import { db } from "@/backend/lib/firebase";
import {
  doc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
} from "firebase/firestore";
import { useProfileDataStore } from "../stores/profileDataStore";
import { userDocSubscriptionService } from "./userDocSubscriptionService";
import { avatarSyncService } from "./avatarSyncService";

/**
 * Profile Data Synchronization Service
 * Handles real-time display name, username, and avatar updates for friends and current user.
 * Mirrors avatarSyncService but keeps the profile cache aligned too.
 */
class ProfileSyncService {
  private unsubscribers: Map<string, () => void> = new Map();

  /**
   * Subscribe to profile data updates for a specific user
   */
  subscribeToUserProfile(userId: string): () => void {
    if (this.unsubscribers.has(userId)) {
      return this.unsubscribers.get(userId)!;
    }

    const unsubscribe = userDocSubscriptionService.subscribe(userId, (data) => {
      if (!data) {
        return;
      }

      if (data.displayName || data.username || data.avatarUrl) {
        const { setUserProfile } = useProfileDataStore.getState();
        setUserProfile(userId, data.displayName, data.username, data.avatarUrl);
        console.log(
          `Profile data updated for user ${userId}: ${data.displayName} (@${data.username})`,
        );
      }
    });

    this.unsubscribers.set(userId, unsubscribe);
    console.log(`Subscribed to profile data updates for user: ${userId}`);
    return unsubscribe;
  }

  /**
   * Subscribe to profile data updates for all friends of the current user
   */
  async subscribeToFriendsProfiles(currentUserId: string): Promise<() => void> {
    try {
      // Reuse avatarSync's cached friend IDs to avoid duplicate Firestore queries
      const friendIds = await (avatarSyncService as any).getFriendIds(
        currentUserId,
      );

      console.log(
        `Found ${friendIds.size} friends, subscribing to their profile data...`,
      );

      const unsubscribers: (() => void)[] = [];
      friendIds.forEach((friendId: string) => {
        const unsubscribe = this.subscribeToUserProfile(friendId);
        unsubscribers.push(unsubscribe);
      });

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        console.log(
          `Unsubscribed from ${friendIds.size} friends' profile data`,
        );
      };
    } catch (error) {
      console.error("Error subscribing to friends' profiles:", error);
      return () => {};
    }
  }

  /**
   * Force refresh profile data for a specific user from Firestore
   */
  async refreshUserProfile(userId: string): Promise<void> {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const data = userDoc.data() as Record<string, any>;
        const displayName = data.displayName || data.display_name || "";
        const username = data.username || "";
        const avatarUrl =
          data.avatar || data.avatarUrl || data.avatar_url || "";

        if (displayName || username || avatarUrl) {
          const { setUserProfile } = useProfileDataStore.getState();
          setUserProfile(userId, displayName, username, avatarUrl);
          console.log(
            `Force refreshed profile data for user ${userId}: ${displayName} (@${username})`,
          );
        }
      }
    } catch (error) {
      console.error(`Error refreshing profile for user ${userId}:`, error);
    }
  }

  /**
   * Unsubscribe from all profile data updates
   */
  unsubscribeAll(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    console.log("Unsubscribed from all profile data updates");
  }
}

export const profileSyncService = new ProfileSyncService();
