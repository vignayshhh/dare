import { db, storage } from "@/backend/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
  Timestamp,
  type FirestoreError,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export interface ChallengeProofVote {
  id: string;
  proofId: string;
  challengeId?: string;
  userId: string;
  vote: "real" | "fake";
  createdAt: Timestamp;
}

export interface ChallengeProofComment {
  id: string;
  proofId: string;
  challengeId?: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  createdAt: Timestamp;
  likes: number;
  userLiked?: boolean;
}

export interface ChallengeCommentLikeSummary {
  commentId: string;
  count: number;
  currentUserLiked: boolean;
}

export interface ChallengeRoomService {
  // Voting functionality
  voteOnProof(
    proofId: string,
    userId: string,
    vote: "real" | "fake",
    challengeId?: string,
  ): Promise<{ success: boolean; error?: string }>;
  removeProofVote(
    proofId: string,
    userId: string,
    challengeId?: string,
  ): Promise<{ success: boolean; error?: string }>;
  getProofVotes(proofId: string): Promise<ChallengeProofVote[]>;
  subscribeToProofVotes(
    proofId: string,
    callback: (votes: ChallengeProofVote[]) => void,
  ): () => void;
  subscribeToProofVotesByProofIds(
    proofIds: string[],
    callback: (votes: ChallengeProofVote[]) => void,
  ): () => void;

  // Comments functionality
  addComment(
    proofId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    content: string,
    challengeId?: string,
  ): Promise<{
    success: boolean;
    comment?: ChallengeProofComment;
    error?: string;
  }>;
  getProofComments(proofId: string): Promise<ChallengeProofComment[]>;
  subscribeToProofComments(
    proofId: string,
    callback: (comments: ChallengeProofComment[]) => void,
  ): () => void;
  subscribeToProofCommentsByProofIds(
    proofIds: string[],
    callback: (comments: ChallengeProofComment[]) => void,
  ): () => void;
  deleteComment(
    commentId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }>;
  likeComment(
    commentId: string,
    userId: string,
    challengeId?: string,
  ): Promise<{ success: boolean; error?: string }>;
  subscribeToCommentLikesByCommentIds(
    commentIds: string[],
    currentUserId: string | undefined,
    callback: (summaries: ChallengeCommentLikeSummary[]) => void,
  ): () => void;

  // Media upload functionality
  uploadProofMedia(
    file: File,
    userId: string,
    challengeId: string,
    proofDay: number,
  ): Promise<{
    success: boolean;
    url?: string;
    thumbnail?: string;
    error?: string;
  }>;
}

const toScopedDocId = (...parts: string[]) =>
  parts.join("_").replace(/[^\w.-]/g, "_").slice(0, 1400);

const toTimestampMs = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime() || 0;
  const maybeTimestamp = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof maybeTimestamp.toMillis === "function") return maybeTimestamp.toMillis();
  if (typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().getTime();
  return 0;
};

const toSafeStorageName = (fileName: string, fallbackExtension: string) => {
  const baseName =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "proof";

  return `${baseName}.${fallbackExtension}`;
};

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const warnRealtimeFailure = (label: string, error: FirestoreError) => {
  console.warn(`${label} unavailable: ${error.code}`);
};

const sortNewestFirst = <T extends { createdAt: unknown }>(items: T[]) =>
  [...items].sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));

const mapProofVote = (id: string, data: any): ChallengeProofVote => ({
  id,
  proofId: String(data.proofId || ""),
  challengeId: data.challengeId ? String(data.challengeId) : undefined,
  userId: String(data.userId || ""),
  vote: data.vote === "fake" ? "fake" : "real",
  createdAt: data.createdAt,
});

