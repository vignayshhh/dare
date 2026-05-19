import React, { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle, Send, X } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import {
  challengeRoomService,
  type ChallengeProofComment,
} from "../../middleware/services/challenge-room.service";
import { Avatar } from "../ui/Avatar";
import type { ChallengeProofPost } from "./ChallengeRoomScreen";

interface ChallengeRoomCommentsProps {
  proof: ChallengeProofPost;
  currentUserId?: string;
  currentUsername?: string;
  currentDisplayName?: string;
  currentAvatarUrl?: string;
  onClose: () => void;
}

const getCommentTime = (timestamp: ChallengeProofComment["createdAt"]) => {
  if (!timestamp) return 0;
  if (timestamp instanceof Timestamp) return timestamp.toMillis();
  const maybeTimestamp = timestamp as unknown as {
    toMillis?: () => number;
    toDate?: () => Date;
  };
  if (typeof maybeTimestamp.toMillis === "function") {
    return maybeTimestamp.toMillis();
  }
  if (typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().getTime();
  }
  const parsed = new Date(timestamp as unknown as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const sortComments = (nextComments: ChallengeProofComment[]) =>
  [...nextComments].sort(
    (a, b) => getCommentTime(b.createdAt) - getCommentTime(a.createdAt),
  );

const mergeComments = (
  syncedComments: ChallengeProofComment[],
  currentComments: ChallengeProofComment[],
) => {
  const pendingComments = currentComments.filter(
    (currentComment) =>
      currentComment.id.startsWith("temp-comment-") &&
      !syncedComments.some(
        (syncedComment) =>
          syncedComment.userId === currentComment.userId &&
          syncedComment.content === currentComment.content,
      ),
  );

  return sortComments([...syncedComments, ...pendingComments]);
};

export function ChallengeRoomComments({
  proof,
  currentUserId,
  currentUsername,
  currentDisplayName,
  currentAvatarUrl,
  onClose,
}: ChallengeRoomCommentsProps) {
  const [comments, setComments] = useState<ChallengeProofComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [commentLikes, setCommentLikes] = useState<
    Record<string, { count: number; currentUserLiked: boolean }>
  >({});
  const [likeInProgress, setLikeInProgress] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadComments = async () => {
      try {
        setIsLoading(true);
        const proofComments = await challengeRoomService.getProofComments(
          proof.id,
        );
        setComments((currentComments) =>
          mergeComments(proofComments, currentComments),
        );
      } catch (error) {
        console.warn("Failed to load comments:", error);
        setError("Could not load comments.");
      } finally {
        setIsLoading(false);
      }
    };

    loadComments();

    return challengeRoomService.subscribeToProofComments(
      proof.id,
      (updatedComments) => {
        setComments((currentComments) =>
          mergeComments(updatedComments, currentComments),
        );
        setIsLoading(false);
      },
    );
  }, [proof.id]);

  const commentIdsKey = useMemo(
    () => comments.map((comment) => comment.id).join("|"),
    [comments],
  );

  useEffect(() => {
    const commentIds = commentIdsKey
      ? commentIdsKey.split("|").filter(Boolean)
      : [];

    return challengeRoomService.subscribeToCommentLikesByCommentIds(
      commentIds,
      currentUserId,
      (summaries) => {
        const nextLikes: Record<
          string,
          { count: number; currentUserLiked: boolean }
        > = {};
        summaries.forEach((summary) => {
          nextLikes[summary.commentId] = {
            count: summary.count,
            currentUserLiked: summary.currentUserLiked,
          };
        });
        setCommentLikes(nextLikes);
      },
    );
  }, [commentIdsKey, currentUserId]);

  const decoratedComments = useMemo(
    () =>
      comments.map((comment) => ({
        ...comment,
        likes: commentLikes[comment.id]?.count ?? comment.likes,
        userLiked: commentLikes[comment.id]?.currentUserLiked ?? false,
      })),
    [commentLikes, comments],
  );

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newComment.trim() || !currentUserId) {
      return;
    }

    const trimmedComment = newComment.trim();
    const tempCommentId = `temp-comment-${Date.now()}`;
    const optimisticComment: ChallengeProofComment = {
      id: tempCommentId,
      proofId: proof.id,
      challengeId: proof.challengeId,
      userId: currentUserId,
      username: (currentUsername || "dareuser").replace(/^@/, ""),
      displayName: currentDisplayName || currentUsername || "Dare User",
      avatarUrl: currentAvatarUrl || "",
      content: trimmedComment,
      likes: 0,
      createdAt: Timestamp.now(),
      userLiked: false,
    };

    setComments((currentComments) =>
      sortComments([
        optimisticComment,
        ...currentComments.filter((comment) => comment.id !== tempCommentId),
      ]),
    );
    setNewComment("");
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await challengeRoomService.addComment(
        proof.id,
        currentUserId,
        currentUsername || "dareuser",
        currentDisplayName || currentUsername || "Dare User",
        currentAvatarUrl || "",
        trimmedComment,
        proof.challengeId,
      );

      if (result.success && result.comment) {
        setComments((currentComments) =>
          sortComments([
            result.comment!,
            ...currentComments.filter(
              (comment) =>
                comment.id !== tempCommentId &&
                comment.id !== result.comment!.id,
            ),
          ]),
        );
      } else {
        setComments((currentComments) =>
          currentComments.filter((comment) => comment.id !== tempCommentId),
        );
        setError(result.error || "Failed to add comment.");
      }
    } catch (error) {
      console.warn("Error adding comment:", error);
      setComments((currentComments) =>
        currentComments.filter((comment) => comment.id !== tempCommentId),
      );
      setError("Failed to add comment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!currentUserId || likeInProgress[commentId]) return;

    const previousLike = commentLikes[commentId] || {
      count: comments.find((comment) => comment.id === commentId)?.likes || 0,
      currentUserLiked: false,
    };
    const nextLike = previousLike.currentUserLiked
      ? {
          count: Math.max(previousLike.count - 1, 0),
          currentUserLiked: false,
        }
      : {
          count: previousLike.count + 1,
          currentUserLiked: true,
        };

    setCommentLikes((current) => ({ ...current, [commentId]: nextLike }));
    setLikeInProgress((current) => ({ ...current, [commentId]: true }));
    setError(null);
    try {
      const result = await challengeRoomService.likeComment(
        commentId,
        currentUserId,
        proof.challengeId,
      );
      if (!result.success) {
        setCommentLikes((current) => ({
          ...current,
          [commentId]: previousLike,
        }));
        setError(result.error || "Failed to update comment vote.");
      }
    } catch (error) {
      console.warn("Error liking comment:", error);
      setCommentLikes((current) => ({
        ...current,
        [commentId]: previousLike,
      }));
      setError("Failed to update comment vote.");
    } finally {
      setLikeInProgress((current) => ({ ...current, [commentId]: false }));
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return "Just now";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-[2700] flex items-end justify-center bg-black/72 px-0 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="app-modal-sheet flex max-h-[min(82dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,14,0.98),rgba(5,8,6,0.99))] shadow-[0_-22px_64px_rgba(0,0,0,0.5)] sm:rounded-[30px]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[calc(var(--safe-area-top)+12px)]">
          <button
            type="button"
            onClick={onClose}
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white"
            aria-label="Close comments"
          >
            <X size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Avatar
                src={proof.avatarUrl}
                alt={proof.displayName}
                size={32}
                fallbackText={proof.displayName.charAt(0)}
                disableGhostMode
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">
                  {proof.displayName}
                </div>
                <div className="text-xs font-semibold text-[#94a3b8]">
                  Day {proof.proofDay} proof
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4ade80]">
            <MessageCircle size={18} />
            <span className="text-sm font-black">
              {decoratedComments.length}
            </span>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm font-semibold text-[#64748b]">
                Loading comments...
              </div>
            </div>
          ) : decoratedComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <MessageCircle size={48} className="text-[#475569]" />
              <div className="mt-4 text-center">
                <div className="text-sm font-bold text-white">
                  No comments yet
                </div>
                <div className="mt-1 text-xs font-semibold text-[#64748b]">
                  Be the first to comment on this proof
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              {decoratedComments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar
                    src={comment.avatarUrl}
                    alt={comment.displayName}
                    size={36}
                    fallbackText={comment.displayName.charAt(0)}
                    disableGhostMode
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {comment.displayName}
                      </span>
                      <span className="text-xs font-semibold text-[#64748b]">
                        @{comment.username}
                      </span>
                      <span className="text-xs font-semibold text-[#475569]">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm leading-relaxed text-[#cbd5e1]">
                      {comment.content}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLikeComment(comment.id)}
                        disabled={!currentUserId || likeInProgress[comment.id]}
                        className={`flex items-center gap-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          comment.userLiked
                            ? "text-[#4ade80]"
                            : "text-[#64748b] hover:text-[#4ade80]"
                        }`}
                        aria-label={
                          comment.userLiked
                            ? "Remove comment vote"
                            : "Vote for comment"
                        }
                      >
                        <Heart
                          size={14}
                          fill={comment.userLiked ? "currentColor" : "none"}
                        />
                        <span>{comment.likes}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {currentUserId && (
          <div className="shrink-0 border-t border-white/8 bg-[#0a0f0a] px-4 pb-7 pt-3">
            {error ? (
              <div className="mb-2 rounded-[16px] border border-red-400/18 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
                {error}
              </div>
            ) : null}
            <form onSubmit={handleSubmitComment} className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                placeholder="Add a comment..."
                maxLength={500}
                className="flex-1 rounded-full border border-white/8 bg-white/[0.045] px-4 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#4ade80] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmitting}
                className="app-pressable flex h-10 w-10 items-center justify-center rounded-full bg-[#4ade80] text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send comment"
              >
                {isSubmitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
