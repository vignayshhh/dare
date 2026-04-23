"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Heart, ChevronDown, ChevronUp, CornerDownRight } from "lucide-react";
import { Avatar } from "./Avatar";
import { formatTimeAgo } from "../../utils/timeFormat";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommentItem {
  id: string;
  userId: string;
  name: string;
  username: string;
  avatar: string;
  text: string;
  createdAt: string;
  likes: number;
  parentId?: string | null;
  likedByCurrentUser?: boolean;
}

interface CommentSectionProps {
  comments: CommentItem[];
  loading?: boolean;
  currentUser: {
    userId: string;
    name: string;
    username: string;
    avatar: string;
  };
  onSubmitComment: (text: string, parentId?: string | null) => Promise<void>;
  onLikeComment?: (commentId: string) => void | Promise<void>;
  onNavigateToProfile?: (userId: string) => void;
  autoFocusInput?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCommentTree(comments: CommentItem[]) {
  console.log("🔍 Building comment tree with comments:", comments);

  const topLevel: CommentItem[] = [];
  const repliesMap: Record<string, CommentItem[]> = {};
  const seenIds = new Set<string>();

  // Deduplicate comments by ID
  const uniqueComments = comments.filter((c) => {
    if (seenIds.has(c.id)) {
      console.warn("Duplicate comment ID found:", c.id);
      return false;
    }
    seenIds.add(c.id);
    return true;
  });

  console.log("🔍 Unique comments:", uniqueComments);

  for (const c of uniqueComments) {
    console.log("🔍 Processing comment:", c.id, "parentId:", c.parentId);
    if (c.parentId) {
      if (!repliesMap[c.parentId]) repliesMap[c.parentId] = [];
      repliesMap[c.parentId].push(c);
      console.log("🔍 Added reply to parent:", c.parentId);
    } else {
      topLevel.push(c);
      console.log("🔍 Added top-level comment:", c.id);
    }
  }

  // Sort top-level newest-first (most recent at top)
  topLevel.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Sort replies newest-first within each thread (most recent replies at top)
  for (const key of Object.keys(repliesMap)) {
    repliesMap[key].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  // Additional safety check: ensure no comment appears in both topLevel and repliesMap
  const topLevelIds = new Set(topLevel.map((c) => c.id));
  for (const replies of Object.values(repliesMap)) {
    for (const reply of replies) {
      if (topLevelIds.has(reply.id)) {
        console.warn("Comment appears in both topLevel and replies:", reply.id);
        // Remove from replies to prevent duplication
        const parentReplies = repliesMap[reply.parentId!];
        const index = parentReplies.findIndex((r) => r.id === reply.id);
        if (index !== -1) {
          parentReplies.splice(index, 1);
        }
      }
    }
  }

  console.log("🔍 Final tree structure:");
  console.log("🔍 Top-level comments:", topLevel);
  console.log("🔍 Replies map:", repliesMap);

  return { topLevel, repliesMap };
}

// ─── Single Comment ─────────────────────────────────────────────────────────

function SingleComment({
  comment,
  replies,
  isReply,
  onReply,
  onLike,
  onNavigateToProfile,
  animationDelay,
}: {
  comment: CommentItem;
  replies?: CommentItem[];
  isReply?: boolean;
  onReply: (commentId: string, username: string) => void;
  onLike?: (commentId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  animationDelay: number;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const replyCount = replies?.length ?? 0;

  return (
    <div
      className="comment-fade-in"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className={`flex gap-3 ${isReply ? "mt-3" : ""}`}>
        {/* Avatar */}
        <div className="shrink-0 pt-0.5">
          <Avatar
            src={comment.avatar}
            alt={comment.name}
            size={isReply ? "sm" : "md"}
            userId={comment.userId}
            username={comment.username}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name + timestamp row */}
          <div className="flex items-center gap-2 mb-0.5">
            <span
              onClick={() =>
                onNavigateToProfile && onNavigateToProfile(comment.userId)
              }
              className={`font-semibold text-white cursor-pointer hover:text-[#4ade80] transition-colors ${isReply ? "text-[13px]" : "text-sm"}`}
            >
              {comment.name}
            </span>
            <span className="text-[#4a5568] text-[11px]">
              {formatTimeAgo(comment.createdAt)}
            </span>
          </div>

          {/* Comment text */}
          <p
            className={`text-[#e2e8f0] leading-relaxed ${isReply ? "text-[13px]" : "text-sm"}`}
          >
            {comment.text}
          </p>

          {/* Actions row */}
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => {
                if (!comment.likedByCurrentUser) {
                  void onLike?.(comment.id);
                }
              }}
              disabled={comment.likedByCurrentUser}
              className={`flex items-center gap-1 transition-colors group ${comment.likedByCurrentUser ? "text-red-500" : "text-[#4a5568] hover:text-red-400"} disabled:cursor-default`}
            >
              <Heart
                size={13}
                className={`transition-transform ${comment.likedByCurrentUser ? "fill-current" : "group-hover:scale-110"}`}
              />
              {(comment.likes ?? 0) > 0 && (
                <span className="text-[11px] font-medium">{comment.likes}</span>
              )}
            </button>
            <button
              onClick={() => onReply(comment.id, comment.username)}
              className="text-[#4a5568] hover:text-white text-[12px] font-semibold transition-colors"
            >
              Reply
            </button>
          </div>

          {/* "View N replies" toggle — only for top-level comments */}
          {!isReply && replyCount > 0 && (
            <button
              onClick={() => setShowReplies((v) => !v)}
              className="flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#4ade80] text-[12px] font-semibold hover:bg-[#2a2a2a] hover:text-[#22c55e] transition-all duration-200"
            >
              {showReplies ? (
                <>
                  <ChevronUp size={12} />
                  <span>
                    Hide {replyCount} {replyCount === 1 ? "reply" : "replies"}
                  </span>
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  <span>
                    View {replyCount} {replyCount === 1 ? "reply" : "replies"}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Nested replies */}
          {!isReply && showReplies && replies && (
            <div className="mt-3 pl-4 border-l border-[#2a2a2a]">
              <div className="flex items-center gap-2 text-[#4a5568] text-[11px] font-medium">
                <div className="w-5 h-5 rounded-full bg-[#151515] border border-[#2a2a2a] flex items-center justify-center">
                  <CornerDownRight size={10} className="text-[#4a5568]" />
                </div>
                <span>{replyCount === 1 ? "Reply" : "Replies"}</span>
              </div>
              <div
                className="mt-2 space-y-3 overflow-y-auto pb-4"
                style={{
                  maxHeight: replyCount > 5 ? "300px" : "none",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {replies.map((reply, rIdx) => (
                  <SingleComment
                    key={`${reply.id}-${rIdx}`} // Fallback unique key
                    comment={reply}
                    isReply
                    onReply={onReply}
                    onLike={onLike}
                    onNavigateToProfile={onNavigateToProfile}
                    animationDelay={rIdx * 30}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CommentSection (main export) ───────────────────────────────────────────

export function CommentSection({
  comments,
  loading,
  currentUser,
  onSubmitComment,
  onLikeComment,
  onNavigateToProfile,
  autoFocusInput,
}: CommentSectionProps) {
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus
  useEffect(() => {
    if (autoFocusInput) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [autoFocusInput]);

  // When replying, focus + prepend @username
  const handleReply = useCallback((commentId: string, username: string) => {
    console.log(
      "🔍 Reply clicked for comment:",
      commentId,
      "username:",
      username,
    );
    const cleanUsername = username.replace(/^@/, "");
    console.log("🔍 Setting replyTo to:", {
      id: commentId,
      username: cleanUsername,
    });
    setReplyTo({ id: commentId, username: cleanUsername });
    setInputText(`@${cleanUsername} `);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
    setInputText("");
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || posting) return;

    console.log("🔍 Submitting comment with replyTo:", replyTo);
    console.log("🔍 Parent ID being sent:", replyTo?.id || null);

    setPosting(true);
    try {
      await onSubmitComment(trimmed, replyTo?.id || null);
      setInputText("");
      setReplyTo(null);
    } finally {
      setPosting(false);
    }
  }, [inputText, posting, replyTo, onSubmitComment]);

  const { topLevel, repliesMap } = useMemo(
    () => buildCommentTree(comments),
    [comments],
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* ── Input area (pinned top) ── */}
      <div className="px-4 py-3 border-b border-[#1e1e1e] shrink-0 bg-[#111]">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5 text-[#4ade80] text-xs font-medium">
              <CornerDownRight size={12} />
              <span>
                Replying to{" "}
                <span className="font-bold">@{replyTo.username}</span>
              </span>
            </div>
            <button
              onClick={cancelReply}
              className="text-[#64748b] hover:text-white text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Avatar
            src={currentUser.avatar}
            alt="You"
            size="md"
            className="shrink-0"
            userId={currentUser.userId}
          />
          <div className="flex-1 flex items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-2.5 gap-2 focus-within:border-[#4ade80]/40 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") cancelReply();
              }}
              placeholder={
                replyTo
                  ? `Reply to @${replyTo.username}...`
                  : "Write a comment..."
              }
              className="bg-transparent text-white text-sm flex-1 outline-none placeholder-[#4a5568]"
            />
            {inputText.trim() && (
              <button
                onClick={handleSubmit}
                disabled={posting}
                className="text-[#4ade80] font-bold text-sm shrink-0 hover:text-[#22c55e] disabled:opacity-50 transition-colors"
              >
                {posting ? "..." : "Post"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Comments list ── */}
      <div
        ref={listRef}
        className="overflow-y-auto flex-1 min-h-0 px-4 pt-4 pb-16"
        style={{
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        <style>{`
          @keyframes commentFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .comment-fade-in {
            animation: commentFadeIn 0.25s ease-out forwards;
            opacity: 0;
          }
        `}</style>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-[#4a5568] text-sm">
              <div className="w-4 h-4 border-2 border-[#4ade80]/30 border-t-[#4ade80] rounded-full animate-spin" />
              <span>Loading comments...</span>
            </div>
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-1">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4a5568"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-[#4a5568] text-sm font-medium">
              No comments yet
            </p>
            <p className="text-[#333] text-xs">Be the first to comment</p>
          </div>
        ) : (
          <div className="space-y-4">
            {topLevel.map((comment, idx) => (
              <SingleComment
                key={`${comment.id}-${idx}`} // Fallback unique key
                comment={comment}
                replies={repliesMap[comment.id]}
                onReply={handleReply}
                onLike={onLikeComment}
                onNavigateToProfile={onNavigateToProfile}
                animationDelay={idx * 40}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
