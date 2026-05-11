// Truth Interactions Service
// Handles truth voting and comments functionality
// All Firebase calls are encapsulated here per ARCHITECTURE_CONTRACT.md

import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { logFirestoreError } from "@/utils/firestoreErrors";

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface TruthVoter {
  id: string;
  otruthId: string;
  ouserId: string;
  vote: "TRUTH" | "LIE";
  displayName: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
}

export interface TruthComment {
  id: string;
  truthId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  likes: number;
  parentId?: string | null;
  createdAt: string;
}

export interface TruthVoteData {
  truthVoters: TruthVoter[];
  lieVoters: TruthVoter[];
  truthCount: number;
  lieCount: number;
  total: number;
  userVote: "TRUTH" | "LIE" | null;
}

// ─── Service Class ─────────────────────────────────────────────────────────────

class TruthInteractionsService {
  // ─── Votes (Truth / Lie) ─────────────────────────────────────────────────

  /** Record a user's vote on a truth. Idempotent — updates if already voted. */
  async recordVote(
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ): Promise<void> {
    try {
      // Check for existing vote
      const q = query(
        collection(db, "truth_votes"),
        where("truth_id", "==", truthId),
        where("voter_id", "==", voterId),
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        // Update existing vote
        const existingDoc = existing.docs[0];
        await updateDoc(existingDoc.ref, { vote });
      } else {
        // Create new vote
        await addDoc(collection(db, "truth_votes"), {
          truth_id: truthId,
          voter_id: voterId,
          vote,
          created_at: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("❌ recordVote:", error);
      throw error;
    }
  }

  /** Subscribe to real-time vote data for a truth, enriched with voter profiles. */
  subscribeToVotes(
    truthId: string,
    currentUserId: string,
    callback: (data: TruthVoteData) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "truth_votes"),
      where("truth_id", "==", truthId),
      orderBy("created_at", "desc"),
    );

    return onSnapshot(q, async (snap) => {
      const truthVoters: TruthVoter[] = [];
      const lieVoters: TruthVoter[] = [];
      let userVote: "TRUTH" | "LIE" | null = null;

      // Collect voter IDs for batch profile fetch
      const voterEntries: { docId: string; data: any }[] = [];
      snap.forEach((d) => {
        voterEntries.push({ docId: d.id, data: d.data() });
      });

      // Fetch all voter profiles
      const profilePromises = voterEntries.map((entry) =>
        this.getUserProfile(entry.data.voter_id),
      );
      const profiles = await Promise.all(profilePromises);

      for (let i = 0; i < voterEntries.length; i++) {
        const entry = voterEntries[i];
        const profile = profiles[i];
        const voter = this.mapVoter(entry.docId, entry.data, profile);

        if (entry.data.voter_id === currentUserId) {
          userVote = entry.data.vote;
        }

        if (entry.data.vote === "TRUTH") {
          truthVoters.push(voter);
        } else {
          lieVoters.push(voter);
        }
      }

      callback({
        truthVoters,
        lieVoters,
        truthCount: truthVoters.length,
        lieCount: lieVoters.length,
        total: truthVoters.length + lieVoters.length,
        userVote,
      });
    });
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  /** Add a comment to a truth post. */
  async addComment(
    truthId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    text: string,
    parentId?: string | null,
  ): Promise<TruthComment | null> {
    try {
      const docData: Record<string, any> = {
        truth_id: truthId,
        user_id: userId,
        username,
        display_name: displayName,
        avatar_url: avatarUrl,
        text,
        likes: 0,
        created_at: serverTimestamp(),
      };

      if (parentId) {
        docData.parent_id = parentId;
      }

      const docRef = await addDoc(collection(db, "truth_comments"), docData);

      const newComment: TruthComment = {
        id: docRef.id,
        truthId,
        userId,
        username,
        displayName,
        avatarUrl,
        text,
        likes: 0,
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
      };

      return newComment;
    } catch (error) {
      console.error("❌ addComment:", error);
      return null;
    }
  }

  /** Subscribe to real-time comments for a truth. */
  subscribeToComments(
    truthId: string,
    callback: (comments: TruthComment[]) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "truth_comments"),
      where("truth_id", "==", truthId),
      orderBy("created_at", "desc"),
    );

    return onSnapshot(q, (snap) => {
      const comments: TruthComment[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        const comment = this.mapComment(doc.id, data);
        if (comment) comments.push(comment);
      });
      callback(comments);
    });
  }

  /** Like a comment. */
  async likeComment(commentId: string): Promise<void> {
    try {
      const commentRef = doc(db, "truth_comments", commentId);
      await updateDoc(commentRef, {
        likes: increment(1),
      });
    } catch (error) {
      console.error("❌ likeComment:", error);
      throw error;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Fetch a user profile from Firestore. Cached in-memory for 5 minutes. */
  private profileCache = new Map<string, { data: any; ts: number }>();

  private async getUserProfile(userId: string): Promise<any> {
    const cached = this.profileCache.get(userId);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      const data = userDoc.exists()
        ? { id: userDoc.id, ...userDoc.data() }
        : null;
      if (data) {
        this.profileCache.set(userId, { data, ts: Date.now() });
      }
      return data;
    } catch (error) {
      logFirestoreError("getUserProfile failed:", error);
      return null;
    }
  }

  private mapVoter(docId: string, data: any, profile: any): TruthVoter {
    let createdAt = new Date().toISOString();
    if (data.created_at) {
      if (typeof data.created_at === "object" && data.created_at.toDate) {
        createdAt = data.created_at.toDate().toISOString();
      } else if (
        typeof data.created_at === "object" &&
        data.created_at.seconds
      ) {
        createdAt = new Date(data.created_at.seconds * 1000).toISOString();
      } else if (typeof data.created_at === "string") {
        createdAt = data.created_at;
      }
    }

    return {
      id: docId,
      otruthId: data.truth_id,
      ouserId: data.voter_id,
      vote: data.vote,
      displayName: profile?.display_name || profile?.username || "User",
      username: profile?.username || "",
      avatarUrl: profile?.avatar_url || profile?.avatar || "",
      createdAt,
    };
  }

  private mapComment(docId: string, data: any): TruthComment | null {
    let createdAt = new Date().toISOString();
    if (data.created_at) {
      if (typeof data.created_at === "object" && data.created_at.toDate) {
        createdAt = data.created_at.toDate().toISOString();
      } else if (
        typeof data.created_at === "object" &&
        data.created_at.seconds
      ) {
        createdAt = new Date(data.created_at.seconds * 1000).toISOString();
      } else if (typeof data.created_at === "string") {
        createdAt = data.created_at;
      }
    }

    return {
      id: docId,
      truthId: data.truth_id,
      userId: data.user_id,
      username: data.username || "",
      displayName: data.display_name || data.username || "User",
      avatarUrl: data.avatar_url || data.avatar || "",
      text: data.text,
      likes: data.likes || 0,
      parentId: data.parent_id || null,
      createdAt,
    };
  }
}

// ─── Increment helper ───────────────────────────────────────────────────────
function increment(value: number) {
  return {
    __type: "increment",
    value,
  };
}

// Export singleton instance
export const truthInteractionsService = new TruthInteractionsService();
