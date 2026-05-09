"use client";

import { useState, useEffect, useRef } from "react";
import {
  Heart,
  Eye,
  MessageCircle,
  Camera,
  CheckCircle,
  XCircle,
  Target,
  AlertTriangle,
  MessageSquare,
  Star,
  ArrowLeft,
  BellRing,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAlertStore } from "../../stores/useAlertStore";
import { AlertEntity } from "@/backend/domain/entities/Alert";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { useAvatarStore } from "../../stores/avatarStore";
import { surveillanceService } from "../../middleware/services/surveillance.service";
import { resolveUserProfile } from "../../utils/profileResolver";

// Helper function to fetch user profile if not cached — also stores avatar
// Uses getProfileByUserIdForContent to bypass privacy checks (avatars should
// always be visible in alerts regardless of profile visibility settings)
const isGoodValue = (v?: string) =>
  !!v && v !== "Unknown User" && v !== "unknown" && v !== "dare";

const inFlightProfileFetches = new Map<string, Promise<void>>();

const fetchUserProfileIfNeeded = async (userId: string) => {
  if (!userId) return;

  const cachedProfile = useProfileDataStore.getState().userProfiles[userId];
  const hasAvatar = !!useAvatarStore.getState().userAvatars[userId];
  const hasGoodName = isGoodValue(cachedProfile?.displayName);

  // Only fetch from Firestore when we're actually missing data
  if (!hasAvatar || !hasGoodName) {
    try {
      const p = await resolveUserProfile(userId);
      if (p) {
        const newDisplayName = p.displayName || p.username || "";
        const newUsername = p.username || "";
        const avatarUrl = p.avatarUrl || "";

        // Only write to profileDataStore if the NEW data is actually better
        // than what's already cached — never overwrite good data with worse data
        const existingName = cachedProfile?.displayName || "";
        const existingUsername = cachedProfile?.username || "";
        const shouldUpdateName =
          isGoodValue(newDisplayName) && !isGoodValue(existingName);
        const shouldUpdateUsername =
          isGoodValue(newUsername) && !isGoodValue(existingUsername);
        const noCacheYet = !cachedProfile;

        if (noCacheYet || shouldUpdateName || shouldUpdateUsername) {
          useProfileDataStore
            .getState()
            .setUserProfile(
              userId,
              isGoodValue(newDisplayName) ? newDisplayName : existingName,
              isGoodValue(newUsername) ? newUsername : existingUsername,
            );
        }

        if (avatarUrl) {
          useAvatarStore.getState().setUserAvatar(userId, avatarUrl);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  }
};

const fetchUserProfileIfNeededDedup = async (userId: string) => {
  if (!userId) return;

  const existingFetch = inFlightProfileFetches.get(userId);
  if (existingFetch) {
    return existingFetch;
  }

  const fetchPromise = fetchUserProfileIfNeeded(userId).finally(() => {
    inFlightProfileFetches.delete(userId);
  });

  inFlightProfileFetches.set(userId, fetchPromise);
  return fetchPromise;
};

export function AlertsScreen({
  onBack,
  onNavigateToDares,
  onNavigateToFeed,
}: {
  onBack: () => void;
  onNavigateToDares: (request?: {
    tab?: "received" | "sent";
    highlightDareId?: string;
    highlightTruthId?: string;
  }) => void;
  onNavigateToFeed: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"social" | "sus">("social");
  const [friendshipStatuses, setFriendshipStatuses] = useState<
    Map<string, "accepted" | "rejected">
  >(new Map());
  const [clockTick, setClockTick] = useState(() => Date.now());
  const { alerts, subscribeToAlerts, markAsRead } = useAlertStore();
  const { user: currentUser } = useAuthStore();
  const checkedFriendshipActorsRef = useRef<Set<string>>(new Set());
  const inFlightFriendshipActorsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    checkedFriendshipActorsRef.current.clear();
    inFlightFriendshipActorsRef.current.clear();
  }, [currentUser?.id]);

  // Handle navigation to dares screen
  const handleAlertClick = async (alert: AlertEntity) => {
    // Mark as read first
    await markAsRead(alert.id);

    // Navigate based on alert type
    if (alert.type === "DARE_COMPLETED") {
      console.log(
        "🔄 Navigating to dares sent tab for DARE_COMPLETED alert:",
        alert.entityId,
      );
      sessionStorage.setItem("highlightDareId", alert.entityId);
      sessionStorage.setItem("openDaresTab", "sent");
      onNavigateToDares({
        tab: "sent",
        highlightDareId: alert.entityId,
      });
      return;
    }

    // Handle comment alerts - navigate to post and open comments
    if (alert.type === "COMMENT_RECEIVED" || alert.type === "COMMENT_REPLY") {
      const truthId = alert.metadata?.truthId;
      const dareId = alert.metadata?.dareId;

      if (truthId || dareId) {
        sessionStorage.setItem("openDaresTab", "received");

        if (truthId) {
          sessionStorage.setItem("highlightTruthId", truthId);
        }

        if (dareId) {
          sessionStorage.setItem("highlightDareId", dareId);
        }

        onNavigateToDares({
          tab: "received",
          highlightDareId: dareId || undefined,
          highlightTruthId: truthId || undefined,
        });
        return;
      }

      console.log(
        "🔄 Navigating to post and opening comments for comment alert:",
        alert.type,
        alert.entityId,
      );

      // Store the post ID to highlight and open comments
      sessionStorage.setItem("highlightPostId", alert.entityId);
      sessionStorage.setItem("openCommentsForPost", alert.entityId);

      // Navigate to feed
      onNavigateToFeed();
      return;
    }

    if (alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") {
      const postId = alert.metadata?.postId || alert.entityId;
      const commentId = alert.metadata?.commentId;

      if (postId) {
        sessionStorage.setItem("highlightPostId", postId);
        if (commentId) {
          sessionStorage.setItem("openCommentsForPost", postId);
        }
        onNavigateToFeed();
      }
      return;
    }

    if (
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED"
    ) {
      console.log(
        "🔄 Navigating to dares received tab for alert:",
        alert.type,
        alert.entityId,
      );

      // Set the correct highlight ID based on alert type
      if (alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED") {
        sessionStorage.setItem("highlightTruthId", alert.entityId);
        console.log("🎯 Stored truth ID to highlight:", alert.entityId);
      } else {
        sessionStorage.setItem("highlightDareId", alert.entityId);
        console.log("🎯 Stored dare ID to highlight:", alert.entityId);
      }

      // Ensure we open the received tab (not sent tab)
      sessionStorage.setItem("openDaresTab", "received");

      // Navigate to dares screen
      onNavigateToDares({
        tab: "received",
        highlightDareId:
          alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED"
            ? undefined
            : alert.entityId,
        highlightTruthId:
          alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED"
            ? alert.entityId
            : undefined,
      });
    }
  };

  // Load alerts on component mount with real-time listener
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubscribe = subscribeToAlerts(currentUser.id);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser?.id]);

  // Check friendship status for friend request alerts to ensure persistence
  useEffect(() => {
    if (!currentUser?.id) return;

    const checkFriendshipStatuses = async () => {
      const actorIds = [
        ...new Set(
          alerts
            .filter((alert) => alert.type === "FRIEND_REQUEST" && alert.actorId)
            .map((alert) => alert.actorId as string),
        ),
      ];

      for (const actorId of actorIds) {
        const cacheKey = `${currentUser.id}:${actorId}`;
        if (
          checkedFriendshipActorsRef.current.has(cacheKey) ||
          inFlightFriendshipActorsRef.current.has(cacheKey)
        ) {
          continue;
        }

        inFlightFriendshipActorsRef.current.add(cacheKey);

        try {
          const { friendsService } =
            await import("@/middleware/services/service-factory");
          const statusResponse = await friendsService.getFriendshipStatus(
            currentUser.id,
            actorId,
          );

          if (statusResponse.success && statusResponse.friendship) {
            const status = statusResponse.friendship.status;
            if (status === "accepted" || status === "rejected") {
              setFriendshipStatuses((prev) => {
                const next = new Map(prev);
                alerts
                  .filter(
                    (alert) =>
                      alert.type === "FRIEND_REQUEST" &&
                      alert.actorId === actorId,
                  )
                  .forEach((alert) => {
                    next.set(alert.id, status);
                  });
                return next;
              });
            }
          }

          checkedFriendshipActorsRef.current.add(cacheKey);
        } catch (error) {
          console.error("Error checking friendship status:", error);
        } finally {
          inFlightFriendshipActorsRef.current.delete(cacheKey);
        }
      }
    };

    checkFriendshipStatuses();
  }, [alerts, currentUser?.id]);

  // Fetch user profiles when alerts change
  useEffect(() => {
    const actorIds = [
      ...new Set(alerts.map((alert) => alert.actorId).filter(Boolean)),
    ] as string[];

    actorIds.forEach((actorId) => {
      fetchUserProfileIfNeededDedup(actorId);
    });
  }, [alerts]);

  // Live profile viewers (real-time surveillance)
  const [liveViewers, setLiveViewers] = useState<
    Array<{ userId: string; username: string }>
  >([]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = surveillanceService.subscribeToProfileViewers(
      currentUser.id,
      (viewers) => setLiveViewers(viewers),
    );
    return () => unsub();
  }, [currentUser?.id]);

  // Group alerts by time
  const groupAlertsByTime = (alerts: AlertEntity[]) => {
    const today: AlertEntity[] = [];
    const yesterday: AlertEntity[] = [];

    alerts.forEach((alert) => {
      const alertTime = new Date(alert.createdAt);
      const now = new Date();
      const diffInHours =
        (now.getTime() - alertTime.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        today.push(alert);
      } else {
        yesterday.push(alert);
      }
    });

    return { today, yesterday };
  };

  // Filter alerts by type
  const socialAlerts = alerts.filter((alert) => alert.isSocialAlert());
  const susAlerts = alerts.filter((alert) => alert.isSusAlert());

  // ── Aggregate POST_LIKED alerts by postId (Instagram-style) ──
  // Groups multiple likes on the same post into one entry:
  //   "@user1 and 3 others liked your post"
  const aggregateLikeAlerts = (alertsList: AlertEntity[]) => {
    const likeAlerts = alertsList.filter((a) => a.type === "POST_LIKED");
    const nonLikeAlerts = alertsList.filter((a) => a.type !== "POST_LIKED");

    // Group likes by postId
    const likesByPost = new Map<string, AlertEntity[]>();
    for (const alert of likeAlerts) {
      const postId = alert.metadata?.postId || alert.entityId;
      if (!likesByPost.has(postId)) {
        likesByPost.set(postId, []);
      }
      likesByPost.get(postId)!.push(alert);
    }

    // Convert grouped likes into aggregated alert entries
    // Use the most recent like alert as the "primary" and attach others count
    const aggregatedLikes: AlertEntity[] = [];
    for (const [, postLikes] of likesByPost) {
      // Sort by createdAt descending — most recent first
      const sorted = [...postLikes].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const primary = sorted[0];
      const othersCount = sorted.length - 1;

      if (othersCount > 0) {
        // Create aggregated alert with updated metadata
        const aggregatedAlert = AlertEntity.create({
          ...primary,
          metadata: {
            ...primary.metadata,
            aggregatedCount: sorted.length,
            actors: sorted.map((a) => ({
              id: a.actorId,
              name: a.metadata?.actorName || "Someone",
              username: a.metadata?.actorUsername || "someone",
              avatar: a.metadata?.actorAvatar || "",
            })),
          },
          message: `${primary.metadata?.actorName || "Someone"} and ${othersCount} ${othersCount === 1 ? "other" : "others"} liked your post`,
        });
        aggregatedLikes.push(aggregatedAlert);
      } else {
        aggregatedLikes.push(primary);
      }
    }

    return [...aggregatedLikes, ...nonLikeAlerts];
  };

  // ── Aggregate STORY_REACTION alerts by storyId (Instagram-style) ──
  const aggregateStoryReactionAlerts = (alertsList: AlertEntity[]) => {
    const storyReactionAlerts = alertsList.filter(
      (a) => a.type === "STORY_REACTION",
    );
    const nonStoryReactionAlerts = alertsList.filter(
      (a) => a.type !== "STORY_REACTION",
    );

    const buildStoryReactionMessage = (
      reactionType: "like" | "hate",
      primaryAlert: AlertEntity,
      count: number,
    ) => {
      const username =
        primaryAlert.metadata?.actorUsername ||
        primaryAlert.metadata?.actorName ||
        "someone";
      const actorLabel = username.startsWith("@") ? username : `@${username}`;

      if (count <= 1) {
        return reactionType === "hate"
          ? `${actorLabel} hated your story`
          : `${actorLabel} liked your story`;
      }

      return reactionType === "hate"
        ? `${actorLabel} and ${count - 1} ${count - 1 === 1 ? "other" : "others"} hated your story`
        : `${actorLabel} and ${count - 1} ${count - 1 === 1 ? "other" : "others"} liked your story`;
    };

    // Group reactions by storyId + reactionType
    const reactionsByStory = new Map<string, AlertEntity[]>();
    for (const alert of storyReactionAlerts) {
      const reactionType =
        alert.metadata?.reactionType === "hate" ? "hate" : "like";
      const storyReactionKey = `${alert.entityId}:${reactionType}`;
      if (!reactionsByStory.has(storyReactionKey)) {
        reactionsByStory.set(storyReactionKey, []);
      }
      reactionsByStory.get(storyReactionKey)!.push(alert);
    }

    // Convert grouped reactions into aggregated alert entries
    const aggregatedReactions: AlertEntity[] = [];
    for (const [, storyReactions] of reactionsByStory) {
      const sorted = [...storyReactions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const primary = sorted[0];
      const othersCount = sorted.length - 1;

      if (othersCount > 0) {
        const aggregatedAlert = AlertEntity.create({
          ...primary,
          metadata: {
            ...primary.metadata,
            aggregatedCount: sorted.length,
            reactionType:
              primary.metadata?.reactionType === "hate" ? "hate" : "like",
            actors: sorted.map((a) => ({
              id: a.actorId,
              name: a.metadata?.actorName || "Someone",
              username: a.metadata?.actorUsername || "someone",
              avatar: a.metadata?.actorAvatar || "",
              reactionType: a.metadata?.reactionType || "like",
            })),
          },
          message: buildStoryReactionMessage(
            primary.metadata?.reactionType === "hate" ? "hate" : "like",
            primary,
            sorted.length,
          ),
        });
        aggregatedReactions.push(aggregatedAlert);
      } else {
        aggregatedReactions.push(
          AlertEntity.create({
            ...primary,
            metadata: {
              ...primary.metadata,
              reactionType:
                primary.metadata?.reactionType === "hate" ? "hate" : "like",
            },
            message: buildStoryReactionMessage(
              primary.metadata?.reactionType === "hate" ? "hate" : "like",
              primary,
              1,
            ),
          }),
        );
      }
    }

    return [...aggregatedReactions, ...nonStoryReactionAlerts];
  };

  const aggregatedSocialAlerts = aggregateStoryReactionAlerts(
    aggregateLikeAlerts(socialAlerts),
  );

  // Deduplicate alerts by ID to prevent key conflicts
  const deduplicateAlerts = (alerts: any[]) => {
    const seen = new Set();
    return alerts.filter((alert) => {
      if (seen.has(alert.id)) {
        return false;
      }
      seen.add(alert.id);
      return true;
    });
  };

  const { today: socialToday, yesterday: socialYesterday } = groupAlertsByTime(
    deduplicateAlerts(aggregatedSocialAlerts),
  );
  const liveViewerMap = new Map(
    liveViewers.map((viewer) => [viewer.userId, viewer.username]),
  );
  const getProfileViewStatusMessage = (
    createdAt: string,
    username?: string,
  ) => {
    const alertTime = new Date(createdAt);
    const now = new Date(clockTick);
    const diffInMs = now.getTime() - alertTime.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    let relativeTime = "Just now";
    if (diffInMins >= 1 && diffInMins < 60) {
      relativeTime = `${diffInMins}m ago`;
    } else if (diffInHours < 24) {
      relativeTime = `${diffInHours}h ago`;
    } else if (diffInDays >= 1) {
      relativeTime = `${diffInDays}d ago`;
    }

    return `@${(username || "someone").replace(/^@/, "")} was viewing your profile ${relativeTime}`;
  };

  const liveAwareSusAlerts = susAlerts.map((alert) => {
    if (alert.type !== "SUS_PROFILE_VIEWING" || !alert.actorId) {
      return alert;
    }

    const metadataSaysLive = !!alert.metadata?.isLive;
    const hasLiveViewer = liveViewerMap.has(alert.actorId);

    if (!hasLiveViewer && !metadataSaysLive) {
      const inactiveUsername =
        alert.metadata?.viewerUsername ||
        alert.metadata?.actorUsername ||
        "someone";

      return alert
        .updateMetadata({
          ...alert.metadata,
          isLive: false,
          viewerUsername: inactiveUsername.replace(/^@/, ""),
          actorUsername: inactiveUsername.replace(/^@/, ""),
        })
        .updateMessage(
          getProfileViewStatusMessage(alert.createdAt, inactiveUsername),
        );
    }

    const liveUsername =
      liveViewerMap.get(alert.actorId) ||
      alert.metadata?.viewerUsername ||
      alert.metadata?.actorUsername ||
      "someone";

    return alert
      .updateMetadata({
        ...alert.metadata,
        isLive: true,
        viewerUsername: liveUsername.replace(/^@/, ""),
        actorUsername: liveUsername.replace(/^@/, ""),
      })
      .updateMessage(
        `@${liveUsername.replace(/^@/, "")} is viewing your profile right now`,
      );
  });

  const mergedSusAlerts = deduplicateAlerts(
    liveAwareSusAlerts.filter((alert) => {
      if (alert.type !== "SUS_PROFILE_VIEWING" || !alert.actorId) {
        return true;
      }

      const latestForActor = liveAwareSusAlerts
        .filter(
          (candidate) =>
            candidate.type === "SUS_PROFILE_VIEWING" &&
            candidate.actorId === alert.actorId,
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];

      return latestForActor?.id === alert.id;
    }),
  );

  const liveAlertActorIds = new Set(
    mergedSusAlerts
      .filter((alert) => alert.type === "SUS_PROFILE_VIEWING" && alert.actorId)
      .map((alert) => alert.actorId),
  );

  const syntheticLiveAlerts = liveViewers
    .filter((viewer) => !liveAlertActorIds.has(viewer.userId))
    .map((viewer) =>
      AlertEntity.create({
        id: `live-profile-${viewer.userId}`,
        userId: currentUser?.id || "",
        type: "SUS_PROFILE_VIEWING",
        entityId: viewer.userId,
        actorId: viewer.userId,
        message: `@${viewer.username.replace(/^@/, "")} is viewing your profile right now`,
        metadata: {
          actorUsername: viewer.username.replace(/^@/, ""),
          viewerUsername: viewer.username.replace(/^@/, ""),
          isLive: true,
        },
        isRead: false,
        createdAt: new Date(clockTick).toISOString(),
        updatedAt: new Date(clockTick).toISOString(),
      }),
    );

  const susAlertsForDisplay = [...syntheticLiveAlerts, ...mergedSusAlerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const { today: susToday, yesterday: susYesterday } =
    groupAlertsByTime(susAlertsForDisplay);

  const currentAlerts =
    activeTab === "social"
      ? deduplicateAlerts(aggregatedSocialAlerts)
      : susAlertsForDisplay;
  // Helper method to get time ago
  const getTimeAgo = (createdAt: string): string => {
    const alertTime = new Date(createdAt);
    const now = new Date(clockTick);
    const diffInMs = now.getTime() - alertTime.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) return "Just now";
    if (diffInMins < 60) return `${diffInMins}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays}d ago`;
  };

  // Get actor info from metadata (resolve from profileDataStore + avatarStore)
  const alertUserProfiles = useProfileDataStore((s) => s.userProfiles);
  const userAvatars = useAvatarStore((s) => s.userAvatars);
  const getActorInfo = (alert: AlertEntity) => {
    const cachedProfile = alert.actorId
      ? alertUserProfiles[alert.actorId]
      : null;

    // Resolve username: cached profile > metadata > fallback
    let username = "unknown";
    if (cachedProfile?.username) {
      username = cachedProfile.username;
    } else if (
      alert.metadata.actorUsername &&
      alert.metadata.actorUsername !== "dare" &&
      alert.metadata.actorUsername !== "unknown"
    ) {
      username = alert.metadata.actorUsername;
    } else if (
      alert.metadata.actorName &&
      alert.metadata.actorName !== "dare" &&
      alert.metadata.actorName !== "Unknown User"
    ) {
      username = alert.metadata.actorName.toLowerCase().replace(/\s+/g, "_");
    }

    // Resolve display name: cached profile > metadata > fallback
    let displayName = "Unknown User";
    const cachedName = cachedProfile?.displayName;
    if (
      cachedName &&
      cachedName !== "Unknown User" &&
      cachedName !== "unknown"
    ) {
      displayName = cachedName;
    } else if (
      alert.metadata.actorName &&
      alert.metadata.actorName !== "dare" &&
      alert.metadata.actorName !== "Unknown User"
    ) {
      displayName = alert.metadata.actorName;
    } else if (
      alert.metadata.actorUsername &&
      alert.metadata.actorUsername !== "dare" &&
      alert.metadata.actorUsername !== "unknown"
    ) {
      displayName = alert.metadata.actorUsername;
    } else if (
      cachedProfile?.username &&
      cachedProfile.username !== "unknown"
    ) {
      displayName = cachedProfile.username;
    }

    // Resolve avatar: avatarStore (freshest) > metadata > empty
    let avatar = "";
    if (alert.actorId && userAvatars[alert.actorId]) {
      avatar = userAvatars[alert.actorId];
    } else if (alert.metadata.actorAvatar) {
      avatar = alert.metadata.actorAvatar;
    }

    return {
      name: displayName,
      avatar,
      username,
      userId: alert.actorId,
    };
  };

  const handleAcceptFriendRequest = async (
    alertId: string,
    friendshipId: string,
  ) => {
    if (!currentUser?.id) return;

    try {
      const alertData = alerts.find((a: any) => a.id === alertId);
      if (!alertData) {
        throw new Error("Alert not found");
      }

      // Special handling for legacy alerts with "pending" entityId or invalid values
      if (
        friendshipId === "pending" ||
        friendshipId === "friendships" ||
        !friendshipId ||
        friendshipId.length < 10
      ) {
        const { friendsService } =
          await import("@/middleware/services/service-factory");
        const friendshipResponse = await friendsService.getFriendshipStatus(
          currentUser.id,
          alertData.actorId,
        );

        if (friendshipResponse.success && friendshipResponse.friendship) {
          friendshipId = friendshipResponse.friendship.id;
        } else {
          throw new Error(
            "Friend request not found - unable to locate friendship",
          );
        }
      }

      const { friendsService } =
        await import("@/middleware/services/service-factory");

      const result = await friendsService.acceptFriendRequest(
        friendshipId,
        currentUser.id,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to accept friend request");
      }

      // Mark this alert as accepted in local state
      setFriendshipStatuses((prev: Map<string, "accepted" | "rejected">) =>
        new Map(prev).set(alertId, "accepted"),
      );

      // Update the existing alert to show friendship established
      const { alertService } =
        await import("@/middleware/services/service-factory");
      const alertResponse = await alertService.getAlerts({
        userId: currentUser.id,
        limit: 1,
      });
      const originalAlert = alertResponse.alerts?.find(
        (a: any) => a.id === alertId,
      );

      if (originalAlert) {
        const actorName = originalAlert.metadata.actorName || "Someone";
        const actorUsername = originalAlert.metadata.actorUsername || "someone";

        await alertService.updateAlert(alertId, currentUser.id, {
          type: "FRIENDSHIP_ESTABLISHED" as any,
          message: `You and ${actorName} (@${actorUsername}) are now friends!`,
          metadata: {
            ...originalAlert.metadata,
            status: "accepted",
          },
        });
      }

      await markAsRead(alertId);
      subscribeToAlerts(currentUser.id);

      // Trigger feed refresh to include friend's posts
      const { usePostsStore } = await import("../../stores/usePostsStore");
      usePostsStore.getState().clearPersistedData();
      await usePostsStore.getState().loadPosts(currentUser.id);

      // Increment friends count for both users
      const { useUserProfileStore } =
        await import("../../stores/useUserProfileStore");
      useUserProfileStore.getState().incrementFriendsCount(currentUser.id);

      if (originalAlert?.actorId) {
        useUserProfileStore
          .getState()
          .incrementFriendsCount(originalAlert.actorId);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
    }
  };

  const handleRejectFriendRequest = async (
    alertId: string,
    friendshipId: string,
  ) => {
    if (!currentUser?.id) return;

    try {
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      await friendsService.rejectFriendRequest(friendshipId, currentUser.id);
      await markAsRead(alertId);
      subscribeToAlerts(currentUser.id); // Refresh alerts
    } catch (error) {
      console.error("Error rejecting friend request:", error);
    }
  };

  const getSocialAlertMeta = (alert: AlertEntity) => {
    switch (alert.type) {
      case "DARE_RECEIVED":
        return {
          label: "Dare Received",
          accentBarClass: "bg-[#f59e0b]",
          pillClass: "border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#fbbf24]",
          glowClass: "bg-[#f59e0b]/14",
          railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
          icon: <Target size={12} />,
        };
      case "DARE_ACCEPTED":
        return {
          label: "Dare Accepted",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "DARE_REFUSED":
        return {
          label: "Dare Refused",
          accentBarClass: "bg-red-400",
          pillClass: "border-red-500/25 bg-red-500/12 text-red-300",
          glowClass: "bg-red-500/14",
          railClass: "from-red-500/0 via-red-500/80 to-red-500/0",
          icon: <XCircle size={12} />,
        };
      case "DARE_COMPLETED":
        return {
          label: "Dare Completed",
          accentBarClass: "bg-[#fcd34d]",
          pillClass: "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fcd34d]",
          glowClass: "bg-[#f59e0b]/14",
          railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
          icon: <Target size={12} />,
        };
      case "TRUTH_RECEIVED":
        return {
          label: "Truth Question",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <MessageCircle size={12} />,
        };
      case "TRUTH_ANSWERED":
        return {
          label: "Truth Answered",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "COMMENT_RECEIVED":
        return {
          label: "New Comment",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <MessageSquare size={12} />,
        };
      case "COMMENT_REPLY":
        return {
          label: "Comment Reply",
          accentBarClass: "bg-violet-400",
          pillClass: "border-violet-500/25 bg-violet-500/10 text-violet-300",
          glowClass: "bg-violet-500/14",
          railClass: "from-violet-500/0 via-violet-500/80 to-violet-500/0",
          icon: <MessageSquare size={12} />,
        };
      case "POST_LIKED":
        return {
          label: "Post Liked",
          accentBarClass: "bg-pink-400",
          pillClass: "border-pink-500/25 bg-pink-500/10 text-pink-300",
          glowClass: "bg-pink-500/14",
          railClass: "from-pink-500/0 via-pink-500/80 to-pink-500/0",
          icon: <Heart size={12} fill="currentColor" />,
        };
      case "FRIEND_REQUEST":
        return {
          label: "Friend Request",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <Star size={12} />,
        };
      default:
        return {
          label: "Alert",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-white/10 bg-white/[0.05] text-white",
          glowClass: "bg-[#4ade80]/10",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/60 to-[#4ade80]/0",
          icon: <BellRing size={12} />,
        };
    }
  };

  const renderSectionHeader = (
    title: string,
    tone: "primary" | "muted" | "danger" = "primary",
  ) => {
    const toneClasses =
      tone === "danger"
        ? {
            text: "text-red-300",
            line: "from-red-500/0 via-red-500/70 to-red-500/0",
            iconWrap: "border-red-500/20 bg-red-500/10 text-red-300",
          }
        : tone === "muted"
          ? {
              text: "text-[#94a3b8]",
              line: "from-white/0 via-white/14 to-white/0",
              iconWrap: "border-white/10 bg-white/[0.04] text-[#94a3b8]",
            }
          : {
              text: "text-[#86efac]",
              line: "from-[#4ade80]/0 via-[#4ade80]/70 to-[#4ade80]/0",
              iconWrap: "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]",
            };

    return (
      <div className="mb-3 flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-2xl border ${toneClasses.iconWrap}`}
        >
          {tone === "danger" ? (
            <AlertTriangle size={14} />
          ) : tone === "primary" ? (
            <Sparkles size={14} />
          ) : (
            <BellRing size={14} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.24em] ${toneClasses.text}`}
          >
            {title}
          </p>
          <div
            className={`mt-2 h-px w-full bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${toneClasses.line}`}
          />
        </div>
      </div>
    );
  };

  const renderSocialAlertMessage = (alert: AlertEntity) => {
    if (alert.type !== "STORY_REACTION") {
      return alert.message;
    }

    const highlightPhrase = alert.message.includes("hated your story")
      ? "hated your story"
      : alert.message.includes("liked your story")
        ? "liked your story"
        : null;

    if (!highlightPhrase) {
      return alert.message;
    }

    const [before, after] = alert.message.split(highlightPhrase);

    return (
      <>
        {before}
        <span
          className={
            highlightPhrase === "hated your story"
              ? "font-semibold text-red-200 drop-shadow-[0_0_10px_rgba(239,68,68,0.18)]"
              : "font-semibold text-[#bbf7d0] drop-shadow-[0_0_10px_rgba(74,222,128,0.18)]"
          }
        >
          {highlightPhrase}
        </span>
        {after}
      </>
    );
  };

  const renderAlertItem = (alert: AlertEntity) => {
    const actorInfo = getActorInfo(alert);
    const meta = getSocialAlertMeta(alert);
    const isDareOrTruth =
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_COMPLETED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED";

    const isClickable =
      isDareOrTruth ||
      alert.type === "COMMENT_RECEIVED" ||
      alert.type === "COMMENT_REPLY";
    const isCompactChallengeCapsule =
      alert.type === "DARE_RECEIVED" || alert.type === "DARE_COMPLETED";

    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`group relative isolate overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(22,26,22,0.98),rgba(14,16,14,0.98))] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-300 ${isClickable ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#4ade80]/20 hover:shadow-[0_24px_54px_rgba(0,0,0,0.5),0_0_32px_rgba(74,222,128,0.12)]" : ""}`}
        onClick={() => isClickable && handleAlertClick(alert)}
      >
        <div
          className={`pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${meta.railClass}`}
        />
        <div
          className={`pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full blur-3xl ${meta.glowClass}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_70%)] opacity-60" />
        <div className="flex items-start space-x-3">
          <div className="relative shrink-0">
            <Avatar
              src={actorInfo.avatar}
              alt={actorInfo.name}
              size="md"
              userId={actorInfo.userId}
              username={actorInfo.username}
              disableGhostMode
            />
            <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-black/40 bg-[#101310] text-white shadow-[0_6px_18px_rgba(0,0,0,0.28)]">
              {meta.icon}
            </div>
            {alert.metadata.isLive && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#4ade80] rounded-full border-2 border-black animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate text-[15px] font-bold tracking-tight text-[#6ee7b7]">
                  {actorInfo.username
                    ? `@${actorInfo.username.replace(/^@/, "")}`
                    : actorInfo.name}
                </span>
              </div>
              <span className="shrink-0 pt-1 text-[11px] font-medium text-[#64748b]">
                {getTimeAgo(alert.createdAt)}
              </span>
            </div>

            <p className="mb-3 text-[14px] leading-relaxed text-[#e2e8f0]">
              {renderSocialAlertMessage(alert)}
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {alert.type !== "STORY_REACTION" && (
                <div
                  className={`inline-flex items-center rounded-full border font-bold uppercase tracking-[0.16em] ${isCompactChallengeCapsule ? "gap-1 px-2.5 py-0.5 text-[10px]" : "gap-1.5 px-3 py-1 text-[11px]"} ${meta.pillClass}`}
                >
                  {meta.icon}
                  <span>{meta.label}</span>
                </div>
              )}
              {alert.metadata.isLive && alert.metadata.liveDuration && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1 text-[11px] font-semibold text-[#86efac]">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#4ade80] animate-pulse" />
                  <span>{alert.metadata.liveDuration}</span>
                </div>
              )}
            </div>

            {false && isClickable && (
              <div className="hidden items-center text-[#4ade80] text-xs font-medium mb-2">
                <span></span>
              </div>
            )}

            {/* Add icons for dare/truth alerts */}
            {alert.type === "DARE_RECEIVED" && (
              <div className="hidden items-center space-x-2 text-red-400 text-xs font-medium mb-2">
                <Target size={12} />
                <span>Dare Received</span>
              </div>
            )}

            {alert.type === "DARE_ACCEPTED" && (
              <div className="hidden items-center space-x-2 text-green-400 text-xs font-medium mb-2">
                <CheckCircle size={12} />
                <span>Dare Accepted</span>
              </div>
            )}

            {alert.type === "DARE_REFUSED" && (
              <div className="hidden items-center space-x-2 text-red-400 text-xs font-medium mb-2">
                <XCircle size={12} />
                <span>Dare Refused</span>
              </div>
            )}

            {alert.type === "DARE_COMPLETED" && (
              <div className="hidden items-center space-x-2 text-[#f59e0b] text-xs font-medium mb-2">
                <Target size={12} />
                <span>Dare Completed</span>
              </div>
            )}

            {alert.type === "TRUTH_RECEIVED" && (
              <div className="hidden items-center space-x-2 text-blue-400 text-xs font-medium mb-2">
                <MessageCircle size={12} />
                <span>Truth Question</span>
              </div>
            )}

            {alert.type === "TRUTH_ANSWERED" && (
              <div className="hidden items-center space-x-2 text-green-400 text-xs font-medium mb-2">
                <CheckCircle size={12} />
                <span>Truth Answered</span>
              </div>
            )}

            {/* COMMENT_RECEIVED and COMMENT_REPLY alerts */}
            {false &&
              (alert.type === "COMMENT_RECEIVED" ||
                alert.type === "COMMENT_REPLY") && (
                <div className="flex items-center space-x-2 text-blue-400 text-xs font-medium mb-2">
                  <MessageSquare size={12} />
                  <span>
                    {alert.type === "COMMENT_REPLY"
                      ? "Comment Reply"
                      : "New Comment"}
                  </span>
                </div>
              )}

            {/* Show comment text for comment alerts */}
            {(alert.type === "COMMENT_RECEIVED" ||
              alert.type === "COMMENT_REPLY") &&
              alert.metadata.commentText && (
                <div className="mt-2 rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div
                    className={`mb-2 h-1 w-14 rounded-full ${meta.accentBarClass}`}
                  />
                  <p className="text-[#e2e8f0] text-sm leading-relaxed">
                    {alert.metadata.commentText}
                  </p>
                </div>
              )}

            {/* Clickable indicator for comment alerts */}
            {(alert.type === "COMMENT_RECEIVED" ||
              alert.type === "COMMENT_REPLY") && (
              <div className="hidden items-center text-[#4ade80] text-xs font-medium mb-2 mt-2">
                <span></span>
              </div>
            )}
            {alert.type === "POST_LIKED" && (
              <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3.5 py-3">
                {/* Stacked avatars of likers */}
                {alert.metadata.allLikers &&
                  alert.metadata.allLikers.length > 1 && (
                    <div className="flex shrink-0 -space-x-2">
                      {alert.metadata.allLikers
                        .slice(0, 3)
                        .map((liker: any, i: number) => (
                          <Avatar
                            key={i}
                            src={liker.avatar}
                            alt={liker.username}
                            size="xs"
                            userId={liker.userId}
                            username={liker.username}
                            disableGhostMode
                          />
                        ))}
                      {alert.metadata.allLikers.length > 3 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#191d19] text-[10px] font-bold text-[#94a3b8]">
                          +{alert.metadata.allLikers.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                    Engagement
                  </p>
                  <p className="truncate text-sm text-white">
                    {alert.metadata.allLikers?.length || 1} people reacted to
                    your post
                  </p>
                </div>
                {alert.metadata.postThumbnail && (
                  <div className="ml-auto h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#161a16] shadow-[0_10px_22px_rgba(0,0,0,0.24)]">
                    <img
                      src={alert.metadata.postThumbnail}
                      alt="Post"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {alert.metadata.isLive && alert.metadata.liveDuration && (
              <p className="hidden text-[#4ade80] text-xs font-medium mb-2">
                {alert.metadata.liveDuration}
              </p>
            )}

            {alert.type === "FRIEND_REQUEST" && (
              <div className="mt-4 flex gap-2.5">
                {friendshipStatuses.get(alert.id) === "accepted" ? (
                  <div className="flex-1 rounded-2xl border border-[#4ade80]/25 bg-[#4ade80]/10 py-3 text-center text-sm font-semibold text-transparent">
                    <span className="text-[#86efac]">
                      Friend Request Accepted
                    </span>
                    ✓ Friend Request Accepted
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        handleAcceptFriendRequest(alert.id, alert.entityId)
                      }
                      className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-4 py-3 text-sm font-semibold text-black shadow-[0_12px_28px_rgba(74,222,128,0.24)] transition-all hover:brightness-105"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() =>
                        handleRejectFriendRequest(alert.id, alert.entityId)
                      }
                      className="flex-1 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/14"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render sus activity alert item with specialized UI ──
  const renderSusAlertItem = (alert: AlertEntity) => {
    const actorInfo = getActorInfo(alert);
    const meta = alert.metadata || {};
    const isLiveProfileView =
      alert.type === "SUS_PROFILE_VIEWING" && !!meta.isLive;

    // Icon & accent color per sus type
    let icon = <Eye size={16} className="text-red-400" />;
    let accentColor = "text-red-400";
    let bgAccent = "border-red-500/10";

    if (alert.type === "SUS_REPEATED_LIKES") {
      icon = <Heart size={16} className="text-pink-400" fill="#f472b6" />;
      accentColor = "text-pink-400";
      bgAccent = "border-pink-500/10";
    } else if (alert.type === "SUS_PHOTO_VIEWS") {
      icon = <Camera size={16} className="text-amber-400" />;
      accentColor = "text-amber-400";
      bgAccent = "border-amber-500/10";
    } else if (alert.type === "SUS_MENTION_TALKING") {
      icon = <MessageSquare size={16} className="text-purple-400" />;
      accentColor = "text-purple-400";
      bgAccent = "border-purple-500/10";
    } else if (alert.type === "SUS_PROFILE_VIEWING") {
      icon = <Eye size={16} className="text-red-400" />;
      accentColor = "text-red-400";
      bgAccent = "border-red-500/10";
    } else if (alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") {
      icon = <Star size={16} className="text-yellow-300" fill="#fde047" />;
      accentColor = "text-yellow-300";
      bgAccent = "border-yellow-400/10";
    }

    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`group relative isolate overflow-hidden rounded-[28px] border p-4 shadow-[0_18px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-300 ${bgAccent} ${isLiveProfileView ? "border-red-500/18 bg-[linear-gradient(135deg,rgba(127,29,29,0.22),rgba(25,14,14,0.98)_42%,rgba(14,15,14,0.98)_100%)] hover:shadow-[0_24px_54px_rgba(0,0,0,0.5),0_0_34px_rgba(239,68,68,0.14)] ring-1 ring-red-500/28" : "border-white/8 bg-[linear-gradient(180deg,rgba(22,24,22,0.98),rgba(14,16,14,0.98))] hover:-translate-y-0.5 hover:shadow-[0_24px_54px_rgba(0,0,0,0.5)]"} ${!alert.isRead ? "ring-1 ring-red-500/20" : ""}`}
        onClick={() => {
          if (!alert.id.startsWith("live-profile-")) {
            void handleAlertClick(alert);
          }
        }}
      >
        <div
          className={`pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${accentColor === "text-pink-400" ? "from-pink-500/0 via-pink-500/80 to-pink-500/0" : accentColor === "text-amber-400" ? "from-amber-500/0 via-amber-500/80 to-amber-500/0" : accentColor === "text-purple-400" ? "from-purple-500/0 via-purple-500/80 to-purple-500/0" : accentColor === "text-yellow-300" ? "from-yellow-400/0 via-yellow-400/80 to-yellow-400/0" : "from-red-500/0 via-red-500/80 to-red-500/0"}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_70%)] opacity-60" />
        <div className="flex items-start space-x-3">
          {/* Avatar with sus type icon overlay */}
          <div className="relative shrink-0">
            <Avatar
              src={actorInfo.avatar}
              alt={actorInfo.name}
              size="md"
              userId={actorInfo.userId}
              username={actorInfo.username}
              disableGhostMode
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#111] rounded-full flex items-center justify-center border border-[#2a2a2a]">
              {icon}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span
                  className={`block truncate text-[14px] font-bold ${accentColor}`}
                >
                  @{actorInfo.username}
                </span>
              </div>
              <span className="shrink-0 pt-1 text-[11px] font-medium text-[#64748b]">
                {getTimeAgo(alert.createdAt)}
              </span>
            </div>

            {/* Message */}
            <p className="mb-3 text-[#e2e8f0] text-sm leading-relaxed">
              {alert.message}
            </p>

            {isLiveProfileView && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1">
                <Eye size={12} className="text-red-300" />
                <span className="text-xs font-semibold text-red-200">
                  Watching right now
                </span>
              </div>
            )}

            {/* Post thumbnail for repeated likes & photo views */}
            {(alert.type === "SUS_REPEATED_LIKES" ||
              alert.type === "SUS_PHOTO_VIEWS" ||
              alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") &&
              meta.postThumbnail && (
                <div className="mt-3 flex items-center space-x-3 rounded-[22px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#181818]">
                    <img
                      src={meta.postThumbnail}
                      alt="Post"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  {meta.postContent && (
                    <p className="flex-1 truncate text-xs text-[#94a3b8]">
                      {meta.postContent.slice(0, 60)}
                      {meta.postContent.length > 60 ? "..." : ""}
                    </p>
                  )}
                </div>
              )}

            {/* Tap count badge for repeated likes */}
            {alert.type === "SUS_REPEATED_LIKES" && meta.tapCount && (
              <div className="mt-2 flex items-center space-x-2">
                <div className="flex items-center space-x-1.5 rounded-full border border-pink-500/20 bg-pink-500/10 px-3 py-1.5">
                  <Heart size={12} className="text-pink-400" fill="#f472b6" />
                  <span className="text-pink-400 text-xs font-bold">
                    {meta.tapCount}x
                  </span>
                </div>
              </div>
            )}

            {/* View count for photo views */}
            {alert.type === "SUS_PHOTO_VIEWS" && meta.viewCount && (
              <div className="mt-2 flex items-center space-x-2">
                <div className="flex items-center space-x-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
                  <Eye size={12} className="text-amber-400" />
                  <span className="text-amber-400 text-xs font-bold">
                    {meta.viewCount} views
                  </span>
                </div>
              </div>
            )}

            {/* @mention talking — show both usernames who were chatting */}
            {alert.type === "SUS_MENTION_TALKING" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {meta.actorUsername && (
                  <div className="flex items-center space-x-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1.5">
                    <span className="text-purple-300 text-xs font-bold">
                      @{meta.actorUsername}
                    </span>
                  </div>
                )}
                {meta.otherUsername && (
                  <div className="flex items-center space-x-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1.5">
                    <span className="text-purple-300 text-xs font-bold">
                      @{meta.otherUsername}
                    </span>
                  </div>
                )}
                {meta.time && (
                  <div className="flex items-center space-x-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                    <MessageSquare size={12} className="text-purple-400" />
                    <span className="text-[#94a3b8] text-xs">{meta.time}</span>
                  </div>
                )}
              </div>
            )}

            {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {meta.interactionType && (
                  <div className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1.5">
                    <span className="text-xs font-bold text-yellow-200">
                      {meta.interactionType === "commented"
                        ? "Comment"
                        : meta.interactionType === "repeated_like"
                          ? `${meta.tapCount || 0}x likes`
                          : `${meta.distinctLikedPosts || 0} posts liked`}
                    </span>
                  </div>
                )}
                {meta.commentText && (
                  <div className="w-full rounded-[20px] border border-white/6 bg-[linear-gradient(180deg,rgba(27,24,18,0.94),rgba(19,16,12,0.98))] p-3.5">
                    <p className="text-sm leading-relaxed text-[#e2e8f0]">
                      {meta.commentText}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Unread dot */}
            {!alert.isRead && (
              <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="screen-container flex flex-col bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.12)_0%,rgba(11,16,11,0.96)_24%,#050605_100%)]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/8 bg-[linear-gradient(180deg,rgba(3,6,4,0.96)_0%,rgba(0,0,0,0.94)_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="px-4 pb-4 pt-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <button
              onClick={onBack}
              className="z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-transparent shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-colors hover:text-transparent"
            >
              <ArrowLeft size={18} className="absolute text-[#94a3b8]" />×
            </button>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2">
                <h1 className="text-[28px] font-black leading-none tracking-[-0.04em] text-white">
                  Alerts
                </h1>
                <Sparkles size={15} className="text-[#4ade80]" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-[22px] border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-2 shadow-[0_10px_24px_rgba(74,222,128,0.15)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#86efac]">
                  Social
                </p>
                <p className="ml-2 text-lg font-black leading-none text-white">
                  {socialAlerts.filter((a) => !a.isRead).length}
                </p>
              </div>
              <div className="flex items-center justify-center rounded-[22px] border border-red-500/20 bg-red-500/10 px-3 py-2 shadow-[0_10px_24px_rgba(239,68,68,0.15)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
                  Sus
                </p>
                <p className="ml-2 text-lg font-black leading-none text-white">
                  {susAlerts.filter((a) => !a.isRead).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="px-4 pb-4">
          <div className="flex rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(24,29,24,0.98),rgba(17,21,17,0.98))] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <button
              onClick={() => setActiveTab("social")}
              className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                activeTab === "social"
                  ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                  : "text-[#64748b] hover:text-white"
              }`}
            >
              Social
            </button>
            <button
              onClick={() => setActiveTab("sus")}
              className={`relative flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                activeTab === "sus"
                  ? "bg-[linear-gradient(135deg,#ef4444,#b91c1c)] text-white shadow-[0_10px_28px_rgba(239,68,68,0.26)]"
                  : "text-[#64748b] hover:text-white"
              }`}
            >
              Sus Activity
              {susAlerts.filter((a) => !a.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border border-black">
                  {susAlerts.filter((a) => !a.isRead).length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
        {activeTab === "social" ? (
          <>
            {socialToday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="space-y-3.5">
                  {socialToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {socialYesterday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Yesterday", "muted")}
                <div className="space-y-3.5">
                  {socialYesterday.map(renderAlertItem)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── Live Surveillance Banner ── */}
            {susToday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Today", "danger")}
                <div className="space-y-3.5">
                  {susToday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
            {susYesterday.length > 0 && (
              <div className="mb-6">
                {renderSectionHeader("Yesterday", "muted")}
                <div className="space-y-3.5">
                  {susYesterday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
          </>
        )}

        {currentAlerts.length === 0 &&
          !(activeTab === "sus" && susAlertsForDisplay.length > 0) && (
            <div className="rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(22,26,22,0.98),rgba(14,16,14,0.98))] px-6 py-12 text-center shadow-[0_20px_56px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.12),rgba(255,255,255,0.03)_55%,transparent_75%)]">
                {activeTab === "social" ? (
                  <Heart size={28} className="text-[#86efac]" />
                ) : (
                  <Eye size={28} className="text-red-300" />
                )}
              </div>
              <p className="mb-2 text-lg font-bold text-white">
                {activeTab === "social"
                  ? "No alerts yet"
                  : "No suspicious activity detected"}
              </p>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-[#94a3b8]">
                {activeTab === "social"
                  ? "When people interact with your world, the premium feed will light up here."
                  : "Your surveillance lane is quiet for now. New signals will appear the moment they arrive."}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
