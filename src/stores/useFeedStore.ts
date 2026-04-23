import { create } from "zustand";
import {
  feedService,
  PostWithAuthor,
  CreatePostRequest,
  FeedEventWithUser,
} from "@/middleware/services/feed.service";

interface FeedStore {
  // State
  posts: PostWithAuthor[];
  feedEvents: FeedEventWithUser[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  offset: number;

  // Actions
  loadFeed: (userId: string, refresh?: boolean) => Promise<void>;
  loadMoreFeed: (userId: string) => Promise<void>;
  createPost: (request: CreatePostRequest) => Promise<PostWithAuthor | null>;
  likePost: (postId: string, userId: string) => Promise<void>;
  unlikePost: (postId: string, userId: string) => Promise<void>;
  getPost: (
    postId: string,
    viewerId?: string,
  ) => Promise<PostWithAuthor | null>;
  getUserPosts: (
    userId: string,
    currentUserId?: string,
  ) => Promise<PostWithAuthor[]>;
  searchPosts: (query: string, userId?: string) => Promise<PostWithAuthor[]>;
  deletePost: (postId: string, authorId: string) => Promise<void>;
  loadFeedEvents: (userId: string) => Promise<void>;
  refreshFeed: (userId: string) => Promise<void>;
  clearError: () => void;

  // Computed values
  unreadCount: number;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  // Initial state
  posts: [],
  feedEvents: [],
  loading: false,
  error: null,
  hasMore: true,
  offset: 0,

  // Computed values
  get unreadCount() {
    return get().feedEvents.length;
  },

  // Actions
  loadFeed: async (userId: string, refresh = false) => {
    if (refresh) {
      set({ posts: [], offset: 0, hasMore: true });
    }

    set({ loading: true, error: null });

    try {
      const { offset } = get();
      const posts = await feedService.getFeed(userId, 20, offset);

      set((state) => ({
        posts: refresh ? posts : [...state.posts, ...posts],
        loading: false,
        hasMore: posts.length === 20,
        offset: refresh ? 20 : state.offset + 20,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load feed";
      set({ loading: false, error: errorMessage });
    }
  },

  loadMoreFeed: async (userId: string) => {
    const { hasMore, loading } = get();
    if (!hasMore || loading) return;

    await get().loadFeed(userId, false);
  },

  createPost: async (
    request: CreatePostRequest,
  ): Promise<PostWithAuthor | null> => {
    set({ loading: true, error: null });

    try {
      const post = await feedService.createPost(request);

      // Get the full post with author info
      const postWithAuthor = await feedService.getPostWithAuthor(
        post.id,
        request.author_id,
      );

      if (postWithAuthor) {
        set((state) => ({
          posts: [postWithAuthor, ...state.posts],
          loading: false,
        }));
      } else {
        set({ loading: false });
      }

      return postWithAuthor;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create post";
      set({ loading: false, error: errorMessage });
      return null;
    }
  },

  likePost: async (postId: string, userId: string) => {
    try {
      await feedService.likePost(postId, userId);

      set((state) => ({
        posts: state.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                likes_count: (post.likes_count || 0) + 1,
                is_liked_by_user: true,
              }
            : post,
        ),
      }));
    } catch (error) {
      console.error("Error liking post:", error);
    }
  },

  unlikePost: async (postId: string, userId: string) => {
    try {
      await feedService.unlikePost(postId, userId);

      set((state) => ({
        posts: state.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                likes_count: Math.max((post.likes_count || 0) - 1, 0),
                is_liked_by_user: false,
              }
            : post,
        ),
      }));
    } catch (error) {
      console.error("Error unliking post:", error);
    }
  },

  getPost: async (
    postId: string,
    viewerId?: string,
  ): Promise<PostWithAuthor | null> => {
    try {
      const post = await feedService.getPostWithAuthor(postId, viewerId);
      return post;
    } catch (error) {
      console.error("Error getting post:", error);
      return null;
    }
  },

  getUserPosts: async (userId: string, currentUserId?: string) => {
    set({ loading: true, error: null });

    try {
      // Get all posts and filter by author
      const allPosts = await feedService.getFeed(currentUserId || userId);
      const userPosts = allPosts.filter(
        (post) => post.author.user_id === userId,
      );
      set({ posts: userPosts, loading: false });
      return userPosts;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get user posts";
      set({ loading: false, error: errorMessage });
      return [];
    }
  },

  searchPosts: async (query: string, userId?: string) => {
    set({ loading: true, error: null });

    try {
      // Search users and get their posts
      const { userService } =
        await import("@/middleware/services/user.service");
      const users = await userService.searchProfiles(query);

      // Get posts from these users
      const allPosts: PostWithAuthor[] = [];
      for (const user of users) {
        const userPosts = await feedService.getFeed(userId || user.user_id);
        const filteredPosts = userPosts.filter(
          (post) => post.author.user_id === user.user_id,
        );
        allPosts.push(...filteredPosts);
      }

      set({ posts: allPosts, loading: false });
      return allPosts;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search posts";
      set({ loading: false, error: errorMessage });
      return [];
    }
  },

  deletePost: async (postId: string, authorId: string) => {
    try {
      await feedService.deletePost(postId, authorId);

      set((state) => ({
        posts: state.posts.filter((post) => post.id !== postId),
      }));
    } catch (error) {
      console.error("Error deleting post:", error);
    }
  },

  loadFeedEvents: async (userId: string) => {
    try {
      // Get feed and extract events from posts
      const posts = await feedService.getFeed(userId);
      const events: FeedEventWithUser[] = [];

      // Convert posts to feed events
      posts.forEach((post: PostWithAuthor) => {
        events.push({
          id: post.id,
          user_id: post.author.user_id,
          event_type: "POST_CREATED",
          created_at: post.created_at,
          user: post.author,
        });
      });

      set({ feedEvents: events });
    } catch (error) {
      console.error("Error loading feed events:", error);
    }
  },

  refreshFeed: async (userId: string) => {
    await get().loadFeed(userId, true);
    await get().loadFeedEvents(userId);
  },

  clearError: () => {
    set({ error: null });
  },
}));
