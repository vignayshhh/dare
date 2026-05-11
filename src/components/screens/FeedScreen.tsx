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
  Gift,
  UserRound,
  ImagePlus,
  Check,
  Type,
  Wand2,
  Sparkles,
  Play,
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
  StoryType,
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
import { useUserGhostModes } from "../../hooks/useUserGhostModes";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { GhostModeTimer } from "../ui/GhostModeTimer";
import { StoryViewer } from "../app/StoryViewer";
import { ghostModeService } from "../../middleware/services/ghost-mode.service";
import { storyReactionService } from "../../middleware/services/story-reaction.service";
import alertService from "../../middleware/services/alert.service.new";
import {
  STORY_FILTER_PRESETS,
  STORY_MUSIC_PRESETS,
  getStoryFilterPreset,
  getStoryMusicPreset,
  type StoryFilterId,
} from "../../utils/storyEnhancements";
import {
  buildSharedPostPayload,
  buildSharedStoryPayload,
  encodeSharedPostPayload,
  encodeSharedStoryPayload,
  SHARED_POST_FALLBACK_TEXT,
  SHARED_STORY_FALLBACK_TEXT,
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

const getStoryCreatedAtTime = (story: StoryDTO) => {
  const createdAt = new Date(story.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const sortStoriesForPlayback = (stories: StoryDTO[]) =>
  [...stories].sort((a, b) => {
    const timeDifference = getStoryCreatedAtTime(a) - getStoryCreatedAtTime(b);
    return timeDifference || a.id.localeCompare(b.id);
  });

const STORY_REPLY_PAYLOAD_URL_LIMIT = 7000;
const STORY_REPLY_ENCODED_PAYLOAD_LIMIT = 15000;
const STORY_TEXT_COLORS = ["#ffffff", "#4ade80", "#facc15", "#fb7185", "#38bdf8"];

async function createStoryReplyPreviewUrl(story: StoryDTO): Promise<string> {
  const mediaUrl = story.media.url;
  if (!mediaUrl) return "";

  if (!mediaUrl.startsWith("data:")) {
    return mediaUrl.length <= STORY_REPLY_PAYLOAD_URL_LIMIT ? mediaUrl : "";
  }

  if (story.media.type !== "image") {
    return "";
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxWidth = 120;
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        const thumbnail = canvas.toDataURL("image/jpeg", 0.42);
        resolve(
          thumbnail.length <= STORY_REPLY_PAYLOAD_URL_LIMIT ? thumbnail : "",
        );
      } catch (error) {
        console.error("Failed to create story reply preview:", error);
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = mediaUrl;
  });
}

// ---------------------------------------------------------------------------
// HeartBurstLayer
// ---------------------------------------------------------------------------

function HeartBurstLayer({ bursts }: { bursts: HeartBurst[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden z-10">
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
  onNavigateToDaily,
  onNavigateToProfile,
  onStoryViewerOpenChange,
}: {
  isActive?: boolean;
  onBack: () => void;
  onCreatePost: () => void;
  onNavigateToChat: () => void;
  onNavigateToAlerts: () => void;
  onNavigateToSearch: () => void;
  onNavigateToDaily: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onStoryViewerOpenChange?: (isOpen: boolean) => void;
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
  }, [isActive, user?.id]);

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
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [animatingPosts, setAnimatingPosts] = useState<Set<string>>(new Set());
  const [showStoryUploadModal, setShowStoryUploadModal] = useState(false);
  const [storyUploadMode, setStoryUploadMode] = useState<StoryType | null>(
    null,
  );
  const [dedicationRecipient, setDedicationRecipient] =
    useState<Friend | null>(null);
  const [storyDraftFiles, setStoryDraftFiles] = useState<File[]>([]);
  const [storyDraftPreviewUrls, setStoryDraftPreviewUrls] = useState<string[]>(
    [],
  );
  const [selectedStoryDraftIndex, setSelectedStoryDraftIndex] = useState(0);
  const [storyDraftText, setStoryDraftText] = useState("");
  const [storyDraftTextColor, setStoryDraftTextColor] = useState("#ffffff");
  const [storyDraftTextX, setStoryDraftTextX] = useState(50);
  const [storyDraftTextY, setStoryDraftTextY] = useState(50);
  const [storyDraftTextSize, setStoryDraftTextSize] = useState(22);
  const [isStoryTextDragging, setIsStoryTextDragging] = useState(false);
  const [storyDraftFilter, setStoryDraftFilter] =
    useState<StoryFilterId>("original");
  const [storyDraftMusicId, setStoryDraftMusicId] = useState("none");
  const [showStoryViewerModal, setShowStoryViewerModal] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [viewerStories, setViewerStories] = useState<StoryDTO[]>([]);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [viewerStoryAuthorId, setViewerStoryAuthorId] = useState<string | null>(
    null,
  );
  const [ghostDebugLoading, setGhostDebugLoading] = useState(false);
  const [ghostDebugText, setGhostDebugText] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingRecipientId, setSendingRecipientId] = useState<string | null>(
    null,
  );
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const storyDraftFile = storyDraftFiles[selectedStoryDraftIndex] ?? null;
  const storyDraftPreviewUrl =
    storyDraftPreviewUrls[selectedStoryDraftIndex] ?? "";

  const {
    stories,
    userStories,
    isLoading: storiesLoading,
    markStoryAsViewed,
    deleteStory,
    isUploading,
    uploadProgress,
    cleanupExpiredStories,
    subscribeToFriendsStories,
    subscribeToUserStories,
    unsubscribeFromAllStories,
  } = useStoryStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const postsCountRef = useRef(0);
  const exhaustedLoadAttemptsRef = useRef(0);
  const hasScrolledSinceFeedActivatedRef = useRef(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  const [bursts, setBursts] = useState<Record<string, HeartBurst[]>>({});
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const burstIdCounter = useRef(0);
  const colorCounterRef = useRef(0);
  const storyDraftPreviewRef = useRef<HTMLDivElement | null>(null);
  const storyDraftPreviewUrlsRef = useRef<string[]>([]);
  const storyFilterTouchStartXRef = useRef<number | null>(null);

  // ── Header hide/show logic ──
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY =
        window.scrollY || document.documentElement.scrollTop;
      const scrollDifference = currentScrollY - lastScrollY;

      // Hide header when scrolling down, show when scrolling up
      if (scrollDifference > 50) {
        setIsHeaderVisible(false);
      } else if (scrollDifference < -50) {
        setIsHeaderVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

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
  const storyGroups = useMemo(() => {
    const groups = new Map<
      string,
      { authorId: string; latestAt: number; stories: StoryDTO[] }
    >();

    stories.forEach((story) => {
      const authorId = story.author.id;
      const createdAt = new Date(story.createdAt).getTime();
      const latestAt = Number.isFinite(createdAt) ? createdAt : 0;
      const existing = groups.get(authorId);

      if (existing) {
        existing.stories.push(story);
        existing.latestAt = Math.max(existing.latestAt, latestAt);
      } else {
        groups.set(authorId, {
          authorId,
          latestAt,
          stories: [story],
        });
      }
    });

    return Array.from(groups.values())
      .map((group) => {
        const playbackStories = sortStoriesForPlayback(group.stories);
        const displayStory =
          playbackStories.find((story) => !story.hasViewed) ??
          playbackStories[playbackStories.length - 1];

        return {
          ...group,
          stories: playbackStories,
          displayStory,
          hasViewed: playbackStories.every((story) => story.hasViewed),
        };
      })
      .filter((group) => Boolean(group.displayStory))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [stories]);
  const ghostModesByUserId = useUserGhostModes([
    ...stories.map((story) => story.author.id),
    ...stories
      .map((story) => story.dedicatedTo?.id)
      .filter((id): id is string => Boolean(id)),
    ...sortedPosts.map((post) => post.author.id),
    ...friends.map((friend) => friend.user_id || friend.id),
    ...(selectedPost
      ? Object.values(selectedPost.likesByUser).map((entry) => entry.userId)
      : []),
  ]);

  // Real-time story subscriptions — fire immediately and keep circles live
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      void subscribeToFriendsStories(currentUser.userId);
      void subscribeToUserStories(currentUser.userId);
    }
    return () => {
      unsubscribeFromAllStories();
    };
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

  // Cleanup expired story docs from Firestore every 5 minutes.
  // The onSnapshot subscription picks up the deletions automatically — no manual reload needed.
  useEffect(() => {
    if (currentUser.userId === "me") return;

    const interval = setInterval(
      () => {
        useStoryStore.getState().cleanupExpiredStories(currentUser.userId);
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [currentUser.userId]);

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

  // Reset spinner whenever the tab becomes inactive so it never shows on return
  useEffect(() => {
    if (!isActive) {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
      exhaustedLoadAttemptsRef.current = 0;
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    hasScrolledSinceFeedActivatedRef.current = false;
    const markScrolled = () => {
      hasScrolledSinceFeedActivatedRef.current = true;
    };

    window.addEventListener("scroll", markScrolled, { passive: true });
    window.addEventListener("wheel", markScrolled, { passive: true });
    window.addEventListener("touchmove", markScrolled, { passive: true });

    return () => {
      window.removeEventListener("scroll", markScrolled);
      window.removeEventListener("wheel", markScrolled);
      window.removeEventListener("touchmove", markScrolled);
    };
  }, [isActive]);

  useEffect(() => {
    postsCountRef.current = sortedPosts.length;
    if (sortedPosts.length === 0) {
      exhaustedLoadAttemptsRef.current = 0;
      setHasMorePosts(true);
    }
  }, [sortedPosts.length]);

  // ── Infinite Scroll ──
  // Dependency array intentionally excludes isLoadingMore — use a ref instead
  // so state updates never recreate the observer (which re-fires it immediately).
  useEffect(() => {
    if (!isActive || !hasMorePosts) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel || sortedPosts.length === 0) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (
          entries[0].isIntersecting &&
          hasScrolledSinceFeedActivatedRef.current &&
          !isLoadingMoreRef.current
        ) {
          const beforeCount = postsCountRef.current;
          isLoadingMoreRef.current = true;
          setIsLoadingMore(true);
          try {
            await loadMorePosts();
          } finally {
            const afterCount = postsCountRef.current;
            if (afterCount <= beforeCount) {
              exhaustedLoadAttemptsRef.current += 1;
              if (exhaustedLoadAttemptsRef.current >= 2) {
                setHasMorePosts(false);
              }
            } else {
              exhaustedLoadAttemptsRef.current = 0;
            }

            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
          }
        }
      },
      { rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMorePosts, isActive, sortedPosts.length, loadMorePosts]);

  useBodyScrollLock(
    showLikesModal ||
      showCommentsModal ||
      showShareModal ||
      showStoryUploadModal ||
      showStoryViewerModal,
  );

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

  useEffect(() => {
    if (
      !showStoryUploadModal ||
      storyUploadMode !== "dedication" ||
      !user?.id ||
      friends.length > 0
    ) {
      return;
    }

    let isMounted = true;
    setLoadingFriends(true);
    friendsService
      .getFriends(user.id)
      .then((response) => {
        if (isMounted) setFriends(response || []);
      })
      .catch((error) => {
        console.error("Failed to load friends for story dedication:", error);
        if (isMounted) setFriends([]);
      })
      .finally(() => {
        if (isMounted) setLoadingFriends(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    showStoryUploadModal,
    storyUploadMode,
    user?.id,
    friends.length,
  ]);

  useEffect(() => {
    storyDraftPreviewUrlsRef.current = storyDraftPreviewUrls;
  }, [storyDraftPreviewUrls]);

  useEffect(() => {
    return () => {
      storyDraftPreviewUrlsRef.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
    };
  }, []);

  const handleYourStoryClick = () => {
    if (userStories.length > 0) {
      // Show user's own stories; owner = true so delete button appears
      setSelectedStoryIndex(0);
      setViewerStories(userStories);
      setViewerIsOwner(true);
      setViewerStoryAuthorId(currentUser.userId);
      setShowStoryViewerModal(true);
      onStoryViewerOpenChange?.(true);
    } else {
      openStoryComposer();
    }
  };

  const openStoryComposer = () => {
    setStoryUploadMode(null);
    setDedicationRecipient(null);
    clearStoryDraft();
    setShowStoryUploadModal(true);
  };

  const closeStoryComposer = () => {
    if (isUploading) return;
    setShowStoryUploadModal(false);
    setStoryUploadMode(null);
    setDedicationRecipient(null);
    clearStoryDraft();
  };

  const clearStoryDraft = () => {
    storyDraftPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setStoryDraftFiles([]);
    setStoryDraftPreviewUrls([]);
    setSelectedStoryDraftIndex(0);
    setStoryDraftText("");
    setStoryDraftTextColor("#ffffff");
    setStoryDraftTextX(50);
    setStoryDraftTextY(50);
    setStoryDraftTextSize(22);
    setIsStoryTextDragging(false);
    setStoryDraftFilter("original");
    setStoryDraftMusicId("none");
    storyFilterTouchStartXRef.current = null;
  };

  const setStoryFilterByOffset = (offset: number) => {
    const currentIndex = STORY_FILTER_PRESETS.findIndex(
      (filter) => filter.id === storyDraftFilter,
    );
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeIndex + offset + STORY_FILTER_PRESETS.length) %
      STORY_FILTER_PRESETS.length;
    setStoryDraftFilter(STORY_FILTER_PRESETS[nextIndex].id);
  };

  const updateStoryTextPosition = (clientX: number, clientY: number) => {
    const preview = storyDraftPreviewRef.current;
    if (!preview) return;

    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nextX = ((clientX - rect.left) / rect.width) * 100;
    const nextY = ((clientY - rect.top) / rect.height) * 100;
    setStoryDraftTextX(Math.min(92, Math.max(8, nextX)));
    setStoryDraftTextY(Math.min(88, Math.max(12, nextY)));
  };

  const handleStoryTextPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setIsStoryTextDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updateStoryTextPosition(event.clientX, event.clientY);
  };

  const handleStoryTextPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryTextDragging) return;
    event.preventDefault();
    event.stopPropagation();
    updateStoryTextPosition(event.clientX, event.clientY);
  };

  const handleStoryTextPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setIsStoryTextDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleStoryClick = async (index: number) => {
    const storyGroup = storyGroups[index];
    if (!storyGroup) return;

    const firstUnviewedIndex = storyGroup.stories.findIndex(
      (story) => !story.hasViewed,
    );
    const nextSelectedIndex = firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0;
    const nextViewerStories = storyGroup.stories.map((story, storyIndex) =>
      storyIndex === nextSelectedIndex ? { ...story, hasViewed: true } : story,
    );

    setSelectedStoryIndex(nextSelectedIndex);
    setViewerStories(nextViewerStories);
    setViewerIsOwner(false);
    setViewerStoryAuthorId(storyGroup.authorId);
    setShowStoryViewerModal(true);
    onStoryViewerOpenChange?.(true);

    const story = storyGroup.stories[nextSelectedIndex];
    if (story && !story.hasViewed) {
      await markStoryAsViewed(story.id, currentUser.userId);
    }
  };

  const handleStoryUpload = async (files: File[]) => {
    try {
      if (files.length === 0) return;
      if (storyUploadMode === "dedication" && !dedicationRecipient) {
        alert("Pick who this story is for first.");
        return;
      }

      useStoryStore.setState({ isUploading: true, uploadProgress: 0 });
      let createdCount = 0;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const mediaUrl = await storyService.uploadStoryMedia(file, (percent) => {
          const overallProgress = Math.round(
            ((index + percent / 100) / files.length) * 100,
          );
          useStoryStore.setState({ uploadProgress: overallProgress });
        });
        const mediaType = file.type.startsWith("video/") ? "video" : "image";

        const request: CreateStoryDTO = {
          mediaUrl,
          mediaType,
          storyType: storyUploadMode || "personal",
          dedicatedToUserId:
            storyUploadMode === "dedication"
              ? dedicationRecipient?.user_id || dedicationRecipient?.id
              : null,
          storyText: storyDraftText.trim()
            ? {
                text: storyDraftText.trim().slice(0, 120),
                color: storyDraftTextColor,
                style: "bold",
                xPct: Math.round(storyDraftTextX),
                yPct: Math.round(storyDraftTextY),
                fontSize: storyDraftTextSize,
              }
            : null,
          storyFilter: storyDraftFilter,
          storyMusic:
            storyDraftMusicId === "none"
              ? null
              : {
                  id: storyDraftMusicId,
                  label: getStoryMusicPreset(storyDraftMusicId).label,
                },
        };

        const newStory = await storyService.createStory(
          currentUser.userId,
          request,
        );
        if (newStory) createdCount += 1;
      }

      useStoryStore.setState({ uploadProgress: 100, isUploading: false });
      window.setTimeout(
        () => useStoryStore.setState({ uploadProgress: 0 }),
        1000,
      );

      if (createdCount > 0) {
        await useStoryStore.getState().loadUserStories(currentUser.userId);
        closeStoryComposer();
      }
    } catch (error) {
      console.error("Error uploading story:", error);
      // Show user-friendly error message
      alert(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Reset upload progress
      useStoryStore.setState({ isUploading: false, uploadProgress: 0 });
    }
  };

  const openStoryFilePicker = () => {
    if (isUploading) return;
    if (storyUploadMode === "dedication" && !dedicationRecipient) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0 && !isUploading) {
        storyDraftPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        setStoryDraftFiles(files);
        setStoryDraftPreviewUrls(files.map((file) => URL.createObjectURL(file)));
        setSelectedStoryDraftIndex(0);
      }
    };
    input.click();
  };

  const publishStoryDraft = async () => {
    if (storyDraftFiles.length === 0 || isUploading) return;
    await handleStoryUpload(storyDraftFiles);
  };

  const handleDeleteStory = async (storyId: string) => {
    await deleteStory(storyId, currentUser.userId);
    // Close viewer if no more stories left
    const remaining = userStories.filter((s) => s.id !== storyId);
    if (remaining.length === 0) {
      setShowStoryViewerModal(false);
      setViewerStoryAuthorId(null);
      onStoryViewerOpenChange?.(false);
    } else {
      // Stay on previous index if possible
      setViewerStories(remaining);
      setSelectedStoryIndex((prev) => Math.min(prev, remaining.length - 1));
    }
  };

  useEffect(() => {
    if (!showStoryViewerModal) return;
    if (viewerIsOwner) {
      setViewerStories(sortStoriesForPlayback(userStories));
      setSelectedStoryIndex((prev) =>
        Math.min(prev, Math.max(userStories.length - 1, 0)),
      );
      return;
    }

    if (!viewerStoryAuthorId) return;

    const nextViewerStories = sortStoriesForPlayback(
      stories.filter((story) => story.author.id === viewerStoryAuthorId),
    );

    if (nextViewerStories.length === 0) {
      setShowStoryViewerModal(false);
      setViewerStoryAuthorId(null);
      onStoryViewerOpenChange?.(false);
      return;
    }

    setViewerStories(nextViewerStories);
    setSelectedStoryIndex((prev) =>
      Math.min(prev, nextViewerStories.length - 1),
    );
  }, [
    showStoryViewerModal,
    viewerIsOwner,
    viewerStoryAuthorId,
    userStories,
    stories,
    onStoryViewerOpenChange,
  ]);

  // ── Story reaction handler ──
  // Uses a deterministic Firestore doc ID so no reads are needed —
  // setDoc just overwrites on double-tap, and deleteDoc removes on toggle-off.
  const handleStoryReact = useCallback(
    async (storyId: string, authorId: string, type: "like" | "hate") => {
      if (!currentUser.userId || authorId === currentUser.userId) return null;

      try {
        const result = await storyReactionService.toggleReaction(
          storyId,
          currentUser.userId,
          type,
        );

        if (!result.success) {
          throw new Error("Failed to save story reaction");
        }

        if (result.currentReaction) {
          await alertService.createAlert({
            userId: authorId,
            type: "STORY_REACTION",
            entityId: storyId,
            actorId: currentUser.userId,
            actorName: currentUser.name,
            actorUsername: currentUser.username,
            actorAvatar: currentUser.avatar,
            message: `${currentUser.name} ${result.currentReaction === "like" ? "liked" : "hated"} your story`,
            metadata: {
              reactionType: result.currentReaction,
            },
          });
        }

        return result.currentReaction;
      } catch (err) {
        console.error("Story reaction failed:", err);
        return null;
      }
    },
    [currentUser],
  );

  // ── Story reply handler ──
  // Gets or creates a DM conversation then sends the reply text.
  const handleStoryReply = useCallback(
    async (storyId: string, authorId: string, text: string) => {
      if (
        !text.trim() ||
        !currentUser.userId ||
        authorId === currentUser.userId
      )
        return;
      try {
        const convId = await getOrCreateConversation(
          currentUser.userId,
          authorId,
        );
        const story = viewerStories.find((item) => item.id === storyId);
        const previewUrl = story ? await createStoryReplyPreviewUrl(story) : "";
        const storyPayload = story
          ? buildSharedStoryPayload(story, text.trim(), previewUrl)
          : null;
        const encodedStoryPayload = storyPayload
          ? encodeSharedStoryPayload(storyPayload)
          : "";
        const safeStoryPayload =
          encodedStoryPayload.length <= STORY_REPLY_ENCODED_PAYLOAD_LIMIT
            ? encodedStoryPayload
            : "";

        await sendRealTimeMessage(
          convId,
          safeStoryPayload ? SHARED_STORY_FALLBACK_TEXT : text.trim(),
          safeStoryPayload || undefined,
          safeStoryPayload ? "TEXT" : undefined,
        );
        const { alertService } =
          await import("../../middleware/services/service-factory");
        await alertService.createAlert({
          userId: authorId,
          type: "STORY_REPLY",
          entityId: storyId,
          actorId: currentUser.userId,
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          actorAvatar: currentUser.avatar,
          message: `${currentUser.name} replied to your story`,
          metadata: { replyText: text.trim() },
        });
      } catch (err) {
        console.error("Story reply failed:", err);
      }
    },
    [currentUser, getOrCreateConversation, sendRealTimeMessage, viewerStories],
  );

  const handleGhostDebugCheck = useCallback(async () => {
    if (!user?.id) return;

    setGhostDebugLoading(true);

    try {
      const backendStatus = await ghostModeService.getGhostModeStatus(user.id);
      setGhostDebugText(
        `UI:${ghostModeIsActive ? "ON" : "OFF"} | backend:${
          backendStatus.isActive ? "ON" : "OFF"
        }${backendStatus.expiresAt ? ` | until ${new Date(backendStatus.expiresAt).toLocaleTimeString()}` : ""}`,
      );
    } catch (error) {
      setGhostDebugText("UI check failed");
    } finally {
      setGhostDebugLoading(false);
    }
  }, [ghostModeIsActive, user?.id]);

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

      // Track like count for animation trigger (every 10 likes)
      setLikeCounts((prev) => {
        const newCount = (prev[postId] || 0) + 1;
        const updated = { ...prev, [postId]: newCount };
        console.log(`Like count for post ${postId}: ${newCount}`);

        // Trigger animation every 10 likes
        if (newCount % 10 === 0) {
          console.log(
            `Triggering animation for post ${postId} at count ${newCount}`,
          );
          setAnimatingPosts((prev) => {
            const newSet = new Set(prev).add(postId);
            console.log(`Animating posts:`, Array.from(newSet));
            return newSet;
          });
          // Remove animation class after animation completes
          setTimeout(() => {
            setAnimatingPosts((prev) => {
              const next = new Set(prev);
              next.delete(postId);
              console.log(`Removing animation for post ${postId}`);
              return next;
            });
          }, 1800); // Animation duration
        }

        return updated;
      });
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
      if (!selectedPost || !user?.id) {
        return;
      }

      const recipientId = friend.user_id || friend.id;
      if (
        !recipientId ||
        sentTo.has(recipientId) ||
        sendingRecipientId === recipientId
      ) {
        return;
      }

      const payload = buildSharedPostPayload({
        ...selectedPost,
        author: resolveAuthor(selectedPost.author),
      });
      if (!payload) {
        return;
      }

      setSendingRecipientId(recipientId);
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
      } finally {
        setSendingRecipientId((current) =>
          current === recipientId ? null : current,
        );
      }
    },
    [
      selectedPost,
      user?.id,
      sentTo,
      sendingRecipientId,
      resolveAuthor,
      getOrCreateConversation,
      sendRealTimeMessage,
    ],
  );

  // Only skeleton-gate when there are genuinely no posts to show.
  // If posts are already in memory (from a previous load or persist cache),
  // render them immediately and let the background subscription refresh silently.
  const isFeedBootstrapping = feedBootstrapping && sortedPosts.length === 0;

  return (
    <div
      className="screen-container"
      style={{
        paddingBottom: "120px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes premiumBorderSweep {
          0% {
            opacity: 0;
            transform: rotate(0deg) scale(0.96);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: rotate(360deg) scale(1.08);
          }
        }
        @keyframes premiumCardGlow {
          0% {
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 0 1px rgba(74, 222, 128, 0.08);
            transform: translateY(0);
          }
          35% {
            box-shadow:
              0 22px 52px rgba(0, 0, 0, 0.4),
              0 0 0 1px rgba(74, 222, 128, 0.22),
              0 0 34px rgba(34, 197, 94, 0.18);
            transform: translateY(-2px);
          }
          100% {
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 0 1px rgba(74, 222, 128, 0.08);
            transform: translateY(0);
          }
        }
        .premium-card-burst {
          animation: premiumCardGlow 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-card-ring {
          position: absolute;
          inset: -1px;
          border-radius: 26px;
          padding: 1px;
          background:
            linear-gradient(130deg,
              rgba(250, 204, 21, 0.12),
              rgba(74, 222, 128, 0.95),
              rgba(16, 185, 129, 0.85),
              rgba(250, 204, 21, 0.14));
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          pointer-events: none;
        }
        .premium-card-burst .premium-card-ring {
          animation: premiumBorderSweep 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-card-glow {
          position: absolute;
          inset: -18px;
          border-radius: 32px;
          background:
            radial-gradient(circle at 20% 20%, rgba(250, 204, 21, 0.1), transparent 34%),
            radial-gradient(circle at 80% 25%, rgba(74, 222, 128, 0.18), transparent 38%),
            radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.12), transparent 42%);
          opacity: 0;
          filter: blur(18px);
          pointer-events: none;
        }
        .premium-card-burst .premium-card-glow {
          animation: premiumBorderSweep 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>
      {/* ── Header ── */}
      <div
        className={`safe-area-top border-b border-white/8 bg-[linear-gradient(180deg,rgba(3,6,4,0.96)_0%,rgba(0,0,0,0.94)_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-in-out ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="p-4">
          <div className="relative flex items-center justify-between">
            <div className="z-10 flex items-center gap-3">
              <button
                onClick={onNavigateToSearch}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8 hover:text-white"
                aria-label="Search"
              >
                <Search size={18} />
              </button>
              <button
                onClick={onNavigateToDaily}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8 hover:text-white"
                aria-label="Daily challenge"
              >
                <Sparkles size={18} />
              </button>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2">
              <GhostModeTimer />
            </div>
            {/*
            <div className="absolute left-12 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => void handleGhostDebugCheck()}
                className="rounded-full border border-[#4ade80]/30 bg-[#071109]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#86efac] shadow-[0_8px_20px_rgba(0,0,0,0.28)] transition-all duration-200 hover:border-[#4ade80]/55 hover:bg-[#0b1a0d]"
              >
                {ghostDebugLoading ? "Checking..." : "Ghost Check"}
              </button>
            </div>
            */}
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center space-x-3">
              <button
                onClick={() => {
                  if (alertUnreadCount > 0) {
                    markAllAsRead().catch(() => {});
                  }
                  onNavigateToAlerts();
                }}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#fb7185]/30 hover:bg-[#fb7185]/8 hover:text-white"
                aria-label="Notifications"
              >
                <Heart size={18} />
                {alertUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-md">
                    {alertUnreadCount > 99 ? "99+" : alertUnreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={onNavigateToChat}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8 hover:text-white"
                aria-label="Messages"
              >
                <MessageSquare size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-[#4ade80] px-1.5 py-0.5 text-[10px] font-bold leading-none text-black shadow-md">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
        {ghostDebugText && (
          <div className="px-4 pb-3">
            <div className="rounded-full border border-[#4ade80]/20 bg-[#08110b]/90 px-3 py-2 text-center text-[11px] font-medium text-[#bbf7d0] shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
              {ghostDebugText}
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
        }}
      >
        {/* ── Stories row ── */}
        <div className="px-4 py-6">
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide">
            {/* Your Story Circle */}
            <div
              className="shrink-0 flex flex-col items-center cursor-pointer group"
              onClick={handleYourStoryClick}
            >
              <div className="relative">
                <div className="absolute inset-0 h-[84px] w-[84px] rounded-full opacity-0 blur-sm group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-full h-full rounded-full border-2 border-[#4ade80]/25" />
                </div>
                {userStories.length > 0 ? (
                  // User has active stories — show profile picture avatar with green ring
                  <div className="relative h-[84px] w-[84px] rounded-full bg-gradient-to-br from-[#4ade80] via-[#34d399] to-[#facc15] p-[3px] shadow-[0_18px_40px_rgba(10,14,12,0.45)] transition-all duration-300 group-hover:scale-[1.04]">
                    <div className="w-full h-full rounded-full bg-[#050505] p-[3px]">
                      <img
                        src={currentUser.avatar}
                        alt="Your story"
                        className="w-full h-full rounded-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  // No stories — show add button
                  <div className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,#20242c_0%,#121417_55%,#090909_100%)] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] group-hover:border-[#4ade80]/60">
                    <Plus
                      size={28}
                      className="text-[#4ade80] transition-transform duration-300 group-hover:scale-110"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openStoryComposer();
                  }}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-gradient-to-br from-[#4ade80] to-[#22c55e] shadow-md transition-transform duration-300 group-hover:scale-110"
                  aria-label="Create story"
                >
                  <Plus size={12} className="text-black" />
                </button>
              </div>
              <span className="text-sm text-[#94a3b8] mt-3 block w-[84px] truncate text-center font-medium transition-colors duration-300 group-hover:text-white">
                Your Story
              </span>
            </div>

            {/* Shimmer skeleton circles while stories are loading and no cached data */}
            {storiesLoading &&
              stories.length === 0 &&
              [1, 2, 3, 4].map((i) => (
                <div
                  key={`story-skel-${i}`}
                  className="shrink-0 flex flex-col items-center"
                >
                  <div className="h-[84px] w-[84px] animate-pulse rounded-full bg-[#1e1e1e]" />
                  <div className="w-14 h-2.5 bg-[#1e1e1e] rounded-full mt-3 animate-pulse" />
                </div>
              ))}

            {/* Friends' Stories — real-time from Firestore onSnapshot */}
            {storyGroups.map((storyGroup, index) => {
              const story = storyGroup.displayStory;
              const hasViewed = storyGroup.hasViewed;
              if (!story) return null;

              return (
              <div
                key={storyGroup.authorId}
                className="shrink-0 flex flex-col items-center group"
              >
                <button
                  type="button"
                  className="relative h-[84px] w-[84px] cursor-pointer"
                  onClick={() => handleStoryClick(index)}
                >
                  {!hasViewed && (
                    <div className="absolute inset-0 h-[84px] w-[84px] rounded-full opacity-0 blur-sm group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-full h-full rounded-full border-2 border-[#4ade80]/35" />
                    </div>
                  )}
                  <div
                    className={`relative h-[84px] w-[84px] rounded-full p-[3px] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] ${
                      hasViewed
                        ? "bg-gradient-to-br from-[#2b2f35] via-[#353941] to-[#44474f]"
                        : story.storyType === "dedication"
                          ? "bg-gradient-to-br from-[#facc15] via-[#4ade80] to-[#38bdf8]"
                          : "bg-gradient-to-br from-[#facc15] via-[#fb7185] to-[#4ade80]"
                    }`}
                  >
                    <div
                      className={`w-full h-full rounded-full ${
                        hasViewed ? "bg-[#111315]" : "bg-[#050505]"
                      } p-[3px]`}
                    >
                      <div className="w-full h-full rounded-full overflow-hidden">
                        <Avatar
                          src={story.author.avatar}
                          alt={story.author.displayName}
                          size="2xl"
                          userId={story.author.id}
                          username={story.author.username}
                          forceGhostMode={ghostModesByUserId[story.author.id]}
                          className="!h-full !w-full"
                        />
                      </div>
                    </div>
                  </div>
                  {!hasViewed && (
                    <div className="absolute -bottom-1 -right-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-[#4ade80]/70 bg-[#08110b] px-1 shadow-lg transition-transform duration-300 group-hover:scale-105">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#86efac]">
                        New
                      </span>
                    </div>
                  )}
                </button>
                {story.storyType === "dedication" && story.dedicatedTo ? (
                  <div className="mt-3 flex w-[84px] items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onNavigateToProfile?.(story.author.id)}
                      className="shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
                      aria-label={`Open ${story.author.displayName}'s profile`}
                    >
                      <Avatar
                        src={story.author.avatar}
                        alt={story.author.displayName}
                        size={17}
                        userId={story.author.id}
                        username={story.author.username}
                        forceGhostMode={ghostModesByUserId[story.author.id]}
                        className="ring-1 ring-white/20"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStoryClick(index)}
                      className="flex h-4 w-3 shrink-0 items-center justify-center text-[#86efac] transition-transform hover:scale-110 active:scale-95"
                      aria-label="Open dedicated story"
                    >
                      <Play size={9} fill="currentColor" strokeWidth={0} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateToProfile?.(story.dedicatedTo!.id)
                      }
                      className="shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
                      aria-label={`Open ${story.dedicatedTo.displayName}'s profile`}
                    >
                      <Avatar
                        src={story.dedicatedTo.avatar}
                        alt={story.dedicatedTo.displayName}
                        size={17}
                        userId={story.dedicatedTo.id}
                        username={story.dedicatedTo.username}
                        forceGhostMode={ghostModesByUserId[story.dedicatedTo.id]}
                        className="ring-1 ring-[#4ade80]/70"
                      />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToProfile && story.author.id) {
                        onNavigateToProfile(story.author.id);
                      }
                    }}
                    className={`mt-3 block w-[84px] truncate text-center text-sm font-medium transition-colors duration-300 ${
                      hasViewed
                        ? "text-[#6b7280]"
                        : "text-[#d1d5db] group-hover:text-white"
                    } ${
                      onNavigateToProfile && story.author.id
                        ? "cursor-pointer hover:text-[#4ade80]"
                        : "cursor-default"
                    }`}
                  >
                    {stripAtSymbol(story.author.username)}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {/* ── Posts ── show only the most recent post per user */}
        {isFeedBootstrapping ? (
          <div className="px-2 pb-6 space-y-5">
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </div>
        ) : (
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
                  className={`relative overflow-hidden rounded-3xl bg-[#111] ${
                    animatingPosts.has(post.id) ? "premium-card-burst" : ""
                  }`}
                >
                  <div className="premium-card-glow" />
                  <div className="premium-card-ring" />
                  {/* Post header */}
                  <div className="flex items-center px-3 pt-3 pb-3">
                    <div className="flex w-full items-center space-x-3 rounded-full bg-gradient-to-r from-[#1a1f1a]/90 to-[#141714]/90 px-5 py-2.5 pr-7 backdrop-blur-md border border-white/12 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                      <Avatar
                        src={author.avatar}
                        alt={author.name}
                        size="md"
                        userId={author.id}
                        username={author.username}
                        forceGhostMode={
                          author.id ? ghostModesByUserId[author.id] : undefined
                        }
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
                        className="w-full relative cursor-pointer rounded-3xl overflow-hidden"
                        onClick={(e) => handleMediaTap(post.id, e)}
                      >
                        {post.media.type === "image" ? (
                          <img
                            src={post.media.url}
                            alt="Post media"
                            className="w-full object-cover"
                            style={{ height: "500px" }}
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
                            style={{ height: "500px" }}
                          >
                            <span className="text-[#94a3b8] text-2xl">
                              🎥 Video
                            </span>
                          </div>
                        ) : (
                          <div
                            className="w-full bg-gradient-to-br from-[#4ade80]/10 via-[#22c55e]/10 to-[#16a34a]/10 flex items-center justify-center rounded-3xl"
                            style={{ height: "500px" }}
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
                        aria-label="Share to DM"
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
        )}
      </div>

      {/* ══════════════════════════════════════════
          COMMENTS MODAL
      ══════════════════════════════════════════ */}
      {showCommentsModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
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
            className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col overflow-hidden"
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
                autoFocusInput={false}
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
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
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
            className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col"
            style={{
              maxHeight: "98vh",
              minHeight: "60vh",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
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
                        forceGhostMode={
                          entry.userId
                            ? ghostModesByUserId[entry.userId]
                            : undefined
                        }
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
      {sortedPosts.length > 0 && hasMorePosts && (
        <>
          <div
            ref={loadMoreRef}
            aria-hidden="true"
            className="h-px w-full pointer-events-none"
          />
          {isLoadingMore && (
            <div className="px-4 pb-6 pt-2">
              <div className="flex items-center justify-center">
                <div className="rounded-full border border-white/8 bg-[#111] px-5 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                  <div className="w-6 h-6 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          SHARE MODAL
      ══════════════════════════════════════════ */}
      {showShareModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
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
            className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col"
            style={{
              height: "min(86dvh, 760px)",
              maxHeight: "calc(100dvh - 12px)",
              touchAction: "pan-y",
              overflow: "hidden",
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
            <div
              className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-2"
              style={{
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorY: "contain",
                touchAction: "pan-y",
              }}
            >
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
                  const sending =
                    !!recipientId && sendingRecipientId === recipientId;
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
                        forceGhostMode={
                          friend.user_id
                            ? ghostModesByUserId[friend.user_id]
                            : undefined
                        }
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
                        disabled={!recipientId || sent || sending}
                        className={`min-w-[104px] justify-center px-5 py-2 rounded-full text-base font-semibold transition-all duration-200 flex items-center space-x-2 ${sent ? "bg-[#2a2a2a] text-[#64748b] cursor-default" : sending ? "bg-[#d9fbe5] text-[#18532c] cursor-wait" : "bg-[#4ade80] text-black hover:bg-[#22c55e] active:scale-95"} disabled:bg-[#2a2a2a] disabled:text-[#64748b] disabled:cursor-default`}
                      >
                        {sent ? (
                          <span>Sent ✓</span>
                        ) : sending ? (
                          <span>Sending...</span>
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
          className="app-modal-backdrop fixed inset-0 bg-black/75 z-[100] flex items-end backdrop-blur-sm"
          onClick={closeStoryComposer}
        >
          <div
            className="app-modal-sheet max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,22,20,0.98),rgba(8,9,8,0.98))] p-5 shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] scrollbar-hide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-6" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#86efac]">
                  Story
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  {storyUploadMode === "dedication"
                    ? "Dedicate a story"
                    : storyUploadMode === "personal"
                      ? "Personal story"
                      : "Create story"}
                </h3>
              </div>
              {storyUploadMode && !isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    setStoryUploadMode(null);
                    setDedicationRecipient(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                  aria-label="Back"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {isUploading && (
                <div className="rounded-[24px] border border-[#4ade80]/15 bg-[#08110b]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">
                      Uploading {storyDraftFiles.length > 1 ? "stories" : "story"}
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

              {storyDraftFile && storyDraftPreviewUrl && (
                <div className="space-y-4">
                  {storyDraftFiles.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {storyDraftFiles.map((file, index) => (
                        <button
                          key={`${file.name}-${file.lastModified}-${index}`}
                          type="button"
                          onClick={() => setSelectedStoryDraftIndex(index)}
                          className={`relative h-16 w-11 shrink-0 overflow-hidden rounded-xl border transition-all ${
                            selectedStoryDraftIndex === index
                              ? "border-[#4ade80] ring-2 ring-[#4ade80]/25"
                              : "border-white/10"
                          }`}
                          aria-label={`Preview story media ${index + 1}`}
                        >
                          {file.type.startsWith("video/") ? (
                            <video
                              src={storyDraftPreviewUrls[index]}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={storyDraftPreviewUrls[index]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-bold text-white">
                            {index + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    ref={storyDraftPreviewRef}
                    className="relative mx-auto aspect-[9/16] max-h-[54vh] w-full max-w-[300px] overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
                    onTouchStart={(event) => {
                      storyFilterTouchStartXRef.current =
                        event.touches[0].clientX;
                    }}
                    onTouchEnd={(event) => {
                      const startX = storyFilterTouchStartXRef.current;
                      storyFilterTouchStartXRef.current = null;
                      if (startX === null) return;
                      const dx = event.changedTouches[0].clientX - startX;
                      if (Math.abs(dx) < 45) return;
                      setStoryFilterByOffset(dx < 0 ? 1 : -1);
                    }}
                  >
                    {storyDraftFile.type.startsWith("video/") ? (
                      <video
                        src={storyDraftPreviewUrl}
                        className="h-full w-full object-contain object-center"
                        style={{
                          filter: getStoryFilterPreset(storyDraftFilter)
                            .cssFilter,
                        }}
                        muted
                        playsInline
                        autoPlay
                        loop
                      />
                    ) : (
                      <img
                        src={storyDraftPreviewUrl}
                        alt="Story preview"
                        className="h-full w-full object-contain object-center"
                        style={{
                          filter: getStoryFilterPreset(storyDraftFilter)
                            .cssFilter,
                        }}
                      />
                    )}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: getStoryFilterPreset(storyDraftFilter)
                          .overlay,
                      }}
                    />
                    {storyDraftText.trim() && (
                      <div
                        className={`absolute z-20 max-w-[86%] cursor-grab touch-none select-none text-center active:cursor-grabbing ${
                          isStoryTextDragging
                            ? "ring-2 ring-[#4ade80]/60"
                            : "ring-1 ring-white/12"
                        } rounded-2xl`}
                        style={{
                          left: `${storyDraftTextX}%`,
                          top: `${storyDraftTextY}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        onPointerDown={handleStoryTextPointerDown}
                        onPointerMove={handleStoryTextPointerMove}
                        onPointerUp={handleStoryTextPointerUp}
                        onPointerCancel={handleStoryTextPointerUp}
                      >
                        <span
                          className="inline-block max-w-full break-words rounded-2xl bg-black/28 px-3.5 py-2 font-black leading-tight shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                          style={{
                            color: storyDraftTextColor,
                            fontSize: `${storyDraftTextSize}px`,
                            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                          }}
                        >
                          {storyDraftText}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm">
                      {getStoryFilterPreset(storyDraftFilter).label}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-white/[0.035] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[#d1d5db]">
                      <Type size={15} className="text-[#4ade80]" />
                      <span className="text-xs font-bold uppercase tracking-[0.16em]">
                        Text
                      </span>
                    </div>
                    <input
                      value={storyDraftText}
                      maxLength={120}
                      onChange={(event) => setStoryDraftText(event.target.value)}
                      placeholder="Add text"
                      className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/45"
                    />
                    <div className="mt-3 flex gap-2">
                      {STORY_TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setStoryDraftTextColor(color)}
                          className={`h-7 w-7 rounded-full border-2 transition-transform ${
                            storyDraftTextColor === color
                              ? "scale-110 border-white"
                              : "border-white/15"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Use text color ${color}`}
                        />
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#cbd5e1]">
                          Text size
                        </span>
                        <span className="text-xs font-bold text-[#86efac]">
                          {storyDraftTextSize}px
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setStoryDraftTextSize((size) =>
                              Math.max(16, size - 2),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-lg font-bold text-white"
                          aria-label="Decrease story text size"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={16}
                          max={42}
                          value={storyDraftTextSize}
                          onChange={(event) =>
                            setStoryDraftTextSize(Number(event.target.value))
                          }
                          className="min-w-0 flex-1 accent-[#4ade80]"
                          aria-label="Story text size"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setStoryDraftTextSize((size) =>
                              Math.min(42, size + 2),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-lg font-bold text-white"
                          aria-label="Increase story text size"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-[#64748b]">
                        Drag the text on the preview to place it.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                      <Wand2 size={14} className="text-[#4ade80]" />
                      Swipe preview or tap a filter
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {STORY_FILTER_PRESETS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setStoryDraftFilter(filter.id)}
                          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                            storyDraftFilter === filter.id
                              ? "border-[#4ade80]/55 bg-[#4ade80]/15 text-[#bbf7d0]"
                              : "border-white/8 bg-white/[0.04] text-[#cbd5e1]"
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                      <Music size={14} className="text-[#facc15]" />
                      Generated copyright-free music
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {STORY_MUSIC_PRESETS.map((music) => (
                        <button
                          key={music.id}
                          type="button"
                          onClick={() => setStoryDraftMusicId(music.id)}
                          className={`rounded-[18px] border p-3 text-left transition-all ${
                            storyDraftMusicId === music.id
                              ? "border-[#4ade80]/45 bg-[#4ade80]/10"
                              : "border-white/8 bg-white/[0.035]"
                          }`}
                        >
                          <p className="text-sm font-bold text-white">
                            {music.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                            {music.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!storyUploadMode && !storyDraftFile && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStoryUploadMode("personal")}
                    className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80] shadow-[0_12px_28px_rgba(74,222,128,0.12)]">
                      <UserRound size={20} />
                    </div>
                    <p className="font-bold text-white">Personal</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                      Your regular story.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoryUploadMode("dedication")}
                    className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#facc15]/35 hover:bg-[#facc15]/8"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#facc15]/20 bg-[#facc15]/10 text-[#facc15] shadow-[0_12px_28px_rgba(250,204,21,0.12)]">
                      <Gift size={20} />
                    </div>
                    <p className="font-bold text-white">Dedication</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                      Pick one person.
                    </p>
                  </button>
                </div>
              )}

              {storyUploadMode === "dedication" && !storyDraftFile && (
                <div className="space-y-3">
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                    {loadingFriends ? (
                      [1, 2, 3].map((item) => (
                        <div
                          key={`dedication-friend-skel-${item}`}
                          className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.035] p-3"
                        >
                          <div className="h-11 w-11 animate-pulse rounded-full bg-white/10" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
                            <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/8" />
                          </div>
                        </div>
                      ))
                    ) : friends.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-center text-sm text-[#94a3b8]">
                        No friends available
                      </div>
                    ) : (
                      friends.map((friend) => {
                        const friendId = friend.user_id || friend.id;
                        const selected =
                          dedicationRecipient &&
                          (dedicationRecipient.user_id ||
                            dedicationRecipient.id) === friendId;

                        return (
                          <button
                            key={friendId}
                            type="button"
                            onClick={() => setDedicationRecipient(friend)}
                            className={`flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition-all ${
                              selected
                                ? "border-[#4ade80]/45 bg-[#4ade80]/10 shadow-[0_12px_30px_rgba(74,222,128,0.12)]"
                                : "border-white/8 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.055]"
                            }`}
                          >
                            <Avatar
                              src={friend.avatar_url || ""}
                              alt={friend.display_name || friend.username}
                              size="md"
                              userId={friendId}
                              username={friend.username}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">
                                {friend.display_name || friend.username}
                              </p>
                              <p className="truncate text-xs text-[#94a3b8]">
                                @{stripAtSymbol(friend.username)}
                              </p>
                            </div>
                            {selected && (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4ade80] text-black">
                                <Check size={15} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {storyUploadMode && !storyDraftFile && (
                <button
                  onClick={openStoryFilePicker}
                  disabled={
                    isUploading ||
                    (storyUploadMode === "dedication" && !dedicationRecipient)
                  }
                  className={`flex w-full items-center justify-center space-x-2 rounded-2xl py-4 font-semibold transition-colors ${
                    isUploading ||
                    (storyUploadMode === "dedication" && !dedicationRecipient)
                      ? "cursor-not-allowed bg-[#2a2a2a] text-[#64748b]"
                      : "bg-[#4ade80] text-black hover:bg-[#22c55e]"
                  }`}
                >
                  <ImagePlus size={20} />
                  <span>{isUploading ? "Uploading..." : "Select media"}</span>
                </button>
              )}
              {storyDraftFile && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={openStoryFilePicker}
                    disabled={isUploading}
                    className="rounded-2xl bg-[#2a2a2a] py-4 font-semibold text-white transition-colors hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:text-[#64748b]"
                  >
                    Change media
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishStoryDraft()}
                    disabled={isUploading}
                    className="rounded-2xl bg-[#4ade80] py-4 font-bold text-black transition-colors hover:bg-[#22c55e] disabled:cursor-not-allowed disabled:bg-[#2a2a2a] disabled:text-[#64748b]"
                  >
                    {isUploading
                      ? "Posting..."
                      : storyDraftFiles.length > 1
                        ? `Post ${storyDraftFiles.length} stories`
                        : "Post story"}
                  </button>
                </div>
              )}
              <button
                onClick={closeStoryComposer}
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
          STORY VIEWER
      ══════════════════════════════════════════ */}
      {showStoryViewerModal && viewerStories.length > 0 && (
        <StoryViewer
          stories={viewerStories}
          initialIndex={selectedStoryIndex}
          isOwner={viewerIsOwner}
          currentUserId={currentUser.userId}
          onClose={() => {
            setShowStoryViewerModal(false);
            setViewerStoryAuthorId(null);
            onStoryViewerOpenChange?.(false);
          }}
          onDelete={viewerIsOwner ? handleDeleteStory : undefined}
          onNavigateToProfile={onNavigateToProfile}
          onReact={!viewerIsOwner ? handleStoryReact : undefined}
          onReply={!viewerIsOwner ? handleStoryReply : undefined}
        />
      )}
    </div>
  );
}
