"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Send,
  X,
  MoreHorizontal,
  Trash2,
  Music,
} from "lucide-react";
import "@/styles/design-system.css";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { usePostsStore, type FeedPost } from "../../stores/usePostsStore";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { formatTimeAgo } from "../../utils/timeFormat";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import { useSurveillance } from "../../hooks/useSurveillance";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { friendsService } from "../../middleware/services/friends.service";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import {
  buildSharedPostPayload,
  encodeSharedPostPayload,
  SHARED_POST_FALLBACK_TEXT,
} from "../../utils/sharedPostMessage";
import { predictivePreFetch } from "../../utils/predictivePreFetch";

// ---------------------------------------------------------------------------
// Constants — EXACT copy from FeedScreen
// ---------------------------------------------------------------------------

const DOUBLE_TAP_DELAY = 320;
// Enable predictive pre-fetching on hover to reduce perceived latency
// Disabled for mobile (hover doesn't work on mobile)
const ENABLE_PREDICTIVE_PREFETCH = false; // Set to true to enable
const BURST_LIFETIME = 950;
const HEART_SIZES = [52, 68, 44, 60, 56];
const HEART_COLORS = [
  "#ff3b6b",
  "#ff6b9d",
  "#ff4d6d",
  "#ff758c",
  "#ff8fa3",
  "#f43f5e",
];

// ---------------------------------------------------------------------------
// Types — EXACT copy from FeedScreen
// ---------------------------------------------------------------------------

interface HeartBurst {
  id: number;
  x: number;
  y: number;
  scale: number;
  colorIdx: number;
}

interface PostsScreenProps {
  onBack: () => void;
  posts: FeedPost[];
  onNavigateToProfile?: (userId: string) => void;
  userName?: string;
  targetUserId?: string;
  initialPostId?: string;
  initialCommentId?: string;
}

// ---------------------------------------------------------------------------
// HeartBurstLayer — EXACT copy from FeedScreen (SVG hearts with glow + ring)
// ---------------------------------------------------------------------------

