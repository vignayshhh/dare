// Surveillance Service - Handles all sus activity tracking
// Creates alerts for: repeated likes, profile viewing, photo views, @mention talking
// Follows architecture contract: clean service interface, DTOs only

import { auth, db, realtimeDb } from "@/backend/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ref, set, onValue, onDisconnect, remove } from "firebase/database";
import { AlertRepository } from "@/backend/repositories/AlertRepository";
import { AlertEntity } from "@/backend/domain/entities/Alert";
import { ghostModeService } from "./ghost-mode.service";

const alertRepository = new AlertRepository();

function createAlertId(): string {
  const maybeRandomUuid = globalThis.crypto?.randomUUID;
  if (typeof maybeRandomUuid === "function") {
    return maybeRandomUuid.call(globalThis.crypto);
  }

  // Fallback to cryptographically secure random values
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const randomStr = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sus_${Date.now()}_${randomStr}`;
}

// ── Dedup keys to avoid spamming the same alert ─────────────────────────────
// In-memory set of recently created alert keys (cleared after 10 minutes)
const recentAlertKeys = new Map<string, number>();
const DEDUP_TTL = 10 * 60 * 1000; // 10 minutes

function isDuplicate(key: string): boolean {
  const ts = recentAlertKeys.get(key);
  if (ts && Date.now() - ts < DEDUP_TTL) return true;
  recentAlertKeys.set(key, Date.now());
  // Cleanup old keys periodically
  if (recentAlertKeys.size > 200) {
    const now = Date.now();
    for (const [k, v] of recentAlertKeys) {
      if (now - v > DEDUP_TTL) recentAlertKeys.delete(k);
    }
  }
  return false;
}

class SurveillanceService {
  private async waitForAuthenticatedViewer(
    expectedUserId: string,
  ): Promise<boolean> {
    if (auth?.currentUser?.uid === expectedUserId) {
      return true;
    }

    if (!auth || typeof window === "undefined") {
      console.warn(
        "[SURVEILLANCE] Firebase auth unavailable; skipping profile-view tracking.",
      );
      return false;
    }

    return new Promise((resolve) => {
      let settled = false;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve(result);
      };

      const timeoutId = window.setTimeout(() => {
        console.warn(
          "[SURVEILLANCE] Firebase auth not ready for profile-view tracking.",
          {
            expectedUserId,
            authUid: auth.currentUser?.uid ?? null,
          },
        );
        finish(false);
      }, 1500);

      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (!firebaseUser) {
          return;
        }

        if (firebaseUser.uid !== expectedUserId) {
          console.warn(
            "[SURVEILLANCE] Skipping profile-view tracking because auth uid does not match viewer id.",
            {
              expectedUserId,
              authUid: firebaseUser.uid,
            },
          );
          finish(false);
          return;
        }

        finish(true);
      });
    });
  }

  private getProfileViewingAlertId(
    viewerUserId: string,
    targetUserId: string,
  ): string {
    return `sus_profile_${targetUserId}_${viewerUserId}`;
  }

  /**
   * Check if surveillance alerts should be suppressed for a user due to ghost mode
   */
  private async shouldSuppressAlerts(userId: string): Promise<boolean> {
    try {
      return await ghostModeService.shouldSuppressAlerts(userId);
    } catch (error) {
      console.error("Error checking ghost mode status:", error);
      // If ghost mode check fails, don't suppress alerts to maintain functionality
      return false;
    }
  }

  // Helper method to truncate content to prevent large alerts
  private truncateContent(content: string, maxLength: number): string {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. REPEATED LIKES — alert when someone likes a post > 5 times
  // ══════════════════════════════════════════════════════════════════════════

  async trackRepeatedLike(params: {
    postId: string;
    postAuthorId: string;
    likerId: string;
    likerUsername: string;
    likerDisplayName: string;
    likerAvatar: string;
    tapCount: number;
    postThumbnail?: string;
    postContent?: string;
  }): Promise<void> {
    try {
      // Only alert at thresholds: 5, 10, 20, 50
      const thresholds = [5, 10, 20, 50];
      if (!thresholds.includes(params.tapCount)) return;
      // Don't alert yourself
      if (params.likerId === params.postAuthorId) return;

      // Check if liker is in ghost mode - suppress alerts if so
      const shouldSuppress = await this.shouldSuppressAlerts(params.likerId);
      if (shouldSuppress) {
        console.log(
          `Ghost mode active for user ${params.likerId} - suppressing repeated likes alert`,
        );
        return;
      }

      const dedupKey = `sus_likes_${params.likerId}_${params.postId}_${params.tapCount}`;
      if (isDuplicate(dedupKey)) return;

      const now = new Date().toISOString();
      const alert = AlertEntity.create({
        id: createAlertId(),
        userId: params.postAuthorId,
        type: "SUS_REPEATED_LIKES",
        entityId: params.postId,
        actorId: params.likerId,
        message: `@${params.likerUsername.replace(/^@/, "")} liked your post ${params.tapCount} times`,
        metadata: {
          actorName: params.likerDisplayName,
          actorUsername: params.likerUsername,
          actorAvatar: params.likerAvatar,
          tapCount: params.tapCount,
          postThumbnail: params.postThumbnail || "",
          postContent: this.truncateContent(params.postContent || "", 200), // Limit to 200 chars
          postId: params.postId,
        },
        isRead: false,
        createdAt: now,
        updatedAt: now,
      });

      await alertRepository.createAlert(alert);
      console.log(
        `🔍 [SUS] Repeated likes alert: ${params.likerUsername} liked post ${params.tapCount}x`,
      );
    } catch (error) {
      console.error("❌ [SUS] Error tracking repeated like:", error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1b. POST_LIKED — social alert when someone likes your post (first like)
  // ══════════════════════════════════════════════════════════════════════════

  async trackPostLike(params: {
    postId: string;
    postAuthorId: string;
    likerId: string;
    likerUsername: string;
    likerDisplayName: string;
    likerAvatar: string;
    postThumbnail?: string;
    postContent?: string;
  }): Promise<void> {
    try {
      if (params.likerId === params.postAuthorId) return;

      // Check if liker is in ghost mode - suppress alerts if so
      const shouldSuppress = await this.shouldSuppressAlerts(params.likerId);
      if (shouldSuppress) {
        console.log(
          `Ghost mode active for user ${params.likerId} - suppressing post like alert`,
        );
        return;
      }

      // Dedup: one POST_LIKED alert per liker per post
      const dedupKey = `post_liked_${params.likerId}_${params.postId}`;
      if (isDuplicate(dedupKey)) return;

      const now = new Date().toISOString();
      const username = params.likerUsername.replace(/^@/, "");

      const alert = AlertEntity.create({
        id: createAlertId(),
        userId: params.postAuthorId,
        type: "POST_LIKED",
        entityId: params.postId,
        actorId: params.likerId,
        message: `@${username} liked your post`,
        metadata: {
          actorName: params.likerDisplayName,
          actorUsername: username,
          actorAvatar: params.likerAvatar,
          postThumbnail: params.postThumbnail || "",
          postContent: this.truncateContent(params.postContent || "", 200), // Limit to 200 chars
          postId: params.postId,
        },
        isRead: false,
        createdAt: now,
        updatedAt: now,
      });

      await alertRepository.createAlert(alert);
    } catch (error) {
      console.error("❌ [SOCIAL] Error tracking post like:", error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. PROFILE VIEWING — real-time "is viewing your profile right now"
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Write presence to RTDB when viewing someone's profile.
   * Path: profile_viewers/{targetUserId}/{viewerUserId}
   * Creates alerts for profile viewing activity.
   */
  async startViewingProfile(
    viewerUserId: string,
    targetUserId: string,
    viewerUsername: string,
    viewerDisplayName: string,
    viewerAvatar: string,
  ): Promise<void> {
    console.log(`🔍 [SURVEILLANCE] startViewingProfile called:`, {
      viewerUserId,
      targetUserId,
      viewerUsername,
    });

    if (viewerUserId === targetUserId) return;

    // Check if viewer is in ghost mode - suppress alerts if so
    const shouldSuppress = await this.shouldSuppressAlerts(viewerUserId);
    if (shouldSuppress) {
      console.log(
        `Ghost mode active for user ${viewerUserId} - suppressing profile viewing alert`,
      );
      return;
    }

    const isAuthenticatedViewer =
      await this.waitForAuthenticatedViewer(viewerUserId);
    if (!isAuthenticatedViewer) {
      return;
    }

    try {
      const cleanUsername = viewerUsername.replace(/^@/, "");
      const now = new Date();
      const alertId = this.getProfileViewingAlertId(viewerUserId, targetUserId);

      // Firestore is the reliable live channel in this app because custom auth
      // does not guarantee RTDB auth. Keep one deterministic live alert doc per pair.
      await setDoc(doc(db, "alerts", alertId), {
        userId: targetUserId,
        type: "SUS_PROFILE_VIEWING",
        entityId: viewerUserId,
        actorId: viewerUserId,
        message: `@${cleanUsername} is viewing your profile right now`,
        metadata: {
          viewerName: viewerDisplayName,
          viewerUsername: cleanUsername,
          viewerAvatar,
          actorName: viewerDisplayName,
          actorUsername: cleanUsername,
          actorAvatar: viewerAvatar,
          isLive: true,
          viewingStartTime: now.getTime(),
        },
        isRead: false,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

      // RTDB is optional fallback for live-presence consumers; don't let it block alerts.
      try {
        const viewerRef = ref(
          realtimeDb,
          `profile_viewers/${targetUserId}/${viewerUserId}`,
        );
        await set(viewerRef, {
          username: cleanUsername,
          display_name: viewerDisplayName,
          avatar: viewerAvatar,
          started_at: Date.now(),
          is_viewing: true,
        });
        await onDisconnect(viewerRef).remove();
      } catch (presenceError) {
        console.warn(
          "⚠️ [SURVEILLANCE] RTDB profile presence unavailable, using Firestore alert only:",
          presenceError,
        );
      }

      console.log(`🔍 [SURVEILLANCE] Profile viewing started:`, {
        viewerUserId,
        targetUserId,
        viewerUsername: cleanUsername,
      });
    } catch (error) {
      console.error("❌ [SUS] Error starting profile view:", error);
    }
  }

  async stopViewingProfile(
    viewerUserId: string,
    targetUserId: string,
    viewerUsername: string,
    _viewerDisplayName: string,
    _viewerAvatar: string,
  ): Promise<void> {
    if (viewerUserId === targetUserId) return;

    const isAuthenticatedViewer =
      await this.waitForAuthenticatedViewer(viewerUserId);
    if (!isAuthenticatedViewer) {
      return;
    }

    try {
      const cleanUsername = viewerUsername.replace(/^@/, "");
      const alertId = this.getProfileViewingAlertId(viewerUserId, targetUserId);

      await updateDoc(doc(db, "alerts", alertId), {
        message: `@${cleanUsername} viewed your profile`,
        metadata: {
          viewerUsername: cleanUsername,
          actorUsername: cleanUsername,
          isLive: false,
          viewingEndTime: Date.now(),
        },
        updatedAt: Timestamp.now(),
      });

      try {
        const viewerRef = ref(
          realtimeDb,
          `profile_viewers/${targetUserId}/${viewerUserId}`,
        );
        await remove(viewerRef);
      } catch (presenceError) {
        console.warn(
          "⚠️ [SURVEILLANCE] RTDB profile cleanup unavailable:",
          presenceError,
        );
      }

      console.log(
        `🔍 [SUS] Profile viewing session ended for ${cleanUsername}`,
      );
    } catch (error) {
      console.error("❌ [SUS] Error stopping profile view:", error);
    }
  }

  /**
   * Subscribe to who is viewing your profile right now.
   * Returns unsubscribe function.
   */
  subscribeToProfileViewers(
    targetUserId: string,
    callback: (viewers: Array<{ userId: string; username: string }>) => void,
  ): () => void {
    const viewersRef = ref(realtimeDb, `profile_viewers/${targetUserId}`);
    const unsub = onValue(viewersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        callback([]);
        return;
      }
      const viewers: Array<{ userId: string; username: string }> = [];
      for (const uid in data) {
        if (data[uid]?.is_viewing) {
          viewers.push({
            userId: uid,
            username: data[uid].username || "someone",
          });
        }
      }
      callback(viewers);
    });
    return unsub;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. PHOTO VIEWS — track how many times someone views a photo from profile
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Start viewing photos in PostsScreen - creates "seeing your pictures right now" alert
   * Path: photo_viewers/{targetUserId}/{viewerUserId}
   */
  async startViewingPhotos(
    viewerUserId: string,
    targetUserId: string,
    viewerUsername: string,
    _viewerDisplayName: string,
    _viewerAvatar: string,
  ): Promise<void> {
    console.log(`🔍 [SURVEILLANCE] startViewingPhotos called:`, {
      viewerUserId,
      targetUserId,
      viewerUsername,
    });

    if (viewerUserId === targetUserId) return;

    // Check if viewer is in ghost mode - suppress alerts if so
    const shouldSuppress = await this.shouldSuppressAlerts(viewerUserId);
    if (shouldSuppress) {
      console.log(
        `Ghost mode active for user ${viewerUserId} - suppressing photo viewing alert`,
      );
      return;
    }
    try {
      const viewerRef = ref(
        realtimeDb,
        `photo_viewers/${targetUserId}/${viewerUserId}`,
      );

      // Check if this is a new photo viewing session
      const { get: rtdbGet } = await import("firebase/database");
      const snap = await rtdbGet(viewerRef);
      const wasViewing = snap.exists() && snap.val()?.is_viewing;

      console.log(`🔍 [SURVEILLANCE] Photo viewing alert creation check:`, {
        wasViewing,
        viewerUserId,
        targetUserId,
        viewerUsername,
      });

      set(viewerRef, {
        username: viewerUsername,
        display_name: _viewerDisplayName,
        avatar: _viewerAvatar,
        started_at: Date.now(),
        is_viewing: true,
      });

      // Auto-clear on disconnect
      onDisconnect(viewerRef).remove();

      // Create "seeing your pictures right now" alert if this is a new session
      if (!wasViewing) {
        const dedupKey = `photo_viewing_${viewerUserId}_${targetUserId}`;
        if (!isDuplicate(dedupKey)) {
          console.log(`🔍 [SURVEILLANCE] Creating photo viewing alert:`, {
            viewerUserId,
            targetUserId,
            viewerUsername,
            dedupKey,
          });

          const alert = AlertEntity.create({
            id: createAlertId(),
            userId: targetUserId,
            type: "SUS_PHOTO_VIEWS",
            entityId: viewerUserId,
            actorId: viewerUserId,
            message: `@${viewerUsername.replace(/^@/, "")} is seeing your pictures right now!`,
            metadata: {
              viewerName: _viewerDisplayName,
              viewerUsername: viewerUsername.replace(/^@/, ""),
              viewerAvatar: _viewerAvatar,
              viewingStartTime: Date.now(),
            },
            isRead: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await alertRepository.createAlert(alert);
          console.log(
            `🔍 [SUS] Photo viewing alert created successfully: ${viewerUsername} is seeing pictures`,
          );
          console.log(`🔍 [SUS] Photo alert details:`, {
            alertId: alert.id,
            targetUserId,
            alertType: alert.type,
            message: alert.message,
          });
        } else {
          console.log(
            `🔍 [SURVEILLANCE] Duplicate photo viewing alert skipped:`,
            dedupKey,
          );
        }
      } else {
        console.log(
          `🔍 [SURVEILLANCE] Photo viewing already active, skipping alert`,
        );
      }
    } catch (error) {
      console.error("❌ [SUS] Error starting photo view:", error);
    }
  }

  /**
   * Stop viewing photos - creates "viewed your pictures X minutes ago" alert
   */
  async stopViewingPhotos(
    viewerUserId: string,
    targetUserId: string,
    viewerUsername: string,
    _viewerDisplayName: string,
    _viewerAvatar: string,
  ): Promise<void> {
    if (viewerUserId === targetUserId) return;
    try {
      const viewerRef = ref(
        realtimeDb,
        `photo_viewers/${targetUserId}/${viewerUserId}`,
      );

      // Get viewing duration before removing
      const { get: rtdbGet } = await import("firebase/database");
      const snap = await rtdbGet(viewerRef);
      const viewerData = snap.exists() ? snap.val() : null;

      // Remove from RTDB
      remove(viewerRef);

      // Create "viewed your pictures X minutes ago" alert if they were viewing
      if (viewerData?.is_viewing && viewerData.started_at) {
        const viewingDuration = Date.now() - viewerData.started_at;
        const viewingMinutes = Math.max(
          1,
          Math.round(viewingDuration / (1000 * 60)),
        );

        const dedupKey = `photo_viewed_${viewerUserId}_${targetUserId}_${viewingMinutes}`;
        if (!isDuplicate(dedupKey)) {
          const alert = AlertEntity.create({
            id: createAlertId(),
            userId: targetUserId,
            type: "SUS_PHOTO_VIEWS",
            entityId: viewerUserId,
            actorId: viewerUserId,
            message: `@${viewerUsername.replace(/^@/, "")} viewed your pictures ${viewingMinutes} minute${viewingMinutes === 1 ? "" : "s"} ago`,
            metadata: {
              viewerName: _viewerDisplayName,
              viewerUsername: viewerUsername.replace(/^@/, ""),
              viewerAvatar: _viewerAvatar,
              viewingDuration,
              viewingMinutes,
              viewingEndTime: Date.now(),
            },
            isRead: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await alertRepository.createAlert(alert);
          console.log(
            `🔍 [SUS] Photo viewed alert: ${viewerUsername} viewed pictures for ${viewingMinutes} minutes`,
          );
        }
      }
    } catch (error) {
      console.error("❌ [SUS] Error stopping photo view:", error);
    }
  }

  /**
   * Increment photo view count in RTDB.
   * Path: photo_views/{targetUserId}/{viewerUserId}/{postId}
   * Creates a sus alert at thresholds 2, 5, 10.
   */
  async trackPhotoView(params: {
    viewerUserId: string;
    viewerUsername: string;
    viewerDisplayName: string;
    viewerAvatar: string;
    targetUserId: string;
    postId: string;
    postThumbnail?: string;
  }): Promise<void> {
    if (params.viewerUserId === params.targetUserId) return;

    // Check if viewer is in ghost mode - suppress alerts if so
    const shouldSuppress = await this.shouldSuppressAlerts(params.viewerUserId);
    if (shouldSuppress) {
      console.log(
        `Ghost mode active for user ${params.viewerUserId} - suppressing photo view alert`,
      );
      return;
    }
    try {
      const countRef = ref(
        realtimeDb,
        `photo_views/${params.targetUserId}/${params.viewerUserId}/${params.postId}`,
      );

      // Read current count
      const { get: rtdbGet } = await import("firebase/database");
      const snap = await rtdbGet(countRef);
      const currentCount = snap.exists() ? snap.val()?.count || 0 : 0;
      const newCount = currentCount + 1;

      // Write new count
      set(countRef, {
        count: newCount,
        username: params.viewerUsername,
        last_viewed: Date.now(),
      });

      // Create alert at thresholds
      const thresholds = [2, 5, 10];
      if (thresholds.includes(newCount)) {
        const dedupKey = `sus_photo_${params.viewerUserId}_${params.postId}_${newCount}`;
        if (isDuplicate(dedupKey)) return;

        const now = new Date().toISOString();
        const alert = AlertEntity.create({
          id: createAlertId(),
          userId: params.targetUserId,
          type: "SUS_PHOTO_VIEWS",
          entityId: params.postId,
          actorId: params.viewerUserId,
          message: `${params.viewerUsername} saw your photo ${newCount} times`,
          metadata: {
            actorName: params.viewerDisplayName,
            actorUsername: params.viewerUsername,
            actorAvatar: params.viewerAvatar,
            viewCount: newCount,
            postThumbnail: params.postThumbnail || "",
            postId: params.postId,
          },
          isRead: false,
          createdAt: now,
          updatedAt: now,
        });

        await alertRepository.createAlert(alert);
        console.log(
          `🔍 [SUS] Photo view alert: ${params.viewerUsername} saw photo ${newCount}x`,
        );
      }
    } catch (error) {
      console.error("❌ [SUS] Error tracking photo view:", error);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. @MENTION TALKING — alert when two users talk about a third user
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Called when @username is detected in a message.
   * Resolves the mentioned username to a userId, then creates a sus alert.
   */
  async trackMentionTalking(params: {
    mentionedUsername: string;
    senderUserId: string;
    senderUsername: string;
    senderDisplayName: string;
    otherUserId: string;
    otherUsername: string;
    conversationId: string;
  }): Promise<void> {
    try {
      // Clean up the mentioned username — remove @ and lowercase
      const usernameClean = params.mentionedUsername
        .replace(/^@/, "")
        .toLowerCase();

      // Try multiple query strategies to find the mentioned user
      let mentionedUserId: string | null = null;

      // Strategy 1: exact lowercase match
      const q1 = query(
        collection(db, "users"),
        where("username", "==", usernameClean),
        limit(1),
      );
      const snap1 = await getDocs(q1);

      if (!snap1.empty) {
        mentionedUserId = snap1.docs[0].id;
      } else {
        // Strategy 2: try with original casing (some users stored as-is)
        const original = params.mentionedUsername.replace(/^@/, "");
        if (original !== usernameClean) {
          const q2 = query(
            collection(db, "users"),
            where("username", "==", original),
            limit(1),
          );
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            mentionedUserId = snap2.docs[0].id;
          }
        }
      }

      if (!mentionedUserId) {
        // Strategy 3: scan all users and compare case-insensitively (fallback)
        const allUsersQuery = query(collection(db, "users"), limit(200));
        const allSnap = await getDocs(allUsersQuery);
        for (const userDoc of allSnap.docs) {
          const storedUsername = (userDoc.data().username || "").toLowerCase();
          if (storedUsername === usernameClean) {
            mentionedUserId = userDoc.id;
            break;
          }
        }
      }

      if (!mentionedUserId) {
        return;
      }

      // Don't notify if mentioned user is one of the two chatting
      if (
        mentionedUserId === params.senderUserId ||
        mentionedUserId === params.otherUserId
      ) {
        return;
      }

      // Check if sender is in ghost mode - suppress alerts if so
      const shouldSuppress = await this.shouldSuppressAlerts(
        params.senderUserId,
      );
      if (shouldSuppress) {
        console.log(
          `Ghost mode active for user ${params.senderUserId} - suppressing mention talking alert`,
        );
        return;
      }

      const dedupKey = `sus_mention_${params.conversationId}_${usernameClean}_${Math.floor(Date.now() / (5 * 60 * 1000))}`;
      if (isDuplicate(dedupKey)) return;

      // Format time nicely
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, "0");
      const timeStr = `${displayHours}:${displayMinutes} ${ampm}`;

      // Clean up display usernames — remove @ prefix for display
      const senderDisplay = (params.senderUsername || "someone").replace(
        /^@/,
        "",
      );
      const otherDisplay = (params.otherUsername || "someone").replace(
        /^@/,
        "",
      );

      const alert = AlertEntity.create({
        id: createAlertId(),
        userId: mentionedUserId,
        type: "SUS_MENTION_TALKING",
        entityId: params.conversationId,
        actorId: params.senderUserId,
        message: `These two were talking about you! @${senderDisplay} and @${otherDisplay} at ${timeStr}`,
        metadata: {
          actorName: params.senderDisplayName,
          actorUsername: senderDisplay,
          otherUsername: otherDisplay,
          mentionedUsername: usernameClean,
          time: timeStr,
          conversationId: params.conversationId,
        },
        isRead: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      await alertRepository.createAlert(alert);
    } catch (error) {
      console.error("❌ [SUS] Error tracking mention talking:", error);
    }
  }
}

export const surveillanceService = new SurveillanceService();
