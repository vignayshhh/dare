import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IDareRepository,
  Dare,
  DareVote,
  CreateDareRequest,
  UpdateDareRequest,
} from "@/backend/domain/interfaces/IDareRepository";

export class DareRepository implements IDareRepository {
  async createDare(request: CreateDareRequest): Promise<Dare> {
    try {
      const dareRef = await addDoc(collection(db, "dares"), {
        challenger_id: request.challengerId,
        receiver_id: request.receiverId,
        description: request.description,
        state: "SENT",
        proof_media_url: null,
        proof_media_type: null,
        challenger_vote: null,
        validation_threshold_met: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        accepted_at: null,
        proof_submitted_at: null,
        completed_at: null,
        ghost_mode_until: null,
      });

      const dare = await this.getDareById(dareRef.id);
      if (!dare) {
        throw new Error("Failed to create dare");
      }
      return dare;
    } catch (error) {
      console.error("createDare error:", error);
      throw error;
    }
  }

  async getDareById(dareId: string): Promise<Dare | null> {
    try {
      const dareDocRef = doc(db, "dares", dareId);
      const dareDoc = await getDoc(dareDocRef);

      if (!dareDoc.exists()) {
        return null;
      }

      // ✅ Pass doc.id so mapToDare gets the real Firestore document ID
      return this.mapToDare(dareDoc.id, dareDoc.data());
    } catch (error) {
      console.error("getDareById error:", error);
      throw error;
    }
  }

