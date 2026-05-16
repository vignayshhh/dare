// Dare Interactions Service
// Handles views tracking, comments CRUD, and share-to-DM functionality
// All Firebase calls are encapsulated here per ARCHITECTURE_CONTRACT.md

import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
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
import { messagingService } from "./messaging.service";
import { logFirestoreError } from "@/utils/firestoreErrors";

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface DareView {
  id: string;
  dareId: string;
  userId: string;
  createdAt: string;
}

export interface DareComment {
  id: string;
  dareId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  likes: number;
  parentId?: string | null;
  createdAt: string;
}

export interface DareViewCount {
  dareId: string;
  count: number;
}

export interface DareVoter {
  id: string;
  odareId: string;
  oduserId: string;
  vote: "REAL" | "FAKE";
  displayName: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
}

export interface DareVoteData {
  realVoters: DareVoter[];
  fakeVoters: DareVoter[];
  realCount: number;
  fakeCount: number;
  total: number;
  userVote: "REAL" | "FAKE" | null;
}

export interface DareMediaLike {
  id: string;
  dareId: string;
  userId: string;
  createdAt: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class DareInteractionsService {
  // ── Views ───────────────────────────────────────────────────────────────

  /** Record that a user viewed a dare. Idempotent — only one view per user per dare. */
  async recordView(dareId: string, userId: string): Promise<void> {
    try {
      // Use a deterministic doc ID so duplicate writes are no-ops
      const viewDocId = `${dareId}_${userId}`;
      const viewRef = doc(db, "dare_views", viewDocId);
      const existing = await getDoc(viewRef);
      if (existing.exists()) return; // already recorded

      await setDoc(viewRef, {
        dare_id: dareId,
        user_id: userId,
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error("❌ recordView:", error);
    }
  }

  /** Get the number of unique viewers for a dare. */
  async getViewCount(dareId: string): Promise<number> {
    try {
      const q = query(
        collection(db, "dare_views"),
        where("dare_id", "==", dareId),
      );
      const snap = await getDocs(q);
      return snap.size;
    } catch (error) {
      console.error("❌ getViewCount:", error);
      return 0;
    }
  }

  /** Get view counts for multiple dares in one batch. */
  async getViewCounts(dareIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (dareIds.length === 0) return counts;

    try {
      // Firestore 'in' queries support max 30 items
      const batches: string[][] = [];
      for (let i = 0; i < dareIds.length; i += 30) {
        batches.push(dareIds.slice(i, i + 30));
      }

      for (const batch of batches) {
        const q = query(
          collection(db, "dare_views"),
          where("dare_id", "in", batch),
        );
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const did = data.dare_id;
          counts[did] = (counts[did] || 0) + 1;
        });
      }

      // Fill in zeros for dares with no views
      for (const id of dareIds) {
        if (!(id in counts)) counts[id] = 0;
      }
    } catch (error) {
      console.error("❌ getViewCounts:", error);
    }
    return counts;
  }

  /** Subscribe to real-time view count changes for a dare. */
  subscribeToViewCount(
    dareId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "dare_views"),
      where("dare_id", "==", dareId),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.size);
    });
  }

  // ── Comments ────────────────────────────────────────────────────────────

  /** Like a dare media item. Idempotent: one like doc per user per dare. */
  async likeMedia(dareId: string, userId: string): Promise<void> {
    try {
      const likeRef = doc(db, "dare_media_likes", `${dareId}_${userId}`);
      const existing = await getDoc(likeRef);
      if (existing.exists()) return;

      await setDoc(likeRef, {
        dare_id: dareId,
        user_id: userId,
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error("❌ likeMedia:", error);
      throw error;
    }
  }

  /** Subscribe to real-time media like count for a dare. */
  subscribeToMediaLikeCount(
    dareId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "dare_media_likes"),
      where("dare_id", "==", dareId),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.size);
    });
  }

  /** Subscribe to whether the current user already liked this dare media. */
  subscribeToUserMediaLike(
    dareId: string,
    userId: string,
    callback: (liked: boolean) => void,
  ): Unsubscribe {
    const likeRef = doc(db, "dare_media_likes", `${dareId}_${userId}`);
    return onSnapshot(likeRef, (snap) => {
      callback(snap.exists());
    });
  }

  /** Add a comment to a dare. */
  async addComment(
    dareId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    text: string,
    parentId?: string | null,
  ): Promise<DareComment> {
    try {
      const commentData: Record<string, any> = {
        dare_id: dareId,
        user_id: userId,
        username,
        display_name: displayName,
        avatar_url: avatarUrl,
        text,
        likes: 0,
        created_at: serverTimestamp(),
      };
      if (parentId) {
        commentData.parent_id = parentId;
      }

      const commentRef = await addDoc(
        collection(db, "dare_comments"),
        commentData,
      );

      return {
        id: commentRef.id,
        dareId,
        userId,
        username,
        displayName,
        avatarUrl,
        text,
        likes: 0,
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ addComment:", error);
      throw error;
    }
  }

  /** Delete a comment (only by author). */
  async deleteComment(commentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, "dare_comments", commentId));
    } catch (error) {
      console.error("❌ deleteComment:", error);
      throw error;
    }
  }

  /** Get all comments for a dare. */
  async getComments(dareId: string): Promise<DareComment[]> {
    try {
      const q = query(
        collection(db, "dare_comments"),
        where("dare_id", "==", dareId),
        orderBy("created_at", "asc"),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => this.mapComment(d.id, d.data()));
    } catch (error) {
      console.error("❌ getComments:", error);
      return [];
    }
  }

  /** Get comment count for a dare. */
  async getCommentCount(dareId: string): Promise<number> {
    try {
      const q = query(
        collection(db, "dare_comments"),
        where("dare_id", "==", dareId),
      );
      const snap = await getDocs(q);
      return snap.size;
    } catch (error) {
      console.error("❌ getCommentCount:", error);
      return 0;
    }
  }

  /** Get comment counts for multiple dares in one batch. */
  async getCommentCounts(dareIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (dareIds.length === 0) return counts;

    try {
      const batches: string[][] = [];
      for (let i = 0; i < dareIds.length; i += 30) {
        batches.push(dareIds.slice(i, i + 30));
      }

      for (const batch of batches) {
        const q = query(
          collection(db, "dare_comments"),
          where("dare_id", "in", batch),
        );
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const did = data.dare_id;
          counts[did] = (counts[did] || 0) + 1;
        });
      }

      for (const id of dareIds) {
        if (!(id in counts)) counts[id] = 0;
      }
    } catch (error) {
      console.error("❌ getCommentCounts:", error);
    }
    return counts;
  }

  /** Subscribe to real-time comments for a dare. */
  subscribeToComments(
    dareId: string,
    callback: (comments: DareComment[]) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "dare_comments"),
      where("dare_id", "==", dareId),
      orderBy("created_at", "asc"),
    );
    return onSnapshot(q, (snap) => {
      const comments = snap.docs.map((d) => this.mapComment(d.id, d.data()));
      callback(comments);
    });
  }

  /** Subscribe to real-time comment count for a dare. */
  subscribeToCommentCount(
    dareId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "dare_comments"),
      where("dare_id", "==", dareId),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.size);
    });
  }

  /** Like a comment (increment likes). */
  async likeComment(commentId: string): Promise<void> {
    try {
      const commentRef = doc(db, "dare_comments", commentId);
      const snap = await getDoc(commentRef);
      if (!snap.exists()) return;
      const current = snap.data().likes || 0;
      await setDoc(commentRef, { likes: current + 1 }, { merge: true });
    } catch (error) {
      console.error("❌ likeComment:", error);
    }
  }

  // ── Share to DM ─────────────────────────────────────────────────────────

  /** Send a dare to a friend via DM. Creates or gets conversation, then sends a message. */
  async shareDareToDM(
    senderId: string,
    recipientId: string,
    dareId: string,
    dareDescription: string,
    challengerName: string,
    receiverName: string,
  ): Promise<boolean> {
    try {
      // Get or create conversation between the two users
      const conversation = await messagingService.getOrCreateConversation(
        senderId,
        recipientId,
      );

      // Send the dare as a message
      const content = `Check out this dare! ${challengerName} dared ${receiverName}: "${dareDescription}"`;
      await messagingService.sendMessage({
        conversation_id: conversation.id,
        sender_id: senderId,
        content,
      });

      return true;
    } catch (error) {
      console.error("❌ shareDareToDM:", error);
      return false;
    }
  }

  // ── Votes (Real / Fake) ─────────────────────────────────────────────────

  /** Record a user's vote on a dare. Idempotent — updates if already voted. */
  async recordVote(
    dareId: string,
    voterId: string,
    vote: "REAL" | "FAKE",
  ): Promise<void> {
    try {
      // Check for existing vote
      const q = query(
        collection(db, "dare_votes"),
        where("dare_id", "==", dareId),
        where("voter_id", "==", voterId),
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        // Update existing vote
        const existingDoc = existing.docs[0];
        await updateDoc(existingDoc.ref, { vote });
      } else {
        // Create new vote
        await addDoc(collection(db, "dare_votes"), {
          dare_id: dareId,
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

  /** Subscribe to real-time vote data for a dare, enriched with voter profiles. */
  subscribeToVotes(
    dareId: string,
    currentUserId: string,
    callback: (data: DareVoteData) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "dare_votes"),
      where("dare_id", "==", dareId),
      orderBy("created_at", "desc"),
    );

    return onSnapshot(q, async (snap) => {
      const realVoters: DareVoter[] = [];
      const fakeVoters: DareVoter[] = [];
      let userVote: "REAL" | "FAKE" | null = null;

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

        if (entry.data.vote === "REAL") {
          realVoters.push(voter);
        } else {
          fakeVoters.push(voter);
        }
      }

      callback({
        realVoters,
        fakeVoters,
        realCount: realVoters.length,
        fakeCount: fakeVoters.length,
        total: realVoters.length + fakeVoters.length,
        userVote,
      });
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

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

  private mapVoter(docId: string, data: any, profile: any): DareVoter {
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
      odareId: data.dare_id,
      oduserId: data.voter_id,
      vote: data.vote,
      displayName: profile?.display_name || profile?.username || "User",
      username: profile?.username || "",
      avatarUrl: profile?.avatar_url || profile?.avatar || "",
      createdAt,
    };
  }

  private mapComment(id: string, data: any): DareComment {
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
      id,
      dareId: data.dare_id,
      userId: data.user_id,
      username: data.username || "",
      displayName: data.display_name || data.username || "Unknown",
      avatarUrl: data.avatar_url || "",
      text: data.text || "",
      likes: data.likes || 0,
      parentId: data.parent_id || null,
      createdAt,
    };
  }
}

export const dareInteractionsService = new DareInteractionsService();
