import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IFriendshipRepository,
  Friendship,
  FriendshipStatus,
  CreateFriendshipRequest,
} from "@/backend/domain/interfaces/IFriendshipRepository";

export class FriendshipRepository implements IFriendshipRepository {
  private getCanonicalFriendshipId(user1Id: string, user2Id: string): string {
    return [user1Id, user2Id].sort().join("_");
  }

  async createFriendship(
    request: CreateFriendshipRequest,
  ): Promise<Friendship> {
    try {
      const existingFriendship = await this.getFriendshipBetweenUsers(
        request.requesterId,
        request.addresseeId,
      );

      if (existingFriendship) {
        throw new Error("Friendship already exists");
      }

      const friendshipId = this.getCanonicalFriendshipId(
        request.requesterId,
        request.addresseeId,
      );
      const friendshipRef = doc(db, "friendships", friendshipId);

      await setDoc(friendshipRef, {
        requester_id: request.requesterId,
        addressee_id: request.addresseeId,
        status: "pending",
        created_at: serverTimestamp(),
        accepted_at: null,
      });

      const friendship = await this.getFriendshipById(friendshipRef.id);
      if (!friendship) {
        throw new Error("Failed to create friendship");
      }
      return friendship;
    } catch (error) {
      console.error("createFriendship error:", error);
      throw error;
    }
  }

  async getFriendshipById(friendshipId: string): Promise<Friendship | null> {
    try {
      console.log("🔄 getFriendshipById called:", friendshipId);

      const friendshipRef = doc(db, "friendships", friendshipId);
      const friendshipDoc = await getDoc(friendshipRef);

      if (!friendshipDoc.exists()) {
        console.log("❌ Friendship document not found in Firestore");
        return null;
      }

      const data = friendshipDoc.data();
      const friendship = this.mapToFriendship(data);
      console.log("🔄 Found friendship with ID:", friendshipDoc.id);

      return { ...friendship, id: friendshipDoc.id };
    } catch (error) {
      console.error("getFriendshipById error:", error);
      throw error;
    }
  }

  async getFriendshipBetweenUsers(
    user1Id: string,
    user2Id: string,
  ): Promise<Friendship | null> {
    try {
      console.log("🔄 getFriendshipBetweenUsers called:", { user1Id, user2Id });

      const canonicalFriendshipId = this.getCanonicalFriendshipId(
        user1Id,
        user2Id,
      );
      const canonicalFriendship = await this.getFriendshipById(
        canonicalFriendshipId,
      );

      if (canonicalFriendship) {
        console.log(
          "🔄 Found canonical friendship with doc ID:",
          canonicalFriendshipId,
        );
        return canonicalFriendship;
      }

      // Fallback for legacy friendships created before deterministic IDs.
      const friendshipQuery1 = query(
        collection(db, "friendships"),
        where("requester_id", "==", user1Id),
        where("addressee_id", "==", user2Id),
      );

      const friendshipQuery2 = query(
        collection(db, "friendships"),
        where("requester_id", "==", user2Id),
        where("addressee_id", "==", user1Id),
      );

      const [querySnapshot1, querySnapshot2] = await Promise.all([
        getDocs(friendshipQuery1),
        getDocs(friendshipQuery2),
      ]);

      console.log("🔄 Query snapshot docs:", {
        query1: querySnapshot1.docs.length,
        query2: querySnapshot2.docs.length,
      });

      // Check both query results
      let doc = null;
      if (!querySnapshot1.empty) {
        doc = querySnapshot1.docs[0];
      } else if (!querySnapshot2.empty) {
        doc = querySnapshot2.docs[0];
      }

      if (!doc) {
        console.log("❌ No friendship found between users");
        return null;
      }

      const data = doc.data();
      const friendship = this.mapToFriendship(data);
      console.log("🔄 Found friendship with doc ID:", doc.id);
      console.log("🔄 Friendship data:", friendship);

      // Include the document ID
      return { ...friendship, id: doc.id };
    } catch (error) {
      console.error("getFriendshipBetweenUsers error:", error);
      throw error;
    }
  }

