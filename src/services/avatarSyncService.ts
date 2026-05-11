import { db } from "@/backend/lib/firebase";
import { collection, query, where, getDocs, doc } from "firebase/firestore";
import { useAvatarStore } from "../stores/avatarStore";
import { userDocSubscriptionService } from "./userDocSubscriptionService";
import { logFirestoreError } from "@/utils/firestoreErrors";

/**
 * Avatar Synchronization Service
 * Handles real-time avatar updates for friends and current user
 */
class AvatarSyncService {
  private unsubscribers: Map<string, () => void> = new Map();
  private friendsCache = new Map<
    string,
    { friendIds: Set<string>; expiresAt: number }
  >();
  private readonly friendsCacheTtlMs = 15 * 60 * 1000;

  /**
   * Subscribe to avatar updates for a specific user
   * @param userId - User ID to monitor for avatar changes
   */
  subscribeToUserAvatar(userId: string): () => void {
    if (this.unsubscribers.has(userId)) {
      console.log(`Already subscribed to avatar updates for user: ${userId}`);
      return this.unsubscribers.get(userId)!;
    }

    const unsubscribe = userDocSubscriptionService.subscribe(userId, (data) => {
      const avatarUrl = data?.avatarUrl || "";

      if (avatarUrl) {
        const { setUserAvatar } = useAvatarStore.getState();
        setUserAvatar(userId, avatarUrl);
        console.log(
          `✅ Avatar updated for user ${userId}:`,
          avatarUrl.substring(0, 50) + "...",
        );
      }
    });

    this.unsubscribers.set(userId, unsubscribe);
    console.log(`📡 Subscribed to avatar updates for user: ${userId}`);
    return unsubscribe;
  }

  /**
   * Get cached friend IDs or fetch from Firestore
   */
  private async getFriendIds(currentUserId: string): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.friendsCache.get(currentUserId);

    if (cached && cached.expiresAt > now) {
      return cached.friendIds;
    }

    // Fetch friendships
    const friendshipsRef = collection(db, "friendships");
    const q1 = query(
      friendshipsRef,
      where("requester_id", "==", currentUserId),
      where("status", "==", "accepted"),
    );
    const q2 = query(
      friendshipsRef,
      where("addressee_id", "==", currentUserId),
      where("status", "==", "accepted"),
    );

    const [snapshot1, snapshot2] = await Promise.all([
      getDocs(q1),
      getDocs(q2),
    ]);

    const friendIds = new Set<string>();

    snapshot1.forEach((doc) => {
      friendIds.add(doc.data().addressee_id);
    });

    snapshot2.forEach((doc) => {
      friendIds.add(doc.data().requester_id);
    });

    // Cache result
    this.friendsCache.set(currentUserId, {
      friendIds,
      expiresAt: now + this.friendsCacheTtlMs,
    });

    return friendIds;
  }

  /**
   * Invalidate friends cache (call when friendship changes)
   */
  invalidateFriendsCache(userId: string): void {
    this.friendsCache.delete(userId);
  }

  /**
   * Subscribe to avatar updates for all friends of the current user
   * @param currentUserId - Current user's ID
   */
  async subscribeToFriendsAvatars(currentUserId: string): Promise<() => void> {
    try {
      const friendIds = await this.getFriendIds(currentUserId);

      console.log(
        `📡 Found ${friendIds.size} friends, subscribing to their avatars...`,
      );

      // Subscribe to each friend's avatar
      const unsubscribers: (() => void)[] = [];
      friendIds.forEach((friendId) => {
        const unsub = this.subscribeToUserAvatar(friendId);
        unsubscribers.push(unsub);
      });

      // Return cleanup function
      return () => {
        unsubscribers.forEach((unsub) => unsub());
        console.log(`🔌 Unsubscribed from ${friendIds.size} friends' avatars`);
      };
    } catch (error) {
      console.error("Error subscribing to friends' avatars:", error);
      return () => {};
    }
  }

  /**
   * Unsubscribe from a specific user's avatar updates
   * @param userId - User ID to unsubscribe from
   */
  unsubscribeFromUserAvatar(userId: string): void {
    const unsubscribe = this.unsubscribers.get(userId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(userId);
      console.log(`🔌 Unsubscribed from avatar updates for user: ${userId}`);
    }
  }

  /**
   * Unsubscribe from all avatar updates
   */
  unsubscribeAll(): void {
    this.unsubscribers.forEach((unsubscribe, userId) => {
      unsubscribe();
      console.log(`🔌 Unsubscribed from avatar updates for user: ${userId}`);
    });
    this.unsubscribers.clear();
    console.log("🔌 Unsubscribed from all avatar updates");
  }

  /**
   * Force refresh avatar for a specific user
   * Useful when you know an avatar has changed
   * @param userId - User ID to refresh avatar for
   */
  async refreshUserAvatar(userId: string): Promise<void> {
    try {
      const userRef = doc(db, "users", userId);
      const { getDoc } = await import("firebase/firestore");
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const avatarUrl =
          userData.avatar || userData.avatarUrl || userData.avatar_url || "";

        if (avatarUrl) {
          const { setUserAvatar } = useAvatarStore.getState();
          setUserAvatar(userId, avatarUrl);
          console.log(`🔄 Force refreshed avatar for user ${userId}`);
        }
      }
    } catch (error) {
      logFirestoreError(`Error refreshing avatar for user ${userId}:`, error);
    }
  }

  /**
   * Batch refresh avatars for multiple users
   * @param userIds - Array of user IDs to refresh
   */
  async refreshMultipleAvatars(userIds: string[]): Promise<void> {
    console.log(`🔄 Batch refreshing avatars for ${userIds.length} users...`);
    await Promise.all(userIds.map((userId) => this.refreshUserAvatar(userId)));
    console.log(`✅ Batch refresh complete`);
  }
}

export const avatarSyncService = new AvatarSyncService();
