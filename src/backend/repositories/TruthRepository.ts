// Truth Repository - Firebase implementation
// Follows architecture contract strictly

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
  or,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  ITruthRepository,
  Truth,
  CreateTruthRequest,
  UpdateTruthRequest,
  TruthVote,
} from "@/backend/domain/interfaces/ITruthRepository";

export class TruthRepository implements ITruthRepository {
  async createTruth(request: CreateTruthRequest): Promise<Truth> {
    try {
      const truthRef = await addDoc(collection(db, "truths"), {
        challenger_id: request.challenger_id,
        receiver_id: request.receiver_id,
        question: request.question,
        state: "SENT",
        votes: { truth: 0, lie: 0, total: 0 },
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        answered_at: null,
        reviewed_at: null,
      });

      const truthDoc = await getDoc(truthRef);
      const data = truthDoc.data();

      if (!data) {
        throw new Error("Failed to create truth document");
      }

      return {
        id: truthDoc.id,
        challenger_id: data.challenger_id,
        receiver_id: data.receiver_id,
        question: data.question,
        state: data.state,
        votes: data.votes,
        created_at:
          data.created_at?.toDate?.()?.toISOString?.() ||
          new Date().toISOString(),
        updated_at:
          data.updated_at?.toDate?.()?.toISOString?.() ||
          new Date().toISOString(),
        answered_at: data.answered_at?.toDate?.()?.toISOString?.() || null,
        reviewed_at: data.reviewed_at?.toDate?.()?.toISOString?.() || null,
      };
    } catch (error) {
      throw new Error(`Failed to create truth: ${error}`);
    }
  }

  async getTruthById(truthId: string): Promise<Truth | null> {
    try {
      const truthDoc = await getDoc(doc(db, "truths", truthId));

      if (!truthDoc.exists()) {
        return null;
      }

      const data = truthDoc.data();
      return this.mapToTruth({ id: truthDoc.id, ...data });
    } catch (error) {
      throw new Error(`Failed to get truth: ${error}`);
    }
  }

  async getUserTruths(
    userId: string,
    type?: "sent" | "received" | "all",
  ): Promise<Truth[]> {
    try {
      let q;

      if (type === "sent") {
        q = query(
          collection(db, "truths"),
          where("challenger_id", "==", userId),
          orderBy("created_at", "desc"),
          limit(50),
        );
      } else if (type === "received") {
        q = query(
          collection(db, "truths"),
          where("receiver_id", "==", userId),
          orderBy("created_at", "desc"),
          limit(50),
        );
      } else {
        // Get all truths where user is either challenger or receiver
        q = query(
          collection(db, "truths"),
          or(
            where("challenger_id", "==", userId),
            where("receiver_id", "==", userId),
          ),
          orderBy("created_at", "desc"),
          limit(50),
        );
      }

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) =>
        this.mapToTruth({ id: doc.id, ...doc.data() }),
      );
    } catch (error) {
      throw new Error(`Failed to get user truths: ${error}`);
    }
  }

  async updateTruth(
    truthId: string,
    updates: UpdateTruthRequest,
  ): Promise<Truth> {
    try {
      const updateData: any = { ...updates, updated_at: serverTimestamp() };

      if (updates.answered_at) {
        updateData.answered_at = serverTimestamp();
      }

      if (updates.reviewed_at) {
        updateData.reviewed_at = serverTimestamp();
      }

      await updateDoc(doc(db, "truths", truthId), updateData);

      const updatedDoc = await getDoc(doc(db, "truths", truthId));
      const data = updatedDoc.data();

      return this.mapToTruth({ id: truthId, ...data });
    } catch (error) {
      throw new Error(`Failed to update truth: ${error}`);
    }
  }

  async answerTruth(truthId: string, answer: string): Promise<Truth> {
    return this.updateTruth(truthId, {
      answer,
      state: "ANSWERED",
      answered_at: new Date().toISOString(),
    });
  }

  async voteOnTruth(
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ): Promise<void> {
    try {
      // Add vote to subcollection
      await addDoc(collection(db, "truths", truthId, "votes"), {
        voter_id: voterId,
        vote,
        created_at: serverTimestamp(),
      });

      // Update vote counts
      const truthDoc = await getDoc(doc(db, "truths", truthId));
      const data = truthDoc.data();

      if (!data) {
        throw new Error("Truth document not found");
      }

      const currentVotes = data.votes || { truth: 0, lie: 0, total: 0 };

      const newVotes = {
        ...currentVotes,
        [vote.toLowerCase()]: currentVotes[vote.toLowerCase()] + 1,
        total: currentVotes.total + 1,
      };

      await updateDoc(doc(db, "truths", truthId), {
        votes: newVotes,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      throw new Error(`Failed to vote on truth: ${error}`);
    }
  }

  async getTruthVotes(truthId: string): Promise<TruthVote[]> {
    try {
      const votesSnapshot = await getDocs(
        collection(db, "truths", truthId, "votes"),
      );
      return votesSnapshot.docs.map((doc) => ({
        id: doc.id,
        truth_id: truthId,
        voter_id: doc.data().voter_id,
        vote: doc.data().vote,
        created_at: doc.data().created_at.toISOString(),
      }));
    } catch (error) {
      throw new Error(`Failed to get truth votes: ${error}`);
    }
  }

  async canTruthUser(
    challengerId: string,
    receiverId: string,
  ): Promise<boolean> {
    try {
      // Check if users are friends (simplified for now)
      // In a real app, you'd check friendship status
      return challengerId !== receiverId; // Basic check - can't truth yourself
    } catch (error) {
      return false;
    }
  }

  async deleteTruth(truthId: string): Promise<void> {
    try {
      // Delete main document
      await deleteDoc(doc(db, "truths", truthId));

      // Delete votes subcollection
      const votesSnapshot = await getDocs(
        collection(db, "truths", truthId, "votes"),
      );
      const deletePromises = votesSnapshot.docs.map((doc) =>
        deleteDoc(doc.ref),
      );
      await Promise.all(deletePromises);
    } catch (error) {
      throw new Error(`Failed to delete truth: ${error}`);
    }
  }

  subscribeToUserTruths(
    userId: string,
    type: "sent" | "received" | "all",
    callback: (truths: Truth[]) => void,
  ): Unsubscribe {
    let q;

    if (type === "sent") {
      q = query(
        collection(db, "truths"),
        where("challenger_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(50),
      );
    } else if (type === "received") {
      q = query(
        collection(db, "truths"),
        where("receiver_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(50),
      );
    } else {
      q = query(
        collection(db, "truths"),
        or(
          where("challenger_id", "==", userId),
          where("receiver_id", "==", userId),
        ),
        orderBy("created_at", "desc"),
        limit(50),
      );
    }

    return onSnapshot(q, (snapshot) => {
      const truths = snapshot.docs.map((doc) =>
        this.mapToTruth({ id: doc.id, ...doc.data() }),
      );
      callback(truths);
    });
  }

  private mapToTruth(data: any): Truth {
    return {
      id: data.id,
      challenger_id: data.challenger_id,
      receiver_id: data.receiver_id,
      question: data.question,
      state: data.state,
      answer: data.answer,
      votes: data.votes,
      created_at: data.created_at,
      updated_at: data.updated_at,
      answered_at: data.answered_at,
      reviewed_at: data.reviewed_at,
    };
  }
}