const mapProofComment = (
  id: string,
  data: any,
): ChallengeProofComment => ({
  id,
  proofId: String(data.proofId || ""),
  challengeId: data.challengeId ? String(data.challengeId) : undefined,
  userId: String(data.userId || ""),
  username: String(data.username || "dareuser").replace(/^@/, ""),
  displayName: String(data.displayName || data.username || "Dare User"),
  avatarUrl: String(data.avatarUrl || ""),
  content: String(data.content || ""),
  likes: Math.max(0, Number(data.likes || 0)),
  createdAt: data.createdAt,
});

class ChallengeRoomServiceImpl implements ChallengeRoomService {
  // Voting functionality
  async voteOnProof(
    proofId: string,
    userId: string,
    vote: "real" | "fake",
    challengeId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await setDoc(
        doc(db, "challenge_proof_votes", toScopedDocId(proofId, userId)),
        {
          proofId,
          ...(challengeId ? { challengeId } : {}),
          userId,
          vote,
          createdAt: Timestamp.now(),
        },
        { merge: true },
      );

      return { success: true };
    } catch (error) {
      console.warn("Error voting on proof:", error);
      return { success: false, error: "Failed to vote on proof" };
    }
  }

  async removeProofVote(
    proofId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await deleteDoc(doc(db, "challenge_proof_votes", toScopedDocId(proofId, userId)));
      return { success: true };
    } catch (error) {
      console.warn("Error removing proof vote:", error);
      return { success: false, error: "Failed to remove vote" };
    }
  }

  async getProofVotes(proofId: string): Promise<ChallengeProofVote[]> {
    try {
      const votesQuery = query(
        collection(db, "challenge_proof_votes"),
        where("proofId", "==", proofId),
      );
      const votesSnapshot = await getDocs(votesQuery);

      return sortNewestFirst(
        votesSnapshot.docs.map((voteDoc) =>
          mapProofVote(voteDoc.id, voteDoc.data()),
        ),
      );
    } catch (error) {
      console.warn("Error getting proof votes:", error);
      return [];
    }
  }

  subscribeToProofVotes(
    proofId: string,
    callback: (votes: ChallengeProofVote[]) => void,
  ): () => void {
    const votesQuery = query(
      collection(db, "challenge_proof_votes"),
      where("proofId", "==", proofId),
    );

    return onSnapshot(
      votesQuery,
      (snapshot) => {
        callback(
          sortNewestFirst(
            snapshot.docs.map((voteDoc) =>
              mapProofVote(voteDoc.id, voteDoc.data()),
            ),
          ),
        );
      },
      (error) => {
        warnRealtimeFailure("Proof votes", error);
      },
    );
  }

  subscribeToProofVotesByProofIds(
    proofIds: string[],
    callback: (votes: ChallengeProofVote[]) => void,
  ): () => void {
    const uniqueProofIds = Array.from(new Set(proofIds)).filter(Boolean);
    if (uniqueProofIds.length === 0) {
      callback([]);
      return () => {};
    }

    const chunkVotes: ChallengeProofVote[][] = [];
    const unsubscribes = chunk(uniqueProofIds, 30).map((proofIdChunk, index) => {
      chunkVotes[index] = [];
      const votesQuery = query(
        collection(db, "challenge_proof_votes"),
        where("proofId", "in", proofIdChunk),
      );

      return onSnapshot(
        votesQuery,
        (snapshot) => {
          chunkVotes[index] = snapshot.docs.map((voteDoc) =>
            mapProofVote(voteDoc.id, voteDoc.data()),
          );
          callback(chunkVotes.flat());
        },
        (error) => {
          warnRealtimeFailure("Proof vote feed", error);
        },
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  // Comments functionality
  async addComment(
    proofId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    content: string,
    challengeId?: string,
  ): Promise<{
    success: boolean;
    comment?: ChallengeProofComment;
    error?: string;
  }> {
    try {
      if (!content.trim()) {
        return { success: false, error: "Comment cannot be empty" };
      }

      if (content.length > 500) {
        return { success: false, error: "Comment too long" };
      }

      const commentRef = doc(collection(db, "challenge_proof_comments"));
      const createdAt = Timestamp.now();
      const commentData = {
        proofId,
        ...(challengeId ? { challengeId } : {}),
        userId,
        username,
        displayName,
        avatarUrl,
        content: content.trim(),
        likes: 0,
        createdAt,
      };

      await setDoc(commentRef, commentData);

      return {
        success: true,
        comment: mapProofComment(commentRef.id, commentData),
      };
    } catch (error) {
      console.warn("Error adding comment:", error);
      return { success: false, error: "Failed to add comment" };
    }
  }

  async getProofComments(proofId: string): Promise<ChallengeProofComment[]> {
    try {
      const commentsQuery = query(
        collection(db, "challenge_proof_comments"),
        where("proofId", "==", proofId),
        limit(50),
      );
      const commentsSnapshot = await getDocs(commentsQuery);

      return sortNewestFirst(
        commentsSnapshot.docs.map((commentDoc) =>
          mapProofComment(commentDoc.id, commentDoc.data()),
        ),
      );
    } catch (error) {
      console.warn("Error getting proof comments:", error);
      return [];
    }
  }

  subscribeToProofComments(
    proofId: string,
    callback: (comments: ChallengeProofComment[]) => void,
  ): () => void {
    const commentsQuery = query(
      collection(db, "challenge_proof_comments"),
      where("proofId", "==", proofId),
      limit(50),
    );

    return onSnapshot(
      commentsQuery,
      (snapshot) => {
        callback(
          sortNewestFirst(
            snapshot.docs.map((commentDoc) =>
              mapProofComment(commentDoc.id, commentDoc.data()),
            ),
          ),
        );
      },
      (error) => {
        warnRealtimeFailure("Proof comments", error);
      },
    );
  }

  subscribeToProofCommentsByProofIds(
    proofIds: string[],
    callback: (comments: ChallengeProofComment[]) => void,
  ): () => void {
    const uniqueProofIds = Array.from(new Set(proofIds)).filter(Boolean);
    if (uniqueProofIds.length === 0) {
      callback([]);
      return () => {};
    }

    const chunkComments: ChallengeProofComment[][] = [];
    const unsubscribes = chunk(uniqueProofIds, 30).map((proofIdChunk, index) => {
      chunkComments[index] = [];
      const commentsQuery = query(
        collection(db, "challenge_proof_comments"),
        where("proofId", "in", proofIdChunk),
      );

      return onSnapshot(
        commentsQuery,
        (snapshot) => {
          chunkComments[index] = snapshot.docs.map((commentDoc) =>
            mapProofComment(commentDoc.id, commentDoc.data()),
          );
          callback(sortNewestFirst(chunkComments.flat()));
        },
        (error) => {
          warnRealtimeFailure("Proof comment feed", error);
        },
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  async deleteComment(
    commentId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const commentDoc = doc(db, "challenge_proof_comments", commentId);
      const commentSnapshot = await getDoc(commentDoc);

      if (!commentSnapshot.exists()) {
        return { success: false, error: "Comment not found" };
      }

      const commentData = commentSnapshot.data();
      if (commentData.userId !== userId) {
        return {
          success: false,
          error: "Not authorized to delete this comment",
        };
      }

      await deleteDoc(commentDoc);

      return { success: true };
    } catch (error) {
      console.warn("Error deleting comment:", error);
      return { success: false, error: "Failed to delete comment" };
    }
  }

  async likeComment(
    commentId: string,
    userId: string,
    challengeId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const likeDocRef = doc(
        db,
        "challenge_comment_likes",
        toScopedDocId(commentId, userId),
      );
      const existingLike = await getDoc(likeDocRef);

      if (existingLike.exists()) {
        await deleteDoc(likeDocRef);
      } else {
        await setDoc(likeDocRef, {
          commentId,
          ...(challengeId ? { challengeId } : {}),
          userId,
          createdAt: Timestamp.now(),
        });
      }

      return { success: true };
    } catch (error) {
      console.warn("Error liking comment:", error);
      return { success: false, error: "Failed to like comment" };
    }
  }

  subscribeToCommentLikesByCommentIds(
    commentIds: string[],
    currentUserId: string | undefined,
    callback: (summaries: ChallengeCommentLikeSummary[]) => void,
  ): () => void {
    const uniqueCommentIds = Array.from(new Set(commentIds)).filter(Boolean);
    if (uniqueCommentIds.length === 0) {
      callback([]);
      return () => {};
    }

    const chunkSummaries: ChallengeCommentLikeSummary[][] = [];
    const unsubscribes = chunk(uniqueCommentIds, 30).map((commentIdChunk, index) => {
      chunkSummaries[index] = [];
      const likesQuery = query(
        collection(db, "challenge_comment_likes"),
        where("commentId", "in", commentIdChunk),
      );

      return onSnapshot(
        likesQuery,
        (snapshot) => {
          const counts: Record<string, ChallengeCommentLikeSummary> = {};
          commentIdChunk.forEach((commentId) => {
            counts[commentId] = {
              commentId,
              count: 0,
              currentUserLiked: false,
            };
          });

          snapshot.docs.forEach((likeDoc) => {
            const data = likeDoc.data();
            const commentId = data.commentId;
            if (!counts[commentId]) return;
            counts[commentId].count += 1;
            if (currentUserId && data.userId === currentUserId) {
              counts[commentId].currentUserLiked = true;
            }
          });

          chunkSummaries[index] = Object.values(counts);
          callback(chunkSummaries.flat());
        },
        (error) => {
          warnRealtimeFailure("Comment votes", error);
          chunkSummaries[index] = commentIdChunk.map((commentId) => ({
            commentId,
            count: 0,
            currentUserLiked: false,
          }));
          callback(chunkSummaries.flat());
        },
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  // Media upload functionality
  async uploadProofMedia(
    file: File,
    userId: string,
    challengeId: string,
    proofDay: number,
  ): Promise<{
    success: boolean;
    url?: string;
    thumbnail?: string;
    error?: string;
  }> {
    try {
      // Validate file
      if (!file) {
        return { success: false, error: "No file provided" };
      }

      // Check file size (max 100MB, aligned with Storage rules)
      if (file.size > 100 * 1024 * 1024) {
        return { success: false, error: "File too large (max 100MB)" };
      }

      // Check file type
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/webm",
        "video/quicktime",
      ];
      if (!allowedTypes.includes(file.type)) {
        return { success: false, error: "Invalid file type" };
      }

      const timestamp = Date.now();
      const randomSuffix =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().split("-")[0]
          : Math.random().toString(36).slice(2, 10);
      const extension =
        file.type === "image/jpeg"
          ? "jpg"
          : file.type === "video/quicktime"
            ? "mov"
            : file.name.split(".").pop() || "bin";
      const safeName = toSafeStorageName(
        `${challengeId}-day-${proofDay}-${file.name}`,
        extension,
      );
      const fileName = `challenge-room-proofs/${userId}/${timestamp}-${randomSuffix}-${safeName}`;

      // Upload to Firebase Storage
      const storageRef = ref(storage, fileName);
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000,immutable",
      });

      // Get download URL
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      let thumbnailUrl = downloadUrl;

      // For videos, we'll use the same URL for now (thumbnail generation would need a cloud function)
      if (file.type.startsWith("video/")) {
        // In a real implementation, you'd generate a thumbnail here
        thumbnailUrl = downloadUrl;
      }

      return {
        success: true,
        url: downloadUrl,
        thumbnail: thumbnailUrl,
      };
    } catch (error) {
      console.warn("Error uploading proof media:", error);
      return { success: false, error: "Failed to upload media" };
    }
  }
}

export const challengeRoomService: ChallengeRoomService =
  new ChallengeRoomServiceImpl();
