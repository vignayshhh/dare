import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { feedService } from "@/middleware/services/feed.service";
import { optimizedFeedService } from "@/middleware/services/feed.service.optimized";
import { authService } from "@/middleware/services/auth-v2.service";
import {
  closeFriendsService,
  surveillanceService,
} from "@/middleware/services/service-factory";
import { commentLikePersistence } from "@/utils/commentLikePersistence";
import {
  getResolvedDisplayName,
  getResolvedUsername,
} from "./profileDataStore";

export interface FeedPost {
  id: string;
  author: {
    id?: string;
    name: string;
    avatar: string;
    username: string;
  };
  content: string;
  media?: {
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
    duration?: string;
  };
  stats: { views: number };
  likesByUser: Record<
    string,
    {
      userId: string;
      name: string;
      username: string;
      avatar: string;
      tapCount: number;
    }
  >;
  comments: {
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
  }[];
  comments_count: number;
  likes_count?: number;
  commentsLoading?: boolean;
  likesLoading?: boolean;
  timestamp: string;
  taggedFriends?: string[];
}

interface PostsStore {
  // State
  posts: FeedPost[];
  userPosts: FeedPost[];
  loading: boolean;
  feedBootstrapping: boolean;
  loadingUserPosts: boolean;
  error: string | null;
  lastSyncedAt: number | null; // tracks when we last fetched from backend
  feedUnsubscribe: (() => void) | null;
  userPostsUnsubscribe: (() => void) | null;
  commentUnsubscribes: Record<string, () => void>;
  likeUnsubscribes: Record<string, () => void>;

  // Actions
  createPost: (postData: {
    content: string;
    media?: {
      type: "image" | "video" | "audio";
      url: string;
      thumbnail?: string;
      duration?: string;
    };
    taggedFriends?: string[];
  }) => Promise<void>;
  loadPosts: (userId?: string) => Promise<void>;
  loadUserPosts: (userId: string) => Promise<void>;
  loadMorePosts: () => Promise<void>;
  subscribeToFeed: (userId: string) => void;
  subscribeToUserPosts: (userId: string) => void;
  unsubscribeFromFeed: () => void;
  unsubscribeFromUserPosts: () => void;
  addLike: (postId: string, userId: string) => Promise<void>;
  removeLike: (postId: string, userId: string) => Promise<void>;
  deletePost: (postId: string, userId: string) => Promise<boolean>;
  addComment: (
    postId: string,
    comment: {
      userId: string;
      name: string;
      username: string;
      avatar: string;
      text: string;
      parentId?: string | null;
    },
  ) => Promise<void>;
  likeComment: (postId: string, commentId: string) => Promise<void>;
  subscribeToPostComments: (postId: string) => void;
  unsubscribeFromPostComments: (postId: string) => void;
  subscribeToPostLikes: (postId: string) => void;
  unsubscribeFromPostLikes: (postId: string) => void;
  incrementViews: (postId: string) => void;
  clearPersistedData: () => void;
}

type PostCollectionsState = Pick<PostsStore, "posts" | "userPosts">;

const updatePostInCollections = (
  state: PostCollectionsState,
  postId: string,
  updater: (post: FeedPost) => FeedPost,
): PostCollectionsState => ({
  posts: state.posts.map((post) => (post.id === postId ? updater(post) : post)),
  userPosts: state.userPosts.map((post) =>
    post.id === postId ? updater(post) : post,
  ),
});

const getCurrentUserDisplay = () => {
  const current = authService.getCurrentUser();

  if (!current) {
    return {
      userId: "anonymous",
      name: "You",
      username: "@you",
      avatar: "", // Use actual avatar, no fallback
    };
  }

  // Use resolved names from profileDataStore (picks up latest changes)
  const resolvedName = getResolvedDisplayName(
    current.displayName || current.username,
    current.id,
    current.username,
  );
  const resolvedUsername = getResolvedUsername(current.username, current.id);

  return {
    userId: current.id,
    name: resolvedName || current.displayName || current.username,
    username: resolvedUsername.startsWith("@")
      ? resolvedUsername
      : `@${resolvedUsername}`,
    avatar: current.avatar, // Use the actual avatar, no fallback
  };
};

// How long before we consider persisted data stale and re-fetch (5 minutes)
const SYNC_STALENESS_MS = 5 * 60 * 1000;

// Limit how much post data we persist to avoid localStorage quota issues
const MAX_PERSISTED_POSTS = 50;

const isDataUrl = (value?: string) =>
  typeof value === "string" && value.startsWith("data:");

