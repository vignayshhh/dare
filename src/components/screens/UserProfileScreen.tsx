"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  UserPlus,
  Check,
  Users,
  MessageCircle,
  X,
  Grid3X3,
  Play,
  MessageSquare,
  Eye,
  Heart,
  Star,
  Activity,
  ChevronRight,
} from "lucide-react";
import { useUserProfileStore } from "../../stores/useUserProfileStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { usePostsStore } from "../../stores/usePostsStore";
import { useTruthStore } from "../../stores/useTruthStore";
import { useDareStore } from "../../stores/useDareStore";
import { useTruthInteractionStore } from "../../stores/useTruthInteractionStore";
import { useDareInteractionStore } from "../../stores/useDareInteractionStore";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import { formatTimeAgo } from "../../utils/timeFormat";
import { formatJoinDate } from "../../utils/profileDateFormat";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { PostsScreen } from "./PostsScreen";
import { TruthsListScreen } from "./TruthsListScreen";
import { DaresListScreen } from "./DaresListScreen";
import {
  truthService,
  dareService,
  userService,
  closeFriendsService,
} from "../../middleware/services/service-factory";
import { resolveUserProfile } from "../../utils/profileResolver";
import type {
  TruthPost as FeedTruthPost,
  DarePost as FeedDarePost,
} from "../../middleware/adapters/data-adapters";

interface UserProfileScreenProps {
  onBack: () => void;
  userId: string;
  onMessage?: (targetUserId: string, targetUsername: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToActivity?: (userId: string) => void;
  onNavigateToTruthPost?: (truth: FeedTruthPost) => void;
  onNavigateToDarePost?: (dare: FeedDarePost) => void;
  initialPostId?: string;
}

interface PublishedTruthCard extends FeedTruthPost {}

interface PublishedDareCard extends FeedDarePost {}

interface ProfileCommentPreview {
  id: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
}

async function fetchContentProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  return resolveUserProfile(userId);
}

function extractProfileName(profile: any, fallback: string) {
  return (
    profile?.displayName ||
    profile?.username ||
    profile?.nickname ||
    profile?.display_name ||
    fallback
  );
}

function extractProfileAvatar(profile: any) {
  return profile?.avatarUrl || profile?.avatar_url || "/default-avatar.png";
}

function formatProfileTime(timestamp: any): string {
  if (!timestamp) return "Recently";
  let formatted = "Recently";
  if (typeof timestamp === "object" && timestamp !== null) {
    if ("toDate" in timestamp && typeof timestamp.toDate === "function") {
      formatted = formatTimeAgo(timestamp.toDate().toISOString());
    } else if ("seconds" in timestamp && "nanoseconds" in timestamp) {
      formatted = formatTimeAgo(
        new Date(timestamp.seconds * 1000).toISOString(),
      );
    }
  } else if (typeof timestamp === "string") {
    formatted = formatTimeAgo(timestamp);
  }
  return formatted === "just now" ? "Recently" : formatted;
}

function PostAvatar({
  src,
  name,
  size,
  style,
  className,
}: {
  src?: string;
  name?: string;
  size: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setError(false);
  }, [src]);

  if (!src || error) {
    const fallbackStyles = {
      backgroundColor: "#4ade80",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#000",
      fontSize: Math.max(Math.round(size * 0.38), 12),
      fontWeight: 700,
      ...style,
    };

    if (className) {
      return (
        <div className={className} style={fallbackStyles}>
          {name?.charAt(0)?.toUpperCase() || "?"}
        </div>
      );
    }

    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          ...fallbackStyles,
        }}
      >
        {name?.charAt(0)?.toUpperCase() || "?"}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || ""}
      onError={() => setError(true)}
      className={className}
      style={
        className
          ? style
          : {
              width: size,
              height: size,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              ...style,
            }
      }
    />
  );
}

function ProfilePostAvatar({
  src,
  name,
  size = 52,
}: {
  src?: string;
  name: string;
  size?: number;
}) {
  return <PostAvatar src={src} name={name} size={size} />;
}

