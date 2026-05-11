import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
  limit,
  documentId,
} from "firebase/firestore";
import { userService, UserProfile } from "./user.service";
import { logFirestoreError } from "@/utils/firestoreErrors";

export type FriendshipStatus = "pending" | "accepted" | "rejected";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  accepted_at: string | null;
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  accepted_at: string | null;
  requester_profile: UserProfile;
}

export interface Friend extends UserProfile {
  friendship_id: string;
  friendship_status: FriendshipStatus;
  friendship_created_at: string;
  friendship_accepted_at: string | null;
}

class FriendsService {
  private readonly friendsCacheTtlMs = 15 * 60 * 1000;
  private friendsCache = new Map<
    string,
    { data: Friend[]; expiresAt: number }
  >();
  private friendshipBetweenCache = new Map<
    string,
    { data: Friendship | null; expiresAt: number }
  >();
  private inFlightFriendsRequests = new Map<string, Promise<Friend[]>>();

  private getCanonicalFriendshipId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join("_");
  }

  private getCachedFriends(userId: string): Friend[] | null {
    const cached = this.friendsCache.get(userId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.friendsCache.delete(userId);
      return null;
    }
    return cached.data;
  }

  private setCachedFriends(userId: string, friends: Friend[]): void {
    this.friendsCache.set(userId, {
      data: friends,
      expiresAt: Date.now() + this.friendsCacheTtlMs,
    });
  }

  private invalidateFriendsCache(...userIds: Array<string | undefined>): void {
    const validIds = userIds.filter((id): id is string => !!id);
    validIds.forEach((userId) => {
      this.friendsCache.delete(userId);
      this.inFlightFriendsRequests.delete(userId);
    });
    // Clear friendship-between cache entries involving these users
    if (validIds.length >= 2) {
      const pairKey = validIds.slice(0, 2).sort().join(":");
      this.friendshipBetweenCache.delete(pairKey);
    }
  }

  async sendFriendRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<Friendship> {
    try {
      const existing = await this.getFriendshipBetweenUsers(
        requesterId,
        addresseeId,
      );
      if (existing) {
        throw new Error("Friendship already exists");
      }

      if (requesterId === addresseeId) {
        throw new Error("Cannot send friend request to yourself");
      }

      const friendshipRef = doc(
        db,
        "friendships",
        this.getCanonicalFriendshipId(requesterId, addresseeId),
      );
      const friendshipData = {
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: "pending",
        created_at: new Date().toISOString(),
        accepted_at: null,
      };

      await setDoc(friendshipRef, friendshipData);
      this.invalidateFriendsCache(requesterId, addresseeId);
      return { id: friendshipRef.id, ...friendshipData } as Friendship;
    } catch (error) {
      console.error("Error sending friend request:", error);
      throw error;
    }
  }

  async acceptFriendRequest(friendshipId: string): Promise<Friendship> {
    try {
      const friendshipRef = doc(db, "friendships", friendshipId);
      await updateDoc(friendshipRef, {
        status: "accepted",
        accepted_at: new Date().toISOString(),
      });

      const updatedDoc = await getDoc(friendshipRef);
      if (!updatedDoc.exists()) {
        throw new Error("Friendship not found");
      }

      const accepted = {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      } as Friendship;
      this.invalidateFriendsCache(accepted.requester_id, accepted.addressee_id);
      return accepted;
    } catch (error) {
      console.error("Error accepting friend request:", error);
      throw error;
    }
  }

  async rejectFriendRequest(friendshipId: string): Promise<Friendship> {
    try {
      const friendshipRef = doc(db, "friendships", friendshipId);
      await updateDoc(friendshipRef, {
        status: "rejected",
      });

      const updatedDoc = await getDoc(friendshipRef);
      if (!updatedDoc.exists()) {
        throw new Error("Friendship not found");
      }

      const rejected = {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      } as Friendship;
      this.invalidateFriendsCache(rejected.requester_id, rejected.addressee_id);
      return rejected;
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      throw error;
    }
  }

  async cancelFriendRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<boolean> {
    try {
      console.log(
        "🔄 FriendsService: Cancelling friend request between",
        requesterId,
        "and",
        addresseeId,
      );

      // Find the friendship document
      const friendship = await this.getFriendshipBetweenUsers(
        requesterId,
        addresseeId,
      );

      if (!friendship) {
        console.log("❌ No friendship found to cancel");
        return false;
      }

      if (friendship.status !== "pending") {
        console.log("❌ Friendship is not pending, cannot cancel");
        return false;
      }

      // Delete the friendship document
      const friendshipRef = doc(db, "friendships", friendship.id);
      await deleteDoc(friendshipRef);
      this.invalidateFriendsCache(requesterId, addresseeId);

      console.log("✅ Friend request cancelled successfully");
      return true;
    } catch (error) {
      console.error("❌ Error cancelling friend request:", error);
      throw error;
    }
  }

  async getFriendshipBetweenUsers(
    userId1: string,
    userId2: string,
  ): Promise<Friendship | null> {
    try {
      // Cache key is sorted so (A,B) and (B,A) hit same entry
      const pairKey = [userId1, userId2].sort().join(":");
      const now = Date.now();
      const cached = this.friendshipBetweenCache.get(pairKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }

      const friendshipsRef = collection(db, "friendships");
      const canonicalFriendshipId = this.getCanonicalFriendshipId(
        userId1,
        userId2,
      );
      const canonicalFriendshipDoc = await getDoc(
        doc(db, "friendships", canonicalFriendshipId),
      );

      if (canonicalFriendshipDoc.exists()) {
        const result = {
          id: canonicalFriendshipDoc.id,
          ...canonicalFriendshipDoc.data(),
        } as Friendship;
        this.friendshipBetweenCache.set(pairKey, {
          data: result,
          expiresAt: now + this.friendsCacheTtlMs,
        });
        return result;
      }

      // Fallback for legacy friendships created before deterministic IDs.
      const [forwardSnap, reverseSnap] = await Promise.all([
        getDocs(
          query(
            friendshipsRef,
            where("requester_id", "==", userId1),
            where("addressee_id", "==", userId2),
          ),
        ),
        getDocs(
          query(
            friendshipsRef,
            where("requester_id", "==", userId2),
            where("addressee_id", "==", userId1),
          ),
        ),
      ]);

      const allDocs = [...forwardSnap.docs, ...reverseSnap.docs];
      if (allDocs.length === 0) {
        this.friendshipBetweenCache.set(pairKey, {
          data: null,
          expiresAt: now + this.friendsCacheTtlMs,
        });
        return null;
      }

      const docSnap = allDocs[0];
      const result = { id: docSnap.id, ...docSnap.data() } as Friendship;
      this.friendshipBetweenCache.set(pairKey, {
        data: result,
        expiresAt: now + this.friendsCacheTtlMs,
      });
      return result;
    } catch (error) {
      logFirestoreError("Error getting friendship between users:", error);
      return null;
    }
  }

  async getFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      const friendshipsRef = collection(db, "friendships");
      const q = query(
        friendshipsRef,
        where("addressee_id", "==", userId),
        where("status", "==", "pending"),
        orderBy("created_at", "desc"),
      );
      const querySnapshot = await getDocs(q);

      const requests: FriendRequest[] = [];
      for (const doc of querySnapshot.docs) {
        const friendship = { id: doc.id, ...doc.data() } as Friendship;
        const requesterProfile = await userService.getProfile(
          friendship.requester_id,
        );

        if (requesterProfile) {
          requests.push({
            ...friendship,
            requester_profile: requesterProfile,
          });
        }
      }

      return requests;
    } catch (error) {
      logFirestoreError("Error getting friend requests:", error);
      return [];
    }
  }

  async getFriends(userId: string): Promise<Friend[]> {
    try {
      const cachedFriends = this.getCachedFriends(userId);
      if (cachedFriends) {
        return cachedFriends;
      }

      const existingRequest = this.inFlightFriendsRequests.get(userId);
      if (existingRequest) {
        return existingRequest;
      }

      const request = this.fetchFriends(userId).finally(() => {
        this.inFlightFriendsRequests.delete(userId);
      });
      this.inFlightFriendsRequests.set(userId, request);
      return request;
    } catch (error) {
      logFirestoreError("Error getting friends:", error);
      return [];
    }
  }

  private async fetchFriends(userId: string): Promise<Friend[]> {
    try {
      const friendshipsRef = collection(db, "friendships");

      // Firestore does not allow multiple "in" filters in a single query.
      // Instead, fetch friendships where the current user is either the
      // requester OR the addressee, then merge the results.
      const [asRequesterSnap, asAddresseeSnap] = await Promise.all([
        getDocs(
          query(
            friendshipsRef,
            where("status", "==", "accepted"),
            where("requester_id", "==", userId),
          ),
        ),
        getDocs(
          query(
            friendshipsRef,
            where("status", "==", "accepted"),
            where("addressee_id", "==", userId),
          ),
        ),
      ]);

      const allDocs = [...asRequesterSnap.docs, ...asAddresseeSnap.docs];
      const seenIds = new Set<string>();
      const friendshipsByOtherUser = new Map<string, Friendship>();

      for (const docSnap of allDocs) {
        if (seenIds.has(docSnap.id)) continue;
        seenIds.add(docSnap.id);

        const friendship = { id: docSnap.id, ...docSnap.data() } as Friendship;
        const otherUserId =
          friendship.requester_id === userId
            ? friendship.addressee_id
            : friendship.requester_id;
        friendshipsByOtherUser.set(otherUserId, friendship);
      }

      // Batch fetch all friend profiles in a single query
      const profileIds = Array.from(friendshipsByOtherUser.keys());
      const profilesMap = new Map<string, UserProfile>();

      if (profileIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < profileIds.length; i += 10) {
          chunks.push(profileIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where(documentId(), "in", chunk));
          const snapshot = await getDocs(q);
          snapshot.forEach((docSnap) => {
            profilesMap.set(docSnap.id, {
              id: docSnap.id,
              ...docSnap.data(),
            } as UserProfile);
          });
        }
      }

      // Build friends array with profiles
      const friends: Friend[] = [];
      for (const [otherUserId, friendship] of friendshipsByOtherUser) {
        const profile = profilesMap.get(otherUserId);

        if (profile) {
          friends.push({
            ...profile,
            friendship_id: friendship.id,
            friendship_status: friendship.status,
            friendship_created_at: friendship.created_at,
            friendship_accepted_at: friendship.accepted_at,
          });
        }
      }

      this.setCachedFriends(userId, friends);
      return friends;
    } catch (error) {
      logFirestoreError("Error getting friends:", error);
      return [];
    }
  }

  async removeFriend(friendshipId: string): Promise<boolean> {
    try {
      const existingFriendship = await getDoc(
        doc(db, "friendships", friendshipId),
      );
      const friendshipRef = doc(db, "friendships", friendshipId);
      await deleteDoc(friendshipRef);
      if (existingFriendship.exists()) {
        const friendship = existingFriendship.data() as Friendship;
        this.invalidateFriendsCache(
          friendship.requester_id,
          friendship.addressee_id,
        );
      }
      return true;
    } catch (error) {
      logFirestoreError("Error removing friend:", error);
      return false;
    }
  }

  async unfriendUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<boolean> {
    try {
      // Find the friendship between these two users
      const friendship = await this.getFriendshipBetweenUsers(
        currentUserId,
        targetUserId,
      );

      if (!friendship) {
        console.error("No friendship found between users");
        return false;
      }

      if (friendship.status !== "accepted") {
        console.error("Users are not friends");
        return false;
      }

      // Remove the friendship
      const success = await this.removeFriend(friendship.id);

      if (success) {
        console.log("✅ Successfully unfriended user");
        this.invalidateFriendsCache(currentUserId, targetUserId);
        return true;
      } else {
        console.error("❌ Failed to unfriend user");
        return false;
      }
    } catch (error) {
      console.error("Error unfriending user:", error);
      return false;
    }
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const friendship = await this.getFriendshipBetweenUsers(userId1, userId2);
      return friendship?.status === "accepted" || false;
    } catch (error) {
      logFirestoreError("Error checking friendship status:", error);
      return false;
    }
  }

  async getFriendsCount(userId: string): Promise<number> {
    try {
      const friends = await this.getFriends(userId);
      return friends.length;
    } catch (error) {
      logFirestoreError("Error getting friends count:", error);
      return 0;
    }
  }
}

export const friendsService = new FriendsService();
