import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
  onSnapshot,
  Unsubscribe,
  Timestamp,
  documentId,
} from "firebase/firestore";
import { aggregatedCounters } from "@/services/aggregatedCounters";

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  text: string;
  likes?: number;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentWithAuthor extends PostComment {
  author: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface CreateCommentRequest {
  post_id: string;
  user_id: string;
  text: string;
  parent_id?: string | null;
}

class CommentService {
  // Enable aggregated counters to reduce reads by ~90% for count queries
  private readonly enableAggregatedCounters = true; // Set to true to enable
  private authorCache = new Map<string, CommentWithAuthor["author"] | null>();

  // SECURITY FIX (§1.6): Comment creation runs through the server API
  // route. Firestore rules deny client writes to `post_comments` so
  // this is the only path. The Cloud Function trigger keeps
  // `posts.comments_count` in sync, so the old manual increment is
  // removed. Realtime listeners (`onSnapshot` elsewhere in this file)
  // pick the new comment up instantly.
  async createComment(request: CreateCommentRequest): Promise<PostComment> {
    try {
      const { apiFetch } = await import("@/lib/apiClient");
      const res = await apiFetch<{ ok: boolean; id: string }>(
        `/api/posts/${encodeURIComponent(request.post_id)}/comment`,
        {
          method: "POST",
          body: JSON.stringify({
            content: request.text,
            parent_id: request.parent_id ?? null,
          }),
        },
      );
      const now = new Date().toISOString();
      return {
        id: res.id,
        post_id: request.post_id,
        user_id: request.user_id,
        text: request.text,
        likes: 0,
        created_at: now,
        updated_at: now,
      } as PostComment;
    } catch (error) {
      console.error("Error creating comment:", error);
      throw error;
    }
  }

  async getComments(postId: string): Promise<CommentWithAuthor[]> {
    try {
      const commentsRef = collection(db, "post_comments");
      const q = query(
        commentsRef,
        where("post_id", "==", postId),
        orderBy("created_at", "asc"),
      );
      const querySnapshot = await getDocs(q);

      const comments = querySnapshot.docs.map(
        (docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as PostComment,
      );

      return this.attachAuthors(comments);
    } catch (error) {
      console.error("Error getting comments:", error);
      return [];
    }
  }

  private async getCommentAuthor(
    userId: string,
  ): Promise<CommentWithAuthor["author"] | null> {
    try {
      if (this.authorCache.has(userId)) {
        return this.authorCache.get(userId) ?? null;
      }

      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        this.authorCache.set(userId, null);
        return null;
      }

      const userData = userDoc.data();
      let avatarUrl = userData.avatar_url || "";

      try {
        const { useAvatarStore } = require("../../stores/avatarStore");
        const { getStoredAvatar } = useAvatarStore.getState();
        const storedAvatar = getStoredAvatar(userId);

        if (storedAvatar && storedAvatar !== avatarUrl) {
          avatarUrl = storedAvatar;
        }
      } catch (error) {
        console.log("Could not access avatar store for user:", userId);
      }

      const author = {
        id: userDoc.id,
        user_id: userData.user_id || userId,
        username: userData.username || `user_${userId.slice(0, 8)}`,
        display_name:
          userData.displayName ||
          userData.display_name ||
          `User ${userId.slice(0, 8)}`,
        avatar_url: avatarUrl,
      };

      this.authorCache.set(userId, author);
      return author;
    } catch (error) {
      console.error("Error getting comment author:", error);
      return null;
    }
  }

  private async getCommentAuthorsBatch(
    userIds: string[],
  ): Promise<Map<string, CommentWithAuthor["author"] | null>> {
    const results = new Map<string, CommentWithAuthor["author"] | null>();
    const missingUserIds = [...new Set(userIds)].filter((userId) => {
      if (!this.authorCache.has(userId)) {
        return true;
      }
      results.set(userId, this.authorCache.get(userId) ?? null);
      return false;
    });

    if (missingUserIds.length === 0) {
      return results;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < missingUserIds.length; i += 10) {
      chunks.push(missingUserIds.slice(i, i + 10));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const usersRef = collection(db, "users");
        const usersQuery = query(usersRef, where(documentId(), "in", chunk));
        const usersSnapshot = await getDocs(usersQuery);

        usersSnapshot.forEach((userDoc) => {
          const userData = userDoc.data();
          const author = {
            id: userDoc.id,
            user_id: userData.user_id || userDoc.id,
            username: userData.username || `user_${userDoc.id.slice(0, 8)}`,
            display_name:
              userData.displayName ||
              userData.display_name ||
              `User ${userDoc.id.slice(0, 8)}`,
            avatar_url: userData.avatar_url || "",
          };
          this.authorCache.set(userDoc.id, author);
          results.set(userDoc.id, author);
        });

        chunk.forEach((userId) => {
          if (!results.has(userId)) {
            this.authorCache.set(userId, null);
            results.set(userId, null);
          }
        });
      }),
    );

    return results;
  }

  private async attachAuthors(
    comments: PostComment[],
  ): Promise<CommentWithAuthor[]> {
    const authorsMap = await this.getCommentAuthorsBatch(
      comments.map((comment) => comment.user_id),
    );

    return comments.flatMap((comment) => {
      const author = authorsMap.get(comment.user_id);
      return author
        ? [
            {
              ...comment,
              author,
            },
          ]
        : [];
    });
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    try {
      const commentRef = doc(db, "post_comments", commentId);
      const commentDoc = await getDoc(commentRef);

      if (!commentDoc.exists()) {
        throw new Error("Comment not found");
      }

      const comment = commentDoc.data() as PostComment;
      if (comment.user_id !== userId) {
        throw new Error("Unauthorized to delete this comment");
      }

      await deleteDoc(commentRef);

      // Keep denormalized count in sync on the post document
      try {
        if (comment.post_id) {
          await updateDoc(doc(db, "posts", comment.post_id), {
            comments_count: increment(-1),
          });
        }
      } catch {
        /* non-fatal */
      }

      // Also update aggregated counter if enabled
      if (this.enableAggregatedCounters && comment.post_id) {
        aggregatedCounters
          .decrementCounter(comment.post_id, "comments")
          .catch(() => {});
      }

      return true;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }

  async likeComment(commentId: string): Promise<void> {
    try {
      const commentRef = doc(db, "post_comments", commentId);
      await updateDoc(commentRef, {
        likes: increment(1),
      });
    } catch (error) {
      console.error("Error liking comment:", error);
      throw error;
    }
  }

  subscribeToComments(
    postId: string,
    callback: (comments: CommentWithAuthor[]) => void,
  ): Unsubscribe {
    const commentsRef = collection(db, "post_comments");
    const q = query(
      commentsRef,
      where("post_id", "==", postId),
      orderBy("created_at", "asc"),
    );

    return onSnapshot(
      q,
      async (querySnapshot) => {
        const comments = querySnapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as PostComment,
        );
        callback(await this.attachAuthors(comments));
      },
      (error) => {
        console.error("Real-time comments subscription error:", error);
      },
    );
  }

  async getCommentsCount(postId: string): Promise<number> {
    try {
      const commentsRef = collection(db, "post_comments");
      const q = query(commentsRef, where("post_id", "==", postId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error("Error getting comments count:", error);
      return 0;
    }
  }
}

export const commentService = new CommentService();
