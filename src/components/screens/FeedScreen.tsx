//feed screen
"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  Heart,
  MessageCircle,
  Plus,
  MessageSquare,
  Send,
  X,
  Music,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { usePostsStore, type FeedPost } from "../../stores/usePostsStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useStoryStore } from "../../stores/useStoryStore";
import {
  StoryDTO,
  CreateStoryDTO,
  storyService,
} from "../../middleware/services/story.service";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  friendsService,
  type Friend,
} from "../../middleware/services/friends.service";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { useAlertStore } from "../../stores/useAlertStore";
import { useGhostModeStore } from "../../stores/useGhostModeStore";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { GhostModeTimer } from "../ui/GhostModeTimer";
import {
  buildSharedPostPayload,
  encodeSharedPostPayload,
  SHARED_POST_FALLBACK_TEXT,
} from "../../utils/sharedPostMessage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserLikeEntry {
  userId: string;
  name: string;
  username: string;
  avatar: string;
  tapCount: number;
}

interface HeartBurst {
  id: number;
  x: number;
  y: number;
  scale: number;
  colorIdx: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOUBLE_TAP_DELAY = 320;
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
// Helpers
// ---------------------------------------------------------------------------

const totalLikes = (post: FeedPost) => {
  if (typeof post.likes_count === "number") {
    return post.likes_count;
  }
  return Object.keys(post.likesByUser || {}).length;
};

const totalLikeTaps = (post: FeedPost) =>
  Object.values(post.likesByUser).reduce(
    (sum, entry) => sum + entry.tapCount,
    0,
  );

const iLiked = (post: FeedPost, currentUserId: string) =>
  (post.likesByUser[currentUserId]?.tapCount ?? 0) > 0;

const formatNumber = (n: number | undefined) =>
  n === undefined || n === 0
    ? "0"
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toString();

const stripAtSymbol = (username?: string) =>
  (username || "unknown").replace(/^@/, "");

// ---------------------------------------------------------------------------
// HeartBurstLayer
// ---------------------------------------------------------------------------

function HeartBurstLayer({ bursts }: { bursts: HeartBurst[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
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
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -size * 0.6,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}60 0%, transparent 68%)`,
                animation: `hbGlow ${BURST_LIFETIME}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: `2px solid ${color}80`,
                animation: `hbRing ${BURST_LIFETIME * 0.75}ms ease-out forwards`,
              }}
            />
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
// PostSkeleton — shimmer placeholder while posts load
// ---------------------------------------------------------------------------

