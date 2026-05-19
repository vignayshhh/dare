//MainScreen

"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Play,
  Eye,
  Share2,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useContentStore } from "../../stores/useContentStore";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import {
  friendsService,
  type Friend,
} from "../../middleware/services/friends.service";
import { dareService } from "@/middleware/services/service-factory";
import { useDareInteractionStore } from "../../stores/useDareInteractionStore";
import { useTruthInteractionStore } from "../../stores/useTruthInteractionStore";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { useAlertStore } from "../../stores/useAlertStore";
import { votePersistence } from "../../utils/votePersistence";
import { CommunityChallengeFeed } from "./CommunityChallengeFeed";
import { CommunityChallengePreviewScreen } from "./CommunityChallengePreviewScreen";
import { ChallengeHubScreen } from "./ChallengeHubScreen";
import {
  COMMUNITY_CHALLENGES,
  type CommunityChallenge,
} from "./communityChallengeData";
import {
  communityChallengeService,
  type CommunityChallengeSummary,
} from "../../middleware/services/community-challenge.service";

import "@/styles/design-system.css";

interface TruthPost {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: { nickname: string; avatar: string; verified?: boolean };
  receiver: { nickname: string; avatar: string; verified?: boolean };
  question: string;
  state: "SENT" | "ANSWERED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  createdAt: string;
  expiresAt?: string;
  answer?: string;
  poll?: {
    question: string;
    options: string[];
    votes: { [key: string]: number };
    totalVotes: number;
  };
}

interface DarePost {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: { nickname: string; avatar: string; verified?: boolean };
  receiver: { nickname: string; avatar: string; verified?: boolean };
  description: string;
  proof?: { type: "image" | "video"; url: string; thumbnail?: string };
  state:
    | "SENT"
    | "ACCEPTED"
    | "CHICKEN_OUT"
    | "PROOF_SUBMITTED"
    | "UNDER_REVIEW"
    | "FRIENDS_VALIDATION"
    | "ACCEPTED_REAL"
    | "REJECTED_FAKE";
  createdAt: string;
  expiresAt?: string;
  votes?: {
    real: number;
    fake: number;
    userVote?: "real" | "fake";
    total?: number;
  };
}

const FEED_SCREEN_SURFACE_BACKGROUND =
  "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)";

function getPostCreatedAtMs(createdAt: unknown): number {
  if (!createdAt) return 0;
  if (typeof createdAt === "object" && createdAt !== null) {
    if ("seconds" in createdAt && typeof createdAt.seconds === "number") {
      return createdAt.seconds * 1000;
    }
    if ("toDate" in createdAt && typeof createdAt.toDate === "function") {
      return createdAt.toDate().getTime();
    }
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    const ms = new Date(createdAt).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function rankDeckByVoteState<T extends { id: string; createdAt: unknown }>(
  posts: T[],
  hasUserVote: (postId: string) => boolean,
): T[] {
  const newestFirst = [...posts].sort(
    (a, b) => getPostCreatedAtMs(b.createdAt) - getPostCreatedAtMs(a.createdAt),
  );
  const unvotedPosts = newestFirst.filter((post) => !hasUserVote(post.id));

  if (unvotedPosts.length === 0) {
    return newestFirst;
  }

  const votedPosts = newestFirst.filter((post) => hasUserVote(post.id));
  return [...unvotedPosts, ...votedPosts];
}

// â”€â”€â”€ PostAvatar â€” now uses global Avatar component for consistent avatar handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PostAvatar({
  src,
  name,
  size,
  style,
  className,
  userId,
  username,
}: {
  src?: string;
  name?: string;
  size: number;
  style?: React.CSSProperties;
  className?: string;
  userId?: string;
  username?: string;
}) {
  return (
    <Avatar
      src={src}
      alt={name || ""}
      size={size}
      fallbackText={name?.charAt(0)?.toUpperCase()}
      style={style}
      className={className}
      userId={userId}
      username={username}
    />
  );
}

// â”€â”€â”€ AnimatedModalWrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AnimatedModalWrapper({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);
  if (!mounted) return null;
  return (
    <div
      className="app-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1999,
        /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
        /* DISABLED: pointerEvents: "none", */
      }}
    >
      <style>{`
        @keyframes dareSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes dareSlideDown { from { transform: translateY(0); }    to { transform: translateY(100%); } }
        .dare-modal-sheet { animation: ${visible ? "dareSlideUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards" : "dareSlideDown 0.3s cubic-bezier(0.32,0.72,0,1) forwards"}; pointer-events: all; }
        .dare-modal-backdrop { pointer-events: all; transition: opacity 0.3s ease; opacity: ${visible ? 1 : 0}; }
      `}</style>
      <div
        className="app-modal-backdrop dare-modal-backdrop"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.01)",
        }}
        onClick={onClose}
      />
      <div
        className="app-modal-sheet dare-modal-sheet"
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
      >
        {children}
      </div>
    </div>
  );
}