  async getFriendshipsForUser(userId: string): Promise<Friendship[]> {
    try {
      const friendshipsQuery = query(
        collection(db, "friendships"),
        where("requester_id", "==", userId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(friendshipsQuery);
      const friendships: Friendship[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const friendship = this.mapToFriendship(data);
        friendships.push({ ...friendship, id: doc.id });
      });

      const addresseeQuery = query(
        collection(db, "friendships"),
        where("addressee_id", "==", userId),
        orderBy("created_at", "desc"),
      );

      const addresseeSnapshot = await getDocs(addresseeQuery);

      addresseeSnapshot.forEach((doc) => {
        const data = doc.data();
        const friendship = this.mapToFriendship(data);
        friendships.push({ ...friendship, id: doc.id });
      });

      return friendships;
    } catch (error) {
      console.error("getFriendshipsForUser error:", error);
      throw error;
    }
  }

  async getPendingFriendships(userId: string): Promise<Friendship[]> {
    try {
      const friendshipsQuery = query(
        collection(db, "friendships"),
        where("addressee_id", "==", userId),
        where("status", "==", "pending"),
      );

      const querySnapshot = await getDocs(friendshipsQuery);
      const friendships: Friendship[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const friendship = this.mapToFriendship(data);
        friendships.push({ ...friendship, id: doc.id });
      });

      // Sort in memory by createdAt (descending)
      friendships.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });

      return friendships;
    } catch (error) {
      console.error("getPendingFriendships error:", error);
      throw error;
    }
  }

  async getAcceptedFriends(userId: string): Promise<Friendship[]> {
    try {
      const friendshipsQuery = query(
        collection(db, "friendships"),
        where("requester_id", "==", userId),
        where("status", "==", "accepted"),
      );

      const querySnapshot = await getDocs(friendshipsQuery);
      const friendships: Friendship[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const friendship = this.mapToFriendship(data);
        friendships.push({ ...friendship, id: doc.id });
      });

      const addresseeQuery = query(
        collection(db, "friendships"),
        where("addressee_id", "==", userId),
        where("status", "==", "accepted"),
      );

      const addresseeSnapshot = await getDocs(addresseeQuery);

      addresseeSnapshot.forEach((doc) => {
        const data = doc.data();
        const friendship = this.mapToFriendship(data);
        friendships.push({ ...friendship, id: doc.id });
      });

      // Sort in memory by acceptedAt (descending)
      friendships.sort((a, b) => {
        const aTime = a.acceptedAt ? new Date(a.acceptedAt).getTime() : 0;
        const bTime = b.acceptedAt ? new Date(b.acceptedAt).getTime() : 0;
        return bTime - aTime;
      });

      return friendships;
    } catch (error) {
      console.error("getAcceptedFriends error:", error);
      throw error;
    }
  }

  async updateFriendshipStatus(
    friendshipId: string,
    status: FriendshipStatus,
  ): Promise<Friendship> {
    try {
      console.log("🔄 updateFriendshipStatus called:", {
        friendshipId,
        status,
      });

      const friendshipRef = doc(db, "friendships", friendshipId);

      const firestoreUpdates: any = {
        status,
        updated_at: serverTimestamp(),
      };

      if (status === "accepted") {
        firestoreUpdates.accepted_at = serverTimestamp();
      }

      console.log("🔄 Updating Firestore with:", firestoreUpdates);
      await updateDoc(friendshipRef, firestoreUpdates);
      console.log("✅ Firestore update completed");

      const updatedFriendship = await this.getFriendshipById(friendshipId);
      console.log("🔄 Retrieved updated friendship:", updatedFriendship);

      if (!updatedFriendship) {
        throw new Error("Friendship not found after update");
      }

      return updatedFriendship;
    } catch (error) {
      console.error("updateFriendshipStatus error:", error);
      throw error;
    }
  }

  async areUsersFriends(user1Id: string, user2Id: string): Promise<boolean> {
    try {
      const friendship = await this.getFriendshipBetweenUsers(user1Id, user2Id);
      return friendship?.status === "accepted";
    } catch (error) {
      console.error("areUsersFriends error:", error);
      return false;
    }
  }

  async deleteFriendship(friendshipId: string): Promise<void> {
    try {
      const friendshipRef = doc(db, "friendships", friendshipId);
      await deleteDoc(friendshipRef);
    } catch (error) {
      console.error("deleteFriendship error:", error);
      throw error;
    }
  }

  private mapToFriendship(data: any): Omit<Friendship, "id"> {
    return {
      requesterId: data.requester_id,
      addresseeId: data.addressee_id,
      status: data.status,
      createdAt: data.created_at,
      acceptedAt: data.accepted_at,
    };
  }
}