const sanitizePostForPersist = (post: FeedPost): FeedPost => {
  const media = post.media;

  const shouldDropMedia =
    media && (isDataUrl(media.url) || isDataUrl(media.thumbnail));

  return {
    ...post,
    // Drop large inline media (base64 data URLs) from persisted state
    media: shouldDropMedia ? undefined : media,
    // Drop heavy, frequently changing fields from persistence
    comments: [],
    likesByUser: {},
  };
};

const toTimestampMs = (timestamp?: string) => {
  if (!timestamp) return 0;
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const sortFeedPosts = (posts: FeedPost[]): FeedPost[] =>
  [...posts].sort((a, b) => {
    const timeDiff = toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

export const usePostsStore = create<PostsStore>()(
  persist(
    (set, get) => ({
      // ─── Initial State ──────────────────────────────────────────────────────
      posts: [],
      userPosts: [],
      loading: false,
      feedBootstrapping: true,
      loadingUserPosts: false,
      error: null,
      lastSyncedAt: null,
      feedUnsubscribe: null,
      userPostsUnsubscribe: null,
      commentUnsubscribes: {},
      likeUnsubscribes: {},

      // ─── Actions ────────────────────────────────────────────────────────────

      // Clear all cached posts and data
      clearCachedData: () => {
        console.log("🗑️ Clearing all cached posts data");
        set((state) => ({
          ...state,
          posts: [],
          userPosts: [],
          loading: false,
          feedBootstrapping: true,
          loadingUserPosts: false,
          error: null,
          lastSyncedAt: null,
        }));
      },

      createPost: async (postData) => {
        console.log("🚀 createPost called with:", postData);
        set({ loading: true, error: null });

        try {
          const currentUser = authService.getCurrentUser();
          if (!currentUser?.id) {
            throw new Error("User not authenticated");
          }

          // Map UI media to backend format
          const mediaType =
            postData.media?.type === "image"
              ? "PHOTO"
              : postData.media?.type === "video"
                ? "VIDEO"
                : postData.media
                  ? "AUDIO"
                  : "TEXT";

          const backendPost = await feedService.createPost({
            author_id: currentUser.id,
            content: postData.content || "",
            media_url: postData.media?.url,
            media_type: mediaType,
          });

          // Get enriched post with author info so usernames / avatars are correct
          const postWithAuthor = await feedService.getPostWithAuthor(
            backendPost.id,
            currentUser.id,
          );

          const nowIso = new Date().toISOString();

          const newPost: FeedPost = postWithAuthor
            ? {
                id: postWithAuthor.id,
                author: {
                  id: postWithAuthor.author_id || currentUser.id,
                  name:
                    postWithAuthor.author.display_name ||
                    postWithAuthor.author.username,
                  avatar: postWithAuthor.author.avatar_url || "", // Use actual avatar or empty string
                  username: postWithAuthor.author.username,
                },
                content: postWithAuthor.content || "",
                media: postWithAuthor.media_url
                  ? {
                      type:
                        postWithAuthor.media_type === "PHOTO"
                          ? "image"
                          : postWithAuthor.media_type === "VIDEO"
                            ? "video"
                            : "audio",
                      url: postWithAuthor.media_url,
                      thumbnail:
                        postData.media?.thumbnail || postWithAuthor.media_url,
                      duration: postData.media?.duration,
                    }
                  : undefined,
                stats: { views: postWithAuthor.view_count || 0 },
                likesByUser: {},
                likes_count: 0,
                comments: [],
                comments_count: 0,
                timestamp: postWithAuthor.created_at || nowIso,
                taggedFriends: postData.taggedFriends,
              }
            : {
                // Fallback mapping if enriched fetch fails
                id: backendPost.id,
                author: {
                  id: currentUser.id,
                  name: currentUser.displayName || currentUser.username,
                  avatar: currentUser.avatar || "", // Use actual avatar or empty string
                  username: currentUser.username,
                },
                content: postData.content,
                media: postData.media,
                stats: { views: 0 },
                likesByUser: {},
                likes_count: 0,
                comments: [],
                comments_count: 0,
                timestamp: nowIso,
                taggedFriends: postData.taggedFriends,
              };

          // Prepend to both feeds so it shows up everywhere immediately
          set((state) => ({
            posts: sortFeedPosts([newPost, ...state.posts]),
            userPosts: sortFeedPosts([newPost, ...state.userPosts]),
            loading: false,
            feedBootstrapping: false,
          }));

          // Update basic user activity in the background (best-effort)
          authService
            .updateUserActivity({
              postsCount: (currentUser.postsCount || 0) + 1,
              lastActiveAt: nowIso,
            })
            .catch((err) =>
              console.error("❌ Error updating user activity after post:", err),
            );

          console.log("🎉 Post created and persisted:", newPost.id);
        } catch (error) {
          console.error("❌ Error in createPost:", error);
          const errorMessage =
            error instanceof Error ? error.message : "Failed to create post";
          set({ loading: false, error: errorMessage });
          throw error;
        }
      },

      loadPosts: async (userId?: string) => {
        console.log("🔄 loadPosts called for user:", userId);

        if (!userId) {
          console.log("⚠️ No userId provided, using persisted posts only");
          return;
        }

        set({ loading: true, error: null });

        try {
          // Use optimized service with intelligent caching
          // This will return cached data immediately if available (stale-while-revalidate)
          const backendPosts = await optimizedFeedService.getFeedCached(
            userId,
            50,
          );

          const frontendPosts: FeedPost[] = backendPosts.map((post) => ({
            id: post.id,
            author: {
              id: post.author_id || post.author.user_id,
              name: post.author.display_name || post.author.username,
              avatar: post.author.avatar_url || "", // Use actual avatar or empty string
              username: post.author.username,
            },
            content: post.content || "",
            media: post.media_url
              ? {
                  type:
                    post.media_type === "PHOTO"
                      ? "image"
                      : post.media_type === "VIDEO"
                        ? "video"
                        : "audio",
                  url: post.media_url,
                  thumbnail: post.media_url,
                }
              : undefined,
            stats: { views: post.view_count || 0 },
            likesByUser: post.is_liked_by_user
              ? {
                  [userId]: {
                    userId,
                    name: "Anonymous",
                    username: "anonymous",
                    avatar: "", // Use actual avatar, no fallback
                    tapCount: 1,
                  },
                }
              : {},
            likes_count: post.likes_count || 0,
            comments: [],
            comments_count: post.comments_count || 0,
            timestamp: post.created_at,
            taggedFriends: [],
          }));

          // Debug timestamps
          console.log("🔍 [POSTS] Timestamp debug:", {
            backendPostsCount: backendPosts.length,
            timestamps: backendPosts.map((p) => ({
              id: p.id,
              created_at: p.created_at,
              formattedTime: p.created_at
                ? new Date(p.created_at).toLocaleString()
                : "No timestamp",
            })),
          });

          // Keep any locally-created posts not yet confirmed by the backend
          const backendIds = new Set(frontendPosts.map((p) => p.id));
          const localOnlyPosts = get().posts.filter(
            (p) => !backendIds.has(p.id),
          );

          const mergedPosts = [...localOnlyPosts, ...frontendPosts];

          // Deduplicate by ID to prevent duplicate key errors
          const uniquePosts = Array.from(
            new Map(mergedPosts.map((post) => [post.id, post])).values(),
          );

          set({
            posts: sortFeedPosts(uniquePosts),
            loading: false,
            feedBootstrapping: false,
            lastSyncedAt: Date.now(),
          });

          console.log(
            `🎉 Loaded ${frontendPosts.length} backend posts + ${localOnlyPosts.length} local-only posts (cached)`,
          );
        } catch (error) {
          console.error("❌ Error in loadPosts:", error);
          // Don't wipe existing persisted posts on a network error —
          // the user will still see their feed while offline.
          set({
            loading: false,
            feedBootstrapping: false,
            error: "Failed to load posts",
          });
        }
      },

      loadMorePosts: async () => {
        const currentUser = authService.getCurrentUser();
        if (!currentUser?.id) {
          console.warn("⚠️ Cannot load more posts: user not authenticated");
          return;
        }

        const { posts } = get();
        console.log("🔄 loadMorePosts called, current posts:", posts.length);

        try {
          const morePosts = await optimizedFeedService.loadMorePosts(
            currentUser.id,
            10,
          );

          if (morePosts.length === 0) {
            console.log("ℹ️ No more posts to load");
            return;
          }

          // Merge new posts with existing, avoiding duplicates
          const existingIds = new Set(posts.map((p) => p.id));
          const newPosts = morePosts.filter((p) => !existingIds.has(p.id));

          if (newPosts.length === 0) {
            console.log("ℹ️ All returned posts already in feed");
            return;
          }

          set({
            posts: sortFeedPosts([...posts, ...newPosts]),
          });

          console.log(`🎉 Loaded ${newPosts.length} more posts`);
        } catch (error) {
          console.error("❌ Error in loadMorePosts:", error);
        }
      },

      loadUserPosts: async (userId: string) => {
        console.log("🔄 loadUserPosts called for user:", userId);
        set({ loadingUserPosts: true, error: null, userPosts: [] }); // Clear previous user posts

        try {
          // Use optimized service with caching - now gets only user posts directly
          const backendPosts = await optimizedFeedService.getUserPostsCached(
            userId,
            50,
          );

          console.log("🔍 User Posts Debug:", {
            requestedUserId: userId,
            backendPostsCount: backendPosts.length,
            postAuthors: backendPosts.map((p) => ({
              id: p.id,
              author_id: p.author_id,
              authorName: p.author?.display_name || p.author?.username,
            })),
          });

          // No need to filter since backend already returns only user posts
          const userPosts = backendPosts;

          const frontendPosts: FeedPost[] = userPosts.map((post) => ({
            id: post.id,
            author: {
              id: post.author_id || post.author.user_id,
              name: post.author.display_name || post.author.username,
              avatar: post.author.avatar_url || "", // Use actual avatar or empty string
              username: post.author.username,
            },
            content: post.content || "",
            media: post.media_url
              ? {
                  type:
                    post.media_type === "PHOTO"
                      ? "image"
                      : post.media_type === "VIDEO"
                        ? "video"
                        : "audio",
                  url: post.media_url,
                  thumbnail: post.media_url,
                }
              : undefined,
            stats: { views: post.view_count || 0 },
            likesByUser: post.is_liked_by_user
              ? {
                  [userId]: {
                    userId,
                    name: "You",
                    username: "@you",
                    avatar: "", // Use actual avatar, no fallback
                    tapCount: 1,
                  },
                }
              : {},
            likes_count: post.likes_count || 0,
            comments: [],
            comments_count: post.comments_count || 0,
            timestamp: post.created_at,
          }));

          // Preserve local-only user posts alongside backend posts
          const backendIds = new Set(frontendPosts.map((p) => p.id));
          const localOnlyUserPosts = get().userPosts.filter(
            (p) => !backendIds.has(p.id),
          );

          const mergedUserPosts = [...localOnlyUserPosts, ...frontendPosts];

          // Deduplicate by ID to prevent duplicate key errors
          const uniqueUserPosts = Array.from(
            new Map(mergedUserPosts.map((post) => [post.id, post])).values(),
          );

          set({
            userPosts: sortFeedPosts(uniqueUserPosts),
            loadingUserPosts: false,
          });

          console.log("🎉 Loaded user posts:", frontendPosts.length);
        } catch (error) {
          console.error("❌ Error in loadUserPosts:", error);
          // Keep existing userPosts on failure so the profile page still works
          set({ loadingUserPosts: false, error: "Failed to load user posts" });
        }
      },

      addLike: async (postId: string, _userId: string) => {
        try {
          void _userId;
          const current = getCurrentUserDisplay();

          await optimizedFeedService.likePostOptimized(postId, current.userId);

          // Compute new tap count BEFORE state update for surveillance
          const post = [...get().posts, ...get().userPosts].find(
            (p) => p.id === postId,
          );
          const existingTapCount =
            post?.likesByUser[current.userId]?.tapCount ?? 0;
          const newTapCount = existingTapCount + 1;
          const wasAlreadyLiked = existingTapCount > 0;

          set((state) =>
            updatePostInCollections(state, postId, (post) => {
              const existing = post.likesByUser[current.userId];
              return {
                ...post,
                likesByUser: {
                  ...post.likesByUser,
                  [current.userId]: {
                    userId: current.userId,
                    name: current.name,
                    username: current.username,
                    avatar: current.avatar || "",
                    tapCount: (existing?.tapCount ?? 0) + 1,
                  },
                },
                // The inline heart count represents unique users, not repeat taps.
                likes_count: wasAlreadyLiked
                  ? Math.max(post.likes_count || 0, 0)
                  : Math.max(post.likes_count || 0, 0) + 1,
              };
            }),
          );

          // Fire-and-forget: create social like alert + track repeated likes for sus
          if (post?.author?.id && post.author.id !== current.userId) {
            const likeParams = {
              postId,
              postAuthorId: post.author.id!,
              likerId: current.userId,
              likerUsername: current.username.replace(/^@/, ""),
              likerDisplayName: current.name,
              likerAvatar: current.avatar || "",
              postThumbnail: post.media?.url || post.media?.thumbnail || "",
              postContent: post.content || "",
            };

            // Social alert: "@username liked your post"
            surveillanceService.trackPostLike(likeParams).catch(() => {});

            // Sus alert: "@username liked your post X times" (at thresholds 5,10,20,50)
            surveillanceService
              .trackRepeatedLike({ ...likeParams, tapCount: newTapCount })
              .catch(() => {});

            closeFriendsService
              .trackPostLikeActivity({
                actorId: current.userId,
                actorName: current.name,
                actorUsername: current.username,
                actorAvatar: current.avatar || "",
                postId,
                tapCount: newTapCount,
                postAuthorId: post.author.id,
                postAuthorUsername: post.author.username,
                postThumbnail: post.media?.thumbnail || post.media?.url || "",
                postContent: post.content || "",
              })
              .catch((closeFriendError) => {
                console.error(
                  "Failed to track close friend like activity:",
                  closeFriendError,
                );
              });
          }
        } catch (error) {
          console.error("❌ Error in addLike:", error);
        }
      },

      removeLike: async (postId: string, userId: string) => {
        try {
          await optimizedFeedService.unlikePostOptimized(postId, userId);

          set((state) =>
            updatePostInCollections(state, postId, (post) => {
              const newLikesByUser = { ...post.likesByUser };
              delete newLikesByUser[userId];
              return {
                ...post,
                likesByUser: newLikesByUser,
                likes_count: Math.max((post.likes_count || 0) - 1, 0),
              };
            }),
          );
        } catch (error) {
          console.error("❌ Error in removeLike:", error);
        }
      },

      deletePost: async (postId: string, userId: string): Promise<boolean> => {
        try {
          await feedService.deletePost(postId, userId);

          set((state) => ({
            posts: state.posts.filter((post) => post.id !== postId),
            userPosts: state.userPosts.filter((post) => post.id !== postId),
          }));

          return true;
        } catch (error) {
          console.error("❌ Error in deletePost:", error);
          return false;
        }
      },

      addComment: async (postId: string, comment) => {
        try {
          console.log("🔍 Adding comment with parentId:", comment.parentId);

          // Unsubscribe from real-time comments temporarily to prevent overwrites
          const { commentUnsubscribes } = get();
          if (commentUnsubscribes[postId]) {
            commentUnsubscribes[postId]();
            const { [postId]: _, ...rest } = commentUnsubscribes;
            set({ commentUnsubscribes: rest });
          }

          const { commentService } =
            await import("@/middleware/services/comment.service");

          const backendComment = await commentService.createComment({
            post_id: postId,
            user_id: comment.userId,
            text: comment.text,
            parent_id: comment.parentId || null,
          });

          console.log("🔍 Backend comment created:", backendComment);

          const newComment = {
            id: backendComment.id,
            userId: comment.userId,
            name: comment.name,
            username: comment.username,
            avatar: comment.avatar,
            text: comment.text,
            createdAt: backendComment.created_at,
            likes: 0,
            parentId: comment.parentId || null,
          };

          console.log("🔍 New comment to add:", newComment);

          set((state) =>
            updatePostInCollections(state, postId, (post) => ({
              ...post,
              comments: [...post.comments, newComment],
              comments_count: post.comments_count + 1,
            })),
          );

          // Re-subscribe to comments after a short delay to ensure Firestore sync
          setTimeout(() => {
            const { subscribeToPostComments } = get();
            subscribeToPostComments(postId);
          }, 500);

          // Fire alert for post author (don't notify yourself)
          try {
            const allPosts = [...get().posts, ...get().userPosts];
            const post = allPosts.find((p) => p.id === postId);
            const postAuthorId = post?.author?.id;
            if (postAuthorId && postAuthorId !== comment.userId) {
              const { alertService } =
                await import("@/middleware/services/service-factory");
              if (comment.parentId) {
                // Reply to a comment — notify the parent comment author
                const parentComment = post?.comments.find(
                  (c) => c.id === comment.parentId,
                );
                if (parentComment && parentComment.userId !== comment.userId) {
                  await alertService.createAlert({
                    userId: parentComment.userId,
                    type: "COMMENT_REPLY",
                    entityId: postId,
                    actorId: comment.userId,
                    actorName: comment.name,
                    actorUsername: comment.username,
                    actorAvatar: comment.avatar,
                    message: `@${comment.username.replace(/^@/, "")} replied to your comment`,
                    metadata: {
                      postId,
                      commentId: newComment.id,
                      parentCommentId: comment.parentId,
                    },
                  });
                }
                // Also notify the post owner if they're different from parent comment author
                if (parentComment?.userId !== postAuthorId) {
                  await alertService.createAlert({
                    userId: postAuthorId,
                    type: "COMMENT_RECEIVED",
                    entityId: postId,
                    actorId: comment.userId,
                    actorName: comment.name,
                    actorUsername: comment.username,
                    actorAvatar: comment.avatar,
                    message: `@${comment.username.replace(/^@/, "")} replied to a comment on your post`,
                    metadata: {
                      postId,
                      commentId: newComment.id,
                      parentCommentId: comment.parentId,
                      commentText: comment.text,
                    },
                  });
                }
              } else {
                // Top-level comment — notify post author
                await alertService.createAlert({
                  userId: postAuthorId,
                  type: "COMMENT_RECEIVED",
                  entityId: postId,
                  actorId: comment.userId,
                  actorName: comment.name,
                  actorUsername: comment.username,
                  actorAvatar: comment.avatar,
                  message: `@${comment.username.replace(/^@/, "")} commented on your post`,
                  metadata: {
                    postId,
                    commentId: newComment.id,
                    commentText: comment.text,
                  },
                });
              }

              closeFriendsService
                .trackPostCommentActivity({
                  actorId: comment.userId,
                  actorName: comment.name,
                  actorUsername: comment.username,
                  actorAvatar: comment.avatar,
                  postId,
                  commentId: newComment.id,
                  commentText: comment.text,
                  postAuthorId,
                  postAuthorUsername: post?.author?.username || "someone",
                  postThumbnail:
                    post?.media?.thumbnail || post?.media?.url || "",
                  postContent: post?.content || "",
                })
                .catch((closeFriendError) => {
                  console.error(
                    "Failed to track close friend comment activity:",
                    closeFriendError,
                  );
                });
            }
          } catch (alertError) {
            console.error("Failed to send comment alert:", alertError);
          }
        } catch (error) {
          console.error("\u274c Error adding comment:", error);
          throw error;
        }
      },

      likeComment: async (postId: string, commentId: string) => {
        try {
          const currentUser = authService.getCurrentUser();
          if (!currentUser?.id) return;
          if (
            commentLikePersistence.hasLiked("post", currentUser.id, commentId)
          ) {
            return;
          }

          commentLikePersistence.markLiked("post", currentUser.id, commentId);
          set((state) =>
            updatePostInCollections(state, postId, (post) => ({
              ...post,
              comments: post.comments.map((comment) =>
                comment.id === commentId
                  ? { ...comment, likes: (comment.likes || 0) + 1 }
                  : comment,
              ),
            })),
          );

          const { commentService } =
            await import("@/middleware/services/comment.service");
          await commentService.likeComment(commentId);
        } catch (error) {
          console.error("❌ Error liking comment:", error);
          throw error;
        }
      },

      incrementViews: (postId: string) => {
        set((state) =>
          updatePostInCollections(state, postId, (post) => ({
            ...post,
            stats: { ...post.stats, views: post.stats.views + 1 },
          })),
        );
      },

      // Call on logout to wipe persisted data for the next user
      clearPersistedData: () => {
        // Unsubscribe from all real-time listeners
        const {
          feedUnsubscribe,
          userPostsUnsubscribe,
          commentUnsubscribes,
          likeUnsubscribes,
        } = get();
        if (feedUnsubscribe) feedUnsubscribe();
        if (userPostsUnsubscribe) userPostsUnsubscribe();

        // Unsubscribe from all comment listeners
        Object.values(commentUnsubscribes).forEach((unsubscribe) =>
          unsubscribe(),
        );

        // Unsubscribe from all like listeners
        Object.values(likeUnsubscribes).forEach((unsubscribe) => unsubscribe());

        // Clear all caches
        optimizedFeedService.clearAllCaches();

        set({
          posts: [],
          userPosts: [],
          feedBootstrapping: true,
          lastSyncedAt: null,
          error: null,
          feedUnsubscribe: null,
          userPostsUnsubscribe: null,
          commentUnsubscribes: {},
          likeUnsubscribes: {},
        });
      },

      // Real-time feed subscription — loads everything, then shows all at once
      subscribeToFeed: (userId: string) => {
        console.log("🔄 Subscribing to feed for user:", userId);

        const { feedUnsubscribe } = get();
        if (feedUnsubscribe) {
          feedUnsubscribe();
        }

        // ALWAYS show loading until first complete data arrives
        set({ loading: true, feedBootstrapping: true });

        const unsubscribe = optimizedFeedService.subscribeToFeedOptimized(
          userId,
          (backendPosts) => {
            console.log(
              "🔍 STORE DEBUG: Received from backend:",
              backendPosts.length,
              "posts",
            );
            console.log(
              "🔍 STORE DEBUG: Backend posts author_ids:",
              backendPosts.map((p) => ({
                id: p.id,
                author_id: p.author_id,
                username: p.author?.username,
              })),
            );

            const frontendPosts: FeedPost[] = backendPosts.map((post) => ({
              id: post.id,
              author: {
                id: post.author_id || post.author.user_id,
                name: post.author.display_name || post.author.username,
                avatar: post.author.avatar_url || "",
                username: post.author.username,
              },
              content: post.content || "",
              media: post.media_url
                ? {
                    type:
                      post.media_type === "PHOTO"
                        ? "image"
                        : post.media_type === "VIDEO"
                          ? "video"
                          : "audio",
                    url: post.media_url,
                    thumbnail: post.media_url,
                  }
                : undefined,
              stats: { views: post.view_count || 0 },
              likesByUser: post.is_liked_by_user
                ? {
                    [userId]: {
                      userId,
                      name: "Anonymous",
                      username: "anonymous",
                      avatar: "",
                      tapCount: 1,
                    },
                  }
                : {},
              likes_count: post.likes_count || 0,
              comments: [],
              comments_count: post.comments_count || 0,
              timestamp: post.created_at,
              taggedFriends: [],
            }));

            console.log(
              "🔍 STORE DEBUG: Transformed to frontend:",
              frontendPosts.length,
              "posts",
            );
            console.log(
              "🔍 STORE DEBUG: Frontend posts authors:",
              frontendPosts.map((p) => ({
                id: p.id,
                author: p.author.username,
              })),
            );

            // Deduplicate by ID to prevent duplicate key errors
            const uniquePosts = Array.from(
              new Map(frontendPosts.map((post) => [post.id, post])).values(),
            );

            // Replace posts entirely — data is already complete from backend
            set({
              posts: sortFeedPosts(uniquePosts),
              loading: false,
              feedBootstrapping: false,
              lastSyncedAt: Date.now(),
            });
          },
          10,
        );

        set({ feedUnsubscribe: unsubscribe });
      },

      // Real-time user posts subscription — loads everything, then shows all at once
      subscribeToUserPosts: (userId: string) => {
        console.log("🔄 Subscribing to user posts for:", userId);

        const { userPostsUnsubscribe } = get();
        if (userPostsUnsubscribe) {
          userPostsUnsubscribe();
        }

        set({ loadingUserPosts: true });

        const unsubscribe = optimizedFeedService.subscribeToUserPostsOptimized(
          userId,
          (backendPosts) => {
            const frontendPosts: FeedPost[] = backendPosts.map((post) => ({
              id: post.id,
              author: {
                id: post.author_id || post.author.user_id,
                name: post.author.display_name || post.author.username,
                avatar: post.author.avatar_url || "",
                username: post.author.username,
              },
              content: post.content || "",
              media: post.media_url
                ? {
                    type:
                      post.media_type === "PHOTO"
                        ? "image"
                        : post.media_type === "VIDEO"
                          ? "video"
                          : "audio",
                    url: post.media_url,
                    thumbnail: post.media_url,
                  }
                : undefined,
              stats: { views: post.view_count || 0 },
              likesByUser: post.is_liked_by_user
                ? {
                    [userId]: {
                      userId,
                      name: "You",
                      username: "@you",
                      avatar: "",
                      tapCount: 1,
                    },
                  }
                : {},
              likes_count: post.likes_count || 0,
              comments: [],
              comments_count: post.comments_count || 0,
              timestamp: post.created_at,
            }));

            // Deduplicate by ID to prevent duplicate key errors
            const uniqueUserPosts = Array.from(
              new Map(frontendPosts.map((post) => [post.id, post])).values(),
            );

            set({
              userPosts: uniqueUserPosts,
              loadingUserPosts: false,
            });
          },
        );

        set({ userPostsUnsubscribe: unsubscribe });
      },

      // Unsubscribe from feed
      unsubscribeFromFeed: () => {
        const { feedUnsubscribe } = get();
        if (feedUnsubscribe) {
          feedUnsubscribe();
          set({ feedUnsubscribe: null });
        }
      },

      // Unsubscribe from user posts
      unsubscribeFromUserPosts: () => {
        const { userPostsUnsubscribe } = get();
        if (userPostsUnsubscribe) {
          userPostsUnsubscribe();
          set({ userPostsUnsubscribe: null });
        }
      },

      // Subscribe to comments for a specific post
      subscribeToPostComments: (postId: string) => {
        const { commentUnsubscribes } = get();

        // Unsubscribe if already subscribed
        if (commentUnsubscribes[postId]) {
          commentUnsubscribes[postId]();
        }

        // Set loading state
        set((state) =>
          updatePostInCollections(state, postId, (post) => ({
            ...post,
            commentsLoading: true,
          })),
        );

        import("@/middleware/services/comment.service").then(
          async ({ commentService }) => {
            const currentUser = authService.getCurrentUser();
            const unsubscribe = commentService.subscribeToComments(
              postId,
              (comments) => {
                const frontendComments = comments.map((comment) => ({
                  id: comment.id,
                  userId: comment.user_id,
                  name: comment.author.display_name || comment.author.username,
                  username: comment.author.username,
                  avatar: comment.author.avatar_url || "",
                  text: comment.text,
                  createdAt: comment.created_at,
                  likes: comment.likes || 0,
                  parentId: comment.parent_id || null,
                  likedByCurrentUser: currentUser?.id
                    ? commentLikePersistence.hasLiked(
                        "post",
                        currentUser.id,
                        comment.id,
                      )
                    : false,
                }));

                set((state) =>
                  updatePostInCollections(state, postId, (post) => ({
                    ...post,
                    comments: frontendComments,
                    comments_count: frontendComments.length,
                    commentsLoading: false,
                  })),
                );
              },
            );

            set((state) => ({
              commentUnsubscribes: {
                ...state.commentUnsubscribes,
                [postId]: unsubscribe,
              },
            }));
          },
        );
      },

      // Unsubscribe from comments for a specific post
      unsubscribeFromPostComments: (postId: string) => {
        const { commentUnsubscribes } = get();
        if (commentUnsubscribes[postId]) {
          commentUnsubscribes[postId]();
          const newUnsubscribes = { ...commentUnsubscribes };
          delete newUnsubscribes[postId];
          set({ commentUnsubscribes: newUnsubscribes });
        }
      },

      // Subscribe to likes for a specific post
      subscribeToPostLikes: (postId: string) => {
        const { likeUnsubscribes } = get();

        // Unsubscribe if already subscribed
        if (likeUnsubscribes[postId]) {
          likeUnsubscribes[postId]();
        }

        // Set loading state
        set((state) =>
          updatePostInCollections(state, postId, (post) => ({
            ...post,
            likesLoading: true,
          })),
        );

        import("@/middleware/services/feed.service").then(
          async ({ feedService }) => {
            const unsubscribe = feedService.subscribeToPostLikes(
              postId,
              (likes) => {
                const likesByUser: Record<string, any> = {};
                likes.forEach((like) => {
                  likesByUser[like.userId] = like;
                });

                set((state) =>
                  updatePostInCollections(state, postId, (post) => ({
                    ...post,
                    likesByUser,
                    likes_count: Object.keys(likesByUser).length,
                    likesLoading: false,
                  })),
                );
              },
            );

            set((state) => ({
              likeUnsubscribes: {
                ...state.likeUnsubscribes,
                [postId]: unsubscribe,
              },
            }));
          },
        );
      },

      // Unsubscribe from likes for a specific post
      unsubscribeFromPostLikes: (postId: string) => {
        const { likeUnsubscribes } = get();
        if (likeUnsubscribes[postId]) {
          likeUnsubscribes[postId]();
          const newUnsubscribes = { ...likeUnsubscribes };
          delete newUnsubscribes[postId];
          set({ likeUnsubscribes: newUnsubscribes });
        }
      },
    }),

    // ─── Persist Config ───────────────────────────────────────────────────────
    {
      name: "social-app-posts", // the localStorage key
      version: 3, // Bump to clear old cached counts/metadata
      storage: createJSONStorage(() => sessionStorage),
      migrate: (persistedState: any, version: number) => {
        if (version < 3) {
          // Old persisted data may have stripped media — discard it
          return {
            ...persistedState,
            posts: [],
            userPosts: [],
            lastSyncedAt: null,
          };
        }
        return persistedState;
      },

      // Only persist trimmed, sanitized data fields to keep payload small
      partialize: (state) => {
        const trimAndSanitize = (posts: FeedPost[]) =>
          posts
            .slice(0, MAX_PERSISTED_POSTS)
            .map((post) => sanitizePostForPersist(post));

        return {
          posts: trimAndSanitize(state.posts),
          userPosts: trimAndSanitize(state.userPosts),
          lastSyncedAt: state.lastSyncedAt,
          // Don't persist unsubscribe functions
          feedUnsubscribe: null,
          userPostsUnsubscribe: null,
          commentUnsubscribes: {},
          likeUnsubscribes: {},
        };
      },
    },
  ),
);