  async getDaresByUserId(userId: string): Promise<Dare[]> {
    try {
      const daresQuery = query(
        collection(db, "dares"),
        where("challenger_id", "==", userId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(daresQuery);
      const dares: Dare[] = [];

      querySnapshot.forEach((doc) => {
        // ✅ Pass doc.id alongside doc.data()
        dares.push(this.mapToDare(doc.id, doc.data()));
      });

      return dares;
    } catch (error) {
      console.error("getDaresByUserId error:", error);
      throw error;
    }
  }

  async getReceivedDares(userId: string): Promise<Dare[]> {
    try {
      const daresQuery = query(
        collection(db, "dares"),
        where("receiver_id", "==", userId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(daresQuery);
      const dares: Dare[] = [];

      querySnapshot.forEach((doc) => {
        // ✅ Pass doc.id alongside doc.data()
        dares.push(this.mapToDare(doc.id, doc.data()));
      });

      return dares;
    } catch (error) {
      console.error("getReceivedDares error:", error);
      throw error;
    }
  }

  async getSentDares(userId: string): Promise<Dare[]> {
    return this.getDaresByUserId(userId);
  }

  async updateDare(dareId: string, updates: UpdateDareRequest): Promise<Dare> {
    try {
      const dareRef = doc(db, "dares", dareId);

      const firestoreUpdates: any = {
        updated_at: serverTimestamp(),
      };

      if (updates.state !== undefined) {
        firestoreUpdates.state = updates.state;

        if (updates.state === "ACCEPTED") {
          firestoreUpdates.accepted_at = serverTimestamp();
        } else if (updates.state === "PROOF_SUBMITTED") {
          firestoreUpdates.proof_submitted_at = serverTimestamp();
        } else if (
          updates.state === "ACCEPTED_REAL" ||
          updates.state === "REJECTED_FAKE"
        ) {
          firestoreUpdates.completed_at = serverTimestamp();
        }
      }

      if (updates.proofMediaUrl !== undefined) {
        firestoreUpdates.proof_media_url = updates.proofMediaUrl;
      }

      if (updates.proofMediaType !== undefined) {
        firestoreUpdates.proof_media_type = updates.proofMediaType;
      }

      if (updates.challengerVote !== undefined) {
        firestoreUpdates.challenger_vote = updates.challengerVote;
      }

      await updateDoc(dareRef, firestoreUpdates);

      const updatedDare = await this.getDareById(dareId);
      if (!updatedDare) {
        throw new Error("Dare not found after update");
      }

      return updatedDare;
    } catch (error) {
      console.error("updateDare error:", error);
      throw error;
    }
  }

  async submitProof(
    dareId: string,
    mediaUrl: string,
    mediaType: "TEXT" | "PHOTO" | "VIDEO",
  ): Promise<Dare> {
    return this.updateDare(dareId, {
      state: "PROOF_SUBMITTED",
      proofMediaUrl: mediaUrl,
      proofMediaType: mediaType,
    });
  }

  async voteOnDare(
    dareId: string,
    voterId: string,
    vote: "REAL" | "FAKE",
  ): Promise<DareVote> {
    try {
      const existingVoteQuery = query(
        collection(db, "dare_votes"),
        where("dare_id", "==", dareId),
        where("voter_id", "==", voterId),
      );

      const existingVoteSnapshot = await getDocs(existingVoteQuery);

      if (!existingVoteSnapshot.empty) {
        const existingVoteDoc = existingVoteSnapshot.docs[0];
        await updateDoc(existingVoteDoc.ref, { vote });

        const updatedVote = await this.getDareVoteById(existingVoteDoc.id);
        if (!updatedVote) {
          throw new Error("Vote not found after update");
        }
        return updatedVote;
      } else {
        const voteRef = await addDoc(collection(db, "dare_votes"), {
          dare_id: dareId,
          voter_id: voterId,
          vote,
          created_at: serverTimestamp(),
        });

        const newVote = await this.getDareVoteById(voteRef.id);
        if (!newVote) {
          throw new Error("Failed to create vote");
        }
        return newVote;
      }
    } catch (error) {
      console.error("voteOnDare error:", error);
      throw error;
    }
  }

  async getDareVotes(dareId: string): Promise<DareVote[]> {
    try {
      const votesQuery = query(
        collection(db, "dare_votes"),
        where("dare_id", "==", dareId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(votesQuery);
      const votes: DareVote[] = [];

      querySnapshot.forEach((doc) => {
        // ✅ Pass doc.id alongside doc.data()
        votes.push(this.mapToDareVote(doc.id, doc.data()));
      });

      return votes;
    } catch (error) {
      console.error("getDareVotes error:", error);
      throw error;
    }
  }

  async canDareUser(
    challengerId: string,
    receiverId: string,
  ): Promise<boolean> {
    try {
      return true;
    } catch (error) {
      return false;
    }
  }

  async getActiveDaresCount(userId: string): Promise<number> {
    try {
      const activeDaresQuery = query(
        collection(db, "dares"),
        where("receiver_id", "==", userId),
        where("state", "in", [
          "SENT",
          "ACCEPTED",
          "PROOF_SUBMITTED",
          "UNDER_REVIEW",
          "FRIENDS_VALIDATION",
        ]),
      );

      const querySnapshot = await getDocs(activeDaresQuery);
      return querySnapshot.size;
    } catch (error) {
      console.error("getActiveDaresCount error:", error);
      throw error;
    }
  }

  private async getDareVoteById(voteId: string): Promise<DareVote | null> {
    try {
      const voteDocRef = doc(db, "dare_votes", voteId);
      const voteDoc = await getDoc(voteDocRef);

      if (!voteDoc.exists()) {
        return null;
      }

      // ✅ Pass doc.id alongside doc.data()
      return this.mapToDareVote(voteDoc.id, voteDoc.data());
    } catch (error) {
      console.error("getDareVoteById error:", error);
      throw error;
    }
  }

  private async getUserProfile(userId: string): Promise<any> {
    try {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);
      return userDoc.exists() ? userDoc.data() : null;
    } catch (error) {
      console.error("getUserProfile error:", error);
      return null;
    }
  }

  async deleteDare(dareId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, "dares", dareId));

      // Delete associated votes
      const votesQuery = query(
        collection(db, "dare_votes"),
        where("dare_id", "==", dareId),
      );
      const votesSnapshot = await getDocs(votesQuery);
      const deletePromises = votesSnapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error("deleteDare error:", error);
      throw error;
    }
  }

  // ✅ Fixed: accepts docId as first argument instead of reading data.id
  // (Firestore document IDs live on doc.id, never inside doc.data())
  private mapToDare(docId: string, data: any): Dare {
    return {
      id: docId,
      challengerId: data.challenger_id,
      receiverId: data.receiver_id,
      description: data.description,
      state: data.state,
      proofMediaUrl: data.proof_media_url,
      proofMediaType: data.proof_media_type,
      challengerVote: data.challenger_vote,
      validationThresholdMet: data.validation_threshold_met,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      acceptedAt: data.accepted_at,
      proofSubmittedAt: data.proof_submitted_at,
      completedAt: data.completed_at,
      ghostModeUntil: data.ghost_mode_until,
    };
  }

  // ✅ Fixed: same pattern for votes
  private mapToDareVote(docId: string, data: any): DareVote {
    return {
      id: docId,
      dareId: data.dare_id,
      voterId: data.voter_id,
      vote: data.vote,
      createdAt: data.created_at,
    };
  }

  async getDaresFromUserAndFriends(
    userId: string,
    friendIds: string[],
  ): Promise<Dare[]> {
    try {
      // Combine user ID with friend IDs
      const allUserIds = [userId, ...friendIds];

      // Query for dares where challenger is in the user's network
      const challengerQuery = query(
        collection(db, "dares"),
        where("challenger_id", "in", allUserIds),
        orderBy("created_at", "desc"),
      );

      // Query for dares where receiver is in the user's network
      const receiverQuery = query(
        collection(db, "dares"),
        where("receiver_id", "in", allUserIds),
        orderBy("created_at", "desc"),
      );

      // Execute both queries
      const [challengerSnapshot, receiverSnapshot] = await Promise.all([
        getDocs(challengerQuery),
        getDocs(receiverQuery),
      ]);

      const dares: Dare[] = [];

      // Process challenger dares
      challengerSnapshot.forEach((doc) => {
        dares.push(this.mapToDare(doc.id, doc.data()));
      });

      // Process receiver dares
      receiverSnapshot.forEach((doc) => {
        dares.push(this.mapToDare(doc.id, doc.data()));
      });

      // Remove duplicates (in case a dare appears in both queries)
      const uniqueDares = dares.filter(
        (dare, index, self) =>
          index === self.findIndex((d) => d.id === dare.id),
      );

      // Sort by createdAt descending
      uniqueDares.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });

      console.log(`📊 Found ${uniqueDares.length} dares from user and friends`);
      return uniqueDares;
    } catch (error) {
      console.error("getDaresFromUserAndFriends error:", error);
      throw error;
    }
  }

