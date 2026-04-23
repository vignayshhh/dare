import { create } from "zustand";
import { userService, UserProfile } from "@/middleware/services/user.service";
import { AlertType } from "@/backend/domain/entities/Alert";
import {
  collection,
  addDoc,
  Timestamp,
  deleteDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";

interface UserProfileState {
  // Data
  profile: UserProfile | null;
  friends: any[]; // Using any[] for now since new service returns UserProfileEntity[]
  isFriend: boolean;
  friendshipStatus: "none" | "pending" | "accepted" | "rejected";
  friendsCount: number;
  loading: boolean;
  error: string | null;

  // Actions
  loadProfile: (userId: string) => Promise<void>;
  sendFriendRequest: (targetUserId: string) => Promise<boolean>;
  cancelFriendRequest: (targetUserId: string) => Promise<boolean>;
  unfriendUser: (targetUserId: string) => Promise<boolean>;
  checkFriendshipStatus: (targetUserId: string) => Promise<void>;
  incrementFriendsCount: (userId: string) => Promise<void>;
  decrementFriendsCount: (userId: string) => Promise<void>;
  clearError: () => void;
  setError: (error: string | null) => void;
}

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  // Initial state
  profile: null,
  friends: [],
  isFriend: false,
  friendshipStatus: "none",
  friendsCount: 0,
  loading: false,
  error: null,

  // Load user profile
  loadProfile: async (userId: string) => {
    console.log("🔄 loadProfile called for user:", userId);
    set({ loading: true, error: null });

    try {
      const profile = await userService.getProfile(userId);
      console.log("🔄 Profile loaded:", profile);

      if (profile) {
        // Get friends count
        const { friendsService } =
          await import("@/middleware/services/service-factory");
        console.log("🔄 Getting friends count for user:", userId);
        const friendsResponse = await friendsService.getFriends(userId);
        console.log("🔄 Friends response:", friendsResponse);

        const friends = friendsResponse.success
          ? friendsResponse.friends || []
          : [];
        const friendsCount = friends.length;
        console.log("🔄 Friends list:", friends);
        console.log("🔄 Friends count calculated:", friendsCount);

        // Sync local `followersCount` from computed friends count. We used
        // to also write this back to the viewed user's Firestore doc, but
        // that fails under ownership rules when viewing someone else's
        // profile (you can only update your own doc). Keep the fix local.
        const firestoreProfile = profile as any;
        if (
          firestoreProfile &&
          friendsCount !== (firestoreProfile.followersCount || 0)
        ) {
          (profile as any).followersCount = friendsCount;
        }

        set({
          profile,
          friends,
          friendsCount,
          loading: false,
        });
        console.log("✅ Profile and friends count updated in store");

        // Check friendship status
        await get().checkFriendshipStatus(userId);
      } else {
        console.log("❌ Profile not found");
        set({ loading: false, error: "Profile not found" });
      }
    } catch (error) {
      console.error("❌ Error loading profile:", error);
      set({ loading: false, error: (error as Error).message });
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load profile";
      set({
        error: errorMessage,
        loading: false,
      });
    }
  },

  // Send friend request
  sendFriendRequest: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("You must be logged in to send friend requests");
      }

      if (currentUser.id === targetUserId) {
        throw new Error("You cannot send a friend request to yourself");
      }

      // Check if already friends or request exists
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const statusResponse = await friendsService.getFriendshipStatus(
        currentUser.id,
        targetUserId,
      );
      const existingFriendship = statusResponse.success
        ? statusResponse.friendship
        : null;

      if (existingFriendship) {
        if (existingFriendship.status === "pending") {
          throw new Error("Friend request already sent");
        } else if (existingFriendship.status === "accepted") {
          throw new Error("You are already friends");
        }
      }

      // Send friend request
      console.log("🔄 Sending friend request...");
      const friendshipResponse = await friendsService.sendFriendRequest(
        currentUser.id,
        targetUserId,
      );
      console.log("🔄 Friend request response:", friendshipResponse);

      if (!friendshipResponse.success || !friendshipResponse.friendship) {
        throw new Error(
          friendshipResponse.error || "Failed to send friend request",
        );
      }

      // Immediately update friendship status in store
      set({ friendshipStatus: "pending" });

      // Create alert with the actual friendship ID
      const alertRequest = {
        userId: targetUserId,
        type: "FRIEND_REQUEST" as AlertType,
        entityId: friendshipResponse.friendship.id, // Use actual friendship ID
        actorId: currentUser.id,
        actorName: currentUser.displayName || "Someone",
        actorUsername: currentUser.username || "someone",
        actorAvatar: currentUser.avatar || "", // Add actor avatar
      };

      console.log("🔄 About to create alert for user:", targetUserId);

      // Create alert for the recipient
      const { alertService } =
        await import("@/middleware/services/service-factory");

      const alertResult = await alertService.createAlert(alertRequest);

      console.log("🔄 Alert creation result:", alertResult);

      if (!alertResult.success) {
        console.warn(
          "⚠️ Alert service failed for friend request, using direct Firestore fallback:",
          alertResult.error,
        );

        await addDoc(collection(db, "alerts"), {
          userId: targetUserId,
          type: "FRIEND_REQUEST",
          entityId: friendshipResponse.friendship.id,
          actorId: currentUser.id,
          message: "sent you a friend request",
          metadata: {
            actorName: currentUser.displayName || "Someone",
            actorUsername: currentUser.username || "someone",
            actorAvatar: currentUser.avatar || "",
          },
          isRead: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to send friend request";
      set({ error: errorMessage });
      return false;
    }
  },

  // Cancel friend request
  cancelFriendRequest: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        return false;
      }

      console.log("🔄 About to cancel friend request for user:", targetUserId);

      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const friendshipResponse = await friendsService.getFriendshipStatus(
        currentUser.id,
        targetUserId,
      );

      if (!friendshipResponse.success) {
        throw new Error(
          friendshipResponse.error || "Failed to load friend request status",
        );
      }

      const friendship = friendshipResponse.friendship;

      if (!friendship) {
        set({ friendshipStatus: "none" });
        return true;
      }

      if (friendship.status !== "pending") {
        set({ friendshipStatus: friendship.status || "none" });
        return friendship.status === "rejected";
      }

      if (friendship.requesterId !== currentUser.id) {
        throw new Error("Only the sender can cancel this friend request");
      }

      const removeResponse = await friendsService.removeFriend(
        friendship.id,
        currentUser.id,
      );

      if (!removeResponse.success) {
        throw new Error(
          removeResponse.error || "Failed to cancel friend request",
        );
      }

      const alertsQuery = query(
        collection(db, "alerts"),
        where("userId", "==", targetUserId),
        where("type", "==", "FRIEND_REQUEST"),
        where("actorId", "==", currentUser.id),
      );

      const alertsSnapshot = await getDocs(alertsQuery);
      await Promise.all(alertsSnapshot.docs.map((doc) => deleteDoc(doc.ref)));

      set({ friendshipStatus: "none" });
      console.log("✅ Friend request cancelled successfully");

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to cancel friend request";
      set({ error: errorMessage });
      return false;
    }
  },

  // Check friendship status
  checkFriendshipStatus: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        return;
      }

      const { friendsService } =
        await import("@/middleware/services/service-factory");

      const friendshipResponse = await friendsService.getFriendshipStatus(
        currentUser.id,
        targetUserId,
      );

      const areFriends =
        friendshipResponse.success &&
        friendshipResponse.friendship?.status === "accepted";
      const friendship = friendshipResponse.success
        ? friendshipResponse.friendship
        : null;

      set({
        isFriend: areFriends,
        friendshipStatus: friendship?.status || "none",
      });
    } catch (error) {
      console.error("Error checking friendship status:", error);
    }
  },

  // Clear profile
  clearProfile: () => {
    set({
      profile: null,
      friends: [],
      isFriend: false,
      friendshipStatus: "none",
      friendsCount: 0,
      error: null,
    });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Set error
  setError: (error: string | null) => {
    set({ error });
  },

  // Increment friends count (called when friend request is accepted)
  incrementFriendsCount: async (userId: string) => {
    try {
      console.log("🔄 Incrementing friends count for user:", userId);

      // Get current friends count
      const currentCount = get().friendsCount;
      const newCount = currentCount + 1;

      console.log(
        "🔄 Updating friends count from",
        currentCount,
        "to",
        newCount,
      );

      // Update local state
      set({ friendsCount: newCount });

      // Update followersCount in Firestore
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db: firestoreDb } = await import("@/backend/lib/firebase");
      const userRef = doc(firestoreDb, "users", userId);
      await updateDoc(userRef, { followersCount: newCount });

      console.log("✅ Friends count incremented to:", newCount);
    } catch (error) {
      console.error("❌ Error incrementing friends count:", error);
    }
  },

  // Unfriend user
  unfriendUser: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("You must be logged in to unfriend someone");
      }

      if (currentUser.id === targetUserId) {
        throw new Error("You cannot unfriend yourself");
      }

      console.log("🔄 Unfriending user:", targetUserId);

      // Unfriend the user
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const response = await friendsService.unfriendUser(
        currentUser.id,
        targetUserId,
      );

      if (response.success) {
        // Update friendship status
        set({
          isFriend: false,
          friendshipStatus: "none",
        });

        // Decrement friends count for both users
        await get().decrementFriendsCount(currentUser.id);
        await get().decrementFriendsCount(targetUserId);

        console.log("✅ Successfully unfriended user");
        return true;
      } else {
        throw new Error(response.error || "Failed to unfriend user");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to unfriend user";
      set({ error: errorMessage });
      return false;
    }
  },

  // Decrement friends count (called when user is unfriended)
  decrementFriendsCount: async (userId: string) => {
    try {
      console.log("🔄 Decrementing friends count for user:", userId);

      // Get current friends count
      const currentCount = get().friendsCount;
      const newCount = Math.max(0, currentCount - 1);

      console.log(
        "🔄 Updating friends count from",
        currentCount,
        "to",
        newCount,
      );

      // Update local state
      set({ friendsCount: newCount });

      // Update followersCount in Firestore
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db: firestoreDb } = await import("@/backend/lib/firebase");
      const userRef = doc(firestoreDb, "users", userId);
      await updateDoc(userRef, { followersCount: newCount });

      console.log("✅ Friends count decremented to:", newCount);
    } catch (error) {
      console.error("❌ Error decrementing friends count:", error);
    }
  },
}));