// â”€â”€â”€ TruthVoteModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TruthVoteModal({
  isOpen,
  onClose,
  post,
  initialTab,
}: {
  isOpen: boolean;
  onClose: () => void;
  post: TruthPost;
  initialTab: "truth" | "lie" | "comments";
}) {
  const { user } = useAuthStore();
  const {
    voteData,
    comments,
    loadingVotes,
    loadingComments,
    subscribeToVotes,
    unsubscribeFromVotes,
    subscribeToComments,
    unsubscribeFromComments,
    addComment,
    likeComment,
  } = useTruthInteractionStore();
  const [activeTab, setActiveTab] = useState<"truth" | "lie" | "comments">(
    initialTab,
  );
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useBodyScrollLock(isOpen || closing);

  useLayoutEffect(() => {
    if (isOpen) {
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      setActiveTab(initialTab);
      if (user?.id) {
        subscribeToVotes(post.id, user.id);
        subscribeToComments(post.id);
      }
    }
    return () => {
      if (!isOpen) {
        unsubscribeFromVotes(post.id);
        unsubscribeFromComments(post.id);
      }
    };
  }, [
    isOpen,
    post.id,
    user?.id,
    initialTab,
    subscribeToVotes,
    subscribeToComments,
    unsubscribeFromVotes,
    unsubscribeFromComments,
  ]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    unsubscribeFromVotes(post.id);
    unsubscribeFromComments(post.id);
    setTimeout(onClose, 320);
  };
  const handlePost = async (text: string, parentId?: string | null) => {
    if (!text.trim() || !user) return;
    try {
      await addComment(
        post.id,
        user.id,
        user.username || "",
        user.displayName || user.username || "You",
        user.avatar || "",
        text.trim(),
        parentId,
      );
    } catch (error) {
      console.error("Failed to post comment:", error);
    }
  };

  if (!isOpen && !closing) return null;
  const data = voteData[post.id];
  const isLoadingVote = loadingVotes[post.id];
  const isLoadingComments = loadingComments[post.id];
  const truthCount = data?.truthCount ?? 0;
  const lieCount = data?.lieCount ?? 0;
  const total = data?.total ?? 0;
  const truthPct = total > 0 ? Math.round((truthCount / total) * 100) : 0;
  const liePct = total > 0 ? 100 - truthPct : 0;
  const voters =
    activeTab === "truth"
      ? (data?.truthVoters ?? [])
      : activeTab === "lie"
        ? (data?.lieVoters ?? [])
        : [];
  const truthComments = comments[post.id] ?? [];

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(6px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease",
        boxSizing: "border-box",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes slideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); }    to { transform: translateY(100%); } }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#111",
          borderRadius: "28px 28px 0 0",
          overflow: "hidden",
          height: "85vh",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          touchAction: "pan-y",
          animation:
            visible && !closing
              ? "slideUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards"
              : "slideDown 0.3s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0 4px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "40px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.2)",
            }}
          />
        </div>
        {/* Fixed header â€” non-scrollable */}
        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "14px",
            }}
          >
            <PostAvatar
              src={post.challenger.avatar}
              name={post.challenger.nickname}
              size={36}
              style={{ border: "2px solid rgba(74,222,128,0.5)" }}
            />
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                whiteSpace: "nowrap",
              }}
            >
              {post.challenger.nickname.split(" ")[0]}
            </span>
            <span
              style={{
                color: "#4ade80",
                fontWeight: 700,
                fontSize: "15px",
                whiteSpace: "nowrap",
              }}
            >
              asked
            </span>
            <PostAvatar
              src={post.receiver.avatar}
              name={post.receiver.nickname}
              size={36}
            />
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                whiteSpace: "nowrap",
              }}
            >
              {post.receiver.nickname.split(" ")[0]}
            </span>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: "14px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}
          >
            <p
              style={{
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                margin: 0,
              }}
            >
              {post.question}
            </p>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span
                style={{ color: "#4ade80", fontWeight: 700, fontSize: "14px" }}
              >
                Truth {truthPct}%
              </span>
              <span
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                Lie {liePct}%
              </span>
            </div>
            <div
              style={{
                height: "8px",
                borderRadius: "99px",
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${truthPct}%`,
                  background: "linear-gradient(90deg, #4ade80, #22c55e)",
                  borderRadius: "99px",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "12px",
                marginTop: "6px",
                textAlign: "center",
              }}
            >
              {total} votes
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["truth", "lie", "comments"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: "12px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "13px",
                  transition: "all 0.2s",
                  background:
                    activeTab === tab
                      ? tab === "truth"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.06)",
                  color:
                    activeTab === tab
                      ? tab === "truth"
                        ? "#000"
                        : "#fff"
                      : "rgba(255,255,255,0.45)",
                }}
              >
                {tab === "truth"
                  ? "Truth"
                  : tab === "lie"
                    ? "Lie"
                    : "Comments"}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            height: "1px",
            background: "rgba(255,255,255,0.07)",
            margin: "14px 0 0",
            flexShrink: 0,
          }}
        />
        {/* Scrollable content area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: activeTab === "comments" ? "hidden" : "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding:
              activeTab === "comments"
                ? "0"
                : "16px 20px calc(32px + var(--safe-area-bottom))",
          }}
        >
          {activeTab === "comments" ? (
            <div
              style={{
                height: "100%",
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column" as const,
                paddingBottom: "24px",
              }}
            >
              {user && (
                <CommentSection
                  comments={truthComments.map(
                    (c): CommentItem => ({
                      id: c.id,
                      userId: c.userId,
                      name: c.displayName,
                      username: c.username || "",
                      avatar: c.avatarUrl,
                      text: c.text,
                      createdAt: c.createdAt,
                      likes: c.likes,
                      parentId: c.parentId || null,
                      likedByCurrentUser: commentLikePersistence.hasLiked(
                        "truth",
                        user.id,
                        c.id,
                      ),
                    }),
                  )}
                  loading={isLoadingComments}
                  currentUser={{
                    userId: user.id,
                    name: user.displayName || user.username || "You",
                    username: user.username || "",
                    avatar: user.avatar || "",
                  }}
                  onSubmitComment={handlePost}
                  onLikeComment={(commentId) => {
                    likeComment(commentId);
                  }}
                  autoFocusInput={false}
                />
              )}
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {isLoadingVote ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 0",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 14,
                  }}
                >
                  Loading votes...
                </div>
              ) : voters.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 0",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 14,
                  }}
                >
                  No {activeTab === "truth" ? "Truth" : "Lie"} votes yet
                </div>
              ) : (
                voters.map((v: any) => (
                  <div
                    key={`truth-voter-${v.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <Avatar
                        src={v.avatarUrl}
                        alt={v.displayName}
                        size="md"
                        userId={v.ouserId}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: "15px",
                          margin: 0,
                        }}
                      >
                        {v.displayName}
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "12px",
                          margin: "2px 0 0",
                        }}
                      >
                        {formatTimeAgo(v.createdAt)}
                      </p>
                    </div>
                    <span
                      style={{
                        padding: "5px 14px",
                        borderRadius: "99px",
                        fontWeight: 700,
                        fontSize: "13px",
                        background:
                          activeTab === "truth"
                            ? "rgba(74,222,128,0.15)"
                            : "rgba(255,255,255,0.08)",
                        color:
                          activeTab === "truth"
                            ? "#4ade80"
                            : "rgba(255,255,255,0.6)",
                        border:
                          activeTab === "truth"
                            ? "1px solid rgba(74,222,128,0.3)"
                            : "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {activeTab === "truth" ? "Truth" : "Lie"}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ DareVoteModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DareVoteModal({
  isOpen,
  onClose,
  dare,
}: {
  isOpen: boolean;
  onClose: () => void;
  dare: DarePost;
}) {
  const { user } = useAuthStore();
  const { voteData, loadingVotes, subscribeToVotes, unsubscribeFromVotes } =
    useDareInteractionStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<"real" | "fake">("real");

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      if (user?.id) subscribeToVotes(dare.id, user.id);
    }
    return () => {
      if (!isOpen) unsubscribeFromVotes(dare.id);
    };
  }, [isOpen, dare.id, user?.id, subscribeToVotes, unsubscribeFromVotes]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    unsubscribeFromVotes(dare.id);
    setTimeout(onClose, 340);
  };

  if (!isOpen && !closing) return null;
  const data = voteData[dare.id];
  const isLoading = loadingVotes[dare.id];
  const realCount = data?.realCount ?? 0;
  const fakeCount = data?.fakeCount ?? 0;
  const total = data?.total ?? 0;
  const realPct = total > 0 ? Math.round((realCount / total) * 100) : 0;
  const fakePct = total > 0 ? 100 - realPct : 0;
  const voters =
    activeTab === "real" ? (data?.realVoters ?? []) : (data?.fakeVoters ?? []);

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.34s ease, backdrop-filter 0.34s ease",
        boxSizing: "border-box",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes dvmSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes dvmSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        .modal-voter-list::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #161616 0%, #111 100%)",
          borderRadius: "28px 28px 0 0",
          height: "82vh",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          animation:
            visible && !closing
              ? "dvmSlideUp 0.38s cubic-bezier(0.32,0.72,0,1) forwards"
              : "dvmSlideDown 0.32s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.18)",
            }}
          />
        </div>
        {/* Fixed header */}
        <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div style={{ display: "flex", flexShrink: 0 }}>
              <PostAvatar
                src={dare.challenger.avatar}
                name={dare.challenger.nickname}
                size={44}
                style={{
                  border: "2px solid rgba(255,255,255,0.2)",
                  zIndex: 1,
                  position: "relative",
                }}
              />
              <PostAvatar
                src={dare.receiver.avatar}
                name={dare.receiver.nickname}
                size={44}
                style={{
                  border: "2px solid rgba(255,255,255,0.2)",
                  marginLeft: -14,
                  position: "relative",
                }}
              />
            </div>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 18,
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}
            >
              {dare.challenger.nickname.split(" ")[0]}&nbsp;
              <span style={{ color: "#4ade80" }}>dared</span>&nbsp;
              {dare.receiver.nickname.split(" ")[0]}&nbsp;
              <span
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                - {dare.description}
              </span>
            </p>
            <button
              onClick={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                border: "none",
                color: "rgba(255,255,255,0.6)",
                fontSize: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              X
            </button>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span style={{ color: "#4ade80", fontWeight: 800, fontSize: 22 }}>
                {realPct}% Real
              </span>
              <span
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 700,
                  fontSize: 22,
                }}
              >
                {fakePct}% Fake
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 99,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 99,
                  background: "linear-gradient(90deg, #4ade80, #22c55e)",
                  width: `${realPct}%`,
                  transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: 12,
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              {total.toLocaleString()} votes total
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {(["real", "fake"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 14,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 15,
                  transition: "all 0.2s",
                  background:
                    activeTab === tab
                      ? tab === "real"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.05)",
                  color:
                    activeTab === tab
                      ? tab === "real"
                        ? "#000"
                        : "#fff"
                      : "rgba(255,255,255,0.35)",
                }}
              >
                {tab === "real"
                  ? `Real - ${realCount}`
                  : `Fake - ${fakeCount}`}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "14px 0 0",
            flexShrink: 0,
          }}
        />
        {/* Scrollable voter list */}
        <div
          className="modal-voter-list"
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "12px 20px calc(48px + var(--safe-area-bottom))",
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              Loading votes...
            </div>
          ) : voters.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              No {activeTab === "real" ? "Real" : "Fake"} votes yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {voters.map((v: any, i: number) => (
                <div
                  key={`dare-voter-${v.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 12px",
                    borderRadius: 16,
                    background:
                      i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent",
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <Avatar
                      src={v.avatarUrl}
                      alt={v.displayName}
                      size="md"
                      userId={v.oduserId}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: 15,
                        margin: 0,
                      }}
                    >
                      {v.displayName}
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: 12,
                        margin: "3px 0 0",
                      }}
                    >
                      {formatTimeAgo(v.createdAt)}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "5px 14px",
                      borderRadius: 99,
                      fontWeight: 700,
                      fontSize: 13,
                      background:
                        activeTab === "real"
                          ? "rgba(74,222,128,0.12)"
                          : "rgba(255,255,255,0.07)",
                      color:
                        activeTab === "real"
                          ? "#4ade80"
                          : "rgba(255,255,255,0.5)",
                      border:
                        activeTab === "real"
                          ? "1px solid rgba(74,222,128,0.25)"
                          : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {activeTab === "real" ? "Real" : "Fake"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ DoubleTapLike â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DoubleTapLike({ trigger }: { trigger: number }) {
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>(
    [],
  );
  useEffect(() => {
    if (trigger === 0) return;
    const id = Date.now();
    setHearts((h) => [
      ...h,
      { id, x: 40 + Math.random() * 20, y: 40 + Math.random() * 20 },
    ]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 900);
  }, [trigger]);
  return (
    <>
      <style>{`@keyframes heartPop { 0%{transform:translate(-50%,-50%) scale(0);opacity:0} 20%{transform:translate(-50%,-50%) scale(1.4);opacity:1} 60%{transform:translate(-50%,-50%) scale(1.1);opacity:1} 100%{transform:translate(-50%,-50%) scale(1.3);opacity:0} }`}</style>
      {hearts.map((h) => (
        <div
          key={h.id}
          style={{
            position: "absolute",
            left: `${h.x}%`,
            top: `${h.y}%`,
            zIndex: 50,
            /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
            /* DISABLED: pointerEvents: "none", */
            animation: "heartPop 0.85s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        >
          <Heart
            size={80}
            fill="#ff4d6d"
            color="#ff4d6d"
            style={{ filter: "drop-shadow(0 0 12px rgba(255,77,109,0.6))" }}
          />
        </div>
      ))}
    </>
  );
}

// â”€â”€â”€ AnimatedDareCapsule â€” CINEMATIC timing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Timings stretched for a slow, theatrical reveal:
//   t=200ms  capsule + challenger name fade in together
//   t=600ms  pill expands
//   t=3.2s   DARED label + receiver appear
//   t=7.5s   description slides up
//   t=18s    fade-out begins
//   t=19.2s  fully hidden
const AnimatedDareCapsule = React.memo(
  function AnimatedDareCapsule({
    cardId,
    challenger,
    receiver,
    description,
    isActive,
    onNavigateToProfile,
    challengerId,
    receiverId,
    revealDescription = true,
    persist = false,
    animate = true,
    animationKey,
  }: {
    cardId: string;
    challenger: DarePost["challenger"];
    receiver: DarePost["receiver"];
    description: string;
    isActive: boolean;
    onNavigateToProfile?: (userId: string) => void;
    challengerId?: string;
    receiverId?: string;
    revealDescription?: boolean;
    persist?: boolean;
    animate?: boolean;
    animationKey?: string | number;
  }) {
    const [expanded, setExpanded] = useState(false);
    const [showChallengerName, setShowChallengerName] = useState(false);
    const [showReceiver, setShowReceiver] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [fading, setFading] = useState(false);
    const [showDescription, setShowDescription] = useState(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const capsuleVisible = animate ? showAll && !fading : true;
    const capsuleExpanded = animate ? expanded : true;
    const capsuleShowChallenger = animate ? showChallengerName : true;
    const capsuleShowReceiver = animate ? showReceiver : true;
    const capsuleShowDescription = animate ? showDescription : true;

    useEffect(() => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      if (!animate) {
        setShowAll(true);
        setExpanded(true);
        setShowChallengerName(true);
        setShowReceiver(true);
        setFading(false);
        setShowDescription(true);
        return;
      }

      if (!isActive) {
        setShowAll(false);
        setExpanded(false);
        setShowChallengerName(false);
        setShowReceiver(false);
        setFading(false);
        setShowDescription(false);
        return;
      }

      // Reset state first
      setShowAll(false);
      setExpanded(false);
      setShowChallengerName(false);
      setShowReceiver(false);
      setFading(false);
      setShowDescription(false);

      // Cinematic sequence â€” all delays from t=0 (card becomes active)
      const t0 = setTimeout(() => setShowAll(true), 200); // capsule appears
      const t1 = setTimeout(() => setExpanded(true), 500); // pill expands
      const t2 = setTimeout(() => setShowChallengerName(true), 200); // name drifts in with capsule
      const t3 = setTimeout(() => setShowReceiver(true), 1500); // DARED + receiver
      const t4 = setTimeout(() => {
        if (revealDescription) setShowDescription(true);
      }, 3500); // description rises

      timers.current.push(t0, t1, t2, t3, t4);
      if (!persist) {
        const t5 = setTimeout(() => setFading(true), 12000); // fade out
        const t6 = setTimeout(() => setShowAll(false), 12500); // unmount
        timers.current.push(t5, t6);
      }
      return () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
      };
    }, [animate, animationKey, cardId, isActive, persist, revealDescription]);

    const COLLAPSED_WIDTH = 64;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: capsuleVisible ? 1 : 0,
          transition: animate
            ? fading
              ? "opacity 1.4s ease"
              : "opacity 0.6s ease"
            : "none",
          /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
          /* DISABLED: pointerEvents: "none", */
          willChange: "opacity, transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {/* Pill */}
        <div
          className="dare-liquid-capsule"
          style={{
            position: "relative",
            isolation: "isolate",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: FEED_SCREEN_SURFACE_BACKGROUND,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.18)",
            height: "64px",
            padding: capsuleExpanded ? "0 18px 0 8px" : "0 8px",
            backdropFilter: "blur(30px) saturate(1.32)",
            WebkitBackdropFilter: "blur(30px) saturate(1.32)",
            boxShadow:
              "0 22px 52px rgba(0,0,0,0.50), 0 8px 20px rgba(0,0,0,0.32), 0 0 28px rgba(74,222,128,0.08), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -1px 0 rgba(74,222,128,0.08)",
            overflow: "hidden",
            whiteSpace: "nowrap",
            maxWidth: capsuleExpanded ? "420px" : `${COLLAPSED_WIDTH}px`,
            width: capsuleExpanded ? "max-content" : `${COLLAPSED_WIDTH}px`,
            // Smooth, slower expand â€” 2.0s with ease-in-out for smooth FPS
            transition: animate
              ? "max-width 2.0s cubic-bezier(0.4, 0, 0.2, 1), width 2.0s cubic-bezier(0.4, 0, 0.2, 1), padding 2.0s cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
            willChange: "max-width, width, padding",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "1px",
              borderRadius: 999,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 42%, rgba(0,0,0,0.12))",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              top: 7,
              height: 18,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), rgba(74,222,128,0.06), transparent)",
              opacity: 0.32,
              filter: "blur(8px)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          {/* Challenger avatar */}
          <PostAvatar
            src={challenger.avatar}
            name={challenger.nickname}
            size={48}
            style={{
              minWidth: 48,
              border: "2px solid rgba(255,255,255,0.62)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.34)",
              opacity: capsuleShowChallenger ? 1 : 0,
              transition: animate ? "opacity 1.2s ease" : "none",
              willChange: "opacity",
              transform: "translateZ(0)",
            }}
          />
          {/* Challenger name â€” slow fade */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToProfile && challengerId) {
                onNavigateToProfile(challengerId);
              }
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
              opacity: capsuleShowChallenger ? 1 : 0,
              transition: animate ? "opacity 1.2s ease" : "none",
              letterSpacing: "-0.01em",
              lineHeight: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
              cursor: onNavigateToProfile ? "pointer" : "default",
              textDecoration: "none",
            }}
          >
            {challenger.nickname.split(" ")[0]}
          </button>
          {/* DARED label */}
          <span
            className="dare-capsule-dared-label"
            style={{
              color: "#4ade80",
              fontWeight: 900,
              fontSize: 16,
              flexShrink: 0,
              opacity: capsuleShowReceiver ? 1 : 0,
              transition: animate ? "opacity 1.2s ease" : "none",
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              lineHeight: 1,
              textShadow:
                "0 2px 8px rgba(0,0,0,0.86), 0 0 12px rgba(74,222,128,0.58), 0 0 24px rgba(74,222,128,0.22)",
            }}
          >
            DARED
          </span>
          {/* Receiver avatar */}
          <PostAvatar
            src={receiver.avatar}
            name={receiver.nickname}
            size={48}
            style={{
              minWidth: 48,
              border: "2px solid rgba(255,255,255,0.62)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.34)",
              opacity: capsuleShowReceiver ? 1 : 0,
              transition: animate ? "opacity 1.2s ease 0.3s" : "none",
            }}
          />
          {/* Receiver name */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToProfile && receiverId) {
                onNavigateToProfile(receiverId);
              }
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
              opacity: capsuleShowReceiver ? 1 : 0,
              transition: animate ? "opacity 1.2s ease 0.5s" : "none",
              letterSpacing: "-0.01em",
              lineHeight: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
              cursor: onNavigateToProfile ? "pointer" : "default",
              textDecoration: "none",
            }}
          >
            {receiver.nickname.split(" ")[0]}
          </button>
        </div>
        {/* Description â€” cinematic slide up */}
        {revealDescription && (
          <p
            style={{
              color: "#fff",
              fontSize: 20,
              fontWeight: 800,
              textAlign: "center",
              textShadow:
                "0 2px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
              margin: "12px 0 0",
              padding: "0 32px",
              opacity: capsuleShowDescription ? 1 : 0,
              transform: capsuleShowDescription
                ? "translateY(0)"
                : "translateY(18px)",
              transition: animate
                ? "opacity 1.4s cubic-bezier(0.25,0.46,0.45,0.94), transform 1.4s cubic-bezier(0.25,0.46,0.45,0.94)"
                : "none",
            }}
          >
            {description}
          </p>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.isActive !== next.isActive) return false;
    if (
      prev.challenger !== next.challenger ||
      prev.receiver !== next.receiver ||
      prev.description !== next.description ||
      prev.revealDescription !== next.revealDescription ||
      prev.persist !== next.persist ||
      prev.animate !== next.animate ||
      prev.animationKey !== next.animationKey
    )
      return false;
    return true;
  },
);

// â”€â”€â”€ ReelCommentsModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ReelCommentsModal({
  isOpen,
  onClose,
  dare,
}: {
  isOpen: boolean;
  onClose: () => void;
  dare: DarePost;
}) {
  const { user } = useAuthStore();
  const {
    comments,
    loadingComments,
    subscribeToComments,
    unsubscribeFromComments,
    addComment,
    likeComment,
    commentLikeCounts,
    commentLikedByUser,
    subscribeToCommentLikeCount,
    subscribeToUserCommentLike,
  } = useDareInteractionStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(isOpen || closing);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      subscribeToComments(dare.id);
    }
    return () => {
      if (!isOpen) unsubscribeFromComments(dare.id);
    };
  }, [isOpen, dare.id, subscribeToComments, unsubscribeFromComments]);

  useEffect(() => {
    if (!user) return;
    const dareComments = comments[dare.id] || [];
    dareComments.forEach((comment) => {
      subscribeToCommentLikeCount(comment.id);
      subscribeToUserCommentLike(comment.id, user.id);
    });
  }, [
    comments,
    dare.id,
    user,
    subscribeToCommentLikeCount,
    subscribeToUserCommentLike,
  ]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    unsubscribeFromComments(dare.id);
    setTimeout(onClose, 340);
  };
  const handlePost = async (text: string, parentId?: string | null) => {
    if (!text.trim() || !user || posting) return;
    setPosting(true);
    await addComment(
      dare.id,
      user.id,
      user.username || "",
      user.displayName || user.username || "You",
      user.avatar || "",
      text.trim(),
      parentId,
    );
    setCommentText("");
    setPosting(false);
    setTimeout(
      () => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  };

  if (!isOpen && !closing) return null;
  const dareComments = comments[dare.id] || [];
  const isLoading = loadingComments[dare.id];

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.34s ease, backdrop-filter 0.34s ease",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes rcSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes rcSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        .rc-list::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #161616 0%, #111 100%)",
          borderRadius: "28px 28px 0 0",
          minHeight: "75vh",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          touchAction: "pan-y",
          animation:
            visible && !closing
              ? "rcSlideUp 0.38s cubic-bezier(0.32,0.72,0,1) forwards"
              : "rcSlideDown 0.32s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.18)",
            }}
          />
        </div>
        <div
          style={{
            padding: "14px 20px 12px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 17,
                margin: 0,
              }}
            >
              Comments
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
                margin: "3px 0 0",
              }}
            >
              {dare.challenger.nickname.split(" ")[0]} dared{" "}
              {dare.receiver.nickname.split(" ")[0]} - {dare.description}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        />
        {/* Comment input â€” fixed */}
        <div
          style={{
            padding: "12px 16px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "#111",
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <Avatar
              src={user?.avatar || ""}
              alt="You"
              size="sm"
              userId={user?.id}
            />
          </div>
          <div
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 99,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePost(commentText);
              }}
              placeholder="Add a comment..."
              style={{
                background: "none",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: 14,
                width: "100%",
                fontFamily: "inherit",
              }}
            />
          </div>
          {commentText.trim() && (
            <button
              onClick={() => handlePost(commentText)}
              disabled={posting}
              style={{
                background: posting ? "rgba(74,222,128,0.5)" : "#4ade80",
                border: "none",
                borderRadius: 99,
                padding: "9px 16px",
                color: "#000",
                fontWeight: 800,
                fontSize: 14,
                cursor: posting ? "default" : "pointer",
                flexShrink: 0,
              }}
            >
              {posting ? "..." : "Post"}
            </button>
          )}
        </div>
        {/* Scrollable comments */}
        <div
          className="rc-list"
          onWheel={(e) => e.stopPropagation()}
          // TEMPORARILY DISABLED FOR MOBILE DEBUGGING - onTouchMove stopPropagation blocking touch events
          // DISABLED: onTouchMove={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding: "12px 20px 8px",
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              Loading comments...
            </div>
          ) : dareComments.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              No comments yet. Be the first!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {dareComments.map((c: any, i: number) => (
                <div
                  key={`reel-comment-${c.id}`}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                    padding: "12px 0",
                    borderBottom:
                      i < dareComments.length - 1
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "none",
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <Avatar
                      src={c.avatarUrl}
                      alt={c.displayName}
                      size="sm"
                      userId={c.userId}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}
                      >
                        {c.displayName}
                      </span>
                      <span
                        style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}
                      >
                        {formatTimeAgo(c.createdAt)}
                      </span>
                    </div>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.85)",
                        fontSize: 14,
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {c.text}
                    </p>
                  </div>
                  <div
                    onClick={() => {
                      if (user && !commentLikedByUser[c.id]) {
                        likeComment(c.id, user.id);
                      }
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      flexShrink: 0,
                      paddingTop: 2,
                      cursor:
                        user && commentLikedByUser[c.id]
                          ? "default"
                          : "pointer",
                    }}
                  >
                    <Heart
                      size={14}
                      color={
                        user && commentLikedByUser[c.id]
                          ? "#ef4444"
                          : "rgba(255,255,255,0.35)"
                      }
                      fill={
                        user && commentLikedByUser[c.id] ? "#ef4444" : "none"
                      }
                    />
                    <span
                      style={{
                        color:
                          user && commentLikedByUser[c.id]
                            ? "#ef4444"
                            : "rgba(255,255,255,0.35)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {commentLikeCounts[c.id] || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ ReelShareModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ReelShareModal({
  isOpen,
  onClose,
  dare,
}: {
  isOpen: boolean;
  onClose: () => void;
  dare: DarePost;
}) {
  const { user } = useAuthStore();
  const { shareDareToDM } = useDareInteractionStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setSentTo([]);
      requestAnimationFrame(() => setVisible(true));
      if (user?.id) {
        setLoadingFriends(true);
        friendsService
          .getFriends(user.id)
          .then((r) => setFriends(r))
          .catch(console.error)
          .finally(() => setLoadingFriends(false));
      }
    }
  }, [isOpen, user?.id]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    setTimeout(onClose, 340);
  };
  const toggleSend = (id: string) =>
    setSentTo((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );
  const handleSendToDMs = async () => {
    if (!user?.id || sentTo.length === 0 || sending) return;
    setSending(true);
    try {
      await Promise.all(
        sentTo.map((recipientId) =>
          shareDareToDM(
            user.id,
            recipientId,
            dare.id,
            dare.description,
            dare.challenger.nickname,
            dare.receiver.nickname,
          ),
        ),
      );
      handleClose();
    } catch (error) {
      console.error("Error sending dare to DMs:", error);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen && !closing) return null;

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.34s ease, backdrop-filter 0.34s ease",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes rsSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes rsSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        .rs-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #161616 0%, #111 100%)",
          borderRadius: "28px 28px 0 0",
          minHeight: "75vh",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          animation:
            visible && !closing
              ? "rsSlideUp 0.38s cubic-bezier(0.32,0.72,0,1) forwards"
              : "rsSlideDown 0.32s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.18)",
            }}
          />
        </div>
        <div
          style={{
            padding: "14px 20px 12px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 17,
                margin: 0,
              }}
            >
              Send to Friends
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
                margin: "3px 0 0",
              }}
            >
              {dare.challenger.nickname.split(" ")[0]} dared{" "}
              {dare.receiver.nickname.split(" ")[0]} - {dare.description}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        />
        {/* Scrollable friends list */}
        <div
          className="rs-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "8px 0",
          }}
        >
          {loadingFriends ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              Loading friends...
            </div>
          ) : friends.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              No friends yet
            </div>
          ) : (
            friends.map((f, i) => {
              const friendId = f.user_id || f.id;
              const selected = sentTo.includes(friendId);
              return (
                <div
                  key={`friend-${friendId}-${i}`}
                  onClick={() => toggleSend(friendId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 20px",
                    cursor: "pointer",
                    background: selected
                      ? "rgba(74,222,128,0.06)"
                      : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      border: selected
                        ? "2px solid #4ade80"
                        : "2px solid rgba(255,255,255,0.1)",
                      borderRadius: "50%",
                      transition: "border 0.15s",
                    }}
                  >
                    <Avatar
                      src={f.avatar_url || ""}
                      alt={f.display_name || f.username}
                      size="lg"
                      userId={f.user_id}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 15,
                        margin: 0,
                      }}
                    >
                      {f.display_name || f.username}
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: 13,
                        margin: "2px 0 0",
                      }}
                    >
                      @{f.username}
                    </p>
                  </div>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: selected
                        ? "none"
                        : "2px solid rgba(255,255,255,0.2)",
                      background: selected ? "#4ade80" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    {selected && (
                      <span
                        style={{ color: "#000", fontSize: 14, fontWeight: 900 }}
                      >
                        OK
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            padding: "12px 20px calc(12px + var(--safe-area-bottom))",
            flexShrink: 0,
          }}
        >
          {sentTo.length > 0 && (
            <button
              onClick={handleSendToDMs}
              disabled={sending}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 16,
                border: "none",
                background: sending ? "rgba(74,222,128,0.5)" : "#4ade80",
                color: "#000",
                fontWeight: 800,
                fontSize: 16,
                cursor: sending ? "default" : "pointer",
              }}
            >
              {sending
                ? "Sending..."
                : `Send to ${sentTo.length} ${sentTo.length === 1 ? "friend" : "friends"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ DareCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Key changes:
//   1. Reads sessionVotes on mount â€” if already voted, skip progress bar and show voted state immediately
//   2. On vote confirm, writes to sessionVotes
//   3. Progress bar only renders when card hasn't been voted on yet
interface DareCardProps {
  dare: DarePost;
  reelMode?: boolean;
  isActive?: boolean;
  hasPlayedEntryAnimation?: boolean;
  playEntryAnimation?: boolean;
  onVoteClick: (dare: DarePost) => void;
  onFullscreenMedia: (media: {
    url: string;
    type: "image" | "video";
    thumbnail?: string;
  }) => void;
  onOpenComments?: (dare: DarePost) => void;
  onOpenShare?: (dare: DarePost) => void;
  onVote?: (dareId: string, vote: "real" | "fake") => void;
  onNavigateToProfile?: (userId: string) => void;
  picModeEnabled?: boolean;
  picModeAnimationKey?: number;
}

export function DareCard({
  dare,
  reelMode,
  isActive,
  hasPlayedEntryAnimation = false,
  playEntryAnimation = true,
  onVoteClick,
  onFullscreenMedia,
  onOpenComments,
  onOpenShare,
  onVote,
  onNavigateToProfile,
  picModeEnabled = true,
  picModeAnimationKey = 0,
}: DareCardProps) {
  if (!dare || !dare.id) return null;

  const { user } = useAuthStore();
  const {
    viewCounts,
    commentCounts,
    mediaLikeCounts,
    mediaLikedByUser,
    recordView,
    subscribeToViewCount,
    subscribeToCommentCount,
    subscribeToMediaLikeCount,
    subscribeToUserMediaLike,
    likeMedia,
    recordVote: recordVoteAction,
    getUserVote,
    setUserVote,
  } = useDareInteractionStore();

  // Initialise from persistent storage â€” if previously voted, jump straight to voted state
  const priorVote = getUserVote(dare.id);
  const [vote, setVote] = useState<"real" | "fake" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const lastTapRef = useRef<number>(0);
  const [likeTrigger, setLikeTrigger] = useState(0);

  // Progress bar / buttons visibility
  // If already voted: buttons are immediately visible, no progress bar
  const [buttonsVisible, setButtonsVisible] = useState(
    priorVote ? true : false,
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [exiting, setExiting] = useState(false);
  const btnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipVoteUntilRef = useRef<number>(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const carouselScrollFrame = useRef<number | null>(null);
  const carouselTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [carouselSlide, setCarouselSlide] = useState(0);
  const [carouselSeamProgress, setCarouselSeamProgress] = useState(0);

  useEffect(() => {
    if (dare.id) {
      subscribeToViewCount(dare.id);
      subscribeToCommentCount(dare.id);
      subscribeToMediaLikeCount(dare.id);
      if (user?.id) subscribeToUserMediaLike(dare.id, user.id);
      if (user?.id) recordView(dare.id, user.id);
    }
  }, [
    dare.id,
    user?.id,
    subscribeToViewCount,
    subscribeToCommentCount,
    subscribeToMediaLikeCount,
    subscribeToUserMediaLike,
    recordView,
  ]);

  const hasVoted = phase === "voted" && vote !== null;
  const realViewCount = viewCounts[dare.id] ?? 0;
  const realCommentCount = commentCounts[dare.id] ?? 0;
  const realLikeCount = mediaLikeCounts[dare.id] ?? 0;
  const hasLikedMedia = Boolean(mediaLikedByUser[dare.id]);
  const voteControlsVisible =
    buttonsVisible || hasVoted || phase === "confirming";
  const shouldRunVoteTimer = Boolean(
    isActive && (!reelMode || carouselSlide === 1),
  );

  useEffect(() => {
    if (btnTimerRef.current) clearTimeout(btnTimerRef.current);

    // If this card was already voted on, always show buttons immediately â€” no timer, no progress bar
    if (getUserVote(dare.id)) {
      setButtonsVisible(true);
      setTimerRunning(false);
      return;
    }

    if (shouldRunVoteTimer) {
      if (buttonsVisible || phase !== "idle") {
        setTimerRunning(false);
        return;
      }

      setTimerRunning(false);
      setTimerKey((k) => k + 1);
      const tStart = setTimeout(() => setTimerRunning(true), 50);
      btnTimerRef.current = setTimeout(() => {
        setButtonsVisible(true);
        setTimerRunning(false);
      }, 10000);
      return () => clearTimeout(tStart);
    } else if (!isActive) {
      setButtonsVisible(false);
      setTimerRunning(false);
    } else {
      setTimerRunning(false);
    }
    return () => {
      if (btnTimerRef.current) clearTimeout(btnTimerRef.current);
    };
  }, [
    buttonsVisible,
    dare.id,
    getUserVote,
    isActive,
    phase,
    shouldRunVoteTimer,
  ]);

  useEffect(() => {
    if (isActive) return;
    setCarouselSlide(0);
    setCarouselSeamProgress(0);
    if (carouselRef.current) carouselRef.current.scrollLeft = 0;
  }, [isActive, dare.id]);

  useEffect(() => {
    return () => {
      if (carouselScrollFrame.current !== null) {
        window.cancelAnimationFrame(carouselScrollFrame.current);
      }
    };
  }, []);

  const handleVote = (choice: "real" | "fake") => {
    if (phase !== "idle" || exiting || Date.now() < skipVoteUntilRef.current)
      return;
    setExiting(true);
    setTimeout(() => {
      setVote(choice);
      setExiting(false);
      setPhase("confirming");
    }, 260);
  };

  const handleConfirm = () => {
    if (vote && user?.id)
      recordVoteAction(dare.id, user.id, vote.toUpperCase() as "REAL" | "FAKE");
    if (vote && onVote) onVote(dare.id, vote);
    // Persist to localStorage
    if (vote) setUserVote(dare.id, vote);
    setPhase("voted");
    onVoteClick(dare);
  };

  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300 && dare.proof) {
      setLikeTrigger((t) => t + 1);
      onFullscreenMedia({
        url: dare.proof.url,
        type: dare.proof.type,
        thumbnail: dare.proof.thumbnail,
      });
    }
    lastTapRef.current = now;
  };

  const handleMediaLike = async () => {
    if (!user?.id || hasLikedMedia) return;
    setLikeTrigger((t) => t + 1);
    await likeMedia(dare.id, user.id);
  };

  const fastForwardVoteProgress = (clientX: number, target: HTMLElement) => {
    skipVoteUntilRef.current = Date.now() + 650;
    const rect = target.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const remaining = Math.max(0, Math.round((1 - pct) * 10));

    if (btnTimerRef.current) clearTimeout(btnTimerRef.current);

    if (remaining <= 0) {
      setButtonsVisible(true);
      setTimerRunning(false);
      return;
    }

    setTimerRunning(false);
    requestAnimationFrame(() => {
      const bar = target.querySelector(
        "[data-progress-bar]",
      ) as HTMLElement | null;
      if (bar) {
        bar.style.transition = "none";
        bar.style.width = `${pct * 100}%`;
        bar.getBoundingClientRect();
        bar.style.transition = `width ${remaining}s linear`;
        bar.style.width = "100%";
      }
      setTimerRunning(true);
      btnTimerRef.current = setTimeout(() => {
        setButtonsVisible(true);
        setTimerRunning(false);
      }, remaining * 1000);
    });
  };

  const handleCarouselTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    carouselTouchStartRef.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  };

  const handleCarouselTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = carouselTouchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    if (deltaX > deltaY * 1.15) {
      e.stopPropagation();
    }
  };

  const handleCarouselTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = carouselTouchStartRef.current;
    carouselTouchStartRef.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    if (deltaX > deltaY * 1.15) {
      e.stopPropagation();
    }
  };

  const handleCarouselScroll = () => {
    if (carouselScrollFrame.current !== null) return;

    carouselScrollFrame.current = window.requestAnimationFrame(() => {
      carouselScrollFrame.current = null;
      const carousel = carouselRef.current;
      if (!carousel || !carousel.clientWidth) return;
      const nextProgress = Math.max(
        0,
        Math.min(1, carousel.scrollLeft / carousel.clientWidth),
      );
      const nextSlide = Math.max(0, Math.min(1, Math.round(nextProgress)));
      setCarouselSeamProgress((current) =>
        Math.abs(current - nextProgress) < 0.01 ? current : nextProgress,
      );
      setCarouselSlide((current) =>
        current === nextSlide ? current : nextSlide,
      );
    });
  };

  const carouselSeamOpacity =
    carouselSeamProgress > 0.015 && carouselSeamProgress < 0.985
      ? Math.min(0.72, Math.sin(carouselSeamProgress * Math.PI) * 0.78)
      : 0;
  const showSettledCover =
    !isActive || !playEntryAnimation || hasPlayedEntryAnimation;
  const coverSlideClassName = [
    "dare-cover-slide",
    picModeEnabled ? "dare-cover-slide-pic-mode" : "",
    isActive && playEntryAnimation ? "dare-cover-slide-active" : "",
    showSettledCover ? "dare-cover-slide-entered" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const coverThumbnailUrl = dare.proof?.thumbnail || dare.proof?.url;

  if (reelMode) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#0a0a0a",
          WebkitTapHighlightColor: "transparent",
          outline: "none",
          contain: "layout paint style",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        <DoubleTapLike trigger={likeTrigger} />
        <div
          ref={carouselRef}
          className="dare-reel-carousel"
          onScroll={handleCarouselScroll}
          onTouchStart={handleCarouselTouchStart}
          onTouchMove={handleCarouselTouchMove}
          onTouchEnd={handleCarouselTouchEnd}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x mandatory",
            scrollBehavior: "auto",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x pan-y",
            willChange: "scroll-position",
            contain: "layout paint style",
          }}
        >
          <section
            className={coverSlideClassName}
            style={{
              position: "relative",
              flex: "0 0 100%",
              width: "100%",
              height: "100%",
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              overflow: "hidden",
              background:
                "radial-gradient(circle at 50% 18%, rgba(250,204,21,0.16), transparent 18%), radial-gradient(circle at 16% 76%, rgba(74,222,128,0.18), transparent 24%), radial-gradient(circle at 86% 72%, rgba(96,165,250,0.14), transparent 28%), linear-gradient(180deg, #020403 0%, #07100b 38%, #030303 100%)",
              contain: "layout paint style",
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
            }}
          >
            <div
              className="dare-cover-lattice"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(115deg, rgba(74,222,128,0.18) 0 1px, transparent 1px 22px), linear-gradient(245deg, rgba(255,255,255,0.075) 0 1px, transparent 1px 28px), radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.12), transparent 42%)",
                backgroundSize: "100% 100%, 100% 100%, 100% 100%",
                opacity: 0.9,
                mixBlendMode: picModeEnabled ? "soft-light" : "normal",
              }}
            />
            <div
              className="dare-cover-metal"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "conic-gradient(from 210deg at 50% 52%, rgba(74,222,128,0.18), rgba(255,255,255,0.06), rgba(96,165,250,0.14), rgba(250,204,21,0.1), rgba(74,222,128,0.18)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.72), transparent 50%)",
                opacity: picModeEnabled ? 0.28 : 0.72,
                mixBlendMode: "screen",
              }}
            />
            <div
              className="dare-cover-ribbon"
              style={{
                position: "absolute",
                top: "50%",
                left: "-22%",
                width: "144%",
                height: 220,
                transform: "translateY(-50%) rotate(12deg)",
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(74,222,128,0.02) 18%, rgba(74,222,128,0.2) 46%, rgba(255,255,255,0.16) 51%, rgba(96,165,250,0.12) 59%, transparent 100%)",
                opacity: picModeEnabled ? 0.2 : 0.68,
                filter: "blur(0.2px)",
              }}
            />
            <div
              className="dare-cover-stage"
              style={{
                position: "absolute",
                left: "7%",
                right: "7%",
                top: "15%",
                bottom: "16%",
                borderRadius: 36,
                border: "1px solid rgba(74,222,128,0.16)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 90px rgba(74,222,128,0.08), inset 0 -44px 90px rgba(0,0,0,0.34), 0 30px 94px rgba(0,0,0,0.38)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))",
                transform: "translateY(-38px) perspective(900px) rotateX(2deg)",
                opacity: picModeEnabled ? 0 : 1,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -120px 160px rgba(0,0,0,0.58), inset 0 120px 160px rgba(74,222,128,0.035)",
              }}
            />
            {picModeEnabled && coverThumbnailUrl && (
              <div
                className="dare-cover-full-thumbnail"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 0,
                  overflow: "hidden",
                }}
              >
                <img
                  src={coverThumbnailUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    transform: "scale(1.01)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.10) 34%, rgba(0,0,0,0.84) 100%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    boxShadow:
                      "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -160px 180px rgba(0,0,0,0.52)",
                  }}
                />
              </div>
            )}
            <div
              style={{
                position: "relative",
                zIndex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: picModeEnabled ? "flex-end" : "center",
                gap: picModeEnabled ? "12px" : "24px",
                padding: picModeEnabled
                  ? "calc(var(--safe-area-top) + 82px) 20px calc(124px + var(--safe-area-bottom))"
                  : "40px 22px calc(120px + var(--safe-area-bottom))",
                transform: picModeEnabled ? "none" : "translateY(-12px)",
              }}
            >
              {!picModeEnabled && (
                <div
                  className="dare-cover-avatar-stack"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 98,
                    filter: "drop-shadow(0 18px 34px rgba(0,0,0,0.5))",
                  }}
                >
                  <button
                    className="dare-cover-avatar dare-cover-avatar-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToProfile && dare.challengerId) {
                        onNavigateToProfile(dare.challengerId);
                      }
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: onNavigateToProfile ? "pointer" : "default",
                      position: "relative",
                      zIndex: 2,
                    }}
                  >
                    <PostAvatar
                      src={dare.challenger.avatar}
                      name={dare.challenger.nickname}
                      size={88}
                      style={{
                        border: "3px solid rgba(255,255,255,0.36)",
                        boxShadow:
                          "0 0 0 1px rgba(74,222,128,0.3), 0 18px 46px rgba(0,0,0,0.5)",
                      }}
                    />
                  </button>
                  <button
                    className="dare-cover-avatar dare-cover-avatar-right"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToProfile && dare.receiverId) {
                        onNavigateToProfile(dare.receiverId);
                      }
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: onNavigateToProfile ? "pointer" : "default",
                      marginLeft: "-18px",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <PostAvatar
                      src={dare.receiver.avatar}
                      name={dare.receiver.nickname}
                      size={88}
                      style={{
                        border: "3px solid rgba(74,222,128,0.48)",
                        boxShadow:
                          "0 0 0 1px rgba(255,255,255,0.18), 0 18px 46px rgba(0,0,0,0.5)",
                      }}
                    />
                  </button>
                </div>
              )}

              <div className="dare-cover-capsule">
                <AnimatedDareCapsule
                  cardId={dare.id}
                  challenger={dare.challenger}
                  receiver={dare.receiver}
                  description={dare.description}
                  isActive={!!isActive}
                  onNavigateToProfile={onNavigateToProfile}
                  challengerId={dare.challengerId}
                  receiverId={dare.receiverId}
                  revealDescription={false}
                  persist
                  animate={false}
                  animationKey={`settled-${picModeAnimationKey}`}
                />
              </div>

              <div
                className="dare-cover-challenge"
                style={{
                  width: "100%",
                  maxWidth: picModeEnabled ? 400 : 430,
                  padding: picModeEnabled ? "18px 18px 17px" : "24px 20px 23px",
                  borderRadius: 24,
                  background: FEED_SCREEN_SURFACE_BACKGROUND,
                  border: picModeEnabled
                    ? "1px solid rgba(255,255,255,0.18)"
                    : "1px solid rgba(255,255,255,0.16)",
                  boxShadow: picModeEnabled
                    ? "0 28px 70px rgba(0,0,0,0.60), 0 10px 26px rgba(0,0,0,0.34), 0 0 34px rgba(74,222,128,0.08), inset 0 1px 0 rgba(255,255,255,0.26), inset 0 -1px 0 rgba(74,222,128,0.08)"
                    : "0 26px 66px rgba(0,0,0,0.54), 0 10px 24px rgba(0,0,0,0.30), 0 0 30px rgba(74,222,128,0.07), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(74,222,128,0.07)",
                  backdropFilter: "blur(30px) saturate(1.34)",
                  WebkitBackdropFilter: "blur(30px) saturate(1.34)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_42%,rgba(0,0,0,0.14))]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(circle_at_22%_0%,rgba(255,255,255,0.035),transparent_44%),radial-gradient(circle_at_86%_8%,rgba(74,222,128,0.045),transparent_42%)]"
                />
                <div
                  className="dare-cover-kicker"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: "#4ade80",
                    textShadow:
                      "0 2px 8px rgba(0,0,0,0.86), 0 0 12px rgba(74,222,128,0.58), 0 0 24px rgba(74,222,128,0.22)",
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    textAlign: "center",
                    marginBottom: 12,
                  }}
                >
                  Dare challenge
                </div>
                <p
                  className="dare-cover-copy"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: "#fff",
                    fontSize: picModeEnabled
                      ? "clamp(20px, 5.3vw, 30px)"
                      : "clamp(24px, 6vw, 36px)",
                    lineHeight: 1.08,
                    fontWeight: 900,
                    textAlign: "center",
                    margin: 0,
                    letterSpacing: 0,
                    textShadow:
                      "0 10px 30px rgba(0,0,0,0.6), 0 0 18px rgba(74,222,128,0.28), 0 0 34px rgba(74,222,128,0.12)",
                    overflowWrap: "break-word",
                  }}
                >
                  {dare.description}
                </p>
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: "calc(94px + var(--safe-area-bottom))",
                display: "flex",
                justifyContent: "center",
                gap: 7,
                zIndex: 2,
              }}
            >
              <span
                style={{
                  width: carouselSlide === 0 ? 18 : 5,
                  height: 5,
                  borderRadius: 999,
                  background:
                    carouselSlide === 0 ? "#4ade80" : "rgba(255,255,255,0.32)",
                  boxShadow:
                    carouselSlide === 0
                      ? "0 0 14px rgba(74,222,128,0.45)"
                      : "none",
                  transition: "all 0.2s ease",
                }}
              />
              <span
                style={{
                  width: carouselSlide === 1 ? 18 : 5,
                  height: 5,
                  borderRadius: 999,
                  background:
                    carouselSlide === 1 ? "#4ade80" : "rgba(255,255,255,0.32)",
                  boxShadow:
                    carouselSlide === 1
                      ? "0 0 14px rgba(74,222,128,0.45)"
                      : "none",
                  transition: "all 0.2s ease",
                }}
              />
            </div>
            <div
              className="dare-carousel-seam-fade dare-carousel-seam-fade-right"
              aria-hidden="true"
              style={{ opacity: carouselSeamOpacity }}
            />
          </section>

          <section
            style={{
              position: "relative",
              flex: "0 0 100%",
              width: "100%",
              height: "100%",
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              overflow: "hidden",
              background: "#0a0a0a",
              contain: "layout paint style",
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
            }}
          >
            {dare.proof && (
              <div
                style={{ position: "absolute", inset: 0, zIndex: 0 }}
                onClick={handleMediaTap}
              >
                <img
                  src={
                    dare.proof.type === "video"
                      ? dare.proof.thumbnail || dare.proof.url
                      : dare.proof.url
                  }
                  alt="Dare proof"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "35%",
                    background:
                      "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
                    /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
                    /* DISABLED: pointerEvents: "none", */
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "45%",
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)",
                    /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
                    /* DISABLED: pointerEvents: "none", */
                  }}
                />
                {dare.proof.type === "video" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
                      /* DISABLED: pointerEvents: "none", */
                    }}
                  >
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        background: "rgba(255,255,255,0.18)",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backdropFilter: "blur(6px)",
                        border: "1.5px solid rgba(255,255,255,0.25)",
                      }}
                    >
                      <Play size={30} color="#fff" fill="#fff" />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div
              className="dare-carousel-seam-fade dare-carousel-seam-fade-left"
              aria-hidden="true"
              style={{ opacity: carouselSeamOpacity }}
            />

            {/* Sidebar icons appear with the Real/Fake controls after the progress line finishes. */}
            {voteControlsVisible && (
              <div
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: "calc(200px + var(--safe-area-bottom))",
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                  opacity: voteControlsVisible ? 1 : 0,
                  transform: voteControlsVisible
                    ? "translateY(0)"
                    : "translateY(10px)",
                  transition: "opacity 0.35s ease, transform 0.35s ease",
                }}
              >
                <button
                  type="button"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: hasLikedMedia ? "default" : "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleMediaLike();
                  }}
                >
                  <Heart
                    size={29}
                    color={hasLikedMedia ? "#fb7185" : "rgba(255,255,255,0.68)"}
                    fill={hasLikedMedia ? "#fb7185" : "transparent"}
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: hasLikedMedia
                        ? "#fecdd3"
                        : "rgba(255,255,255,0.6)",
                      fontSize: "12px",
                      fontWeight: 800,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {realLikeCount}
                  </span>
                </button>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Eye
                    size={28}
                    color="rgba(255,255,255,0.55)"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {realViewCount}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenComments?.(dare);
                  }}
                >
                  <MessageCircle
                    size={28}
                    color="rgba(255,255,255,0.55)"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {realCommentCount}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenShare?.(dare);
                  }}
                >
                  <Share2
                    size={28}
                    color="rgba(255,255,255,0.55)"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    Share
                  </span>
                </div>
              </div>
            )}

            {/* Progress bar â€” only shown when not yet voted and buttons not yet visible */}
            {!hasVoted && !buttonsVisible && phase === "idle" && (
              <div
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fastForwardVoteProgress(e.clientX, e.currentTarget);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  position: "absolute",
                  top: "calc(100% - 100px - var(--safe-area-bottom))", // decreased further to move down more
                  left: "14px",
                  right: "14px",
                  zIndex: 100,
                  height: "5px", // thinner than 8px, slightly thicker than original 2px
                  borderRadius: "99px",
                  background: "rgba(255,255,255,0.10)",
                  overflow: "visible",
                  cursor: "pointer",
                  touchAction: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "-20px",
                    zIndex: 1,
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      fastForwardVoteProgress(e.clientX, parent);
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
                <div
                  data-progress-bar // â† used by the querySelector above
                  key={timerKey}
                  style={{
                    height: "100%",
                    borderRadius: "99px",
                    background:
                      "linear-gradient(90deg, rgba(74,222,128,0.5), #4ade80)",
                    width: timerRunning ? "100%" : "0%",
                    transition: timerRunning ? `width 10s linear` : "none",
                    pointerEvents: "none",
                    position: "relative",
                    zIndex: 2,
                  }}
                />
              </div>
            )}

            {/* Vote buttons / voted state */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1,
                padding: "0 14px calc(95px + var(--safe-area-bottom))",
              }}
            >
              <div
                style={{
                  opacity:
                    buttonsVisible || hasVoted || phase === "confirming"
                      ? 1
                      : 0,
                  transform:
                    buttonsVisible || hasVoted || phase === "confirming"
                      ? "translateY(0)"
                      : "translateY(16px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                  pointerEvents:
                    buttonsVisible || hasVoted || phase === "confirming"
                      ? "auto"
                      : "none",
                }}
              >
                {hasVoted ? (
                  // Voted state â€” show locked-in choice, clicking reopens the modal
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => onVoteClick(dare)}
                      style={{
                        width: "80%",
                        padding: "16px",
                        borderRadius: "16px",
                        border:
                          vote === "fake"
                            ? "1px solid rgba(255,255,255,0.2)"
                            : "none",
                        background:
                          vote === "real" ? "#4ade80" : "rgba(255,255,255,0.1)",
                        color:
                          vote === "real" ? "#000" : "rgba(255,255,255,0.9)",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        textAlign: "center",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      {vote === "real"
                        ? "You think this is Real"
                        : "You think this is Fake"}
                    </button>
                  </div>
                ) : phase === "idle" ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      opacity: exiting ? 0 : 1,
                      transform: exiting
                        ? "scale(0.93) translateY(5px)"
                        : "scale(1) translateY(0)",
                      transition: "opacity 0.22s ease, transform 0.22s ease",
                    }}
                  >
                    <button
                      className="dare-real-btn"
                      onClick={() => handleVote("real")}
                      style={{
                        flex: 1,
                        padding: "16px",
                        borderRadius: "16px",
                        border: "none",
                        background: "#4ade80",
                        color: "#000",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        animation: "btnPulseReal 6s ease-in-out infinite",
                      }}
                    >
                      Real
                    </button>
                    <button
                      className="dare-fake-btn"
                      onClick={() => handleVote("fake")}
                      style={{
                        flex: 1,
                        padding: "16px",
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.9)",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        backdropFilter: "blur(8px)",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        animation: "btnPulseFake 6s ease-in-out infinite",
                      }}
                    >
                      Fake
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={handleConfirm}
                      style={{
                        width: "80%",
                        padding: "16px",
                        borderRadius: "16px",
                        border:
                          vote === "fake"
                            ? "1px solid rgba(255,255,255,0.2)"
                            : "none",
                        background:
                          vote === "real" ? "#4ade80" : "rgba(255,255,255,0.1)",
                        color:
                          vote === "real" ? "#000" : "rgba(255,255,255,0.9)",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        textAlign: "center",
                        backdropFilter: "blur(8px)",
                        animation:
                          "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
                      }}
                    >
                      {vote === "real"
                        ? "You think this is Real"
                        : "You think this is Fake"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
        <div
          className="dare-carousel-swipe-bridge"
          aria-hidden="true"
          style={{
            left: `${(1 - carouselSeamProgress) * 100}%`,
            opacity: carouselSeamOpacity,
          }}
        />

        <style>{`
          .dare-reel-carousel {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .dare-reel-carousel::-webkit-scrollbar {
            display: none;
          }
          .dare-carousel-seam-fade {
            position: absolute;
            top: 0;
            bottom: 0;
            width: min(24vw, 104px);
            pointer-events: none;
            z-index: 4;
            transition: opacity 120ms ease-out;
            will-change: opacity;
          }
          .dare-carousel-seam-fade-right {
            right: 0;
            background: linear-gradient(
              to left,
              rgba(0, 0, 0, 0.62) 0%,
              rgba(0, 0, 0, 0.28) 44%,
              rgba(0, 0, 0, 0) 100%
            );
          }
          .dare-carousel-seam-fade-left {
            left: 0;
            background: linear-gradient(
              to right,
              rgba(0, 0, 0, 0.62) 0%,
              rgba(0, 0, 0, 0.28) 44%,
              rgba(0, 0, 0, 0) 100%
            );
          }
          .dare-carousel-swipe-bridge {
            position: absolute;
            top: 0;
            bottom: 0;
            width: min(30vw, 140px);
            transform: translateX(-50%);
            pointer-events: none;
            z-index: 7;
            background:
              linear-gradient(
                90deg,
                rgba(0, 0, 0, 0) 0%,
                rgba(0, 0, 0, 0.28) 30%,
                rgba(0, 0, 0, 0.5) 50%,
                rgba(0, 0, 0, 0.28) 70%,
                rgba(0, 0, 0, 0) 100%
              );
            filter: blur(0.1px);
            transition: opacity 120ms ease-out;
            will-change: left, opacity;
          }
          .dare-cover-slide {
            isolation: isolate;
          }
          .dare-cover-lattice {
            opacity: 0;
          }
          .dare-cover-metal {
            opacity: 0;
          }
          .dare-cover-ribbon {
            opacity: 0;
          }
          .dare-cover-stage {
            opacity: 1;
          }
          .dare-cover-avatar-stack {
            opacity: 0;
          }
          .dare-cover-avatar {
            transform-origin: center;
          }
          .dare-cover-avatar::before,
          .dare-cover-avatar::after {
            content: "";
            position: absolute;
            inset: -12px;
            border-radius: 999px;
            pointer-events: none;
          }
          .dare-cover-avatar::before {
            border: 1.5px solid rgba(74,222,128,0.52);
            background: radial-gradient(circle, rgba(74,222,128,0.18) 0%, rgba(74,222,128,0.07) 44%, transparent 72%);
            box-shadow: 0 0 26px rgba(74,222,128,0.3), 0 0 52px rgba(74,222,128,0.13);
            animation: none;
          }
          .dare-cover-avatar::after {
            inset: -6px;
            padding: 1.5px;
            background: conic-gradient(from 90deg, rgba(74,222,128,0), rgba(74,222,128,0.82), rgba(255,255,255,0.55), rgba(250,204,21,0.4), rgba(74,222,128,0));
            opacity: 0.78;
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: none;
          }
          .dare-cover-capsule {
            opacity: 0;
          }
          .dare-cover-full-thumbnail {
            opacity: 0;
            transform: scale(1.015);
          }
          .dare-cover-pic-frame {
            opacity: 0;
            transform: translateY(18px) scale(0.98);
          }
          .dare-cover-slide-pic-mode .dare-cover-capsule {
            margin-top: 4px;
          }
          .dare-cover-challenge {
            position: relative;
            overflow: hidden;
            transform-origin: center top;
            opacity: 1;
          }
          .dare-cover-challenge::before {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 42%, rgba(74,222,128,0.13) 50%, transparent 64%);
            transform: translateX(-120%);
            pointer-events: none;
          }
          .dare-cover-kicker {
            opacity: 0;
          }
          .dare-cover-copy {
            opacity: 0;
          }
          .dare-cover-slide-active .dare-cover-lattice {
            animation: dareCoverLatticeIn 1s ease-out both;
          }
          .dare-cover-slide-active .dare-cover-metal {
            animation: dareCoverMetalIn 0.8s ease-out both, dareCoverSheen 8s ease-in-out 0.8s infinite;
          }
          .dare-cover-slide-active .dare-cover-ribbon {
            animation: dareCoverRibbonIn 1.1s cubic-bezier(0.22,1,0.36,1) 0.12s both, dareCoverRibbonDrift 7s ease-in-out 1.2s infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar-stack {
            animation: dareCoverAvatarStackIn 0.72s cubic-bezier(0.22,1,0.36,1) 0.18s both;
          }
          .dare-cover-slide-active .dare-cover-avatar {
            animation: dareCoverAvatarBreathe 4.6s ease-in-out 1.25s infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar::before {
            animation: dareCoverAvatarRing 2.65s ease-out 0.45s infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar::after {
            animation: dareCoverAvatarHalo 4.8s linear infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar-right::before {
            animation-delay: 0.78s;
          }
          .dare-cover-slide-active .dare-cover-avatar-right::after {
            animation-delay: -1.9s;
          }
          .dare-cover-slide-active .dare-cover-capsule {
            animation: dareCoverCapsuleSettle 0.75s cubic-bezier(0.22,1,0.36,1) 0.58s both;
          }
          .dare-cover-slide-active .dare-cover-full-thumbnail {
            animation: dareCoverFullThumbnailIn 0.8s ease-out both;
          }
          .dare-cover-slide-active .dare-cover-pic-frame {
            animation: dareCoverPicFrameIn 0.72s cubic-bezier(0.22,1,0.36,1) 0.12s both;
          }
          .dare-cover-slide-active .dare-cover-challenge {
            animation: none;
          }
          .dare-cover-slide-active .dare-cover-challenge::before {
            animation: dareCoverChallengeSweep 2.5s cubic-bezier(0.22,1,0.36,1) 2.36s both;
          }
          .dare-cover-slide-active .dare-cover-kicker {
            animation: dareCoverKickerIn 0.5s ease-out 2.08s both;
          }
          .dare-cover-slide-active .dare-cover-copy {
            animation: dareCoverCopyIn 0.72s cubic-bezier(0.22,1,0.36,1) 2.18s both;
          }
          .dare-cover-slide-active .dare-capsule-dared-label,
          .dare-cover-slide-entered .dare-capsule-dared-label {
            animation: dareCapsuleDaredGlow 3.8s ease-in-out infinite;
          }
          .dare-cover-slide-entered .dare-cover-lattice {
            opacity: 1;
            transform: scale(1);
          }
          .dare-cover-slide-entered .dare-cover-metal {
            opacity: 0.86;
            animation: none;
          }
          .dare-cover-slide-entered .dare-cover-ribbon {
            opacity: 0.68;
            transform: translateY(-50%) rotate(12deg) scale(1);
            animation: none;
          }
          .dare-cover-slide-entered .dare-cover-avatar-stack {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0) drop-shadow(0 18px 34px rgba(0,0,0,0.5));
          }
          .dare-cover-slide-entered .dare-cover-avatar {
            animation: none;
            transform: translateY(0) scale(1);
          }
          .dare-cover-slide-entered .dare-cover-avatar::before {
            animation: dareCoverAvatarRing 3.15s ease-out 0.45s infinite;
          }
          .dare-cover-slide-entered .dare-cover-avatar::after {
            animation: dareCoverAvatarHalo 5.6s linear infinite;
          }
          .dare-cover-slide-entered .dare-cover-avatar-right::before {
            animation-delay: 1.08s;
          }
          .dare-cover-slide-entered .dare-cover-avatar-right::after {
            animation-delay: -2.2s;
          }
          .dare-cover-slide-entered .dare-cover-capsule {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          .dare-cover-slide-entered .dare-cover-full-thumbnail {
            opacity: 1;
            transform: scale(1);
          }
          .dare-cover-slide-entered .dare-cover-pic-frame {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          .dare-cover-slide-entered .dare-cover-challenge::before {
            animation: dareCoverChallengeSweepLoop 9s cubic-bezier(0.22,1,0.36,1) 1.4s infinite;
            transform: translateX(-120%);
          }
          .dare-cover-slide-entered .dare-cover-kicker,
          .dare-cover-slide-entered .dare-cover-copy {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
          @keyframes dareCoverLatticeIn {
            from { opacity: 0; transform: scale(1.04); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes dareCoverSheen {
            0%, 100% { opacity: 0.68; transform: translateX(-1.5%); }
            50% { opacity: 0.95; transform: translateX(1.5%); }
          }
          @keyframes dareCoverMetalIn {
            from { opacity: 0; }
            to { opacity: 0.86; }
          }
          @keyframes dareCoverRibbonIn {
            from { opacity: 0; transform: translateY(calc(-50% + 28px)) rotate(12deg) scale(0.98); }
            to { opacity: 0.68; transform: translateY(-50%) rotate(12deg) scale(1); }
          }
          @keyframes dareCoverRibbonDrift {
            0%, 100% { transform: translateY(-50%) rotate(12deg); }
            50% { transform: translateY(calc(-50% + 10px)) rotate(12deg); }
          }
          @keyframes dareCoverAvatarStackIn {
            from { opacity: 0; transform: translateY(22px) scale(0.88); filter: blur(8px) drop-shadow(0 18px 34px rgba(0,0,0,0.5)); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) drop-shadow(0 18px 34px rgba(0,0,0,0.5)); }
          }
          @keyframes dareCoverAvatarBreathe {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-3px) scale(1.015); }
          }
          @keyframes dareCoverAvatarRing {
            0% { opacity: 0.95; transform: scale(0.84); filter: blur(0); }
            52% { opacity: 0.28; transform: scale(1.2); filter: blur(0.4px); }
            78% { opacity: 0; transform: scale(1.36); filter: blur(1px); }
            100% { opacity: 0; transform: scale(1.36); filter: blur(1px); }
          }
          @keyframes dareCoverAvatarHalo {
            0% { transform: rotate(0deg) scale(1); opacity: 0.72; }
            50% { transform: rotate(180deg) scale(1.04); opacity: 0.95; }
            100% { transform: rotate(360deg) scale(1); opacity: 0.72; }
          }
          @keyframes dareCoverCapsuleSettle {
            from { opacity: 0; transform: translateY(14px) scale(0.96); filter: blur(5px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes dareCoverFullThumbnailIn {
            from { opacity: 0; transform: scale(1.035); filter: blur(8px); }
            to { opacity: 1; transform: scale(1); filter: blur(0); }
          }
          @keyframes dareCoverPicFrameIn {
            from { opacity: 0; transform: translateY(18px) scale(0.98); filter: blur(8px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes dareCoverChallengeIn {
            from { opacity: 0; transform: translateY(26px) scale(0.965); filter: blur(8px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes dareCoverChallengeSweep {
            from { transform: translateX(-120%); }
            to { transform: translateX(120%); }
          }
          @keyframes dareCoverChallengeSweepLoop {
            0% { transform: translateX(-120%); }
            28% { transform: translateX(120%); }
            100% { transform: translateX(120%); }
          }
          @keyframes dareCapsuleDaredGlow {
            0%, 100% {
              text-shadow: 0 2px 8px rgba(0,0,0,0.86), 0 0 12px rgba(74,222,128,0.58), 0 0 24px rgba(74,222,128,0.22);
              filter: brightness(1);
            }
            45% {
              text-shadow: 0 2px 8px rgba(0,0,0,0.86), 0 0 22px rgba(74,222,128,0.82), 0 0 38px rgba(74,222,128,0.32);
              filter: brightness(1.16);
            }
          }
          @keyframes dareCoverKickerIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes dareCoverCopyIn {
            from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
            to { opacity: 1; transform: translateY(0); filter: blur(0); }
          }
          @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
          .dare-real-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
          .dare-real-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
          .dare-fake-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
          .dare-fake-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
          @keyframes btnPulseReal { 0%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 15%{box-shadow:0 0 22px 6px rgba(74,222,128,0.4);opacity:1} 35%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} }
          @keyframes btnPulseFake { 0%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 55%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 70%{box-shadow:0 0 22px 6px rgba(255,255,255,0.18);opacity:1} 88%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} }
        `}</style>
      </div>
    );
  }

  // â”€â”€ Non-reel card (feed view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      className="overflow-hidden bg-[#1a1a1a] rounded-2xl border border-gray-800"
      style={{
        padding: "0",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ height: "32px" }} />
      <div
        style={{
          padding: "0 14px 12px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
            borderRadius: "999px",
            padding: "10px 24px 10px 10px",
            backdropFilter: "blur(12px)",
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <PostAvatar
            src={dare.challenger.avatar}
            name={dare.challenger.nickname}
            size={52}
            style={{ border: "2px solid rgba(255,255,255,0.2)" }}
          />
          <span
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {dare.challenger.nickname.split(" ")[0]}
          </span>
          <span
            style={{
              color: "#4ade80",
              fontWeight: 800,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {dare.receiver.nickname.split(" ")[0]}
          </span>
        </div>
      </div>
      <div className="px-4 pb-2">
        <p
          className="text-white text-2xl font-bold text-center"
          style={{ marginTop: "8px" }}
        >
          {dare.description}
        </p>
      </div>
      {dare.proof && (
        <div
          className="bg-[#1a1a1a] rounded-2xl border border-gray-800 mx-4 mb-4 overflow-hidden"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
        >
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              cursor: "pointer",
              position: "relative",
            }}
            onClick={handleMediaTap}
          >
            {dare.proof.type === "image" ? (
              <img
                src={dare.proof.url}
                alt="Dare proof"
                style={{
                  width: "100%",
                  height: "32rem",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{ position: "relative", width: "100%", height: "32rem" }}
              >
                <img
                  src={dare.proof.thumbnail || dare.proof.url}
                  alt="Video thumbnail"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      background: "rgba(255,255,255,0.18)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backdropFilter: "blur(6px)",
                      border: "1.5px solid rgba(255,255,255,0.25)",
                    }}
                  >
                    <Play size={30} color="#fff" fill="#fff" />
                  </div>
                </div>
              </div>
            )}
            <div
              style={{
                position: "absolute",
                bottom: "14px",
                left: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {[
                {
                  icon: <Eye size={14} color="rgba(255,255,255,0.85)" />,
                  val: realViewCount,
                },
                {
                  icon: <Heart size={14} color="rgba(255,255,255,0.85)" />,
                  val: dare.votes ? dare.votes.real + 4 : 24,
                },
                {
                  icon: (
                    <MessageCircle size={14} color="rgba(255,255,255,0.85)" />
                  ),
                  val: realCommentCount,
                },
              ].map((item, i) => (
                <div
                  key={`vote-option-${i}`}
                  onClick={() => {
                    if (i === 2) onOpenComments?.(dare);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(8px)",
                    borderRadius: "999px",
                    padding: "6px 12px",
                    cursor: i === 2 ? "pointer" : "default",
                  }}
                >
                  {item.icon}
                  <span
                    style={{
                      color: "rgba(255,255,255,0.9)",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {item.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="p-4 pt-4">
        {hasVoted ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => onVoteClick(dare)}
              style={{
                width: "80%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background:
                  vote === "real" ? "#4ade80" : "rgba(255,255,255,0.08)",
                color: vote === "real" ? "#000" : "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {vote === "real"
                ? "You think this is Real"
                : "You think this is Fake"}
            </button>
          </div>
        ) : phase === "idle" ? (
          <div
            style={{
              display: "flex",
              gap: "12px",
              opacity: exiting ? 0 : 1,
              transform: exiting
                ? "scale(0.93) translateY(5px)"
                : "scale(1) translateY(0)",
              transition: "opacity 0.22s ease, transform 0.22s ease",
            }}
          >
            <button
              className="dare-real-btn"
              onClick={() => handleVote("real")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background: "#4ade80",
                color: "#000",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Real
            </button>
            <button
              className="dare-fake-btn"
              onClick={() => handleVote("fake")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Fake
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleConfirm}
              style={{
                width: "80%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background:
                  vote === "real" ? "#4ade80" : "rgba(255,255,255,0.08)",
                color: vote === "real" ? "#000" : "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                textAlign: "center",
                animation:
                  "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}
            >
              {vote === "real"
                ? "You think this is Real"
                : "You think this is Fake"}
            </button>
          </div>
        )}
        <style>{`
          @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
          @keyframes daredPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        `}</style>
      </div>
    </div>
  );
}

// â”€â”€â”€ SwipeableTruthCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type TruthCardBackgroundTheme = {
  activeShadow: string;
  answerBubble: string;
  legacyAnswer: string;
  legacyQuestion: string;
  legacyShell: string;
  questionBubble: string;
  shell: string;
  texture: string;
  topGlow: string;
  wash: string;
};

const TRUTH_CARD_BACKGROUND_THEMES: TruthCardBackgroundTheme[] = [
  {
    shell:
      "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 74%, rgba(74,222,128,0.09), transparent 28%), radial-gradient(circle at 88% 70%, rgba(56,189,248,0.12), transparent 32%), linear-gradient(180deg, #08110c 0%, #050b08 48%, #020403 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.11) 0 1px, transparent 1px 22px), linear-gradient(245deg, rgba(56,189,248,0.055) 0 1px, transparent 1px 28px), radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.08), transparent 42%)",
    wash: "conic-gradient(from 210deg at 50% 52%, rgba(74,222,128,0.11), rgba(255,255,255,0.04), rgba(56,189,248,0.095), rgba(20,83,45,0.09), rgba(74,222,128,0.11)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.76), transparent 50%)",
    topGlow:
      "linear-gradient(90deg, transparent, rgba(74,222,128,0.88), rgba(56,189,248,0.55), transparent)",
    questionBubble:
      "linear-gradient(180deg, rgba(22,32,25,0.92), rgba(8,13,10,0.86)), radial-gradient(circle at 0% 0%, rgba(74,222,128,0.11), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.13), rgba(8,16,11,0.78)), radial-gradient(circle at 100% 0%, rgba(56,189,248,0.13), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(9,19,13,0.98) 0%, rgba(6,14,10,0.99) 52%, rgba(3,6,4,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(23,34,27,0.78), rgba(10,17,12,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(74,222,128,0.09), rgba(8,16,11,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.3), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(56,189,248,0.055) inset, 0 0 84px rgba(74,222,128,0.06) inset",
  },
  {
    shell:
      "radial-gradient(circle at 50% -12%, rgba(56,189,248,0.15), transparent 32%), radial-gradient(circle at 18% 76%, rgba(74,222,128,0.075), transparent 30%), radial-gradient(circle at 88% 66%, rgba(20,184,166,0.12), transparent 32%), linear-gradient(180deg, #071117 0%, #041014 50%, #020506 100%)",
    texture:
      "linear-gradient(115deg, rgba(56,189,248,0.09) 0 1px, transparent 1px 24px), linear-gradient(245deg, rgba(74,222,128,0.055) 0 1px, transparent 1px 30px), radial-gradient(ellipse at 50% 28%, rgba(255,255,255,0.075), transparent 42%)",
    wash: "conic-gradient(from 220deg at 52% 50%, rgba(56,189,248,0.105), rgba(255,255,255,0.035), rgba(74,222,128,0.08), rgba(14,116,144,0.095), rgba(56,189,248,0.105)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    topGlow:
      "linear-gradient(90deg, transparent, rgba(56,189,248,0.76), rgba(74,222,128,0.5), transparent)",
    questionBubble:
      "linear-gradient(180deg, rgba(18,31,36,0.92), rgba(6,13,15,0.86)), radial-gradient(circle at 0% 0%, rgba(56,189,248,0.105), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(56,189,248,0.105), rgba(6,15,16,0.78)), radial-gradient(circle at 100% 0%, rgba(74,222,128,0.115), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(8,18,23,0.98) 0%, rgba(5,14,17,0.99) 52%, rgba(2,5,6,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(20,33,38,0.78), rgba(8,16,18,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(56,189,248,0.075), rgba(7,16,17,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(56,189,248,0.26), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(74,222,128,0.05) inset, 0 0 84px rgba(56,189,248,0.055) inset",
  },
  {
    shell:
      "radial-gradient(ellipse at 50% 16%, rgba(255,255,255,0.075), transparent 30%), radial-gradient(circle at 50% -8%, rgba(74,222,128,0.13), transparent 36%), radial-gradient(circle at 86% 74%, rgba(56,189,248,0.095), transparent 30%), linear-gradient(180deg, #09100c 0%, #050705 54%, #020302 100%)",
    texture:
      "linear-gradient(115deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 26px), linear-gradient(245deg, rgba(74,222,128,0.06) 0 1px, transparent 1px 32px), radial-gradient(ellipse at 50% 24%, rgba(74,222,128,0.08), transparent 38%)",
    wash: "conic-gradient(from 190deg at 50% 44%, rgba(255,255,255,0.055), rgba(74,222,128,0.105), rgba(56,189,248,0.06), rgba(255,255,255,0.04), rgba(74,222,128,0.105)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    topGlow:
      "linear-gradient(90deg, transparent, rgba(255,255,255,0.58), rgba(74,222,128,0.72), transparent)",
    questionBubble:
      "linear-gradient(180deg, rgba(25,32,27,0.92), rgba(9,12,10,0.86)), radial-gradient(circle at 50% -10%, rgba(255,255,255,0.09), transparent 52%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.12), rgba(9,15,11,0.78)), radial-gradient(circle at 100% 0%, rgba(255,255,255,0.085), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(10,17,13,0.98) 0%, rgba(7,10,8,0.99) 56%, rgba(2,3,2,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(27,33,28,0.78), rgba(11,14,11,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(74,222,128,0.085), rgba(9,15,11,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(255,255,255,0.14), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(74,222,128,0.055) inset, 0 0 84px rgba(255,255,255,0.035) inset",
  },
  {
    shell:
      "radial-gradient(circle at 48% -12%, rgba(74,222,128,0.13), transparent 34%), radial-gradient(circle at 14% 70%, rgba(244,114,182,0.075), transparent 28%), radial-gradient(circle at 88% 68%, rgba(56,189,248,0.09), transparent 32%), linear-gradient(180deg, #11090f 0%, #08070b 50%, #030204 100%)",
    texture:
      "linear-gradient(115deg, rgba(244,114,182,0.055) 0 1px, transparent 1px 24px), linear-gradient(245deg, rgba(74,222,128,0.065) 0 1px, transparent 1px 30px), radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.07), transparent 42%)",
    wash: "conic-gradient(from 215deg at 50% 52%, rgba(244,114,182,0.07), rgba(255,255,255,0.035), rgba(74,222,128,0.095), rgba(56,189,248,0.07), rgba(244,114,182,0.07)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    topGlow:
      "linear-gradient(90deg, transparent, rgba(244,114,182,0.44), rgba(74,222,128,0.78), transparent)",
    questionBubble:
      "linear-gradient(180deg, rgba(31,22,29,0.92), rgba(12,8,11,0.86)), radial-gradient(circle at 0% 0%, rgba(244,114,182,0.075), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.115), rgba(13,9,11,0.78)), radial-gradient(circle at 100% 0%, rgba(244,114,182,0.075), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(18,10,15,0.98) 0%, rgba(9,8,11,0.99) 52%, rgba(3,2,4,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(32,24,31,0.78), rgba(13,10,13,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(74,222,128,0.08), rgba(13,9,11,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.24), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(244,114,182,0.045) inset, 0 0 84px rgba(74,222,128,0.055) inset",
  },
  {
    shell:
      "radial-gradient(circle at 24% 16%, rgba(74,222,128,0.105), transparent 30%), radial-gradient(circle at 76% 20%, rgba(56,189,248,0.105), transparent 31%), radial-gradient(circle at 50% 84%, rgba(255,255,255,0.055), transparent 28%), linear-gradient(180deg, #07100d 0%, #050809 50%, #020303 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.075) 0 1px, transparent 1px 26px), linear-gradient(245deg, rgba(56,189,248,0.065) 0 1px, transparent 1px 32px), radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.07), transparent 42%)",
    wash: "conic-gradient(from 230deg at 50% 52%, rgba(74,222,128,0.075), rgba(56,189,248,0.085), rgba(255,255,255,0.035), rgba(20,83,45,0.075), rgba(74,222,128,0.075)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    topGlow:
      "linear-gradient(90deg, transparent, rgba(74,222,128,0.66), rgba(56,189,248,0.6), transparent)",
    questionBubble:
      "linear-gradient(180deg, rgba(20,31,28,0.92), rgba(7,11,11,0.86)), radial-gradient(circle at 0% 0%, rgba(74,222,128,0.09), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(56,189,248,0.085), rgba(7,14,13,0.78)), radial-gradient(circle at 100% 0%, rgba(74,222,128,0.105), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(7,17,14,0.98) 0%, rgba(5,10,11,0.99) 52%, rgba(2,3,3,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(20,32,29,0.78), rgba(8,14,14,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(56,189,248,0.065), rgba(7,14,13,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.24), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(56,189,248,0.055) inset, 0 0 84px rgba(74,222,128,0.05) inset",
  },
];

function getTruthCardBackgroundTheme(postId: string): TruthCardBackgroundTheme {
  let hash = 0;
  for (let i = 0; i < postId.length; i += 1) {
    hash = (hash * 31 + postId.charCodeAt(i)) | 0;
  }
  return TRUTH_CARD_BACKGROUND_THEMES[
    Math.abs(hash) % TRUTH_CARD_BACKGROUND_THEMES.length
  ];
}

function TruthConversationScreen({
  post,
  onClose,
  onNavigateToProfile,
}: {
  post: TruthPost;
  onClose: () => void;
  onNavigateToProfile?: (userId: string) => void;
}) {
  useBodyScrollLock(true);
  const theme = getTruthCardBackgroundTheme(post.id);
  const answerText = post.answer?.trim() || "No reply has been posted yet.";
  const isLongQuestion = post.question.length > 120;
  const isLongAnswer = answerText.length > 220;

  return (
    <div className="fixed inset-0 z-[12000] bg-[#030403] text-white">
      <style>{`
        @keyframes truthConversationIn {
          from { opacity: 0; transform: translateY(18px) scale(0.985); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes truthConversationBubbleIn {
          from { opacity: 0; transform: translateY(18px) scale(0.975); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes truthConversationGlow {
          0%, 100% { opacity: 0.34; transform: translate3d(-4%, -3%, 0) scale(1); }
          50% { opacity: 0.62; transform: translate3d(4%, 3%, 0) scale(1.06); }
        }
        .truth-conversation-screen {
          animation: truthConversationIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .truth-conversation-bubble {
          animation: truthConversationBubbleIn 0.52s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>

      <div
        className="truth-conversation-screen flex h-full flex-col overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 22%, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg,#07100d,#030403 62%,#010201)",
        }}
      >
        <div className="relative shrink-0 px-4 pb-3 pt-[calc(var(--safe-area-top)+10px)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.68),rgba(56,189,248,0.34),transparent)]" />
          <div className="relative flex min-h-[78px] items-center gap-3 overflow-hidden rounded-[26px] border border-white/8 bg-[radial-gradient(circle_at_18%_-28%,rgba(74,222,128,0.13),transparent_38%),radial-gradient(circle_at_92%_8%,rgba(56,189,248,0.08),transparent_34%),linear-gradient(180deg,rgba(6,8,6,0.96)_0%,rgba(10,15,10,0.94)_52%,rgba(3,4,3,0.98)_100%)] px-3.5 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-[1px] rounded-[25px] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_48%,rgba(0,0,0,0.16))]" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="app-pressable relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_12px_28px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl"
            >
              <ArrowLeft size={19} />
            </button>
            <div className="relative z-[1] min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      post.challengerId &&
                      onNavigateToProfile?.(post.challengerId)
                    }
                    className="rounded-full"
                    aria-label={`Open ${post.challenger.nickname}'s profile`}
                  >
                    <Avatar
                      src={post.challenger.avatar}
                      alt={post.challenger.nickname}
                      size={38}
                      fallbackText={post.challenger.nickname.charAt(0)}
                      style={{
                        border: "2px solid rgba(3,4,3,0.96)",
                        boxShadow:
                          "0 0 0 1px rgba(74,222,128,0.28), 0 10px 24px rgba(0,0,0,0.34)",
                      }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      post.receiverId && onNavigateToProfile?.(post.receiverId)
                    }
                    className="rounded-full"
                    aria-label={`Open ${post.receiver.nickname}'s profile`}
                  >
                    <Avatar
                      src={post.receiver.avatar}
                      alt={post.receiver.nickname}
                      size={38}
                      fallbackText={post.receiver.nickname.charAt(0)}
                      style={{
                        border: "2px solid rgba(3,4,3,0.96)",
                        boxShadow:
                          "0 0 0 1px rgba(56,189,248,0.24), 0 10px 24px rgba(0,0,0,0.34)",
                      }}
                    />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-black leading-tight text-white">
                    {post.receiver.nickname} answered
                  </h2>
                  <p className="mt-0.5 truncate text-[12px] font-bold text-[#94a3b8]">
                    Question from {post.challenger.nickname}
                  </p>
                </div>
              </div>
            </div>
            <div className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac] shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
              <Sparkles size={16} />
            </div>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+22px)] pt-5"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div className="mx-auto flex max-w-[520px] flex-col gap-5">
            <div className="truth-conversation-bubble flex flex-col items-start gap-1.5">
              <div className="flex max-w-[86%] items-center gap-2.5 pl-1">
                <button
                  type="button"
                  onClick={() =>
                    post.challengerId &&
                    onNavigateToProfile?.(post.challengerId)
                  }
                  className="shrink-0 rounded-full"
                >
                  <Avatar
                    src={post.challenger.avatar}
                    alt={post.challenger.nickname}
                    size={38}
                    fallbackText={post.challenger.nickname.charAt(0)}
                    style={{
                      border: "2px solid rgba(74,222,128,0.42)",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.34)",
                    }}
                  />
                </button>
                <span className="min-w-0 truncate text-sm font-black text-white/86">
                  {post.challenger.nickname}
                </span>
              </div>
              <div
                className="relative max-w-[92%] overflow-hidden rounded-[28px] rounded-tl-[10px] border border-white/10 p-4 shadow-[0_20px_54px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)]"
                style={{ background: theme.questionBubble }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-35%] blur-xl"
                  style={{
                    background:
                      "radial-gradient(circle at 22% 12%, rgba(255,255,255,0.16), transparent 34%), radial-gradient(circle at 80% 76%, rgba(74,222,128,0.14), transparent 36%)",
                    animation: "truthConversationGlow 7s ease-in-out infinite",
                  }}
                />
                <div className="relative z-[1]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/54">
                      Question
                    </span>
                  </div>
                  <p
                    className={`m-0 font-black text-white ${
                      isLongQuestion ? "text-[18px]" : "text-[20px]"
                    }`}
                    style={{
                      lineHeight: isLongQuestion ? 1.42 : 1.28,
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {post.question}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="truth-conversation-bubble flex flex-col items-end gap-1.5"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="flex max-w-[86%] items-center justify-end gap-2.5 pr-1">
                <span className="min-w-0 truncate text-right text-sm font-black text-white/86">
                  {post.receiver.nickname}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    post.receiverId && onNavigateToProfile?.(post.receiverId)
                  }
                  className="shrink-0 rounded-full"
                >
                  <Avatar
                    src={post.receiver.avatar}
                    alt={post.receiver.nickname}
                    size={34}
                    fallbackText={post.receiver.nickname.charAt(0)}
                    style={{
                      border: "2px solid rgba(74,222,128,0.44)",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.34)",
                    }}
                  />
                </button>
              </div>
              <div
                className="relative max-w-[92%] overflow-hidden rounded-[28px] rounded-tr-[10px] border border-[#4ade80]/24 p-4 shadow-[0_20px_54px_rgba(0,0,0,0.34),0_0_42px_rgba(74,222,128,0.08),inset_0_1px_0_rgba(255,255,255,0.09)]"
                style={{ background: theme.answerBubble }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-35%] blur-xl"
                  style={{
                    background:
                      "radial-gradient(circle at 78% 16%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 14% 80%, rgba(56,189,248,0.12), transparent 34%)",
                    animation:
                      "truthConversationGlow 7.4s ease-in-out 0.3s infinite",
                  }}
                />
                <div className="relative z-[1]">
                  <p
                    className={`m-0 font-bold text-white/92 ${
                      isLongAnswer ? "text-[16px]" : "text-[17px]"
                    }`}
                    style={{
                      lineHeight: isLongAnswer ? 1.7 : 1.55,
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {answerText}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SwipeableTruthCardProps {
  post: TruthPost;
  onVoteClick: (post: TruthPost, choice: "truth" | "lie") => void;
  onOpenVoteModal: (post: TruthPost, tab: "truth" | "lie" | "comments") => void;
  onOpenConversation?: (post: TruthPost) => void;
  cardIndex: number;
  currentIndex: number;
  isDragging?: boolean;
  isCurrentCard?: boolean;
  lockInternalScroll?: boolean;
  onNavigateToProfile?: (userId: string) => void;
}

export const SwipeableTruthCard = React.memo(function SwipeableTruthCard({
  post,
  onVoteClick,
  onOpenVoteModal,
  onOpenConversation,
  cardIndex,
  currentIndex,
  isDragging = false,
  isCurrentCard,
  lockInternalScroll = false,
  onNavigateToProfile,
}: SwipeableTruthCardProps) {
  const { getUserVote, setUserVote } = useTruthInteractionStore();

  // Initialise from persistent storage â€” if previously voted, jump straight to voted state
  const priorVote = getUserVote(post.id);
  const [vote, setVote] = useState<"truth" | "lie" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const [exiting, setExiting] = useState(false);
  const lastConversationTapRef = useRef(0);
  const conversationTapStartRef = useRef<{ x: number; y: number } | null>(null);
  const isActive = isCurrentCard ?? cardIndex === currentIndex;
  const reduceMotionDuringDrag = isDragging && isActive;
  const truthBackground = getTruthCardBackgroundTheme(post.id);

  const handleVote = (choice: "truth" | "lie") => {
    if (phase !== "idle" || exiting) return;
    setExiting(true);
    setTimeout(() => {
      setVote(choice);
      setExiting(false);
      setPhase("confirming");
    }, 260);
  };

  const handleConfirm = () => {
    if (vote) {
      setUserVote(post.id, vote);
      onVoteClick(post, vote);
    }
    setPhase("voted");
  };
  const handleOpenVotedStateModal = () => {
    if (vote) onOpenVoteModal(post, vote);
  };

  const handleConversationPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isActive || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    conversationTapStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handleConversationPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isActive || !onOpenConversation) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button,a,input,textarea,select")) {
      lastConversationTapRef.current = 0;
      conversationTapStartRef.current = null;
      return;
    }

    const start = conversationTapStartRef.current;
    conversationTapStartRef.current = null;
    if (!start) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 12) {
      lastConversationTapRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastConversationTapRef.current <= 320) {
      lastConversationTapRef.current = 0;
      onOpenConversation(post);
      return;
    }

    lastConversationTapRef.current = now;
  };

  const offset = cardIndex - currentIndex;
  const translateY = offset === 0 ? "0%" : offset < 0 ? "-105%" : "105%";
  const isNearby = Math.abs(offset) <= 1;
  const opacity = isNearby ? 1 : 0;

  return (
    <div
      data-truth-card-active={isActive ? "true" : undefined}
      onPointerDown={handleConversationPointerDown}
      onPointerUp={handleConversationPointerUp}
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate3d(0, calc(${translateY} + var(--truth-drag-y, 0px)), 0)`,
        opacity,
        transition: isDragging
          ? "none"
          : "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease-out",
        pointerEvents: isActive ? "auto" : "none",
        willChange: isNearby ? "transform" : "auto",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        perspective: 1000,
        contain: "layout paint style",
        isolation: "isolate",
        zIndex: isActive ? 2 : offset > 0 ? 1 : 0,
        padding: "calc(var(--safe-area-top) + 18px) 8px 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes truthGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.06); }
        }
        @keyframes borderSpin {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes expandBtn { from { width:58%;opacity:0.72;transform:translate3d(0,5px,0) scale(0.97);} to {width:80%;opacity:1;transform:translate3d(0,0,0) scale(1);} }
        .truth-vote-btn,
        .lie-vote-btn {
          transition:
            transform 180ms cubic-bezier(0.22,1,0.36,1),
            box-shadow 240ms ease,
            opacity 180ms ease;
          will-change: transform, box-shadow, opacity;
        }
        .truth-vote-btn:active,
        .lie-vote-btn:active {
          transform: translate3d(0,1px,0) scale(0.965);
          transition-duration: 80ms;
        }
        @keyframes btnPulseTruth {
          0%,100%{box-shadow:0 8px 22px rgba(74,222,128,0.22);opacity:0.88}
          16%{box-shadow:0 10px 30px rgba(74,222,128,0.38);opacity:1}
          34%{box-shadow:0 8px 24px rgba(74,222,128,0.28);opacity:0.94}
          52%{box-shadow:0 8px 22px rgba(74,222,128,0.22);opacity:0.88}
        }
        @keyframes btnPulseLie {
          0%,52%,100%{box-shadow:0 8px 22px rgba(255,80,80,0.06);opacity:0.82}
          72%{box-shadow:0 10px 28px rgba(255,100,100,0.2);opacity:1}
          88%{box-shadow:0 8px 24px rgba(255,80,80,0.1);opacity:0.9}
        }
        @keyframes questionReveal {
          from { opacity:0; transform: translate3d(0,10px,0) scale(0.985); }
          to   { opacity:1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes answerReveal {
          from { opacity:0; transform: translate3d(0,12px,0) scale(0.985); }
          to   { opacity:1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes truthBubbleAura {
          0%, 100% { opacity: 0.18; transform: translate3d(-6%, -4%, 0) scale(1); }
          50% { opacity: 0.34; transform: translate3d(4%, 3%, 0) scale(1.06); }
        }
        .truth-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Card shell */}
      <div
        style={{
          flex: 1,
          position: "relative",
          borderRadius: "32px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: truthBackground.shell,
          boxShadow: reduceMotionDuringDrag
            ? "0 12px 34px rgba(0,0,0,0.72)"
            : isActive
              ? truthBackground.activeShadow
              : "0 8px 32px rgba(0,0,0,0.7)",
          transition: reduceMotionDuringDrag ? "none" : "box-shadow 0.35s ease",
          transform: "translateZ(0)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: truthBackground.texture,
            backgroundSize: "100% 100%, 100% 100%, 100% 100%",
            opacity: reduceMotionDuringDrag ? 0.2 : 0.56,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: truthBackground.wash,
            opacity: reduceMotionDuringDrag ? 0.16 : 0.44,
            mixBlendMode: reduceMotionDuringDrag ? "normal" : "screen",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.2))",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -120px 160px rgba(0,0,0,0.58), inset 0 120px 160px rgba(74,222,128,0.04)",
            pointerEvents: "none",
          }}
        />
        {/* Ambient top glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "70%",
            height: "2px",
            background: truthBackground.topGlow,
            opacity: isActive ? 0.82 : 0.22,
            transition: "opacity 0.5s ease",
            borderRadius: "99px",
            zIndex: 10,
          }}
        />

        {/* Scrollable content */}
        <div
          className="truth-scroll"
          data-truth-scroll="true"
          style={{
            flex: 1,
            overflowY: lockInternalScroll ? "hidden" : "auto",
            padding: "28px 22px 12px",
            WebkitOverflowScrolling: lockInternalScroll ? undefined : "touch",
            overscrollBehavior: lockInternalScroll ? "none" : "contain",
            touchAction: "pan-y",
            position: "relative",
            zIndex: 1,
            pointerEvents: lockInternalScroll ? "none" : undefined,
          }}
        >
          {/* "TRUTH OR LIE" label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              marginBottom: "22px",
            }}
          >
            <div
              style={{
                height: "1px",
                flex: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(74,222,128,0.24))",
              }}
            />
            <span
              style={{
                color: "#a7f3d0",
                fontWeight: 900,
                fontSize: "11px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.75,
                textShadow: "0 0 18px rgba(74,222,128,0.18)",
              }}
            >
              Truth or Lie
            </span>
            <div
              style={{
                height: "1px",
                flex: 1,
                background:
                  "linear-gradient(90deg, rgba(56,189,248,0.2), transparent)",
              }}
            />
          </div>

          {/* Avatars + names */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0px",
              marginBottom: "26px",
            }}
          >
            {/* Challenger */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  padding: "3px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #16a34a)",
                  boxShadow: "0 0 16px rgba(74,222,128,0.3)",
                }}
              >
                <PostAvatar
                  src={post.challenger.avatar}
                  name={post.challenger.nickname}
                  size={52}
                  style={{ display: "block", border: "2px solid #111" }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToProfile && post.challengerId) {
                    onNavigateToProfile(post.challengerId);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: onNavigateToProfile ? "pointer" : "default",
                  textDecoration: "none",
                }}
              >
                {post.challenger.nickname.split(" ")[0]}
              </button>
            </div>

            {/* Center "asked" badge */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "0 16px",
                zIndex: 1,
              }}
            >
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(74,222,128,0.18), rgba(56,189,248,0.1))",
                  border: "1px solid rgba(74,222,128,0.28)",
                  borderRadius: "99px",
                  padding: "5px 14px",
                  boxShadow:
                    "0 10px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <span
                  style={{
                    color: "#4ade80",
                    fontWeight: 800,
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    animation: isDragging
                      ? "none"
                      : "truthGlow 3s ease-in-out infinite",
                    display: "inline-block",
                  }}
                >
                  asked
                </span>
              </div>
              <span
                style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}
              >
                to say the truth
              </span>
            </div>

            {/* Receiver */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  padding: "3px",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))",
                }}
              >
                <PostAvatar
                  src={post.receiver.avatar}
                  name={post.receiver.nickname}
                  size={52}
                  style={{ display: "block", border: "2px solid #111" }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToProfile && post.receiverId) {
                    onNavigateToProfile(post.receiverId);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: onNavigateToProfile ? "pointer" : "default",
                  textDecoration: "none",
                }}
              >
                {post.receiver.nickname.split(" ")[0]}
              </button>
            </div>
          </div>

          {/* Question block */}
          <div
            style={{
              position: "relative",
              borderRadius: "26px 26px 26px 12px",
              padding: "15px 16px 18px",
              marginBottom: "14px",
              marginRight: "28px",
              background: truthBackground.questionBubble,
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow:
                "0 16px 38px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -28px 60px rgba(74,222,128,0.035)",
              overflow: "hidden",
              isolation: "isolate",
              animation:
                isActive && !isDragging
                  ? "questionReveal 0.6s ease 0.1s both"
                  : "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "-40% -25%",
                zIndex: 0,
                background:
                  "radial-gradient(circle at 24% 20%, rgba(255,255,255,0.14), transparent 34%), radial-gradient(circle at 70% 72%, rgba(74,222,128,0.1), transparent 34%)",
                filter: "blur(10px)",
                opacity: isActive && !isDragging ? 0.24 : 0.12,
                animation:
                  isActive && !isDragging
                    ? "truthBubbleAura 7s ease-in-out 0.8s infinite"
                    : "none",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  color: "#86efac",
                  fontSize: "10px",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Question
              </span>
              <span
                style={{
                  minWidth: 0,
                  color: "rgba(255,255,255,0.32)",
                  fontSize: "11px",
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {post.challenger.nickname.split(" ")[0]}
              </span>
            </div>
            <p
              style={{
                position: "relative",
                zIndex: 1,
                color: "#fff",
                fontWeight: 800,
                fontSize: post.question.length > 120 ? "18px" : "21px",
                lineHeight: post.question.length > 120 ? 1.42 : 1.34,
                textAlign: "left",
                margin: 0,
                letterSpacing: "-0.01em",
                overflowWrap: "anywhere",
                display: "-webkit-box",
                WebkitLineClamp: post.question.length > 160 ? 4 : 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {post.question}
            </p>
          </div>

          {/* Poll or answer */}
          {post.poll ? (
            <div style={{ marginBottom: "8px" }}>
              {post.poll.options.map((option, index) => {
                const votes = post.poll!.votes[option] || 0;
                const percentage = Math.round(
                  (votes / post.poll!.totalVotes) * 100,
                );
                const isLeading =
                  percentage ===
                  Math.max(
                    ...post.poll!.options.map((o) =>
                      Math.round(
                        ((post.poll!.votes[o] || 0) / post.poll!.totalVotes) *
                          100,
                      ),
                    ),
                  );
                return (
                  <div
                    key={`${post.id}-option-${index}`}
                    style={{ marginBottom: "12px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "7px",
                      }}
                    >
                      <span
                        style={{
                          color: isLeading ? "#fff" : "rgba(255,255,255,0.6)",
                          fontSize: "14px",
                          fontWeight: isLeading ? 700 : 500,
                        }}
                      >
                        {option}
                      </span>
                      <span
                        style={{
                          color: isLeading
                            ? "#4ade80"
                            : "rgba(255,255,255,0.4)",
                          fontSize: "14px",
                          fontWeight: 800,
                        }}
                      >
                        {percentage}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "99px",
                        background: "rgba(255,255,255,0.07)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${percentage}%`,
                          background: isLeading
                            ? "linear-gradient(90deg, #4ade80, #22c55e)"
                            : "rgba(255,255,255,0.2)",
                          borderRadius: "99px",
                          transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: "12px",
                  textAlign: "center",
                  margin: "8px 0 0",
                }}
              >
                {post.poll.totalVotes.toLocaleString()} votes
              </p>
            </div>
          ) : post.answer ? (
            <div
              style={{
                borderRadius: "26px 26px 12px 26px",
                padding: "15px",
                marginBottom: "8px",
                marginLeft: "28px",
                background: truthBackground.answerBubble,
                border: "1px solid rgba(74,222,128,0.2)",
                boxShadow:
                  "0 14px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
                overflow: "hidden",
                isolation: "isolate",
                animation:
                  isActive && !isDragging
                    ? "answerReveal 0.62s ease 0.22s both"
                    : "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: "-42% -24%",
                  zIndex: 0,
                  background:
                    "radial-gradient(circle at 76% 20%, rgba(255,255,255,0.12), transparent 34%), radial-gradient(circle at 18% 74%, rgba(56,189,248,0.09), transparent 34%)",
                  filter: "blur(10px)",
                  opacity: isActive && !isDragging ? 0.22 : 0.1,
                  animation:
                    isActive && !isDragging
                      ? "truthBubbleAura 7.6s ease-in-out 1.1s infinite"
                      : "none",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "#4ade80",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "#bbf7d0",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.11em",
                    textTransform: "uppercase",
                  }}
                >
                  Reply from {post.receiver.nickname.split(" ")[0]}
                </span>
                <span
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "11px",
                    marginLeft: "auto",
                  }}
                >
                  {formatTimestamp(post.createdAt)}
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <PostAvatar
                  src={post.receiver.avatar}
                  name={post.receiver.nickname}
                  size={36}
                  style={{ flexShrink: 0 }}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.9)",
                    fontSize: post.answer.length > 220 ? "14px" : "15px",
                    lineHeight: post.answer.length > 220 ? 1.62 : 1.55,
                    margin: 0,
                    flex: 1,
                    overflowWrap: "anywhere",
                    display: "-webkit-box",
                    WebkitLineClamp: post.answer.length > 260 ? 6 : 7,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {post.answer}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Bottom vote area */}
        <div
          style={{
            padding: "14px 20px 22px",
            background:
              "linear-gradient(180deg, rgba(2,4,3,0.58), rgba(2,4,3,0.94))",
            backdropFilter: reduceMotionDuringDrag ? "none" : "blur(12px)",
            WebkitBackdropFilter: reduceMotionDuringDrag
              ? "none"
              : "blur(12px)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Micro-hint */}
          {phase === "idle" && (
            <p
              style={{
                color: "rgba(255,255,255,0.25)",
                fontSize: "11px",
                textAlign: "center",
                margin: "0 0 12px",
                letterSpacing: "0.04em",
              }}
            >
              What do you think?
            </p>
          )}

          {phase === "idle" ? (
            <div
              style={{
                display: "flex",
                gap: "10px",
                opacity: exiting ? 0 : 1,
                transform: exiting
                  ? "scale(0.93) translateY(5px)"
                  : "scale(1) translateY(0)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
              }}
            >
              <button
                className="truth-vote-btn"
                onClick={() => handleVote("truth")}
                style={{
                  flex: 1,
                  padding: "17px",
                  borderRadius: "18px",
                  border: "1px solid rgba(74,222,128,0.25)",
                  background: "rgba(74,222,128,0.08)",
                  color: "rgba(74,222,128,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  animation: isDragging
                    ? "none"
                    : "btnPulseTruth 6s ease-in-out infinite",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                }}
              >
                <span style={{ fontSize: "18px" }}>T</span> Truth
              </button>
              <button
                className="lie-vote-btn"
                onClick={() => handleVote("lie")}
                style={{
                  flex: 1,
                  padding: "17px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,80,80,0.25)",
                  background: "rgba(255,80,80,0.08)",
                  color: "rgba(255,160,160,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  animation: isDragging
                    ? "none"
                    : "btnPulseLie 6s ease-in-out infinite",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                }}
              >
                <span style={{ fontSize: "18px" }}>L</span> Lie
              </button>
            </div>
          ) : phase === "confirming" ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleConfirm}
                style={{
                  width: "80%",
                  padding: "17px",
                  borderRadius: "18px",
                  border:
                    vote === "lie" ? "1px solid rgba(255,80,80,0.3)" : "none",
                  background:
                    vote === "truth" ? "#4ade80" : "rgba(255,80,80,0.12)",
                  color: vote === "truth" ? "#000" : "rgba(255,160,160,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  textAlign: "center",
                  animation:
                    "expandBtn 0.34s cubic-bezier(0.22,1,0.36,1) forwards",
                  boxShadow:
                    vote === "truth"
                      ? "0 10px 24px rgba(74,222,128,0.28)"
                      : "none",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  transition:
                    "transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease, opacity 160ms ease",
                }}
              >
                {vote === "truth"
                  ? "You think this is truth"
                  : "You think this is a lie"}
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "17px",
                borderRadius: "18px",
                background:
                  vote === "truth"
                    ? "rgba(74,222,128,0.1)"
                    : "rgba(255,80,80,0.08)",
                border:
                  vote === "truth"
                    ? "1px solid rgba(74,222,128,0.3)"
                    : "1px solid rgba(255,80,80,0.2)",
              }}
            >
              <button
                onClick={handleOpenVotedStateModal}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color:
                    vote === "truth" ? "#4ade80" : "rgba(255,160,160,0.85)",
                  fontWeight: 800,
                  fontSize: "16px",
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                }}
              >
                {vote === "truth"
                  ? "You think this is truth"
                  : "You think this is a lie"}
              </button>
              <span
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: "12px",
                  marginLeft: "auto",
                }}
              >
                tap to see results
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// â”€â”€â”€ TruthCard (feed view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface TruthCardProps {
  post: TruthPost;
  onVoteClick: (post: TruthPost, choice: "truth" | "lie") => void;
}
export function TruthCard({ post, onVoteClick }: TruthCardProps) {
  const { getUserVote, setUserVote } = useTruthInteractionStore();

  // Initialise from persistent storage â€” if previously voted, jump straight to voted state
  const priorVote = getUserVote(post.id);
  const [vote, setVote] = useState<"truth" | "lie" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );

  const handleVote = (choice: "truth" | "lie") => {
    if (phase !== "idle") return;
    setVote(choice);
    setPhase("confirming");
  };

  const handleConfirm = () => {
    if (vote) {
      setUserVote(post.id, vote);
      onVoteClick(post, vote);
    }
    setPhase("voted");
  };
  const truthBackground = getTruthCardBackgroundTheme(post.id);

  return (
    <div
      className="rounded-2xl p-4 mb-4 border card transition-all duration-300 w-full overflow-hidden"
      style={{
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        background: truthBackground.legacyShell,
        borderColor: "rgba(255,255,255,0.08)",
        boxShadow:
          "0 18px 44px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.055)",
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "14px",
          flexWrap: "nowrap",
          overflow: "hidden",
        }}
      >
        <PostAvatar
          src={post.challenger.avatar}
          name={post.challenger.nickname}
          size={52}
        />
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "18px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {post.challenger.nickname.split(" ")[0]}
        </span>
        <span
          style={{
            color: "#4ade80",
            fontWeight: 700,
            fontSize: "18px",
            whiteSpace: "nowrap",
            flexShrink: 0,
            animation: "truthFade 3s ease-in-out infinite",
          }}
        >
          asked
        </span>
        <PostAvatar
          src={post.receiver.avatar}
          name={post.receiver.nickname}
          size={52}
        />
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "18px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {post.receiver.nickname.split(" ")[0]}
        </span>
      </div>
      <p className="text-white text-lg">
        to say <span className="text-white font-bold text-lg">the</span>{" "}
        <span
          className="text-[#4ade80] font-bold text-lg"
          style={{ animation: "truthFade 3s ease-in-out infinite" }}
        >
          TRUTH
        </span>{" "}
        about
      </p>
      <div
        className="rounded-xl p-5 mt-2 mb-4"
        style={{
          background: truthBackground.legacyQuestion,
          border: "1px solid rgba(255,255,255,0.075)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)",
        }}
      >
        <p
          className="text-white font-semibold text-lg leading-snug"
          style={{
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitLineClamp: post.question.length > 160 ? 4 : 5,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.question}
        </p>
      </div>
      {post.poll ? (
        <div className="mb-4 mt-4 space-y-3">
          {post.poll.options.map((option, index) => {
            const votes = post.poll!.votes[option] || 0;
            const percentage = Math.round(
              (votes / post.poll!.totalVotes) * 100,
            );
            return (
              <div key={`${post.id}-option-${index}`} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-white text-base font-medium">
                    {option}
                  </span>
                  <span className="text-gray-400 text-base font-semibold">
                    {percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-linear-to-r from-[#4ade80] to-[#22c55e] h-3 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : post.answer ? (
        <div
          className="mb-4 mt-4 rounded-xl p-4"
          style={{
            background: truthBackground.legacyAnswer,
            border: "1px solid rgba(74,222,128,0.16)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)",
          }}
        >
          <div className="flex items-start space-x-4">
            <PostAvatar
              src={post.receiver.avatar}
              name={post.receiver.nickname}
              size={48}
              className="w-12 h-12 rounded-full object-cover shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-white font-semibold text-base truncate">
                  {post.receiver.nickname}
                </span>
                <span className="text-gray-400 text-sm shrink-0">
                  {formatTimestamp(post.createdAt)}
                </span>
              </div>
              <p
                className="text-white text-base leading-relaxed"
                style={{
                  overflowWrap: "anywhere",
                  display: "-webkit-box",
                  WebkitLineClamp: post.answer.length > 260 ? 6 : 7,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {post.answer}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col pt-3 border-t border-gray-800 gap-3">
        {post.answer && (
          <div className="flex items-center space-x-5">
            <button className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
              <Heart size={19} />
              <span className="text-sm">312</span>
            </button>
            <button className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
              <MessageCircle size={19} />
              <span className="text-sm">47</span>
            </button>
          </div>
        )}
        {phase === "idle" ? (
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => handleVote("truth")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background: "#4ade80",
                color: "#000",
                fontWeight: 800,
                fontSize: "16px",
                cursor: "pointer",
                animation: "btnPulseTruth 6s ease-in-out infinite",
              }}
            >
              Truth
            </button>
            <button
              onClick={() => handleVote("lie")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "16px",
                cursor: "pointer",
                animation: "btnPulseLie 6s ease-in-out infinite",
              }}
            >
              Lie
            </button>
          </div>
        ) : phase === "confirming" ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleConfirm}
              style={{
                width: "80%",
                padding: "14px",
                borderRadius: "14px",
                border:
                  vote === "lie" ? "1px solid rgba(255,255,255,0.15)" : "none",
                background:
                  vote === "truth" ? "#4ade80" : "rgba(255,255,255,0.08)",
                color: vote === "truth" ? "#000" : "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "16px",
                cursor: "pointer",
                textAlign: "center",
                animation:
                  "expandBtn 0.34s cubic-bezier(0.22,1,0.36,1) forwards",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                transition:
                  "transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease, opacity 160ms ease",
              }}
            >
              {vote === "truth"
                ? "You think this is truth"
                : "You think this is a lie"}
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "14px",
              borderRadius: "14px",
              background:
                vote === "truth"
                  ? "rgba(74,222,128,0.15)"
                  : "rgba(255,255,255,0.08)",
              border:
                vote === "truth"
                  ? "1px solid rgba(74,222,128,0.3)"
                  : "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span
              style={{
                color: vote === "truth" ? "#4ade80" : "rgba(255,255,255,0.6)",
                fontWeight: 700,
                fontSize: "15px",
              }}
            >
              {vote === "truth"
                ? "You think this is truth"
                : "You think this is a lie"}
            </span>
          </div>
        )}
        <style>{`
          @keyframes expandBtn { from { width: 58%; opacity: 0.72; transform: translate3d(0,5px,0) scale(0.97); } to { width: 80%; opacity: 1; transform: translate3d(0,0,0) scale(1); } }
          @keyframes truthFade { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes btnPulseTruth { 0%,100%{box-shadow:0 8px 22px rgba(74,222,128,0.22);opacity:0.88} 16%{box-shadow:0 10px 30px rgba(74,222,128,0.38);opacity:1} 34%{box-shadow:0 8px 24px rgba(74,222,128,0.28);opacity:0.94} 52%{box-shadow:0 8px 22px rgba(74,222,128,0.22);opacity:0.88} }
          @keyframes btnPulseLie { 0%,52%,100%{box-shadow:0 8px 22px rgba(255,80,80,0.06);opacity:0.82} 72%{box-shadow:0 10px 28px rgba(255,100,100,0.2);opacity:1} 88%{box-shadow:0 8px 24px rgba(255,80,80,0.1);opacity:0.9} }
          .card:focus, .card:active { outline: none !important; box-shadow: none !important; }
        `}</style>
      </div>
    </div>
  );
}

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return "Recently";
  if (typeof timestamp === "object" && timestamp !== null) {
    if ("toDate" in timestamp && typeof timestamp.toDate === "function")
      return formatTimeAgo(timestamp.toDate().toISOString());
    if ("seconds" in timestamp && "nanoseconds" in timestamp)
      return formatTimeAgo(new Date(timestamp.seconds * 1000).toISOString());
  }
  if (typeof timestamp === "string") return formatTimeAgo(timestamp);
  return "Recently";
};

// â”€â”€â”€ MainScreen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type MainScreenView = "truth" | "dares";
type DareAudience = "friends" | "community";

export function MainScreen({
  isActive,
  onDaresClick,
  onNavigateToChat,
  onNavigateToProfile: _onNavigateToProfile,
  focusRequest,
  activeView: activeViewProp,
  initialDareAudience = "friends",
  showViewToggle = true,
  resetKey,
}: {
  isActive?: boolean;
  onDaresClick: () => void;
  onNavigateToChat: () => void;
  onNavigateToProfile?: (userId: string) => void;
  activeView?: MainScreenView;
  initialDareAudience?: DareAudience;
  showViewToggle?: boolean;
  resetKey?: number;
  focusRequest?: {
    view: MainScreenView;
    post: TruthPost | DarePost;
    nonce: number;
  } | null;
}) {
  const { user } = useAuthStore();
  const userId = user?.id;
  const {
    truthPosts,
    darePosts,
    loadingTruth,
    loadingDares,
    truthPostsUserId,
    darePostsUserId,
    truthPostsScope,
    darePostsScope,
    loadTruthPosts,
    loadDarePosts,
    voteOnDare,
    voteOnTruth,
  } = useContentStore();
  const alerts = useAlertStore((s) => s.alerts);
  const subscribeToAlerts = useAlertStore((s) => s.subscribeToAlerts);
  const handledRealtimeAlertIds = useRef<Set<string>>(new Set());
  const publishedRealtimeDareIds = useRef<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<MainScreenView>(
    activeViewProp ?? "dares",
  );
  const [selectedDare, setSelectedDare] = useState<DarePost | null>(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [selectedTruth, setSelectedTruth] = useState<TruthPost | null>(null);
  const [selectedTruthConversation, setSelectedTruthConversation] =
    useState<TruthPost | null>(null);
  const [showTruthModal, setShowTruthModal] = useState(false);
  const [truthModalTab, setTruthModalTab] = useState<
    "truth" | "lie" | "comments"
  >("truth");
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    url: string;
    type: "image" | "video";
    thumbnail?: string;
  } | null>(null);
  const [reelCommentsDare, setReelCommentsDare] = useState<DarePost | null>(
    null,
  );
  const [reelShareDare, setReelShareDare] = useState<DarePost | null>(null);
  const picModeEnabled = true;
  const picModeAnimationKey = 0;
  const [dareAudience, setDareAudience] =
    useState<DareAudience>(initialDareAudience);
  const [selectedCommunityChallenge, setSelectedCommunityChallenge] =
    useState<CommunityChallenge | null>(null);
  const [showCommunityChallengeHub, setShowCommunityChallengeHub] =
    useState(false);
  const [communityChallengeSummaries, setCommunityChallengeSummaries] =
    useState<Record<string, CommunityChallengeSummary>>({});
  const [joinedCommunityChallengeIds, setJoinedCommunityChallengeIds] =
    useState<Set<string>>(() => new Set());
  const canSwitchViewsInternally = showViewToggle;

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTruthIndex, setCurrentTruthIndex] = useState(0);
  const activeReelIndexRef = useRef(0);
  const mainTouchStartX = useRef<number | null>(null);
  const mainTouchStartY = useRef<number | null>(null);
  const mainTouchLastX = useRef<number | null>(null);
  const mainTouchLastY = useRef<number | null>(null);

  useEffect(() => {
    if (!activeViewProp) return;
    setActiveView(activeViewProp);
    setIsTransitioning(false);
  }, [activeViewProp]);
  const reelWheelLockRef = useRef(false);
  const reelWheelUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reelScrollFrame = useRef<number | null>(null);
  const dareReelTouchStartX = useRef<number | null>(null);
  const dareReelTouchStartY = useRef<number | null>(null);
  const dareReelTouchStartIndex = useRef(0);
  const visitedDareEntryIds = useRef<Set<string>>(new Set());
  const [animatedDareEntryIds, setAnimatedDareEntryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sessionVoteSnapshot] = useState(() => ({
    truthVotes: votePersistence.getAllTruthVotes(),
    dareVotes: votePersistence.getAllDareVotes(),
  }));
  const minSwipeDistance = 20;

  const displayTruthPosts = React.useMemo(() => {
    const seenIds = new Set<string>();
    const focusedTruth =
      focusRequest?.view === "truth" ? (focusRequest.post as TruthPost) : null;

    const isPublishableTruth = (post: TruthPost) =>
      post.state === "APPROVED" && Boolean(post.answer?.trim());

    return [focusedTruth, ...truthPosts].filter((post): post is TruthPost => {
      if (!post?.id || seenIds.has(post.id) || !isPublishableTruth(post)) {
        return false;
      }

      seenIds.add(post.id);
      return true;
    });
  }, [focusRequest, truthPosts]);

  const displayDarePosts = React.useMemo(() => {
    const seen = new Set<string>();
    const focusedDare =
      focusRequest?.view === "dares" ? (focusRequest.post as DarePost) : null;

    return [focusedDare, ...darePosts].filter((post): post is DarePost => {
      if (!post?.id || seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
  }, [focusRequest, darePosts]);

  const orderedTruthPosts = React.useMemo(
    () => {
      const rankedTruths = rankDeckByVoteState(displayTruthPosts, (postId) =>
        Boolean(sessionVoteSnapshot.truthVotes[postId]),
      );
      const focusedTruthId =
        focusRequest?.view === "truth" ? focusRequest.post.id : null;

      if (!focusedTruthId) return rankedTruths;

      const focusedTruth = rankedTruths.find(
        (truth) => truth.id === focusedTruthId,
      );
      if (!focusedTruth) return rankedTruths;

      return [
        focusedTruth,
        ...rankedTruths.filter((truth) => truth.id !== focusedTruthId),
      ];
    },
    [displayTruthPosts, focusRequest, sessionVoteSnapshot],
  );
  const truthReelContainerRef = useRef<HTMLDivElement>(null);
  const truthScrollFrame = useRef<number | null>(null);
  const currentTruthIndexRef = useRef(0);

  useEffect(() => {
    if (!userId) return;
    const shouldLoadTruths =
      truthPostsUserId !== userId || truthPostsScope !== "feed";
    const shouldLoadDares =
      darePostsUserId !== userId || darePostsScope !== "feed";

    if (shouldLoadTruths) {
      void loadTruthPosts(false, "feed");
    }
    if (shouldLoadDares) {
      void loadDarePosts(false, "feed");
    }
  }, [
    userId,
    truthPostsUserId,
    darePostsUserId,
    truthPostsScope,
    darePostsScope,
    loadTruthPosts,
    loadDarePosts,
  ]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToAlerts(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || alerts.length === 0) return;

    const relevantAlerts = alerts.filter(
      (alert) =>
        alert.userId === userId &&
        (alert.type === "TRUTH_ANSWERED" ||
          alert.type === "TRUTH_COMPLETED" ||
          alert.type === "DARE_COMPLETED" ||
          alert.type === "DARE_APPROVED" ||
          alert.type === "TRUTH_RECEIVED" ||
          alert.type === "DARE_RECEIVED") &&
        !handledRealtimeAlertIds.current.has(alert.id),
    );

    if (relevantAlerts.length === 0) return;

    relevantAlerts.forEach((alert) =>
      handledRealtimeAlertIds.current.add(alert.id),
    );
    void Promise.all([
      loadTruthPosts(true, "feed"),
      loadDarePosts(true, "feed"),
    ]);
  }, [alerts, loadDarePosts, loadTruthPosts, userId]);

  useEffect(() => {
    if (!userId) return;

    return dareService.subscribeToUserDares(userId, "all", (dares) => {
      const publishedDareIds = dares
        .filter((dare) => dare.state === "ACCEPTED_REAL")
        .map((dare) => dare.id);

      const hasNewPublishedDare = publishedDareIds.some(
        (dareId) => !publishedRealtimeDareIds.current.has(dareId),
      );

      publishedRealtimeDareIds.current = new Set(publishedDareIds);

      if (hasNewPublishedDare) {
        void loadDarePosts(true, "feed");
      }
    });
  }, [loadDarePosts, userId]);

  useEffect(() => {
    return communityChallengeService.subscribeToSummaries(
      COMMUNITY_CHALLENGES.map((challenge) => challenge.id),
      setCommunityChallengeSummaries,
    );
  }, []);

  useEffect(() => {
    return communityChallengeService.subscribeToJoinedChallengeIds(
      userId,
      setJoinedCommunityChallengeIds,
    );
  }, [userId]);

  const handleVoteClick = React.useCallback((dare: DarePost) => {
    setSelectedDare(dare);
    setShowVoteModal(true);
  }, []);
  const handleCloseVoteModal = React.useCallback(() => {
    setShowVoteModal(false);
    setSelectedDare(null);
  }, []);
  const handleOpenTruthModal = React.useCallback(
    (post: TruthPost, tab: "truth" | "lie" | "comments") => {
      setSelectedTruth(post);
      setTruthModalTab(tab);
      setShowTruthModal(true);
    },
    [],
  );
  const handleDareVote = React.useCallback(
    (dareId: string, vote: "real" | "fake") => {
      voteOnDare(dareId, vote);
      handleCloseVoteModal();
    },
    [voteOnDare, handleCloseVoteModal],
  );
  const handleTruthVoteClick = React.useCallback(
    (post: TruthPost, choice: "truth" | "lie") => {
      if (userId) {
        const { recordVote } = useTruthInteractionStore.getState();
        recordVote(post.id, userId, choice.toUpperCase() as "TRUTH" | "LIE");
      }
      voteOnTruth(post.id, choice);
      handleOpenTruthModal(post, choice);
    },
    [voteOnTruth, userId, handleOpenTruthModal],
  );
  const handleCloseTruthModal = React.useCallback(() => {
    setShowTruthModal(false);
    setSelectedTruth(null);
  }, []);

  const hydratedCommunityChallenges = React.useMemo(
    () =>
      communityChallengeService.hydrateChallenges(
        COMMUNITY_CHALLENGES,
        communityChallengeSummaries,
      ),
    [communityChallengeSummaries],
  );

  const selectedHydratedCommunityChallenge = selectedCommunityChallenge
    ? hydratedCommunityChallenges.find(
        (challenge) => challenge.id === selectedCommunityChallenge.id,
      ) || selectedCommunityChallenge
    : null;

  const handleJoinCommunityChallenge = React.useCallback(
    async (challenge: CommunityChallenge) => {
      if (!user?.id) return;

      setJoinedCommunityChallengeIds((current) => {
        if (current.has(challenge.id)) return current;
        const next = new Set(current);
        next.add(challenge.id);
        return next;
      });

      const result = await communityChallengeService.joinChallenge(challenge, {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatar: user.avatar || "",
      });

      if (!result.success) {
        setJoinedCommunityChallengeIds((current) => {
          const next = new Set(current);
          next.delete(challenge.id);
          return next;
        });
      }
    },
    [user?.avatar, user?.displayName, user?.id, user?.username],
  );
  const handleFullscreenMedia = React.useCallback(
    (media: { url: string; type: "image" | "video"; thumbnail?: string }) => {
      setFullscreenMedia(media);
    },
    [],
  );
  const handleOpenComments = React.useCallback((dare: DarePost) => {
    setReelCommentsDare(dare);
  }, []);
  const handleOpenShare = React.useCallback((dare: DarePost) => {
    setReelShareDare(dare);
  }, []);

  // Lock outer reel scroll when any modal is open
  const anyModalOpen = !!(
    reelCommentsDare ||
    reelShareDare ||
    showVoteModal ||
    showTruthModal ||
    selectedTruthConversation ||
    selectedCommunityChallenge ||
    showCommunityChallengeHub
  );
  const reelContainerRef = useRef<HTMLDivElement>(null);
  const isDareScreenVisible =
    Boolean(isActive) && activeView === "dares" && dareAudience === "friends";
  useEffect(() => {
    const el = reelContainerRef.current;
    if (!el) return;
    el.style.overflowY = anyModalOpen ? "hidden" : "auto";
    el.style.overflowX = "hidden";
    // Also lock body scroll when modal open so overscroll doesn't bleed
    document.body.style.overflow = anyModalOpen ? "hidden" : "";
    return () => {
      el.style.overflowY = "";
      el.style.overflowX = "";
      document.body.style.overflow = "";
    };
  }, [anyModalOpen]);

  const sortedDarePosts = React.useMemo(() => {
    const seen = new Set<string>();

    // Publish gate for MainScreen:
    // show only dares that are explicitly approved as real and include proof media.
    const isPublishableDare = (d: DarePost) =>
      d.state === "ACCEPTED_REAL" && Boolean(d.proof?.url);

    const publishableDares = [...displayDarePosts].filter((d) => {
      if (!d || !d.id || seen.has(d.id)) return false;
      seen.add(d.id);
      return isPublishableDare(d);
    });

    const rankedDares = rankDeckByVoteState(publishableDares, (postId) =>
      Boolean(sessionVoteSnapshot.dareVotes[postId]),
    );
    const focusedDareId =
      focusRequest?.view === "dares" ? focusRequest.post.id : null;

    if (!focusedDareId) return rankedDares;

    const focusedDare = rankedDares.find((dare) => dare.id === focusedDareId);
    if (!focusedDare) return rankedDares;

    return [
      focusedDare,
      ...rankedDares.filter((dare) => dare.id !== focusedDareId),
    ];
  }, [displayDarePosts, focusRequest, sessionVoteSnapshot]);

  const registerDareCardVisit = React.useCallback((dareId: string) => {
    if (visitedDareEntryIds.current.has(dareId)) {
      setAnimatedDareEntryIds((current) => {
        if (current.has(dareId)) return current;
        return current.size > 0 ? new Set() : current;
      });
      return;
    }

    visitedDareEntryIds.current.add(dareId);
    setAnimatedDareEntryIds(new Set([dareId]));
  }, []);

  useEffect(() => {
    if (!isDareScreenVisible) {
      setAnimatedDareEntryIds((current) =>
        current.size > 0 ? new Set() : current,
      );
      return;
    }

    const activeDare = sortedDarePosts[activeReelIndex];
    if (!activeDare?.id) return;
    registerDareCardVisit(activeDare.id);
  }, [
    activeReelIndex,
    isDareScreenVisible,
    registerDareCardVisit,
    sortedDarePosts,
  ]);

  const shouldPlayDareEntryAnimation = React.useCallback(
    (dareId: string, cardIsActive: boolean) => {
      if (!cardIsActive) return false;
      return (
        animatedDareEntryIds.has(dareId) ||
        !visitedDareEntryIds.current.has(dareId)
      );
    },
    [animatedDareEntryIds],
  );

  const hasPlayedDareEntryAnimation = React.useCallback((dareId: string) => {
    return visitedDareEntryIds.current.has(dareId);
  }, []);

  useEffect(() => {
    activeReelIndexRef.current = activeReelIndex;
  }, [activeReelIndex]);

  useEffect(() => {
    currentTruthIndexRef.current = currentTruthIndex;
  }, [currentTruthIndex]);

  useEffect(() => {
    return () => {
      if (reelWheelUnlockTimer.current) {
        clearTimeout(reelWheelUnlockTimer.current);
      }
      if (reelScrollFrame.current !== null) {
        window.cancelAnimationFrame(reelScrollFrame.current);
      }
      if (truthScrollFrame.current !== null) {
        window.cancelAnimationFrame(truthScrollFrame.current);
      }
    };
  }, []);

  const scrollDareReelToIndex = React.useCallback(
    (index: number) => {
      const container = reelContainerRef.current;
      if (!container) return;

      const maxIndex = Math.max(0, sortedDarePosts.length - 1);
      const targetIndex = Math.min(maxIndex, Math.max(0, index));
      const activeDare = sortedDarePosts[targetIndex];
      if (activeDare?.id) registerDareCardVisit(activeDare.id);

      activeReelIndexRef.current = targetIndex;
      setActiveReelIndex(targetIndex);
      container.scrollTo({
        top: container.clientHeight * targetIndex,
        behavior: "auto",
      });
    },
    [registerDareCardVisit, sortedDarePosts],
  );

  const handleDareReelWheel = React.useCallback(
    (e: WheelEvent) => {
      if (!isDareScreenVisible || anyModalOpen) return;

      const verticalDelta = Math.abs(e.deltaY);
      const horizontalDelta = Math.abs(e.deltaX);
      if (verticalDelta < 10 || horizontalDelta > verticalDelta) return;

      e.preventDefault();
      if (reelWheelLockRef.current) return;

      const direction = e.deltaY > 0 ? 1 : -1;
      const currentIndex = activeReelIndexRef.current;
      const nextIndex = Math.min(
        Math.max(0, sortedDarePosts.length - 1),
        Math.max(0, currentIndex + direction),
      );

      if (nextIndex === currentIndex) return;

      reelWheelLockRef.current = true;
      scrollDareReelToIndex(nextIndex);

      if (reelWheelUnlockTimer.current) {
        clearTimeout(reelWheelUnlockTimer.current);
      }
      reelWheelUnlockTimer.current = setTimeout(() => {
        reelWheelLockRef.current = false;
      }, 520);
    },
    [
      anyModalOpen,
      isDareScreenVisible,
      scrollDareReelToIndex,
      sortedDarePosts.length,
    ],
  );

  useEffect(() => {
    const container = reelContainerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleDareReelWheel, {
      passive: false,
    });
    return () => {
      container.removeEventListener("wheel", handleDareReelWheel);
    };
  }, [handleDareReelWheel]);

  const handleDareReelTouchStart = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      dareReelTouchStartX.current = touch.clientX;
      dareReelTouchStartY.current = touch.clientY;
      dareReelTouchStartIndex.current = activeReelIndexRef.current;
    },
    [],
  );

  const handleDareReelTouchEnd = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const startX = dareReelTouchStartX.current;
      const startY = dareReelTouchStartY.current;
      dareReelTouchStartX.current = null;
      dareReelTouchStartY.current = null;

      if (startX === null || startY === null) return;

      const touch = e.changedTouches[0];
      const deltaX = startX - touch.clientX;
      const deltaY = startY - touch.clientY;
      const verticalDistance = Math.abs(deltaY);

      if (verticalDistance < 48 || verticalDistance < Math.abs(deltaX) * 1.15) {
        return;
      }

      const direction = deltaY > 0 ? 1 : -1;
      scrollDareReelToIndex(dareReelTouchStartIndex.current + direction);
    },
    [scrollDareReelToIndex],
  );

  const handleDareReelTouchCancel = React.useCallback(() => {
    dareReelTouchStartX.current = null;
    dareReelTouchStartY.current = null;
  }, []);

  useEffect(() => {
    if (activeView !== "dares") return;
    const container = reelContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (reelScrollFrame.current !== null) return;
      reelScrollFrame.current = window.requestAnimationFrame(() => {
        reelScrollFrame.current = null;
        const slideHeight = container.clientHeight;
        if (!slideHeight) return;
        const maxIndex = Math.max(0, sortedDarePosts.length - 1);
        const idx = Math.min(
          maxIndex,
          Math.max(0, Math.round(container.scrollTop / slideHeight)),
        );
        if (idx === activeReelIndexRef.current) return;

        const activeDare = sortedDarePosts[idx];
        if (activeDare?.id) registerDareCardVisit(activeDare.id);
        activeReelIndexRef.current = idx;
        setActiveReelIndex(idx);
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (reelScrollFrame.current !== null) {
        window.cancelAnimationFrame(reelScrollFrame.current);
        reelScrollFrame.current = null;
      }
    };
  }, [activeView, registerDareCardVisit, sortedDarePosts]);

  useEffect(() => {
    if (activeView !== "truth") return;
    const container = truthReelContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (truthScrollFrame.current !== null) return;
      truthScrollFrame.current = window.requestAnimationFrame(() => {
        truthScrollFrame.current = null;
        const slideHeight = container.clientHeight;
        if (!slideHeight) return;
        const maxIndex = Math.max(0, orderedTruthPosts.length - 1);
        const idx = Math.min(
          maxIndex,
          Math.max(0, Math.round(container.scrollTop / slideHeight)),
        );
        currentTruthIndexRef.current = idx;
        setCurrentTruthIndex((prev) => (prev === idx ? prev : idx));
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (truthScrollFrame.current !== null) {
        window.cancelAnimationFrame(truthScrollFrame.current);
        truthScrollFrame.current = null;
      }
    };
  }, [activeView, orderedTruthPosts.length]);

  useEffect(() => {
    if (!focusRequest || focusRequest.view !== "truth") return;
    if (activeViewProp && activeViewProp !== "truth") return;

    setActiveView("truth");
    const targetIndex = orderedTruthPosts.findIndex(
      (truth) => truth.id === focusRequest.post.id,
    );
    if (targetIndex >= 0) {
      setCurrentTruthIndex(targetIndex);
    }
  }, [activeViewProp, focusRequest, orderedTruthPosts]);

  useEffect(() => {
    if (
      !focusRequest ||
      focusRequest.view !== "truth" ||
      (activeViewProp && activeViewProp !== "truth") ||
      activeView !== "truth"
    ) {
      return;
    }

    const targetIndex = orderedTruthPosts.findIndex(
      (truth) => truth.id === focusRequest.post.id,
    );

    if (targetIndex < 0) return;

    setCurrentTruthIndex(targetIndex);

    const container = truthReelContainerRef.current;
    if (!container) return;
    container.scrollTop = container.clientHeight * targetIndex;
  }, [activeView, activeViewProp, focusRequest, orderedTruthPosts]);

  useEffect(() => {
    if (!focusRequest || focusRequest.view !== "dares") return;
    if (activeViewProp && activeViewProp !== "dares") return;

    setActiveView("dares");
    setDareAudience("friends");
  }, [activeViewProp, focusRequest]);

  useEffect(() => {
    if (
      !focusRequest ||
      focusRequest.view !== "dares" ||
      (activeViewProp && activeViewProp !== "dares") ||
      activeView !== "dares"
    ) {
      return;
    }

    const targetIndex = sortedDarePosts.findIndex(
      (dare) => dare.id === focusRequest.post.id,
    );

    if (targetIndex < 0) return;

    setDareAudience("friends");
    setActiveReelIndex(targetIndex);

    const container = reelContainerRef.current;
    if (!container) return;
    container.scrollTop = container.clientHeight * targetIndex;
  }, [activeView, activeViewProp, focusRequest, sortedDarePosts]);

  useEffect(() => {
    if (activeView === "truth") {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [activeView]);

  useEffect(() => {
    if (!isActive) return;

    window.scrollTo(0, 0);

    if (activeView === "dares") {
      setDareAudience(initialDareAudience);
      setActiveReelIndex(0);
      if (reelContainerRef.current) reelContainerRef.current.scrollTop = 0;
    }
  }, [activeView, initialDareAudience, isActive, resetKey]);

  useLayoutEffect(() => {
    if (activeView !== "truth") return;
    if (focusRequest?.view === "truth") return;

    const container = truthReelContainerRef.current;
    if (!container) return;

    const targetIndex = Math.min(
      Math.max(0, orderedTruthPosts.length - 1),
      Math.max(0, currentTruthIndexRef.current),
    );

    setCurrentTruthIndex((prev) => (prev === targetIndex ? prev : targetIndex));
    container.scrollTop = container.clientHeight * targetIndex;
  }, [activeView, focusRequest, orderedTruthPosts.length]);

  useEffect(() => {
    if (activeView !== "dares") return;

    setActiveReelIndex(0);
    activeReelIndexRef.current = 0;
    if (reelContainerRef.current) {
      reelContainerRef.current.scrollTop = 0;
    }
  }, [activeView, dareAudience]);

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    mainTouchStartX.current = touch.clientX;
    mainTouchStartY.current = touch.clientY;
    mainTouchLastX.current = touch.clientX;
    mainTouchLastY.current = touch.clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    mainTouchLastX.current = touch.clientX;
    mainTouchLastY.current = touch.clientY;
  };
  const onTouchEnd = () => {
    const touchStart = mainTouchStartX.current;
    const touchEnd = mainTouchLastX.current;
    const touchStartY = mainTouchStartY.current;
    const touchEndY = mainTouchLastY.current;
    mainTouchStartX.current = null;
    mainTouchStartY.current = null;
    mainTouchLastX.current = null;
    mainTouchLastY.current = null;

    if (
      touchStart === null ||
      touchEnd === null ||
      touchStartY === null ||
      touchEndY === null ||
      isTransitioning ||
      !canSwitchViewsInternally
    ) {
      return;
    }

    const distanceX = touchStart - touchEnd;
    const distanceY = Math.abs(touchStartY - touchEndY);
    if (Math.abs(distanceX) > minSwipeDistance && distanceX > distanceY * 0.6) {
      setIsTransitioning(true);
      if (distanceX > 0) setActiveView("truth");
      else setActiveView("dares");
      setTimeout(() => setIsTransitioning(false), 300);
    }
  };

  const NavHeader = () => (
    <div
      className="nav-header"
      style={{
        flexShrink: 0,
        paddingTop: "calc(var(--safe-area-top) + 12px)",
        background:
          "radial-gradient(circle at 50% -40%, rgba(74,222,128,0.18), transparent 58%), linear-gradient(180deg, rgba(10,15,11,0.98), rgba(4,7,5,0.94))",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 54px rgba(0,0,0,0.38)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
      <div className="px-4 pb-4">
        {showViewToggle ? (
          <div className="mx-auto grid max-w-sm grid-cols-2 rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(10,14,10,0.98))] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <button
              onClick={() => setActiveView("dares")}
              className={`rounded-full px-4 py-3 text-sm font-black transition-all duration-200 ${
                activeView === "dares"
                  ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_26px_rgba(74,222,128,0.3),inset_0_1px_0_rgba(255,255,255,0.3)]"
                  : "text-[#94a3b8] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              Dares
            </button>
            <button
              onClick={() => setActiveView("truth")}
              className={`rounded-full px-4 py-3 text-sm font-black transition-all duration-200 ${
                activeView === "truth"
                  ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_26px_rgba(74,222,128,0.3),inset_0_1px_0_rgba(255,255,255,0.3)]"
                  : "text-[#94a3b8] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              Truth
            </button>
          </div>
        ) : activeView === "dares" ? (
          <div
            className="mx-auto grid max-w-sm grid-cols-2 rounded-full border border-white/8 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.045)]"
            style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
          >
            {(["friends", "community"] as const).map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setDareAudience(section)}
                className={`rounded-full px-4 py-2.5 text-sm font-black capitalize transition-all duration-200 ${
                  dareAudience === section
                    ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_24px_rgba(74,222,128,0.26),inset_0_1px_0_rgba(255,255,255,0.28)]"
                    : "text-[#94a3b8] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {section}
              </button>
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-sm items-center justify-center rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(10,14,10,0.98))] px-4 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <span className="text-sm font-black uppercase tracking-[0.18em] text-[#d7ffe6]">
              {activeView === "truth" ? "Truth" : "Feed"}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="screen-container"
      style={{
        transition: isTransitioning ? "transform 0.3s ease-out" : "none",
        touchAction: "auto",
      }}
      onTouchStart={
        activeView === "dares" && canSwitchViewsInternally
          ? onTouchStart
          : undefined
      }
      onTouchMove={
        activeView === "dares" && canSwitchViewsInternally
          ? onTouchMove
          : undefined
      }
      onTouchEnd={
        activeView === "dares" && canSwitchViewsInternally
          ? onTouchEnd
          : undefined
      }
    >
      {activeView === "dares" ? (
        <div
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background:
              "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.14), transparent 34%), linear-gradient(180deg, #060806 0%, #030403 100%)",
          }}
        >
          <NavHeader />
          {dareAudience === "friends" ? (
            <div
              ref={reelContainerRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                scrollSnapType: "y mandatory",
                scrollBehavior: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                contain: "layout paint style",
                willChange: "scroll-position",
              }}
            >
              <div
                data-reel-index="0"
                style={{
                  height: "100%",
                  minHeight: "100%",
                  scrollSnapAlign: "start",
                  scrollSnapStop: "always",
                  overflow: "hidden",
                  contain: "layout paint style",
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                }}
              >
                {sortedDarePosts[0] ? (
                  <DareCard
                    dare={sortedDarePosts[0]}
                    reelMode
                    isActive={isDareScreenVisible && activeReelIndex === 0}
                    hasPlayedEntryAnimation={hasPlayedDareEntryAnimation(
                      sortedDarePosts[0].id,
                    )}
                    playEntryAnimation={shouldPlayDareEntryAnimation(
                      sortedDarePosts[0].id,
                      isDareScreenVisible && activeReelIndex === 0,
                    )}
                    onVoteClick={handleVoteClick}
                    onFullscreenMedia={handleFullscreenMedia}
                    onOpenComments={handleOpenComments}
                    onOpenShare={handleOpenShare}
                    onVote={handleDareVote}
                    onNavigateToProfile={_onNavigateToProfile}
                    picModeEnabled={picModeEnabled}
                    picModeAnimationKey={picModeAnimationKey}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    {loadingDares
                      ? "Loading dares..."
                      : "No approved dares yet"}
                  </div>
                )}
              </div>
              {sortedDarePosts
                .slice(1)
                .filter((dare) => dare && dare.id)
                .map((dare, i) => (
                  <div
                    key={dare.id}
                    data-reel-index={String(i + 1)}
                    style={{
                      height: "100%",
                      minHeight: "100%",
                      scrollSnapAlign: "start",
                      scrollSnapStop: "always",
                      overflow: "hidden",
                      contain: "layout paint style",
                      transform: "translateZ(0)",
                      backfaceVisibility: "hidden",
                    }}
                  >
                    <DareCard
                      dare={dare}
                      reelMode
                      isActive={
                        isDareScreenVisible && activeReelIndex === i + 1
                      }
                      hasPlayedEntryAnimation={hasPlayedDareEntryAnimation(
                        dare.id,
                      )}
                      playEntryAnimation={shouldPlayDareEntryAnimation(
                        dare.id,
                        isDareScreenVisible && activeReelIndex === i + 1,
                      )}
                      onVoteClick={handleVoteClick}
                      onFullscreenMedia={handleFullscreenMedia}
                      onOpenComments={handleOpenComments}
                      onOpenShare={handleOpenShare}
                      onVote={handleDareVote}
                      onNavigateToProfile={_onNavigateToProfile}
                      picModeEnabled={picModeEnabled}
                      picModeAnimationKey={picModeAnimationKey}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <CommunityChallengeFeed
              challenges={hydratedCommunityChallenges}
              onPreview={setSelectedCommunityChallenge}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background:
              "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.14), transparent 34%), linear-gradient(180deg, #060806 0%, #030403 100%)",
            paddingBottom: "calc(80px + var(--safe-area-bottom))",
          }}
        >
          <div
            ref={truthReelContainerRef}
            data-active-truth-index={currentTruthIndex}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              scrollSnapType: "y mandatory",
              scrollBehavior: "smooth",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              contain: "layout paint style",
              willChange: "scroll-position",
            }}
          >
            {orderedTruthPosts.length > 0 ? (
              orderedTruthPosts.map((post, index) => (
                <div
                  key={`truth-reel-${post.id}-${index}`}
                  data-truth-reel-index={String(index)}
                  style={{
                    height: "100%",
                    minHeight: "100%",
                    scrollSnapAlign: "start",
                    scrollSnapStop: "always",
                    overflow: "hidden",
                    position: "relative",
                    contain: "layout paint style",
                    transform: "translateZ(0)",
                    backfaceVisibility: "hidden",
                  }}
                >
                  <SwipeableTruthCard
                    post={post}
                    onVoteClick={handleTruthVoteClick}
                    onOpenVoteModal={handleOpenTruthModal}
                    onOpenConversation={setSelectedTruthConversation}
                    cardIndex={0}
                    currentIndex={0}
                    isDragging={false}
                    isCurrentCard={index === currentTruthIndex}
                    lockInternalScroll
                    onNavigateToProfile={_onNavigateToProfile}
                  />
                </div>
              ))
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "12px",
                }}
              >
                <div style={{ fontSize: "36px" }}>?</div>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "15px",
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {loadingTruth
                    ? "Loading truth questions..."
                    : "No approved truths yet"}
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "13px",
                    margin: 0,
                  }}
                >
                  {loadingTruth
                    ? "Dare someone to reveal their truth"
                    : "Approved truth answers will appear here"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen media */}
      {fullscreenMedia && (
        <div
          className="app-modal-backdrop"
          onClick={() => setFullscreenMedia(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.97)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => setFullscreenMedia(null)}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              fontSize: "20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
            }}
          >
            X
          </button>
          {fullscreenMedia.type === "image" ? (
            <img
              src={fullscreenMedia.url}
              alt="Fullscreen"
              style={{
                maxWidth: "100%",
                maxHeight: "100vh",
                objectFit: "contain",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              style={{
                position: "relative",
                width: "100%",
                maxHeight: "100vh",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={fullscreenMedia.thumbnail || fullscreenMedia.url}
                alt="Video fullscreen"
                style={{
                  width: "100%",
                  maxHeight: "100vh",
                  objectFit: "contain",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.2)",
                    backdropFilter: "blur(8px)",
                    border: "2px solid rgba(255,255,255,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Play size={32} color="#fff" fill="#fff" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedCommunityChallenge && (
        <CommunityChallengePreviewScreen
          challenge={selectedHydratedCommunityChallenge || selectedCommunityChallenge}
          isJoined={joinedCommunityChallengeIds.has(
            selectedCommunityChallenge.id,
          )}
          onClose={() => setSelectedCommunityChallenge(null)}
          onJoin={() =>
            handleJoinCommunityChallenge(
              selectedHydratedCommunityChallenge || selectedCommunityChallenge,
            )
          }
          onOpenHub={() => {
            setSelectedCommunityChallenge(null);
            setShowCommunityChallengeHub(true);
          }}
        />
      )}
      {showCommunityChallengeHub && (
        <div className="fixed inset-0 z-[10000] bg-[#030403]">
          <ChallengeHubScreen
            isActive
            onBack={() => setShowCommunityChallengeHub(false)}
          />
        </div>
      )}
      {selectedTruthConversation && (
        <TruthConversationScreen
          post={selectedTruthConversation}
          onClose={() => setSelectedTruthConversation(null)}
          onNavigateToProfile={_onNavigateToProfile}
        />
      )}
      {selectedDare && (
        <DareVoteModal
          isOpen={showVoteModal}
          onClose={handleCloseVoteModal}
          dare={selectedDare}
        />
      )}
      {selectedTruth && (
        <TruthVoteModal
          isOpen={showTruthModal}
          onClose={handleCloseTruthModal}
          post={selectedTruth}
          initialTab={truthModalTab}
        />
      )}
      {reelCommentsDare && (
        <ReelCommentsModal
          isOpen={!!reelCommentsDare}
          onClose={() => setReelCommentsDare(null)}
          dare={reelCommentsDare}
        />
      )}
      {reelShareDare && (
        <ReelShareModal
          isOpen={!!reelShareDare}
          onClose={() => setReelShareDare(null)}
          dare={reelShareDare}
        />
      )}
    </div>
  );
}