  subscribeToUserDares(
    userId: string,
    type: "sent" | "received" | "all",
    callback: (dares: Dare[]) => void,
  ): Unsubscribe {
    let q;

    if (type === "sent") {
      q = query(
        collection(db, "dares"),
        where("challenger_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(50),
      );
    } else if (type === "received") {
      q = query(
        collection(db, "dares"),
        where("receiver_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(50),
      );
    } else {
      // For "all", we need to get both sent and received dares
      // This is more complex with Firestore, so we'll use two separate queries
      // and combine the results
      const sentQuery = query(
        collection(db, "dares"),
        where("challenger_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(25),
      );
      const receivedQuery = query(
        collection(db, "dares"),
        where("receiver_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(25),
      );

      let unsubscribeSent: Unsubscribe;
      let unsubscribeReceived: Unsubscribe;
      let lastSentData: Dare[] = [];
      let lastReceivedData: Dare[] = [];

      const updateCombined = () => {
        const combined = [...lastSentData, ...lastReceivedData];
        // Remove duplicates and sort
        const uniqueDares = combined.filter(
          (dare, index, self) =>
            index === self.findIndex((d) => d.id === dare.id),
        );
        uniqueDares.sort((a, b) => {
          const aTime = new Date(a.createdAt).getTime();
          const bTime = new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
        callback(uniqueDares);
      };

      unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
        lastSentData = snapshot.docs.map((doc) =>
          this.mapToDare(doc.id, doc.data()),
        );
        updateCombined();
      });

      unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
        lastReceivedData = snapshot.docs.map((doc) =>
          this.mapToDare(doc.id, doc.data()),
        );
        updateCombined();
      });

      return () => {
        unsubscribeSent();
        unsubscribeReceived();
      };
    }

    return onSnapshot(q, (snapshot) => {
      const dares = snapshot.docs.map((doc) =>
        this.mapToDare(doc.id, doc.data()),
      );
      callback(dares);
    });
  }
}