function TruthReplicaCard({
  truth,
  comments,
  commentCount,
  voteCount,
  onVoteClick,
  onOpenVoteModal,
}: {
  truth: PublishedTruthCard;
  comments: ProfileCommentPreview[];
  commentCount: number;
  voteCount: number;
  onVoteClick?: (truth: PublishedTruthCard, vote: "truth" | "lie") => void;
  onOpenVoteModal?: (
    truth: PublishedTruthCard,
    tab: "truth" | "lie" | "comments",
  ) => void;
}) {
  const { getUserVote, setUserVote } = useTruthInteractionStore();
  const priorVote = getUserVote(truth.id);
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
    if (!vote) return;
    setUserVote(truth.id, vote);
    onVoteClick?.(truth, vote);
    setPhase("voted");
  };

  return (
    <div
      className="bg-[#1a1a1a] rounded-2xl p-4 mb-4 border border-gray-800 card transition-all duration-300 w-full overflow-hidden"
      style={{
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
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
          src={truth.challenger.avatar}
          name={truth.challenger.nickname}
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
          {truth.challenger.nickname.split(" ")[0]}
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
          src={truth.receiver.avatar}
          name={truth.receiver.nickname}
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
          {truth.receiver.nickname.split(" ")[0]}
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
      <div className="bg-[#2a2a2a] rounded-xl p-5 mt-2 mb-4">
        <p className="text-white font-semibold text-lg leading-snug">
          {truth.question}
        </p>
      </div>

      {truth.answer && (
        <div className="mb-4 mt-4">
          <div className="flex items-start space-x-4">
            <PostAvatar
              src={truth.receiver.avatar}
              name={truth.receiver.nickname}
              size={48}
              className="w-12 h-12 rounded-full object-cover shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-white font-semibold text-base truncate">
                  {truth.receiver.nickname}
                </span>
                <span className="text-gray-400 text-sm shrink-0">
                  {formatProfileTime(truth.createdAt)}
                </span>
              </div>
              <p className="text-white text-base leading-relaxed">
                {truth.answer}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col pt-3 border-t border-gray-800 gap-3">
        {truth.answer && (
          <div className="flex items-center space-x-5">
            <button
              type="button"
              onClick={() => onOpenVoteModal?.(truth, "truth")}
              className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <Heart size={19} />
              <span className="text-sm">{voteCount}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenVoteModal?.(truth, "comments")}
              className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <MessageCircle size={19} />
              <span className="text-sm">{commentCount}</span>
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
                  "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}
            >
              {vote === "truth"
                ? "You think this is the Truth ✓"
                : "You think this is a Lie ✓"}
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
            <button
              type="button"
              onClick={() => onOpenVoteModal?.(truth, vote || "truth")}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                color: vote === "truth" ? "#4ade80" : "rgba(255,255,255,0.6)",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              You voted: {vote === "truth" ? "Truth ✓" : "Lie ✓"}
            </button>
          </div>
        )}
        {comments.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-[#202020] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Comments
            </div>
            <div className="space-y-3">
              {comments.slice(0, 2).map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <ProfilePostAvatar
                    src={comment.avatarUrl}
                    name={comment.displayName}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {comment.displayName}
                      </span>
                      <span className="shrink-0 text-xs text-[#64748b]">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-[#d1d5db]">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <style>{`
          @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
          @keyframes truthFade { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes btnPulseTruth { 0%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 15%{box-shadow:0 0 22px 6px rgba(74,222,128,0.4);opacity:1} 35%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} }
          @keyframes btnPulseLie { 0%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 55%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 70%{box-shadow:0 0 22px 6px rgba(255,255,255,0.18);opacity:1} 88%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} }
          .card:focus, .card:active { outline: none !important; box-shadow: none !important; }
        `}</style>
      </div>
    </div>
  );
}

function DareReplicaCard({
  dare,
  viewCount,
  voteCount,
  commentCount,
  comments,
  onVoteClick,
  onOpenComments,
}: {
  dare: PublishedDareCard;
  viewCount: number;
  voteCount: number;
  commentCount: number;
  comments: ProfileCommentPreview[];
  onVoteClick?: (dare: PublishedDareCard) => void;
  onOpenComments?: (dare: PublishedDareCard) => void;
}) {
  const { getUserVote, setUserVote } = useDareInteractionStore();
  const priorVote = getUserVote(dare.id);
  const [vote, setVote] = useState<"real" | "fake" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const challengerName = dare.challenger.nickname;
  const receiverName = dare.receiver.nickname;
  const challengerAvatar = dare.challenger.avatar;
  const proofUrl = dare.proof?.url;
  const proofType = dare.proof?.type;
  const proofThumb = dare.proof?.thumbnail || proofUrl;
  const isVideo = String(proofType || "").toLowerCase() === "video";
  const hasVoted = phase === "voted" && vote !== null;

  const handleVote = (choice: "real" | "fake") => {
    if (phase !== "idle") return;
    setVote(choice);
    setPhase("confirming");
  };

  const handleConfirm = () => {
    if (!vote) return;
    setUserVote(dare.id, vote);
    setPhase("voted");
    onVoteClick?.(dare);
  };

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
          <ProfilePostAvatar
            src={challengerAvatar}
            name={challengerName}
            size={52}
          />
          <span
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {challengerName.split(" ")[0]}
          </span>
          <span
            style={{
              color: "#4ade80",
              fontWeight: 800,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {receiverName.split(" ")[0]}
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
      {proofUrl && (
        <div
          className="bg-[#1a1a1a] rounded-2xl border border-gray-800 mx-4 mb-4 overflow-hidden"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
        >
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {isVideo ? (
              <div
                style={{ position: "relative", width: "100%", height: "32rem" }}
              >
                <img
                  src={proofThumb}
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
            ) : (
              <img
                src={proofUrl}
                alt="Dare proof"
                style={{
                  width: "100%",
                  height: "32rem",
                  objectFit: "cover",
                  display: "block",
                }}
              />
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
                  val: viewCount,
                },
                {
                  icon: <Heart size={14} color="rgba(255,255,255,0.85)" />,
                  val: voteCount,
                },
                {
                  icon: (
                    <MessageCircle size={14} color="rgba(255,255,255,0.85)" />
                  ),
                  val: commentCount,
                },
              ].map((item, i) => (
                <div
                  key={`profile-dare-chip-${dare.id}-${i}`}
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
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => onVoteClick?.(dare)}
            style={{
              width: "80%",
              padding: "14px",
              borderRadius: "14px",
              border: "none",
              background: "#4ade80",
              color: "#000",
              fontWeight: 800,
              fontSize: "17px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            Completed • Real
          </button>
        </div>
        {comments.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-[#202020] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Comments
            </div>
            <div className="space-y-3">
              {comments.slice(0, 2).map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <ProfilePostAvatar
                    src={comment.avatarUrl}
                    name={comment.displayName}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {comment.displayName}
                      </span>
                      <span className="shrink-0 text-xs text-[#64748b]">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-[#d1d5db]">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UserProfileScreen({
  onBack,
  userId,
  onMessage,
  onNavigateToProfile,
  onNavigateToActivity,
  onNavigateToTruthPost,
  onNavigateToDarePost,
  initialPostId,
}: UserProfileScreenProps) {
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "truths" | "dares">(
    "posts",
  );
  const [showPostsScreen, setShowPostsScreen] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [showTruthsListScreen, setShowTruthsListScreen] = useState(false);
  const [showDaresListScreen, setShowDaresListScreen] = useState(false);
  const [initialTruthId, setInitialTruthId] = useState<string | undefined>(
    undefined,
  );
  const [initialDareId, setInitialDareId] = useState<string | undefined>(
    undefined,
  );
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [isCloseFriend, setIsCloseFriend] = useState(false);
  const [closeFriendBusy, setCloseFriendBusy] = useState(false);
  const [showUnfriendModal, setShowUnfriendModal] = useState(false);
  const [isUnfriending, setIsUnfriending] = useState(false);
  const [publishedTruths, setPublishedTruths] = useState<PublishedTruthCard[]>(
    [],
  );
  const [publishedDares, setPublishedDares] = useState<PublishedDareCard[]>([]);
  const [loadingPublishedTruths, setLoadingPublishedTruths] = useState(false);
  const [loadingPublishedDares, setLoadingPublishedDares] = useState(false);
  const stripAtSymbol = (username?: string) =>
    (username || "unknown").replace(/^@/, "");

  const {
    profile,
    isFriend,
    friendshipStatus,
    friendsCount,
    loading,
    error,
    loadProfile,
    sendFriendRequest,
    cancelFriendRequest,
    unfriendUser,
    checkFriendshipStatus,
  } = useUserProfileStore();

  const { user: currentUser } = useAuthStore();

  const {
    posts: storePosts,
    userPosts,
    loadUserPosts,
    loadingUserPosts,
    subscribeToUserPosts,
    unsubscribeFromUserPosts,
  } = usePostsStore();
  const { sentDares, receivedDares, loadUserDares } = useDareStore();
  const { sentTruths, receivedTruths, loadUserTruths } = useTruthStore();
  const truthCommentsMap = useTruthInteractionStore((s) => s.comments);
  const truthVoteDataMap = useTruthInteractionStore((s) => s.voteData);
  const subscribeToTruthComments = useTruthInteractionStore(
    (s) => s.subscribeToComments,
  );
  const unsubscribeFromTruthComments = useTruthInteractionStore(
    (s) => s.unsubscribeFromComments,
  );
  const subscribeToTruthVotes = useTruthInteractionStore(
    (s) => s.subscribeToVotes,
  );
  const unsubscribeFromTruthVotes = useTruthInteractionStore(
    (s) => s.unsubscribeFromVotes,
  );
  const dareCommentsMap = useDareInteractionStore((s) => s.comments);
  const dareCommentCounts = useDareInteractionStore((s) => s.commentCounts);
  const dareViewCounts = useDareInteractionStore((s) => s.viewCounts);
  const dareVoteDataMap = useDareInteractionStore((s) => s.voteData);
  const subscribeToDareComments = useDareInteractionStore(
    (s) => s.subscribeToComments,
  );
  const unsubscribeFromDareComments = useDareInteractionStore(
    (s) => s.unsubscribeFromComments,
  );
  const subscribeToDareCommentCount = useDareInteractionStore(
    (s) => s.subscribeToCommentCount,
  );
  const subscribeToDareViewCount = useDareInteractionStore(
    (s) => s.subscribeToViewCount,
  );
  const unsubscribeFromDareCommentCount = useDareInteractionStore(
    (s) => s.unsubscribeFromCommentCount,
  );
  const unsubscribeFromDareViewCount = useDareInteractionStore(
    (s) => s.unsubscribeFromViewCount,
  );
  const subscribeToDareVotes = useDareInteractionStore(
    (s) => s.subscribeToVotes,
  );
  const unsubscribeFromDareVotes = useDareInteractionStore(
    (s) => s.unsubscribeFromVotes,
  );

  // Load profile and user content on component mount
  useEffect(() => {
    if (userId) {
      loadProfile(userId);
      loadUserPosts(userId);
      loadUserDares(userId, "all");
      loadUserTruths(userId, "all");

      return () => {
        if (currentUser?.id && currentUser.id !== userId) {
          loadUserPosts(currentUser.id);
        }
      };
    }
  }, [
    userId,
    currentUser?.id,
    loadProfile,
    loadUserPosts,
    loadUserDares,
    loadUserTruths,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadPublishedCards = async () => {
      if (!userId) return;

      setLoadingPublishedTruths(true);
      setLoadingPublishedDares(true);

      try {
        const [truthResponse, dareResponse] = await Promise.all([
          truthService.getUserTruths(userId, "all"),
          dareService.getDaresForUser(userId),
        ]);

        const truthEntities =
          (truthResponse.success ? truthResponse.truths : []) || [];
        const dareEntities =
          (dareResponse.success ? dareResponse.dares : []) || [];

        const builtTruths = await Promise.all(
          truthEntities
            .filter(
              (truth: any) =>
                ["ANSWERED", "APPROVED", "REJECTED"].includes(truth.state) &&
                (truth.answer || truth.state !== "SENT"),
            )
            .map(async (truth: any) => {
              const [challengerProfile, receiverProfile] = await Promise.all([
                fetchContentProfile(truth.challengerId),
                fetchContentProfile(truth.receiverId),
              ]);

              return {
                id: truth.id,
                challengerId: truth.challengerId,
                receiverId: truth.receiverId,
                challenger: {
                  nickname: extractProfileName(
                    challengerProfile,
                    truth.challengerId || "Someone",
                  ),
                  avatar: extractProfileAvatar(challengerProfile),
                },
                receiver: {
                  nickname: extractProfileName(
                    receiverProfile,
                    truth.receiverId || "Someone",
                  ),
                  avatar: extractProfileAvatar(receiverProfile),
                },
                question: truth.question,
                state: truth.state,
                createdAt:
                  truth.reviewedAt ||
                  truth.answeredAt ||
                  truth.updatedAt ||
                  truth.createdAt,
                answer: truth.answer,
              } as PublishedTruthCard;
            }),
        );

        const builtDares = await Promise.all(
          dareEntities
            .filter(
              (dare: any) =>
                dare.state === "ACCEPTED_REAL" && !!dare.proofMediaUrl,
            )
            .map(async (dare: any) => {
              const [challengerProfile, receiverProfile] = await Promise.all([
                fetchContentProfile(dare.challengerId),
                fetchContentProfile(dare.receiverId),
              ]);

              return {
                id: dare.id,
                challengerId: dare.challengerId,
                receiverId: dare.receiverId,
                challenger: {
                  nickname: extractProfileName(
                    challengerProfile,
                    dare.challengerId || "Someone",
                  ),
                  avatar: extractProfileAvatar(challengerProfile),
                },
                receiver: {
                  nickname: extractProfileName(
                    receiverProfile,
                    dare.receiverId || "Someone",
                  ),
                  avatar: extractProfileAvatar(receiverProfile),
                },
                description: dare.description,
                proof: {
                  type: dare.proofMediaType === "VIDEO" ? "video" : "image",
                  url: dare.proofMediaUrl,
                  thumbnail: dare.proofMediaUrl,
                },
                state: dare.state,
                createdAt: dare.completedAt || dare.updatedAt || dare.createdAt,
              } as PublishedDareCard;
            }),
        );

        if (!isMounted) return;

        setPublishedTruths(
          builtTruths.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
        setPublishedDares(
          builtDares.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      } catch (error) {
        console.error("Error loading published user cards:", error);
        if (isMounted) {
          setPublishedTruths([]);
          setPublishedDares([]);
        }
      } finally {
        if (isMounted) {
          setLoadingPublishedTruths(false);
          setLoadingPublishedDares(false);
        }
      }
    };

    void loadPublishedCards();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (activeTab !== "truths") {
      return;
    }

    const truthIds = publishedTruths.map((truth) => truth.id);

    truthIds.forEach((truthId) => {
      subscribeToTruthComments(truthId);
      if (currentUser?.id) {
        subscribeToTruthVotes(truthId, currentUser.id);
      }
    });

    return () => {
      truthIds.forEach((truthId) => {
        unsubscribeFromTruthComments(truthId);
        unsubscribeFromTruthVotes(truthId);
      });
    };
  }, [
    publishedTruths,
    subscribeToTruthComments,
    subscribeToTruthVotes,
    unsubscribeFromTruthComments,
    unsubscribeFromTruthVotes,
    currentUser?.id,
    activeTab,
  ]);

  useEffect(() => {
    if (activeTab !== "dares") {
      return;
    }

    const dareIds = publishedDares.map((dare) => dare.id);

    dareIds.forEach((dareId) => {
      subscribeToDareCommentCount(dareId);
      subscribeToDareViewCount(dareId);
    });

    return () => {
      dareIds.forEach((dareId) => {
        unsubscribeFromDareCommentCount(dareId);
        unsubscribeFromDareViewCount(dareId);
      });
    };
  }, [
    publishedDares,
    subscribeToDareCommentCount,
    subscribeToDareViewCount,
    unsubscribeFromDareCommentCount,
    unsubscribeFromDareViewCount,
    activeTab,
  ]);

  // Update local state when friendship status changes
  useEffect(() => {
    setFriendRequestSent(friendshipStatus === "pending");
  }, [friendshipStatus]);

  // Re-check friendship status periodically
  useEffect(() => {
    if (!userId || !currentUser?.id) {
      return;
    }

    const refreshFriendshipStatus = () => {
      checkFriendshipStatus(userId);
    };

    refreshFriendshipStatus();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFriendshipStatus();
      }
    };

    const handleFocus = () => {
      refreshFriendshipStatus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, currentUser?.id, checkFriendshipStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadCloseFriendStatus = async () => {
      if (!currentUser?.id || currentUser.id === userId || !isFriend) {
        if (isMounted) {
          setIsCloseFriend(false);
        }
        return;
      }

      const response = await closeFriendsService.isCloseFriend(
        currentUser.id,
        userId,
      );

      if (isMounted) {
        setIsCloseFriend(!!response.isCloseFriend);
      }
    };

    void loadCloseFriendStatus();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, userId, isFriend]);

  const handleSendFriendRequest = async () => {
    if (!currentUser?.id) return;
    setIsAnimating(true);
    try {
      const success = await sendFriendRequest(userId);
      if (success) {
        setFriendRequestSent(true);
        await checkFriendshipStatus(userId);
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
    } finally {
      setIsAnimating(false);
    }
  };

  const handleResendFriendRequest = async () => {
    if (!currentUser?.id) return;
    setIsCancelling(true);
    try {
      const success = await cancelFriendRequest(userId);
      if (success) {
        console.log("Friend request cancelled successfully");
      }
    } catch (error) {
      console.error("Error cancelling friend request:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleToggleCloseFriend = async () => {
    if (!currentUser?.id || currentUser.id === userId || !isFriend) return;

    setCloseFriendBusy(true);
    try {
      const response = isCloseFriend
        ? await closeFriendsService.removeCloseFriend(currentUser.id, userId)
        : await closeFriendsService.addCloseFriend(currentUser.id, userId);

      if (response.success) {
        setIsCloseFriend(!isCloseFriend);
      }
    } catch (error) {
      console.error("Error toggling close friend:", error);
    } finally {
      setCloseFriendBusy(false);
    }
  };

  // Filter posts by the current user
  const userFeedPosts = userPosts.filter((post) => {
    const postAuthorId = post.author?.id;
    return postAuthorId === userId;
  });

  useEffect(() => {
    if (!initialPostId) return;
    if (!userFeedPosts.some((post) => post.id === initialPostId)) return;
    setShowPostsScreen(true);
  }, [initialPostId, userFeedPosts]);

  const userAllDares = [...sentDares, ...receivedDares].filter(
    (dare) => dare.challenger_id === userId || dare.receiver_id === userId,
  );
  const userAllTruths = [...sentTruths, ...receivedTruths].filter(
    (truth) => truth.challengerId === userId || truth.receiverId === userId,
  );
  const completedTruths = userAllTruths.filter((truth: any) =>
    ["ANSWERED", "APPROVED", "REJECTED"].includes(truth.state),
  );
  const completedDares = userAllDares.filter(
    (dare: any) => dare.state === "ACCEPTED_REAL",
  );

  // Handler for opening friends modal
  const handleFriendsClick = async () => {
    if (!userId) return;
    try {
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const [response, closeFriendResponse] = await Promise.all([
        friendsService.getFriends(userId),
        currentUser?.id && currentUser.id !== userId && isFriend
          ? closeFriendsService.isCloseFriend(currentUser.id, userId)
          : Promise.resolve({ success: true, isCloseFriend: false }),
      ]);
      const friends = response.success ? response.friends || [] : [];
      setFriendsList(friends);
      setIsCloseFriend(!!closeFriendResponse.isCloseFriend);
    } catch (error) {
      console.error("Error loading friends:", error);
      setFriendsList([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  // Handler for unfriending a user
  const handleUnfriend = async () => {
    if (!userId) return;

    setIsUnfriending(true);
    try {
      const success = await unfriendUser(userId);
      if (success) {
        if (currentUser?.id) {
          await closeFriendsService.removeCloseFriend(currentUser.id, userId);
        }
        setIsCloseFriend(false);
        setShowUnfriendModal(false);
        await checkFriendshipStatus(userId);
        // Remove user's posts from feed (Instagram-like behavior)
        const { usePostsStore } = await import("../../stores/usePostsStore");
        const postsStore = usePostsStore.getState();
        const filteredPosts = postsStore.posts.filter(
          (post) => post.author?.id !== userId,
        );
        usePostsStore.setState({ posts: filteredPosts });
      }
    } catch (error) {
      console.error("Error unfriending user:", error);
    } finally {
      setIsUnfriending(false);
    }
  };

  if (loading) {
    return (
      <div className="screen-container bg-black min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="screen-container bg-black min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">{error || "User not found"}</p>
          <button
            onClick={onBack}
            className="bg-[#4ade80] text-black px-6 py-2 rounded-full font-semibold hover:bg-[#22c55e] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const showFriendButton =
    currentUser?.id !== userId && !isFriend && friendshipStatus === "none";
  const showPendingButton =
    currentUser?.id !== userId && friendshipStatus === "pending";
  const showFriendsButton = currentUser?.id !== userId && isFriend;

  return (
    <div className="screen-container">
      {/* Header */}
      <div className="bg-black border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="text-[#94a3b8] hover:text-white transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">Profile</h1>
          </div>
        </div>
      </div>

      {/* Show PostsScreen if navigation is triggered */}
      {showPostsScreen && (
        <div className="fixed inset-0 z-50 bg-black">
          <PostsScreen
            onBack={() => setShowPostsScreen(false)}
            posts={userFeedPosts}
            onNavigateToProfile={onNavigateToProfile}
            userName={profile.display_name || profile.username}
            targetUserId={userId}
            initialPostId={initialPostId}
          />
        </div>
      )}

      {/* Show TruthsListScreen if navigation is triggered */}
      {showTruthsListScreen && (
        <div className="fixed inset-0 z-50 bg-black">
          <TruthsListScreen
            userId={userId}
            onBack={() => {
              setShowTruthsListScreen(false);
              setInitialTruthId(undefined);
            }}
            truthPosts={publishedTruths}
            loading={loadingPublishedTruths}
            initialTruthId={initialTruthId}
            onSelectTruth={(truth) => {
              setShowTruthsListScreen(false);
              setInitialTruthId(undefined);
              onNavigateToTruthPost?.(truth);
            }}
          />
        </div>
      )}

      {/* Show DaresListScreen if navigation is triggered */}
      {showDaresListScreen && (
        <div className="fixed inset-0 z-50 bg-black">
          <DaresListScreen
            userId={userId}
            onBack={() => {
              setShowDaresListScreen(false);
              setInitialDareId(undefined);
            }}
            darePosts={publishedDares}
            loading={loadingPublishedDares}
            initialDareId={initialDareId}
            onSelectDare={(dare) => {
              setShowDaresListScreen(false);
              setInitialDareId(undefined);
              onNavigateToDarePost?.(dare);
            }}
          />
        </div>
      )}

      {/* Profile Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Avatar and Basic Info */}
        <div className="w-full max-w-4xl px-5 pt-6 pb-4">
          <div className="mb-5">
            {/* Top row: avatar + name/username/bio */}
            <div className="flex items-start gap-5 mb-4">
              <div className="relative shrink-0">
                <Avatar
                  src={profile.avatar_url || ""}
                  alt={profile.display_name || profile.username}
                  size="xl"
                  className="border-4 border-[#1e1e1e] shadow-[0_0_20px_rgba(74,222,128,0.18)]"
                />
                {onNavigateToActivity && (
                  <button
                    onClick={() => onNavigateToActivity(userId)}
                    className="absolute bottom-0 -left-2 w-7 h-7 rounded-full bg-[#4ade80] border-2 border-[#0a0a0a] flex items-center justify-center cursor-pointer"
                    style={{ color: "#000" }}
                  >
                    <Activity size={14} />
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="text-[26px] leading-none font-bold text-white mb-2">
                  {profile.display_name || profile.username}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToProfile && userId) {
                      onNavigateToProfile(userId);
                    }
                  }}
                  className={`mb-3 text-[15px] font-semibold text-[#4ade80] ${
                    onNavigateToProfile
                      ? "cursor-pointer hover:text-[#86efac]"
                      : "cursor-default"
                  }`}
                >
                  {stripAtSymbol(profile.username)}
                </button>
                <p className="text-[#94a3b8] leading-relaxed max-w-xl mb-4">
                  {profile.bio || "No bio yet"}
                </p>
                {profile.created_at && (
                  <p className="text-[#64748b] text-sm font-medium">
                    {formatJoinDate(profile.created_at)}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons - full width row, flush to screen left */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "8px",
                flexWrap: "nowrap",
              }}
            >
              {showFriendButton && (
                <button
                  onClick={handleSendFriendRequest}
                  disabled={isAnimating}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    borderRadius: "999px",
                    background: isAnimating ? "#2a2a2a" : "#4ade80",
                    color: isAnimating ? "#64748b" : "#000",
                    fontWeight: 700,
                    fontSize: "14px",
                    padding: "10px 20px",
                    whiteSpace: "nowrap",
                    border: "none",
                    cursor: isAnimating ? "not-allowed" : "pointer",
                  }}
                >
                  <UserPlus size={18} />
                  Send Friend Request
                </button>
              )}

              {showPendingButton && (
                <>
                  <button
                    disabled
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      background: "#2a2a2a",
                      color: "#64748b",
                      fontWeight: 700,
                      fontSize: "14px",
                      padding: "10px 16px",
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: "not-allowed",
                    }}
                  >
                    <Check size={18} />
                    Request Sent
                  </button>
                  <button
                    onClick={handleResendFriendRequest}
                    disabled={isCancelling}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      background: isCancelling ? "#2a2a2a" : "#ef4444",
                      color: isCancelling ? "#64748b" : "#fff",
                      fontWeight: 700,
                      fontSize: "14px",
                      padding: "10px 16px",
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: isCancelling ? "not-allowed" : "pointer",
                    }}
                  >
                    <X size={18} />
                    {isCancelling ? "Cancelling..." : "Cancel"}
                  </button>
                </>
              )}

              {showFriendsButton && (
                <>
                  <button
                    onClick={() => {
                      if (onMessage && profile) {
                        onMessage(
                          userId,
                          profile.username || profile.display_name || "user",
                        );
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      background: "#4ade80",
                      color: "#000",
                      fontWeight: 700,
                      fontSize: "14px",
                      padding: "10px 16px",
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <MessageCircle size={18} />
                    Message
                  </button>
                  <button
                    onClick={() => {
                      setShowFriendsModal(true);
                      setLoadingFriends(true);
                      handleFriendsClick();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      background: "#1e1e1e",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "14px",
                      padding: "10px 16px",
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Users size={18} />
                    {isCloseFriend ? "Close Friend" : "Friends"}
                  </button>
                  <button
                    onClick={() => setShowUnfriendModal(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      borderRadius: "999px",
                      background: "#ef4444",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "14px",
                      padding: "10px 16px",
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <X size={18} />
                    Unfriend
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mx-auto grid w-full max-w-4xl grid-cols-3 gap-3 px-5 mb-5">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-3 py-3 text-center">
            <div className="text-[22px] font-bold text-white leading-none mb-1">
              {userFeedPosts.length}
            </div>
            <div className="text-[#64748b] text-xs uppercase tracking-[0.12em]">
              Posts
            </div>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-3 py-3 text-center">
            <div className="text-[22px] font-bold text-white leading-none mb-1">
              {userAllDares.length}
            </div>
            <div className="text-[#64748b] text-xs uppercase tracking-[0.12em]">
              Dares
            </div>
          </div>
          <div
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-3 py-3 text-center cursor-pointer hover:bg-[#202020] transition-colors"
            onClick={() => {
              setShowFriendsModal(true);
              setLoadingFriends(true);
              handleFriendsClick();
            }}
          >
            <div className="text-[22px] font-bold text-white leading-none mb-1">
              {friendsCount}
            </div>
            <div className="text-[#64748b] text-xs uppercase tracking-[0.12em]">
              Friends
            </div>
          </div>
        </div>

        {/* Content Tabs - Only show if friends or own profile */}
        {(isFriend || currentUser?.id === userId) && (
          <>
            {/* Tab Navigation */}
            <div className="mx-auto flex w-full max-w-4xl border-b border-gray-800 px-5">
              <button
                onClick={() => setActiveTab("posts")}
                className={`flex-1 py-4 text-center font-medium transition-colors ${
                  activeTab === "posts"
                    ? "text-white border-b-2 border-[#4ade80]"
                    : "text-[#64748b] hover:text-white"
                }`}
              >
                <Grid3X3 size={20} className="mx-auto mb-1" />
                <div className="text-sm">Posts</div>
              </button>
              <button
                onClick={() => {
                  setActiveTab("truths");
                }}
                className={`flex-1 py-4 text-center font-medium transition-colors ${
                  activeTab === "truths"
                    ? "text-white border-b-2 border-[#4ade80]"
                    : "text-[#64748b] hover:text-white"
                }`}
              >
                <MessageSquare size={20} className="mx-auto mb-1" />
                <div className="text-sm">Truths</div>
              </button>
              <button
                onClick={() => {
                  setActiveTab("dares");
                }}
                className={`flex-1 py-4 text-center font-medium transition-colors ${
                  activeTab === "dares"
                    ? "text-white border-b-2 border-[#4ade80]"
                    : "text-[#64748b] hover:text-white"
                }`}
              >
                <Play size={20} className="mx-auto mb-1" />
                <div className="text-sm">Dares</div>
              </button>
            </div>

            {/* Tab Content */}
            <div className="mx-auto w-full max-w-4xl px-5 py-5">
              {activeTab === "posts" && (
                <div>
                  {userFeedPosts.length === 0 ? (
                    <div className="text-center py-12">
                      <Grid3X3
                        size={48}
                        className="mx-auto mb-4 text-[#64748b]"
                      />
                      <p className="text-[#64748b]">No posts yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {userFeedPosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => setShowPostsScreen(true)}
                          className="aspect-square min-h-[132px] bg-[#151515] border border-[#2a2a2a] rounded-2xl cursor-pointer hover:opacity-90 transition-opacity overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
                        >
                          {post.media ? (
                            <img
                              src={post.media.url}
                              alt="Post"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#64748b]">
                              <MessageSquare size={24} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "truths" && (
                <div style={{ padding: "10px 16px 24px" }}>
                  {loadingPublishedTruths ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "72px 20px",
                        gap: "16px",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          border: "3px solid rgba(96,165,250,0.15)",
                          borderTopColor: "#60a5fa",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      <span
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "14px",
                          fontWeight: 500,
                        }}
                      >
                        Loading truths...
                      </span>
                    </div>
                  ) : publishedTruths.length === 0 ? (
                    <div style={{ padding: "64px 24px", textAlign: "center" }}>
                      <MessageSquare
                        size={36}
                        color="rgba(255,255,255,0.12)"
                        style={{ margin: "0 auto 14px" }}
                      />
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "15px",
                          fontWeight: 600,
                          margin: "0 0 4px",
                        }}
                      >
                        No truths yet
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.2)",
                          fontSize: "13px",
                          margin: 0,
                        }}
                      >
                        Truths will appear here
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "22px",
                      }}
                    >
                      {publishedTruths.map((truth, index) => {
                        const badge =
                          truth.state === "APPROVED"
                            ? { label: "Approved", color: "#4ade80" }
                            : truth.state === "ANSWERED"
                              ? { label: "Answered", color: "#22c55e" }
                              : truth.state === "REJECTED"
                                ? { label: "Rejected", color: "#ef4444" }
                                : truth.state === "UNDER_REVIEW"
                                  ? { label: "Under Review", color: "#fbbf24" }
                                  : {
                                      label: "Pending",
                                      color: "rgba(255,255,255,0.4)",
                                    };
                        return (
                          <div
                            key={truth.id}
                            onClick={() => {
                              setInitialTruthId(truth.id);
                              setShowTruthsListScreen(true);
                            }}
                            style={{
                              animationDelay: `${index * 0.04}s`,
                              width: "100%",
                              background:
                                "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderLeft: `3px solid ${badge.color}`,
                              borderRadius: "20px",
                              padding: "24px 28px",
                              color: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "18px",
                              boxShadow:
                                "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.28)",
                              transition:
                                "border-color 0.2s ease, transform 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                          >
                            <div
                              style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: badge.color,
                                boxShadow: `0 0 14px ${badge.color}90`,
                                flexShrink: 0,
                                marginTop: "7px",
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  lineHeight: 1.3,
                                  color: "rgba(255,255,255,0.55)",
                                  letterSpacing: "-0.005em",
                                }}
                              >
                                <span
                                  style={{ color: "rgba(255,255,255,0.9)" }}
                                >
                                  {truth.challenger.nickname}
                                </span>
                                <span
                                  style={{
                                    margin: "0 6px",
                                    color: "rgba(255,255,255,0.35)",
                                    fontWeight: 500,
                                  }}
                                >
                                  asked
                                </span>
                                <span
                                  style={{ color: "rgba(255,255,255,0.9)" }}
                                >
                                  {truth.receiver.nickname}
                                </span>
                              </p>
                              {truth.question && (
                                <p
                                  style={{
                                    margin: "8px 0 0",
                                    fontSize: "19px",
                                    fontWeight: 700,
                                    lineHeight: 1.35,
                                    letterSpacing: "-0.02em",
                                    color: "#fff",
                                    overflow: "hidden",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  {truth.question}
                                </p>
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  marginTop: "13px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: badge.color,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    padding: "5px 12px",
                                    borderRadius: "99px",
                                    background: `${badge.color}18`,
                                    border: `1px solid ${badge.color}40`,
                                  }}
                                >
                                  {badge.label}
                                </span>
                                <span
                                  style={{
                                    color: "rgba(255,255,255,0.4)",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                  }}
                                >
                                  {formatTimeAgo(truth.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "dares" && (
                <div style={{ padding: "10px 16px 24px" }}>
                  {loadingPublishedDares ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "72px 20px",
                        gap: "16px",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          border: "3px solid rgba(74,222,128,0.15)",
                          borderTopColor: "#4ade80",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      <span
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "14px",
                          fontWeight: 500,
                        }}
                      >
                        Loading dares...
                      </span>
                    </div>
                  ) : publishedDares.length === 0 ? (
                    <div style={{ padding: "64px 24px", textAlign: "center" }}>
                      <Play
                        size={36}
                        color="rgba(255,255,255,0.12)"
                        style={{ margin: "0 auto 14px" }}
                      />
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "15px",
                          fontWeight: 600,
                          margin: "0 0 4px",
                        }}
                      >
                        No dares yet
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.2)",
                          fontSize: "13px",
                          margin: 0,
                        }}
                      >
                        Dares will appear here
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "22px",
                      }}
                    >
                      {publishedDares.map((dare, index) => {
                        const badge =
                          dare.state === "ACCEPTED_REAL"
                            ? { label: "Completed", color: "#4ade80" }
                            : dare.state === "CHICKEN_OUT"
                              ? { label: "Surrendered", color: "#fbbf24" }
                              : dare.state === "REJECTED_FAKE"
                                ? { label: "Rejected", color: "#ef4444" }
                                : dare.state === "PROOF_SUBMITTED" ||
                                    dare.state === "UNDER_REVIEW" ||
                                    dare.state === "FRIENDS_VALIDATION"
                                  ? { label: "Under Review", color: "#fbbf24" }
                                  : dare.state === "ACCEPTED"
                                    ? { label: "Accepted", color: "#22c55e" }
                                    : {
                                        label: "Pending",
                                        color: "rgba(255,255,255,0.4)",
                                      };
                        return (
                          <div
                            key={dare.id}
                            onClick={() => {
                              setInitialDareId(dare.id);
                              setShowDaresListScreen(true);
                            }}
                            style={{
                              animationDelay: `${index * 0.04}s`,
                              width: "100%",
                              background:
                                "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderLeft: `3px solid ${badge.color}`,
                              borderRadius: "20px",
                              padding: "24px 28px",
                              color: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "18px",
                              boxShadow:
                                "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.28)",
                              transition:
                                "border-color 0.2s ease, transform 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                          >
                            <div
                              style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: badge.color,
                                boxShadow: `0 0 14px ${badge.color}90`,
                                flexShrink: 0,
                                marginTop: "7px",
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  lineHeight: 1.3,
                                  color: "rgba(255,255,255,0.55)",
                                  letterSpacing: "-0.005em",
                                }}
                              >
                                <span
                                  style={{ color: "rgba(255,255,255,0.9)" }}
                                >
                                  {dare.challenger.nickname}
                                </span>
                                <span
                                  style={{
                                    margin: "0 6px",
                                    color: "rgba(255,255,255,0.35)",
                                    fontWeight: 500,
                                  }}
                                >
                                  dared
                                </span>
                                <span
                                  style={{ color: "rgba(255,255,255,0.9)" }}
                                >
                                  {dare.receiver.nickname}
                                </span>
                              </p>
                              {dare.description && (
                                <p
                                  style={{
                                    margin: "8px 0 0",
                                    fontSize: "19px",
                                    fontWeight: 700,
                                    lineHeight: 1.35,
                                    letterSpacing: "-0.02em",
                                    color: "#fff",
                                    overflow: "hidden",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  {dare.description}
                                </p>
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  marginTop: "13px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: badge.color,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    padding: "5px 12px",
                                    borderRadius: "99px",
                                    background: `${badge.color}18`,
                                    border: `1px solid ${badge.color}40`,
                                  }}
                                >
                                  {badge.label}
                                </span>
                                <span
                                  style={{
                                    color: "rgba(255,255,255,0.4)",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                  }}
                                >
                                  {formatTimeAgo(dare.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Posts Notice - Only show if not friends and not own profile */}
        {!isFriend && currentUser?.id !== userId && (
          <div className="px-6 pb-6">
            <div className="bg-[#1e1e1e] rounded-2xl p-6 text-center">
              <div className="w-16 h-16 bg-[#4ade80]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-[#4ade80]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8h.01"
                  />
                </svg>
              </div>
              <p className="text-white font-medium mb-2">Posts are hidden</p>
              <p className="text-[#64748b] text-sm leading-relaxed">
                Send a friend request to see{" "}
                {profile.display_name || profile.username}&apos;s truth and dare
                posts
              </p>
            </div>
          </div>
        )}

        {/* Friends Modal */}
        {showFriendsModal && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-70"
            onClick={() => setShowFriendsModal(false)}
          >
            <div
              className="bg-[#111] w-full max-w-md rounded-t-3xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">
                  Friends ({friendsList.length})
                </h3>
                <button
                  onClick={() => setShowFriendsModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {currentUser?.id !== userId && isFriend && (
                <button
                  type="button"
                  onClick={() => void handleToggleCloseFriend()}
                  disabled={closeFriendBusy}
                  className={`mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    isCloseFriend
                      ? "border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]"
                      : "border-[#2a2a2a] bg-[#1a1a1a] text-white hover:border-[#4ade80]/40 hover:text-[#4ade80]"
                  } ${closeFriendBusy ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <Star size={16} />
                  {closeFriendBusy
                    ? "Updating..."
                    : isCloseFriend
                      ? "Remove from Close Friends"
                      : "Add to Close Friends"}
                </button>
              )}

              {loadingFriends ? (
                <div className="text-center py-8">
                  <p className="text-[#64748b]">Loading friends...</p>
                </div>
              ) : friendsList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[#64748b]">No friends yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {friendsList.map((friend: any) => (
                    <div
                      key={friend.userId}
                      className="flex items-center space-x-3 p-3 bg-[#1e1e1e] rounded-xl"
                    >
                      <Avatar
                        src={friend.avatarUrl || ""}
                        alt={friend.displayName || friend.username}
                        size="sm"
                        userId={friend.userId}
                      />
                      <div className="flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.userId) {
                              onNavigateToProfile(friend.userId);
                            }
                          }}
                          className={`text-left font-medium text-white ${
                            onNavigateToProfile && friend.userId
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {friend.displayName || friend.username}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.userId) {
                              onNavigateToProfile(friend.userId);
                            }
                          }}
                          className={`block text-sm text-[#64748b] ${
                            onNavigateToProfile && friend.userId
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {stripAtSymbol(friend.username)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Unfriend Confirmation Modal */}
        {showUnfriendModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
            onClick={() => setShowUnfriendModal(false)}
          >
            <div
              className="bg-[#111] w-full max-w-sm mx-4 rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-[#ef4444]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X size={24} className="text-[#ef4444]" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Unfriend {profile.display_name || profile.username}?
                </h3>
                <p className="text-[#64748b] text-sm">
                  Their posts will be removed from your feed and you won&apos;t
                  see their content anymore.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleUnfriend}
                  disabled={isUnfriending}
                  className={`w-full py-3 rounded-full font-semibold transition-colors ${
                    isUnfriending
                      ? "bg-[#2a2a2a] text-[#64748b] cursor-not-allowed"
                      : "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                  }`}
                >
                  {isUnfriending ? "Unfriending..." : "Unfriend"}
                </button>
                <button
                  onClick={() => setShowUnfriendModal(false)}
                  disabled={isUnfriending}
                  className="w-full py-3 rounded-full font-semibold bg-[#1e1e1e] text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