function HeartBurstLayer({ bursts }: { bursts: HeartBurst[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden z-10">
      <style>{`
        @keyframes hbFloat {
          0%   { opacity: 0;    transform: scale(0.15) translateY(0px) rotate(-8deg); }
          12%  { opacity: 1;    transform: scale(1.4)  translateY(-6px) rotate(4deg); }
          35%  { opacity: 1;    transform: scale(1.15) translateY(-14px) rotate(-2deg); }
          65%  { opacity: 0.75; transform: scale(1.0)  translateY(-28px) rotate(3deg); }
          100% { opacity: 0;    transform: scale(0.65) translateY(-52px) rotate(-5deg); }
        }
        @keyframes hbGlow {
          0%   { opacity: 0;    transform: scale(0.4); }
          18%  { opacity: 0.85; transform: scale(1.5); }
          55%  { opacity: 0.35; transform: scale(2.1); }
          100% { opacity: 0;    transform: scale(2.8); }
        }
        @keyframes hbRing {
          0%   { opacity: 0.9; transform: scale(0.5); }
          60%  { opacity: 0.3; transform: scale(2.2); }
          100% { opacity: 0;   transform: scale(3.0); }
        }
      `}</style>
      {bursts.map((burst) => {
        const size = HEART_SIZES[burst.id % HEART_SIZES.length];
        const color = HEART_COLORS[burst.colorIdx % HEART_COLORS.length];
        return (
          <div
            key={burst.id}
            style={{
              position: "absolute",
              left: burst.x - size / 2,
              top: burst.y - size / 2,
              width: size,
              height: size,
              /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
              /* DISABLED: pointerEvents: "none", */
            }}
          >
            {/* Glow halo */}
            <div
              style={{
                position: "absolute",
                inset: -size * 0.6,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}60 0%, transparent 68%)`,
                animation: `hbGlow ${BURST_LIFETIME}ms ease-out forwards`,
              }}
            />
            {/* Expanding ring */}
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: `2px solid ${color}80`,
                animation: `hbRing ${BURST_LIFETIME * 0.75}ms ease-out forwards`,
              }}
            />
            {/* SVG Heart */}
            <div
              style={{
                animation: `hbFloat ${BURST_LIFETIME}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                transformOrigin: "center bottom",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill={color}
                width={size}
                height={size}
                style={{
                  filter: `drop-shadow(0 0 ${size * 0.18}px ${color}dd) drop-shadow(0 2px 6px #0008)`,
                  transform: `scale(${burst.scale})`,
                  transformOrigin: "center",
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — EXACT copy from FeedScreen
// ---------------------------------------------------------------------------

const totalLikes = (post: FeedPost) =>
  typeof post.likes_count === "number"
    ? post.likes_count
    : Object.keys(post.likesByUser || {}).length;

const totalLikeTaps = (post: FeedPost) =>
  Object.values(post.likesByUser || {}).reduce(
    (sum, entry) => sum + (entry?.tapCount || 0),
    0,
  );

const iLiked = (post: FeedPost, currentUserId: string) =>
  (post.likesByUser?.[currentUserId]?.tapCount ?? 0) > 0;

const formatNumber = (n: number | undefined) =>
  n === undefined || n === 0
    ? "0"
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toString();

const stripAtSymbol = (username?: string) =>
  (username || "unknown").replace(/^@/, "");

const normalizePost = (post: any): FeedPost => ({
  id: post.id,
  author: {
    id: post.author?.id,
    name: post.author?.name || "Unknown",
    avatar: post.author?.avatar || "",
    username: post.author?.username || "unknown",
  },
  content: post.content || "",
  media: post.media,
  stats: {
    views: post.stats?.views || 0,
  },
  likesByUser: post.likesByUser || {},
  likes_count: post.likes_count ?? post.stats?.likes ?? 0,
  comments: post.comments || [],
  comments_count: post.comments_count ?? post.stats?.comments ?? 0,
  commentsLoading: post.commentsLoading || false,
  likesLoading: post.likesLoading || false,
  timestamp: post.timestamp || new Date().toISOString(),
  taggedFriends: post.taggedFriends || [],
});

const sortPostsByTimestamp = (posts: FeedPost[]) =>
  [...posts].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    const normalizedATime = Number.isFinite(aTime) ? aTime : 0;
    const normalizedBTime = Number.isFinite(bTime) ? bTime : 0;

    if (normalizedBTime !== normalizedATime) {
      return normalizedBTime - normalizedATime;
    }

    return b.id.localeCompare(a.id);
  });

const dedupePostsById = (posts: FeedPost[]) => {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
};

// ---------------------------------------------------------------------------
// PostsScreen
// ---------------------------------------------------------------------------

export function PostsScreen({
  onBack,
  posts,
  onNavigateToProfile,
  userName,
  targetUserId,
  initialPostId,
  initialCommentId,
}: PostsScreenProps) {
  const { user } = useAuthStore();
  const userProfiles = useProfileDataStore((s) => s.userProfiles);
  const currentDisplayName = useProfileDataStore((s) => s.currentDisplayName);
  const currentUsername = useProfileDataStore((s) => s.currentUsername);
  const currentProfileUserId = useProfileDataStore((s) => s.currentUserId);

  // Surveillance setup
  const derivedTargetUserId =
    targetUserId || posts[0]?.author?.id || user?.id || "";
  useSurveillance({ targetUserId: derivedTargetUserId, screen: "posts" });

  const {
    posts: feedPosts,
    addLike: storeAddLike,
    addComment: storeAddComment,
    likeComment: storeLikeComment,
    subscribeToPostComments,
    unsubscribeFromPostComments,
    subscribeToPostLikes,
    unsubscribeFromPostLikes,
    userPosts,
    deletePost,
  } = usePostsStore();
  const { getOrCreateConversation, sendRealTimeMessage } = useMessagingStore();

  // currentUser — same shape as FeedScreen
  const currentUser = user
    ? {
        userId: user.id,
        name:
          currentProfileUserId === user.id && currentDisplayName
            ? currentDisplayName
            : user.displayName || user.username,
        username: (() => {
          const uname =
            currentProfileUserId === user.id && currentUsername
              ? currentUsername
              : user.username;
          return uname.startsWith("@") ? uname : `@${uname}`;
        })(),
        avatar: user.avatar || "",
      }
    : {
        userId: "me",
        name: "You",
        username: "@you",
        avatar: "https://picsum.photos/seed/you/100/100.jpg",
      };

  const resolveAuthor = useCallback(
    (author: {
      id?: string;
      name: string;
      username: string;
      avatar: string;
    }) => {
      const authorId = author.id;
      const isCurrentUser =
        authorId && currentProfileUserId && authorId === currentProfileUserId;

      let name = author.name;
      let username = author.username;

      if (isCurrentUser && currentDisplayName) {
        name = currentDisplayName;
      } else if (authorId && userProfiles[authorId]) {
        name = userProfiles[authorId].displayName || name;
      }

      if (isCurrentUser && currentUsername) {
        username = currentUsername;
      } else if (authorId && userProfiles[authorId]) {
        username = userProfiles[authorId].username || username;
      }

      return { ...author, name, username };
    },
    [userProfiles, currentDisplayName, currentUsername, currentProfileUserId],
  );

  // ── Modal state ──
  const [showCommentsModal, setShowCommentsModal] = useState<string | null>(
    null,
  );
  const [showLikesModal, setShowLikesModal] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState<string | null>(null);
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [postPendingDelete, setPostPendingDelete] = useState<FeedPost | null>(
    null,
  );
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const consumedInitialCommentLinkRef = useRef<string | null>(null);
  const postMenuRef = useRef<HTMLDivElement | null>(null);

  // ── Heart burst state — EXACT copy from FeedScreen ──
  const [bursts, setBursts] = useState<Record<string, HeartBurst[]>>({});
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const burstIdCounter = useRef(0);
  const colorCounterRef = useRef(0);

  // ── Realtime subscriptions (same pattern as FeedScreen) ──
  const optimizedPosts = useMemo(() => {
    const canonicalById = new Map<string, FeedPost>();
    [...feedPosts, ...userPosts].forEach((post) => {
      canonicalById.set(post.id, post);
    });

    if (posts.length > 0) {
      const providedPosts = posts.map((post) => normalizePost(post));
      return sortPostsByTimestamp(
        dedupePostsById(
          providedPosts.map((post) => canonicalById.get(post.id) || post),
        ),
      );
    }

    return dedupePostsById(sortPostsByTimestamp(userPosts));
  }, [posts, feedPosts, userPosts]);

  const selectedPost = useMemo(
    () =>
      optimizedPosts.find(
        (post) => post.id === showCommentsModal || post.id === showLikesModal,
      ) || null,
    [optimizedPosts, showCommentsModal, showLikesModal],
  );

  const selectedSharedPost = useMemo(
    () => optimizedPosts.find((post) => post.id === showShareModal) || null,
    [optimizedPosts, showShareModal],
  );

  useEffect(() => {
    if (!selectedPost) return;
    const postId = selectedPost.id;

    if (showLikesModal) {
      subscribeToPostLikes(postId);
      return () => unsubscribeFromPostLikes(postId);
    }
    if (showCommentsModal) {
      subscribeToPostComments(postId);
      return () => unsubscribeFromPostComments(postId);
    }
  }, [selectedPost?.id, showLikesModal, showCommentsModal]);

  useEffect(() => {
    if (!showShareModal || !user?.id) return;

    let isActive = true;

    const loadFriendsForShare = async () => {
      setLoadingFriends(true);
      try {
        const response = await friendsService.getFriends(user.id);
        if (!isActive) return;
        setFriends(response || []);
      } catch (error) {
        console.error("Failed to load friends for sharing:", error);
        if (isActive) setFriends([]);
      } finally {
        if (isActive) setLoadingFriends(false);
      }
    };

    void loadFriendsForShare();

    return () => {
      isActive = false;
    };
  }, [showShareModal, user?.id]);

  useEffect(() => {
    if (!initialPostId) return;

    const target = postRefs.current[initialPostId];
    if (!target) return;

    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [initialPostId, optimizedPosts]);

  useEffect(() => {
    if (!initialPostId || !initialCommentId) return;
    if (!optimizedPosts.some((post) => post.id === initialPostId)) return;
    const linkKey = `${initialPostId}:${initialCommentId}`;
    if (consumedInitialCommentLinkRef.current === linkKey) return;
    consumedInitialCommentLinkRef.current = linkKey;

    const timer = window.setTimeout(() => {
      setShowCommentsModal(initialPostId);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [initialCommentId, initialPostId, optimizedPosts]);

  useEffect(() => {
    if (!openPostMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        postMenuRef.current &&
        !postMenuRef.current.contains(event.target as Node)
      ) {
        setOpenPostMenuId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openPostMenuId]);

  const openCommentsModal = useCallback((postId: string) => {
    setShowCommentsModal(postId);
  }, []);

  const closeCommentsModal = useCallback(() => {
    setShowCommentsModal(null);
  }, []);

  useBodyScrollLock(
    !!(
      showCommentsModal ||
      showLikesModal ||
      showShareModal ||
      postPendingDelete
    ),
  );

  // ── Burst spawner — EXACT copy from FeedScreen ──
  const spawnBurst = useCallback((postId: string, x: number, y: number) => {
    const id = ++burstIdCounter.current;
    const colorIdx = colorCounterRef.current++ % HEART_COLORS.length;
    const burst: HeartBurst = {
      id,
      x: x + (Math.random() - 0.5) * 28,
      y: y + (Math.random() - 0.5) * 18,
      scale: 0.8 + Math.random() * 0.5,
      colorIdx,
    };
    setBursts((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), burst],
    }));
    setTimeout(() => {
      setBursts((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).filter((b) => b.id !== id),
      }));
    }, BURST_LIFETIME + 100);
  }, []);

  // ── addLike — EXACT copy from FeedScreen ──
  const addLike = useCallback(
    (postId: string) => {
      storeAddLike(postId, currentUser.userId);
    },
    [storeAddLike, currentUser.userId],
  );

  // ── Double-tap detection — EXACT copy from FeedScreen ──
  const handleMediaTap = useCallback(
    (postId: string, e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const now = Date.now();
      const last = lastTapTimeRef.current[postId] ?? 0;
      const isDoubleTap = now - last < DOUBLE_TAP_DELAY;
      lastTapTimeRef.current[postId] = isDoubleTap ? 0 : now;
      if (!isDoubleTap) return;
      const rect = e.currentTarget.getBoundingClientRect();
      spawnBurst(postId, e.clientX - rect.left, e.clientY - rect.top);
      addLike(postId);
    },
    [spawnBurst, addLike],
  );

  // ── Heart icon click — EXACT copy from FeedScreen ──
  const handleHeartIconClick = useCallback(
    (postId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const mediaEl = document.getElementById(`media-${postId}`);
      spawnBurst(
        postId,
        mediaEl ? mediaEl.clientWidth / 2 : 160,
        mediaEl ? mediaEl.clientHeight / 2 : 160,
      );
      addLike(postId);
    },
    [spawnBurst, addLike],
  );

  // ... (rest of the code remains the same)
  const handleSubmitComment = useCallback(
    async (text: string, parentId?: string | null) => {
      if (!text.trim() || !selectedPost || !currentUser) return;
      try {
        await storeAddComment(selectedPost.id, {
          userId: currentUser.userId,
          name: currentUser.name,
          username: currentUser.username,
          avatar: currentUser.avatar,
          text: text.trim(),
          parentId: parentId || null,
        });
      } catch (error) {
        console.error("Failed to post comment:", error);
      }
    },
    [selectedPost, storeAddComment, currentUser],
  );

  const handleShare = useCallback((postId: string) => {
    setSentTo(new Set());
    setShowShareModal(postId);
  }, []);

  const handleDeletePost = useCallback(async () => {
    if (!postPendingDelete || !user?.id) return;

    setDeletingPostId(postPendingDelete.id);
    try {
      const deleted = await deletePost(postPendingDelete.id, user.id);
      if (deleted) {
        setPostPendingDelete(null);
        setOpenPostMenuId((current) =>
          current === postPendingDelete.id ? null : current,
        );
      }
    } finally {
      setDeletingPostId(null);
    }
  }, [deletePost, postPendingDelete, user?.id]);

  const handleSendToDM = useCallback(
    async (friend: any) => {
      if (!showShareModal || !user?.id) return;

      if (!selectedSharedPost) return;

      const recipientId = friend.user_id || friend.userId || friend.id;
      if (!recipientId) return;

      const payload = buildSharedPostPayload({
        ...selectedSharedPost,
        author: resolveAuthor(selectedSharedPost.author),
      });
      if (!payload) return;

      try {
        const conversationId = await getOrCreateConversation(
          user.id,
          recipientId,
        );
        await sendRealTimeMessage(
          conversationId,
          SHARED_POST_FALLBACK_TEXT,
          encodeSharedPostPayload(payload),
          "TEXT",
        );
        setSentTo((prev) => new Set(prev).add(recipientId));
      } catch (error) {
        console.error("Failed to share post to DM:", error);
      }
    },
    [
      showShareModal,
      user?.id,
      selectedSharedPost,
      resolveAuthor,
      getOrCreateConversation,
      sendRealTimeMessage,
    ],
  );

  // ── Render ──
  return (
    <div
      className="screen-container"
      style={{
        background:
          "radial-gradient(circle at 50% -10%, rgba(74,222,128,0.1), transparent 30%), radial-gradient(circle at 88% 14%, rgba(96,165,250,0.055), transparent 28%), #050705",
      }}
    >
      {/* Header */}
      <div className="nav-header border-b border-white/6 bg-[linear-gradient(180deg,rgba(5,7,5,0.98),rgba(5,7,5,0.88))] backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,20,0.96),rgba(12,14,12,0.98))] text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition-all duration-200 hover:border-[#4ade80]/30 hover:text-[#4ade80] hover:shadow-[0_16px_34px_rgba(0,0,0,0.34),0_0_22px_rgba(74,222,128,0.12)]"
            aria-label="Go back"
          >
            <ArrowLeft size={19} strokeWidth={2.2} />
          </button>
          <h1 className="truncate px-3 text-lg font-black tracking-[-0.03em] text-white">
            {userName ? `${userName}'s Posts` : "Posts"}
          </h1>
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="space-y-5 px-3 py-6">
          {optimizedPosts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-[#94a3b8] text-lg">No posts yet</div>
            </div>
          ) : (
            optimizedPosts.map((post) => {
              const liked = iLiked(post, currentUser.userId);
              const likeCount = totalLikes(post);
              const postBursts = bursts[post.id] ?? [];
              const author = resolveAuthor(post.author);
              const isHighlighted = initialPostId === post.id;
              const isOwnPost = !!user?.id && author.id === user.id;
              const isMenuOpen = openPostMenuId === post.id;

              return (
                <div
                  key={post.id}
                  ref={(node) => {
                    postRefs.current[post.id] = node;
                  }}
                  onMouseEnter={() => {
                    if (ENABLE_PREDICTIVE_PREFETCH) {
                      predictivePreFetch.prefetchComments(post.id);
                      predictivePreFetch.prefetchLikes(
                        post.id,
                        currentUser.userId,
                      );
                    }
                  }}
                  className={`overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,19,17,0.98),rgba(8,9,8,0.99))] shadow-[0_22px_60px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.045)] ${isHighlighted ? "ring-2 ring-[#4ade80] ring-offset-2 ring-offset-black" : ""}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 pt-3 pb-2">
                    <div className="flex min-w-[236px] max-w-full items-center space-x-3 rounded-full border border-white/10 bg-[linear-gradient(90deg,rgba(26,31,26,0.92),rgba(16,19,16,0.92))] px-5 py-2.5 pr-7 shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
                      <Avatar
                        src={author.avatar}
                        alt={author.name}
                        size="md"
                        userId={author.id}
                        username={author.username}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (onNavigateToProfile && author.id) {
                            onNavigateToProfile(author.id);
                          }
                        }}
                        className={`min-w-0 text-left ${
                          onNavigateToProfile && author.id
                            ? "cursor-pointer"
                            : "cursor-default"
                        }`}
                      >
                        <h3 className="font-bold text-white text-base leading-tight">
                          {author.name}
                        </h3>
                        <p className="text-[#4ade80] text-sm font-medium tracking-wide">
                          {author.username}
                        </p>
                      </button>
                    </div>
                    {isOwnPost && (
                      <div
                        ref={isMenuOpen ? postMenuRef : null}
                        className="relative ml-3 shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPostMenuId((current) =>
                              current === post.id ? null : post.id,
                            )
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,20,0.96),rgba(12,14,12,0.98))] text-[#d7fbe6] shadow-[0_14px_30px_rgba(0,0,0,0.28)] transition-all duration-200 hover:border-[#4ade80]/28 hover:text-white hover:shadow-[0_16px_36px_rgba(0,0,0,0.34),0_0_24px_rgba(74,222,128,0.12)]"
                          aria-label="Post options"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {isMenuOpen && (
                          <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-52 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,20,0.98),rgba(10,12,10,0.99))] p-2 shadow-[0_22px_44px_rgba(0,0,0,0.42),0_0_30px_rgba(74,222,128,0.08)] backdrop-blur-xl">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenPostMenuId(null);
                                setPostPendingDelete(post);
                              }}
                              className="flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left text-red-200 transition-colors hover:bg-red-500/10"
                            >
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
                                <Trash2 size={15} className="text-red-300" />
                              </div>
                              <div className="text-sm font-semibold">
                                Delete Post
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Media */}
                  {post.media && post.media.url && (
                    <div className="px-2">
                      <div
                        id={`media-${post.id}`}
                        className="w-full relative cursor-pointer rounded-3xl overflow-hidden" /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - select-none removed */
                        onClick={(e) => handleMediaTap(post.id, e)}
                      >
                        {post.media.type === "image" ? (
                          <img
                            src={post.media.url}
                            alt="Post media"
                            className="w-full object-cover"
                            style={{ height: "520px" }}
                            /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - draggable might block touch */
                            /* DISABLED: draggable={false} */
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.src =
                                "https://picsum.photos/seed/fallback/800/600.jpg";
                            }}
                          />
                        ) : post.media.type === "video" ? (
                          <div
                            className="w-full bg-[#2a2a2a] flex items-center justify-center rounded-3xl"
                            style={{ height: "520px" }}
                          >
                            <span className="text-[#94a3b8] text-2xl">
                              🎥 Video
                            </span>
                          </div>
                        ) : (
                          <div
                            className="w-full bg-gradient-to-br from-[#4ade80]/10 via-[#22c55e]/10 to-[#16a34a]/10 flex items-center justify-center rounded-3xl"
                            style={{ height: "520px" }}
                          >
                            <div className="text-center">
                              <div className="w-16 h-16 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-2xl flex items-center justify-center mb-3 mx-auto">
                                <Music size={28} className="text-black" />
                              </div>
                              <p className="text-white font-medium">
                                Audio File
                              </p>
                              {post.media.duration && (
                                <p className="text-[#94a3b8] text-sm mt-1">
                                  {post.media.duration}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <HeartBurstLayer bursts={postBursts} />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-2 pt-3">
                    <div className="grid grid-cols-3 items-center gap-1 rounded-full border border-white/8 bg-white/[0.045] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <div className="flex items-center justify-center min-w-0">
                        <button
                          onClick={(e) => handleHeartIconClick(post.id, e)}
                          className="group flex items-center justify-center min-w-0 text-white hover:text-[#4ade80] transition-colors"
                        >
                          <Heart
                            size={20}
                            fill={liked ? "#ef4444" : "white"}
                            strokeWidth={0}
                            className={`shrink-0 transition-all duration-200 ${
                              liked
                                ? "text-red-500 scale-110 drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                                : "text-white group-hover:scale-110"
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => setShowLikesModal(post.id)}
                          className="font-bold text-sm truncate ml-1 text-white hover:text-[#4ade80] transition-colors"
                        >
                          {formatNumber(likeCount)}
                        </button>
                      </div>
                      <div className="flex items-center justify-center min-w-0">
                        <button
                          onClick={() => {
                            setSentTo(new Set());
                            openCommentsModal(post.id);
                          }}
                          className="flex items-center justify-center space-x-2 min-w-0 text-white hover:text-[#4ade80] transition-colors"
                        >
                          <MessageCircle
                            size={20}
                            fill="white"
                            strokeWidth={0}
                          />
                          <span className="font-bold text-sm truncate">
                            {formatNumber(post.comments_count)}
                          </span>
                        </button>
                      </div>
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleShare(post.id)}
                          className="flex items-center justify-center text-white hover:text-[#4ade80] transition-colors"
                        >
                          <Send size={18} fill="white" strokeWidth={0} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Caption */}
                  <div className="px-4 pt-3 pb-5">
                    <p className="text-white text-base leading-snug">
                      {post.content}
                    </p>
                    <p className="text-[#64748b] text-xs mt-2">
                      {formatTimeAgo(post.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          COMMENTS MODAL — EXACT copy from FeedScreen
      ══════════════════════════════════════════ */}
      {showCommentsModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
            overscrollBehavior: "contain",
          }}
          onClick={closeCommentsModal}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .modal-slide-up { 
              animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; 
            }
            .comment-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col overflow-hidden"
            style={{
              maxHeight: "98vh",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle + header */}
            <div className="px-6 pt-4 pb-3 border-b border-[#2a2a2a] shrink-0">
              <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Comments</h3>
                <button
                  onClick={closeCommentsModal}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-6">
              {currentUser && (
                <CommentSection
                  comments={selectedPost.comments.map(
                    (c): CommentItem => ({
                      id: c.id,
                      userId: c.userId,
                      name: c.name,
                      username: c.username,
                      avatar: c.avatar,
                      text: c.text,
                      createdAt: c.createdAt,
                      likes: c.likes || 0,
                      parentId: c.parentId || null,
                      likedByCurrentUser: commentLikePersistence.hasLiked(
                        "post",
                        currentUser.userId,
                        c.id,
                      ),
                    }),
                  )}
                  loading={selectedPost.commentsLoading}
                  currentUser={{
                    userId: currentUser.userId,
                    name: currentUser.name,
                    username: currentUser.username,
                    avatar: currentUser.avatar,
                  }}
                  onSubmitComment={handleSubmitComment}
                  onLikeComment={(commentId) =>
                    storeLikeComment(selectedPost.id, commentId)
                  }
                  onNavigateToProfile={onNavigateToProfile}
                  autoFocusInput={true}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LIKES MODAL — EXACT copy from FeedScreen
      ══════════════════════════════════════════ */}
      {showLikesModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowLikesModal(null)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom { 
              from { transform: translateY(100%); } 
              to { transform: translateY(0); } 
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            .modal-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col"
            style={{
              maxHeight: "98vh",
              minHeight: "60vh",
              touchAction: "pan-y",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 shrink-0">
              <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-5" />
              <h3 className="text-white font-bold text-lg mb-1">Likes</h3>
              <p className="text-[#64748b] text-sm mb-3">
                {totalLikeTaps(selectedPost)} total likes ·{" "}
                {Object.keys(selectedPost.likesByUser || {}).length}{" "}
                {Object.keys(selectedPost.likesByUser || {}).length === 1
                  ? "person"
                  : "people"}
              </p>
            </div>

            {selectedPost.likesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-[#64748b] text-sm">Loading likes...</div>
              </div>
            ) : Object.keys(selectedPost.likesByUser || {}).length === 0 ? (
              <p className="text-[#64748b] text-center py-8 text-sm">
                No likes yet
              </p>
            ) : (
              <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
                {Object.values(selectedPost.likesByUser || {})
                  .sort(
                    (a: any, b: any) => (b?.tapCount || 0) - (a?.tapCount || 0),
                  )
                  .map((entry: any, index: number) => (
                    <div
                      key={entry?.userId || index}
                      className="flex items-center space-x-4 p-3 bg-[#1a1a1a] rounded-2xl modal-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={entry?.avatar || ""}
                        alt={entry?.name || "User"}
                        size="xl"
                        userId={entry?.userId}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && entry?.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className="text-white font-semibold text-base cursor-pointer hover:text-[#4ade80] transition-colors"
                        >
                          {entry?.name || "Unknown User"}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && entry?.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className={`text-sm text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && entry?.userId
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {entry?.username || "unknown"}
                        </button>
                      </div>
                      {/* EXACT same "liked N times" pill as FeedScreen */}
                      <div className="flex items-center space-x-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-full px-4 py-2">
                        <Heart
                          size={14}
                          fill="#ef4444"
                          className="text-red-500"
                        />
                        <span className="text-white text-sm font-semibold">
                          liked {entry?.tapCount || 0}{" "}
                          {(entry?.tapCount || 0) === 1 ? "time" : "times"}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          SHARE MODAL
      ══════════════════════════════════════════ */}
      {showShareModal && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowShareModal(null)}
        >
          <div
            className="app-modal-sheet bg-[#111] w-full rounded-t-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Send to…</h3>
              <button
                onClick={() => setShowShareModal(null)}
                className="text-[#64748b] hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            {selectedSharedPost?.media && (
              <div className="px-6 py-4 shrink-0 border-b border-[#2a2a2a]">
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedSharedPost.media.url}
                    alt="Post"
                    className="w-14 h-14 rounded-xl object-cover"
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {resolveAuthor(selectedSharedPost.author).name}
                    </p>
                    <p className="text-[#94a3b8] text-xs line-clamp-2">
                      {selectedSharedPost.content || ""}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loadingFriends ? (
                <p className="text-[#64748b] text-center py-10 text-sm">
                  Loading friends...
                </p>
              ) : friends.length === 0 ? (
                <p className="text-[#64748b] text-center py-10 text-sm">
                  No friends to share with
                </p>
              ) : (
                friends.map((friend, index) => {
                  const recipientId =
                    friend.user_id || friend.userId || friend.id;
                  const wasSent = recipientId ? sentTo.has(recipientId) : false;
                  return (
                    <div
                      key={recipientId || index}
                      className="flex items-center space-x-4 py-3 px-3 rounded-2xl hover:bg-[#1e1e1e] transition-colors bg-[#1a1a1a]"
                    >
                      <Avatar
                        src={friend.avatar_url || friend.avatarUrl || ""}
                        alt={
                          friend.display_name ||
                          friend.displayName ||
                          friend.username
                        }
                        size="xl"
                        userId={friend.user_id || friend.userId}
                        username={friend.username}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            const targetId = friend.user_id || friend.userId;
                            if (onNavigateToProfile && targetId) {
                              onNavigateToProfile(targetId);
                            }
                          }}
                          className="text-white font-semibold text-base cursor-pointer hover:text-[#4ade80] transition-colors"
                        >
                          {friend.display_name ||
                            friend.displayName ||
                            friend.username}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = friend.user_id || friend.userId;
                            if (onNavigateToProfile && targetId) {
                              onNavigateToProfile(targetId);
                            }
                          }}
                          className={`text-sm text-[#94a3b8] transition-colors ${
                            onNavigateToProfile &&
                            (friend.user_id || friend.userId)
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          @{stripAtSymbol(friend.username)}
                        </button>
                      </div>
                      <button
                        onClick={() => void handleSendToDM(friend)}
                        disabled={!recipientId || wasSent}
                        className={`px-5 py-2 rounded-full text-base font-semibold transition-all duration-200 flex items-center space-x-2 ${wasSent ? "bg-[#2a2a2a] text-[#64748b] cursor-default" : "bg-[#4ade80] text-black hover:bg-[#22c55e] active:scale-95"} disabled:bg-[#2a2a2a] disabled:text-[#64748b] disabled:cursor-default`}
                      >
                        {wasSent ? (
                          <span>Sent ✓</span>
                        ) : (
                          <>
                            <Send
                              size={18}
                              fill="currentColor"
                              strokeWidth={0}
                            />
                            <span>Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      {postPendingDelete && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[80] flex items-end bg-black/70"
          onClick={() => {
            if (deletingPostId) return;
            setPostPendingDelete(null);
          }}
        >
          <div
            className="app-modal-sheet w-full rounded-t-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,18,0.98),rgba(10,12,10,0.99))] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-4 shadow-[0_-20px_46px_rgba(0,0,0,0.42)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/15" />
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
                <Trash2 size={18} className="text-red-300" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">
                  Delete this post?
                </p>
                <p className="text-sm text-white/50">
                  This action permanently removes it from your profile and feed.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPostPendingDelete(null)}
                disabled={!!deletingPostId}
                className="flex-1 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePost()}
                disabled={!!deletingPostId}
                className="flex-1 rounded-[20px] bg-[linear-gradient(135deg,#fb7185,#ef4444)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(239,68,68,0.28)] transition-all hover:brightness-105 disabled:opacity-50"
              >
                {deletingPostId ? "Deleting..." : "Delete Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