function PostSkeleton() {
  return (
    <div className="bg-[#111] rounded-3xl overflow-hidden animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center px-3 pt-3 pb-2">
        <div className="flex items-center space-x-3 bg-[#1e1e1e] rounded-full px-4 py-2.5">
          <div className="w-10 h-10 rounded-full bg-[#2a2a2a]" />
          <div>
            <div className="h-4 w-24 bg-[#2a2a2a] rounded mb-1" />
            <div className="h-3 w-16 bg-[#2a2a2a] rounded" />
          </div>
        </div>
      </div>
      {/* Media skeleton */}
      <div className="px-2">
        <div
          className="w-full bg-[#1a1a1a] rounded-3xl"
          style={{ height: "520px" }}
        />
      </div>
      {/* Actions skeleton */}
      <div className="px-2 pt-3">
        <div className="bg-[#1e1e1e] rounded-full flex items-center px-4 py-3">
          <div className="h-5 w-5 bg-[#2a2a2a] rounded-full" />
          <div className="h-4 w-8 bg-[#2a2a2a] rounded ml-2" />
          <div className="flex-1" />
          <div className="h-5 w-5 bg-[#2a2a2a] rounded-full" />
          <div className="h-4 w-8 bg-[#2a2a2a] rounded ml-2" />
          <div className="flex-1" />
          <div className="h-5 w-5 bg-[#2a2a2a] rounded-full" />
        </div>
      </div>
      {/* Caption skeleton */}
      <div className="px-4 pt-3 pb-5">
        <div className="h-4 w-3/4 bg-[#1e1e1e] rounded mb-2" />
        <div className="h-3 w-20 bg-[#1e1e1e] rounded" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FeedScreen
// ---------------------------------------------------------------------------

export function FeedScreen({
  isActive = true,
  onBack,
  onCreatePost,
  onNavigateToChat,
  onNavigateToAlerts,
  onNavigateToSearch,
  onNavigateToProfile,
}: {
  isActive?: boolean;
  onBack: () => void;
  onCreatePost: () => void;
  onNavigateToChat: () => void;
  onNavigateToAlerts: () => void;
  onNavigateToSearch: () => void;
  onNavigateToProfile?: (userId: string) => void;
}) {
  const { getOrCreateConversation, sendRealTimeMessage } = useMessagingStore();
  const unreadCount = useMessagingStore((s) =>
    s.conversations.reduce(
      (total: number, conv: any) => total + (conv.unread_count || 0),
      0,
    ),
  );
  const {
    posts,
    loading,
    feedBootstrapping,
    addLike: storeAddLike,
    addComment: storeAddComment,
    likeComment: storeLikeComment,
    incrementViews: storeIncrementViews,
    subscribeToPostComments,
    unsubscribeFromPostComments,
    subscribeToPostLikes,
    unsubscribeFromPostLikes,
    loadMorePosts,
  } = usePostsStore();
  const { user } = useAuthStore();
  const userProfiles = useProfileDataStore((s) => s.userProfiles);
  const currentDisplayName = useProfileDataStore((s) => s.currentDisplayName);
  const currentUsername = useProfileDataStore((s) => s.currentUsername);
  const currentProfileUserId = useProfileDataStore((s) => s.currentUserId);
  const alertUnreadCount = useAlertStore((s) => s.unreadCount);
  const { subscribeToAlerts: subscribeAlerts, markAllAsRead } = useAlertStore();
  const ghostModeIsActive = useGhostModeStore((s) => s.isActive);
  const { checkGhostModeStatus, subscribeToGhostMode } = useGhostModeStore();

  // Initialize ghost mode status and subscribe to updates
  useEffect(() => {
    if (user?.id) {
      // Check initial ghost mode status
      checkGhostModeStatus(user.id);

      // Subscribe to real-time ghost mode changes
      const unsub = subscribeToGhostMode(user.id);
      return () => {
        if (unsub) unsub();
      };
    }
  }, [user?.id, checkGhostModeStatus, subscribeToGhostMode]);

  // Subscribe to alerts early so badge count is live
  useEffect(() => {
    if (isActive && user?.id) {
      const unsub = subscribeAlerts(user.id);
      return () => {
        if (unsub) unsub();
      };
    }
  }, [isActive, user?.id, subscribeAlerts]);

  // Helper: resolve author display name and username from profileDataStore
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

  const [showLikesModal, setShowLikesModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showStoryUploadModal, setShowStoryUploadModal] = useState(false);
  const [showStoryViewerModal, setShowStoryViewerModal] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [viewerStories, setViewerStories] = useState<StoryDTO[]>([]);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const {
    stories,
    userStories,
    isLoading: storiesLoading,
    createStory,
    markStoryAsViewed,
    deleteStory,
    isUploading,
    uploadProgress,
    loadFriendsStories,
    loadUserStories,
    cleanupExpiredStories,
    clearAllStories,
  } = useStoryStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [bursts, setBursts] = useState<Record<string, HeartBurst[]>>({});
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const burstIdCounter = useRef(0);
  const colorCounterRef = useRef(0);

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
        avatar: user.avatar || "", // Use actual avatar or empty string
      }
    : {
        userId: "me",
        name: "You",
        username: "@you",
        avatar: "https://picsum.photos/seed/you/100/100.jpg", // Only fallback if no user
      };

  // Subscribe to real-time feed before first paint to avoid stale persisted flashes
  useLayoutEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      usePostsStore.getState().subscribeToFeed(currentUser.userId);
    }
    return () => {
      usePostsStore.getState().unsubscribeFromFeed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentUser.userId]);

  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const aTime = new Date(a.timestamp).getTime();
        const bTime = new Date(b.timestamp).getTime();
        const normalizedATime = Number.isFinite(aTime) ? aTime : 0;
        const normalizedBTime = Number.isFinite(bTime) ? bTime : 0;

        if (normalizedBTime !== normalizedATime) {
          return normalizedBTime - normalizedATime;
        }

        return b.id.localeCompare(a.id);
      }),
    [posts],
  );

  // Derive selectedPost from live store data (not a stale snapshot)
  const selectedPost = useMemo(
    () => sortedPosts.find((p) => p.id === selectedPostId) || null,
    [sortedPosts, selectedPostId],
  );

  // Load real stories (no mocks)
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      const {
        clearAllStories: clear,
        loadFriendsStories: loadFriends,
        loadUserStories: loadUser,
      } = useStoryStore.getState();
      clear();
      loadFriends(currentUser.userId);
      loadUser(currentUser.userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentUser.userId]);

  // Load friends for share modal
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      friendsService
        .getFriends(currentUser.userId)
        .then(setFriends)
        .catch(console.error);
    }
  }, [isActive, currentUser.userId]);

  // Cleanup expired stories every minute
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupExpiredStories();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle opening comments from alert navigation
  useEffect(() => {
    const openCommentsForPost = sessionStorage.getItem("openCommentsForPost");
    const highlightPostId = sessionStorage.getItem("highlightPostId");

    if (openCommentsForPost && posts.length > 0) {
      const post = posts.find((p) => p.id === openCommentsForPost);
      if (post) {
        setSelectedPostId(post.id);
        setShowCommentsModal(true);
        // Clear the flags after using them
        sessionStorage.removeItem("openCommentsForPost");
        sessionStorage.removeItem("highlightPostId");
      }
    }
  }, [posts]);

  useEffect(() => {
    const highlightPostId = sessionStorage.getItem("highlightPostId");
    const openCommentsForPost = sessionStorage.getItem("openCommentsForPost");

    if (!highlightPostId || openCommentsForPost || posts.length === 0) return;

    const target = document.getElementById(`feed-post-${highlightPostId}`);
    if (!target) return;

    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      sessionStorage.removeItem("highlightPostId");
    }, 120);

    return () => window.clearTimeout(timer);
  }, [posts]);

  // Subscribe to likes/comments only for the post the user is interacting with
  // (instead of all visible posts, which created 40+ unnecessary listeners)
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

  // ── Infinite Scroll ──
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || sortedPosts.length === 0) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          setIsLoadingMore(true);
          await loadMorePosts();
          setIsLoadingMore(false);
        }
      },
      { rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [isLoadingMore, loadMorePosts]);

  useBodyScrollLock(showLikesModal || showCommentsModal || showShareModal);

  // ── Story handlers ──

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

  const handleYourStoryClick = () => {
    if (userStories.length > 0) {
      // Show user's own stories; owner = true so delete button appears
      setSelectedStoryIndex(0);
      setViewerStories(userStories);
      setViewerIsOwner(true);
      setShowStoryViewerModal(true);
    } else {
      setShowStoryUploadModal(true);
    }
  };

  const handleStoryClick = async (index: number) => {
    setSelectedStoryIndex(index);
    setViewerStories(stories);
    setViewerIsOwner(false);
    setShowStoryViewerModal(true);

    const story = stories[index];
    if (story && !story.hasViewed) {
      await markStoryAsViewed(story.id, currentUser.userId);
    }
  };

  const handleStoryUpload = async (file: File) => {
    try {
      // Upload to Firebase Storage with real progress
      const mediaUrl = await storyService.uploadStoryMedia(file, (percent) => {
        useStoryStore.setState({ uploadProgress: percent });
      });
      const mediaType = file.type.startsWith("video/") ? "video" : "image";

      const request: CreateStoryDTO = {
        mediaUrl,
        mediaType,
      };

      const newStory = await createStory(currentUser.userId, request);
      if (newStory) {
        setShowStoryUploadModal(false);
      }
    } catch (error) {
      console.error("Error uploading story:", error);
      // Show user-friendly error message
      alert(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Reset upload progress
      useStoryStore.setState({ uploadProgress: 0 });
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    await deleteStory(storyId, currentUser.userId);
    // Close viewer if no more stories left
    const remaining = userStories.filter((s) => s.id !== storyId);
    if (remaining.length === 0) {
      setShowStoryViewerModal(false);
    } else {
      // Stay on previous index if possible
      setViewerStories(remaining);
      setSelectedStoryIndex((prev) => Math.min(prev, remaining.length - 1));
    }
  };

  // ── Heart burst spawner ──
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

  const addLike = useCallback(
    (postId: string) => {
      storeAddLike(postId, currentUser.userId);
    },
    [storeAddLike, currentUser.userId],
  );

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

  const handleSubmitComment = useCallback(
    async (text: string, parentId?: string | null) => {
      if (!text.trim() || !selectedPost) return;
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

  const handleSendToDM = useCallback(
    async (friend: Friend) => {
      if (!selectedPost || !user?.id) return;

      const recipientId = friend.user_id || friend.id;
      if (!recipientId || sentTo.has(recipientId)) return;

      const payload = buildSharedPostPayload({
        ...selectedPost,
        author: resolveAuthor(selectedPost.author),
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
      selectedPost,
      user?.id,
      sentTo,
      resolveAuthor,
      getOrCreateConversation,
      sendRealTimeMessage,
    ],
  );

  // ── Full-screen loading gate ──
  // Block ALL content until data is fully loaded from backend.
  if (loading || feedBootstrapping) {
    return (
      <div
        className="screen-container"
        style={{
          paddingBottom: "120px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#000",
        }}
      >
        <h1
          className="text-3xl font-bold text-white mb-6"
          style={{ textShadow: "0 0 8px rgba(74, 222, 128, 0.3)" }}
        >
          DARE
        </h1>
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-2 h-2 rounded-full bg-[#4ade80] animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="w-2 h-2 rounded-full bg-[#4ade80] animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="w-2 h-2 rounded-full bg-[#4ade80] animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <p className="text-[#94a3b8] text-sm">Loading your feed...</p>
      </div>
    );
  }

  return (
    <div
      className="screen-container"
      style={{
        paddingBottom: "120px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ── */}
      <div className="bg-black border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center justify-between relative">
            <button
              onClick={onNavigateToSearch}
              className="text-[#94a3b8] hover:text-white transition-colors z-10"
            >
              <Search size={24} />
            </button>
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <GhostModeTimer />
            </div>
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-3">
              <button
                onClick={() => {
                  // Mark all alerts as read when user clicks to view them (Instagram-style)
                  if (alertUnreadCount > 0) {
                    markAllAsRead().catch(() => {});
                  }
                  onNavigateToAlerts();
                }}
                className="text-[#94a3b8] hover:text-white transition-colors relative"
              >
                <Heart size={24} />
                {alertUnreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center shadow-md border border-black leading-none">
                    {alertUnreadCount > 99 ? "99+" : alertUnreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={onNavigateToChat}
                className="text-[#94a3b8] hover:text-white transition-colors relative"
              >
                <MessageSquare size={24} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-[#4ade80] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center shadow-md border border-black leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Stories row ── */}
        <div className="px-4 py-6">
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide">
            {/* Your Story Circle */}
            <div
              className="shrink-0 flex flex-col items-center cursor-pointer group"
              onClick={handleYourStoryClick}
            >
              <div className="relative">
                <div className="absolute inset-0 w-20 h-20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-full h-full rounded-full border-2 border-[#4ade80]/30 animate-pulse" />
                </div>
                {userStories.length > 0 ? (
                  // User has active stories — show profile picture avatar with green ring
                  <div className="relative w-20 h-20 rounded-full p-0.5 bg-gradient-to-br from-[#4ade80] via-[#22c55e] to-[#16a34a] group-hover:scale-105 shadow-lg group-hover:shadow-xl backdrop-blur-sm transition-all duration-300">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-transparent to-white/5" />
                    <div className="w-full h-full rounded-full p-0.5 bg-black">
                      <img
                        src={currentUser.avatar}
                        alt="Your story"
                        className="w-full h-full rounded-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  // No stories — show add button
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#1a1a1a] via-[#1f1f1f] to-[#2a2a2a] flex items-center justify-center border-2 border-[#4ade80]/60 group-hover:border-[#4ade80] shadow-lg group-hover:shadow-xl group-hover:shadow-[#4ade80]/20 transition-all duration-300 group-hover:scale-105 backdrop-blur-sm">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-transparent to-white/5" />
                    <Plus
                      size={28}
                      className="text-[#4ade80] group-hover:scale-110 transition-transform duration-300 drop-shadow-sm"
                    />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-full flex items-center justify-center border-2 border-black shadow-md group-hover:scale-110 transition-transform duration-300">
                  <Plus size={12} className="text-black" />
                </div>
              </div>
              <span className="text-sm text-[#94a3b8] mt-3 block text-center w-20 truncate font-medium group-hover:text-white transition-colors duration-300">
                Your Story
              </span>
            </div>

            {/* Friends' Stories — only real stories from Firestore, no mocks */}
            {stories.map((story, index) => (
              <div
                key={story.id}
                className="shrink-0 flex flex-col items-center group"
              >
                <button
                  type="button"
                  className="relative w-20 h-20 cursor-pointer"
                  onClick={() => handleStoryClick(index)}
                >
                  {!story.hasViewed && (
                    <div className="absolute inset-0 w-20 h-20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-full h-full rounded-full border-2 border-[#4ade80]/40 animate-pulse" />
                    </div>
                  )}
                  <div
                    className={`relative w-20 h-20 rounded-full p-[2px] transition-all duration-300 group-hover:scale-105 shadow-lg group-hover:shadow-xl backdrop-blur-sm ${
                      story.hasViewed
                        ? "bg-gradient-to-br from-[#2a2a2a] via-[#2d2d2d] to-[#333333]"
                        : "bg-gradient-to-tr from-[#4ade80] via-[#22c55e] to-[#16a34a]"
                    }`}
                  >
                    <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-transparent to-white/5" />
                    <div
                      className={`w-full h-full rounded-full ${
                        story.hasViewed ? "bg-[#1a1a1a]" : "bg-black"
                      } p-[2px]`}
                    >
                      <div className="w-full h-full rounded-full overflow-hidden">
                        <Avatar
                          src={story.author.avatar}
                          alt={story.author.displayName}
                          size="2xl"
                          userId={story.author.id}
                          username={story.author.username}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  </div>
                  {!story.hasViewed && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-full border-2 border-black shadow-md animate-pulse group-hover:scale-110 transition-transform duration-300" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToProfile && story.author.id) {
                      onNavigateToProfile(story.author.id);
                    }
                  }}
                  className={`text-sm mt-3 block text-center w-20 truncate font-medium transition-colors duration-300 ${
                    story.hasViewed
                      ? "text-[#64748b]"
                      : "text-[#94a3b8] group-hover:text-white"
                  } ${
                    onNavigateToProfile && story.author.id
                      ? "cursor-pointer hover:text-[#4ade80]"
                      : "cursor-default"
                  }`}
                >
                  {stripAtSymbol(story.author.username)}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Posts ── show only the most recent post per user */}
        <div className="px-2 pb-6 space-y-5">
          {sortedPosts.map((post: FeedPost) => {
            const liked = iLiked(post, currentUser.userId);
            const likeCount = totalLikes(post);
            const postBursts = bursts[post.id] ?? [];
            const author = resolveAuthor(post.author);

            return (
              <div
                key={post.id}
                id={`feed-post-${post.id}`}
                className="bg-[#111] rounded-3xl overflow-hidden"
              >
                {/* Post header */}
                <div className="flex items-center px-3 pt-3 pb-2">
                  <div className="flex w-full items-center space-x-3 rounded-full bg-[#1e1e1e] px-5 py-2.5 pr-7">
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
                </div>

                {/* Media */}
                {post.media && post.media.url && (
                  <div className="px-1">
                    <div
                      id={`media-${post.id}`}
                      className="w-full relative select-none cursor-pointer rounded-3xl overflow-hidden"
                      onClick={(e) => handleMediaTap(post.id, e)}
                    >
                      {post.media.type === "image" ? (
                        <img
                          src={post.media.url}
                          alt="Post media"
                          className="w-full object-cover"
                          style={{ height: "520px" }}
                          draggable={false}
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
                            <p className="text-white font-medium">Audio File</p>
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
                  <div className="bg-[#1e1e1e] rounded-full flex items-center px-4 py-2.5">
                    <button
                      onClick={(e) => handleHeartIconClick(post.id, e)}
                      className="group flex items-center space-x-2"
                    >
                      <Heart
                        size={20}
                        fill={liked ? "#ef4444" : "white"}
                        strokeWidth={0}
                        className={`transition-all duration-200 ${
                          liked
                            ? "text-red-500 scale-110 drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                            : "text-white group-hover:scale-110"
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPostId(post.id);
                        setShowLikesModal(true);
                      }}
                      className="text-white font-bold text-sm ml-1 hover:text-[#4ade80] transition-colors"
                    >
                      {formatNumber(likeCount)}
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        setSelectedPostId(post.id);
                        setShowCommentsModal(true);
                      }}
                      className="flex items-center space-x-2 text-white hover:text-[#4ade80] transition-colors"
                    >
                      <MessageCircle size={20} fill="white" strokeWidth={0} />
                    </button>
                    <span className="text-white font-bold text-sm ml-1">
                      {formatNumber(post.comments_count)}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        setSelectedPostId(post.id);
                        setSentTo(new Set());
                        setShowShareModal(true);
                      }}
                      className="text-white hover:text-[#4ade80] transition-colors"
                    >
                      <Send size={18} fill="white" strokeWidth={0} />
                    </button>
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
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          COMMENTS MODAL
      ══════════════════════════════════════════ */}
      {showCommentsModal && selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
            overscrollBehavior: "contain",
          }}
          onClick={() => setShowCommentsModal(false)}
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
            className="bg-[#111] w-full rounded-t-3xl flex flex-col modal-slide-up overflow-hidden"
            style={{
              maxHeight: "98vh",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 border-b border-[#2a2a2a] shrink-0">
              <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Comments</h3>
                <button
                  onClick={() => setShowCommentsModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-6">
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
                    likes: c.likes,
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
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LIKES MODAL
      ══════════════════════════════════════════ */}
      {showLikesModal && selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowLikesModal(false)}
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
            className="bg-[#111] w-full rounded-t-3xl flex flex-col modal-slide-up"
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
                {Object.keys(selectedPost.likesByUser).length}{" "}
                {Object.keys(selectedPost.likesByUser).length === 1
                  ? "person"
                  : "people"}
              </p>
            </div>
            {selectedPost.likesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-[#64748b] text-sm">Loading likes...</div>
              </div>
            ) : Object.keys(selectedPost.likesByUser).length === 0 ? (
              <p className="text-[#64748b] text-center py-8 text-sm">
                No likes yet
              </p>
            ) : (
              <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
                {Object.values(selectedPost.likesByUser)
                  .sort((a, b) => b.tapCount - a.tapCount)
                  .map((entry, index) => (
                    <div
                      key={entry.userId}
                      className="flex items-center space-x-4 p-3 bg-[#1a1a1a] rounded-2xl modal-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={entry.avatar}
                        alt={entry.name}
                        size="xl"
                        userId={entry.userId}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && entry.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className="text-white font-semibold text-base cursor-pointer hover:text-[#4ade80] transition-colors"
                        >
                          {entry.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && entry.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className={`text-sm text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && entry.userId
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {entry.username}
                        </button>
                      </div>
                      <div className="flex items-center space-x-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-full px-4 py-2">
                        <Heart
                          size={14}
                          fill="#ef4444"
                          className="text-red-500"
                        />
                        <span className="text-white text-sm font-semibold">
                          liked {entry.tapCount}{" "}
                          {entry.tapCount === 1 ? "time" : "times"}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Infinite Scroll Sentinel ── */}
      {sortedPosts.length > 0 && (
        <div ref={loadMoreRef} className="px-2 pb-6">
          {isLoadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          SHARE MODAL
      ══════════════════════════════════════════ */}
      {showShareModal && selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowShareModal(false)}
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
            .share-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="bg-[#111] w-full rounded-t-3xl flex flex-col modal-slide-up"
            style={{
              maxHeight: "98vh",
              minHeight: "60vh",
              touchAction: "pan-y",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 border-b border-[#2a2a2a] shrink-0">
              <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Send to…</h3>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {selectedPost.media && (
              <div className="px-6 py-4 shrink-0 border-b border-[#2a2a2a]">
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedPost.media.url}
                    alt="Post"
                    className="w-14 h-14 rounded-xl object-cover"
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {resolveAuthor(selectedPost.author).name}
                    </p>
                    <p className="text-[#94a3b8] text-xs line-clamp-2">
                      {selectedPost.content}
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
                  const recipientId = friend.user_id || friend.id;
                  const sent = recipientId ? sentTo.has(recipientId) : false;
                  return (
                    <div
                      key={recipientId || friend.id || index}
                      className="flex items-center space-x-4 py-3 px-3 rounded-2xl hover:bg-[#1e1e1e] transition-colors bg-[#1a1a1a] share-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={friend.avatar_url || ""}
                        alt={
                          (friend.user_id &&
                            userProfiles[friend.user_id]?.displayName) ||
                          friend.display_name ||
                          friend.username
                        }
                        size="xl"
                        userId={friend.user_id}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && friend.user_id) {
                              onNavigateToProfile(friend.user_id);
                            }
                          }}
                          className="text-white font-semibold text-base cursor-pointer hover:text-[#4ade80] transition-colors"
                        >
                          {(friend.user_id &&
                            userProfiles[friend.user_id]?.displayName) ||
                            friend.display_name ||
                            friend.username}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.user_id) {
                              onNavigateToProfile(friend.user_id);
                            }
                          }}
                          className={`text-sm text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && friend.user_id
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {(friend.user_id &&
                            userProfiles[friend.user_id]?.username) ||
                            friend.username}
                        </button>
                      </div>
                      <button
                        onClick={() => void handleSendToDM(friend)}
                        disabled={!recipientId || sent}
                        className={`px-5 py-2 rounded-full text-base font-semibold transition-all duration-200 flex items-center space-x-2 ${sent ? "bg-[#2a2a2a] text-[#64748b] cursor-default" : "bg-[#4ade80] text-black hover:bg-[#22c55e] active:scale-95"} disabled:bg-[#2a2a2a] disabled:text-[#64748b] disabled:cursor-default`}
                      >
                        {sent ? (
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

      {/* ══════════════════════════════════════════
          STORY UPLOAD MODAL
      ══════════════════════════════════════════ */}
      {showStoryUploadModal && (
        <div
          className="fixed inset-0 bg-black/70 z-[100] flex items-end"
          onClick={() => setShowStoryUploadModal(false)}
        >
          <div
            className="bg-[#111] w-full rounded-t-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-6" />
            <h3 className="text-white font-bold text-lg mb-6">Create Story</h3>
            <div className="space-y-4">
              {isUploading && (
                <div className="bg-[#1e1e1e] rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">
                      Uploading story...
                    </span>
                    <span className="text-[#4ade80] text-sm font-medium">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-[#2a2a2a] rounded-full h-2">
                    <div
                      className="bg-[#4ade80] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*,video/*";
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file && !isUploading) {
                      await handleStoryUpload(file);
                    }
                  };
                  input.click();
                }}
                disabled={isUploading}
                className={`w-full font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center space-x-2 ${isUploading ? "bg-[#2a2a2a] text-[#64748b] cursor-not-allowed" : "bg-[#4ade80] text-black hover:bg-[#22c55e]"}`}
              >
                <Plus size={20} />
                <span>
                  {isUploading ? "Uploading..." : "Select from Gallery"}
                </span>
              </button>
              <button
                onClick={() => setShowStoryUploadModal(false)}
                disabled={isUploading}
                className={`w-full font-semibold py-4 rounded-2xl transition-colors ${isUploading ? "bg-[#1a1a1a] text-[#64748b] cursor-not-allowed" : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"}`}
              >
                {isUploading ? "Please wait..." : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STORY VIEWER MODAL
      ══════════════════════════════════════════ */}
      {showStoryViewerModal && viewerStories[selectedStoryIndex] && (
        <StoryViewer
          key={viewerStories[selectedStoryIndex]?.id || selectedStoryIndex}
          stories={viewerStories}
          currentIndex={selectedStoryIndex}
          isOwner={viewerIsOwner}
          currentUserId={currentUser.userId}
          onClose={() => setShowStoryViewerModal(false)}
          onStoryChange={(index) => setSelectedStoryIndex(index)}
          onDeleteStory={handleDeleteStory}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story Viewer Component
// ---------------------------------------------------------------------------

function StoryViewer({
  stories,
  currentIndex,
  isOwner,
  currentUserId,
  onClose,
  onStoryChange,
  onDeleteStory,
}: {
  stories: StoryDTO[];
  currentIndex: number;
  isOwner: boolean;
  currentUserId: string;
  onClose: () => void;
  onStoryChange: (index: number) => void;
  onDeleteStory: (storyId: string) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const currentStory = stories[currentIndex];
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const isPausedRef = useRef(false);

  const STORY_DURATION = 5000;

  function animateProgress(now: number) {
    if (isPausedRef.current) return;

    const elapsed = pausedElapsedRef.current + (now - startTimeRef.current);
    const newProgress = Math.min((elapsed / STORY_DURATION) * 100, 100);
    setProgress(newProgress);

    if (newProgress >= 100) {
      if (currentIndex < stories.length - 1) {
        onStoryChange(currentIndex + 1);
      } else {
        onClose();
      }
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(animateProgress);
  }

  useEffect(() => {
    pausedElapsedRef.current = 0;
    startTimeRef.current = performance.now();
    isPausedRef.current = false;

    animationFrameRef.current = window.requestAnimationFrame(animateProgress);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [currentIndex, onClose, onStoryChange, stories.length]);

  // Pause/resume on isPaused change
  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused) {
      pausedElapsedRef.current += performance.now() - startTimeRef.current;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } else {
      startTimeRef.current = performance.now();
      if (animationFrameRef.current === null) {
        animationFrameRef.current =
          window.requestAnimationFrame(animateProgress);
      }
    }
  }, [isPaused, onClose, onStoryChange, currentIndex, stories.length]);

  const handlePrevious = () => {
    if (currentIndex > 0) onStoryChange(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      onStoryChange(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handleDeletePress = () => {
    setIsPaused(true);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDeleteStory(currentStory.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setIsPaused(false);
  };

  if (!currentStory) return null;

  const postedAgo = formatTimeAgo(currentStory.createdAt);

  return (
    <div
      className="fixed inset-0 bg-black z-[100] flex items-center justify-center"
      style={{ transform: "translateZ(0)" }}
    >
      {/* Progress bars for all stories */}
      <div className="absolute top-4 left-4 right-4 flex space-x-1 z-20">
        {stories.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className="h-full origin-left rounded-full bg-white will-change-transform"
              style={{
                transform: `scaleX(${
                  i < currentIndex ? 1 : i === currentIndex ? progress / 100 : 0
                })`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Media */}
      <div className="relative w-full h-full flex items-center justify-center">
        {currentStory.media.type === "image" ? (
          <img
            src={currentStory.media.url}
            alt="Story"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            src={currentStory.media.url}
            className="max-w-full max-h-full object-contain"
            autoPlay
            controls={false}
          />
        )}
      </div>

      {/* Author bar */}
      <div className="absolute top-10 left-4 right-4 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <img
            src={currentStory.author.avatar}
            alt={currentStory.author.displayName}
            className="w-10 h-10 rounded-full object-cover border-2 border-white"
          />
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 flex items-center space-x-2">
            <p className="text-white font-semibold text-base">
              {stripAtSymbol(currentStory.author.username)}
            </p>
            <span className="text-white/50 text-xs">· {postedAgo}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Delete button — only visible to the story owner */}
          {isOwner && (
            <button
              onClick={handleDeletePress}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-red-400 hover:bg-black/70 transition-all"
            >
              <Trash2 size={18} />
            </button>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Caption */}
      {currentStory.caption && (
        <div className="absolute bottom-24 left-4 right-4 z-20">
          <div className="bg-black/50 backdrop-blur-sm rounded-2xl px-4 py-3">
            <p className="text-white text-sm">{currentStory.caption}</p>
          </div>
        </div>
      )}

      {/* View count (owner only) */}
      {isOwner && (
        <div className="absolute bottom-10 left-4 z-20">
          <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center space-x-1.5">
            <svg viewBox="0 0 24 24" fill="white" width={14} height={14}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" fill="black" />
            </svg>
            <span className="text-white text-xs font-medium">
              {currentStory.viewCount} views
            </span>
          </div>
        </div>
      )}

      {/* Tap zones: left = previous, right = next */}
      <button
        onClick={handlePrevious}
        className="absolute left-0 top-0 bottom-0 w-1/3 cursor-pointer z-10"
        disabled={currentIndex === 0}
      />
      <button
        onClick={handleNext}
        className="absolute right-0 top-0 bottom-0 w-1/3 cursor-pointer z-10"
      />

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-center justify-center px-6">
          <div className="bg-[#1a1a1a] rounded-3xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className="text-white font-bold text-lg text-center mb-2">
              Delete Story?
            </h3>
            <p className="text-[#94a3b8] text-sm text-center mb-6">
              This story will be permanently removed and your friends won&apos;t
              be able to see it anymore.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleConfirmDelete}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3.5 rounded-2xl transition-colors"
              >
                Delete Story
              </button>
              <button
                onClick={handleCancelDelete}
                className="w-full bg-[#2a2a2a] hover:bg-[#333] text-white font-semibold py-3.5 rounded-2xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
