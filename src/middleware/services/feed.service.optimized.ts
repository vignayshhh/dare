/**
 * Optimized Feed Service with Intelligent Caching
 *
 * This wraps the existing feed.service.ts with caching and batching layers
 * to dramatically reduce Firebase reads while maintaining real-time updates.
 */

import { feedService, PostWithAuthor } from "./feed.service";
import { feedCache, userPostsCache } from "../cache/FeedCacheManager";
import { batchQueryOptimizer } from "../cache/BatchQueryOptimizer";
import { redisCache } from "@/services/redisCache.server";
import { visibilitySubscriptionManager } from "@/utils/visibilitySubscriptionManager";
import { aggregatedCounters } from "@/services/aggregatedCounters";
import {
  Unsubscribe,
  collection,
  query,
  where,
  getDocs,
  limit as firestoreLimit,
  documentId,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";

class OptimizedFeedService {
  private readonly fallbackTimestamp = "1970-01-01T00:00:00.000Z";
  private readonly friendIdsTtlMs = 5 * 60 * 1000;
  private readonly authorDetailsTtlMs = 15 * 60 * 1000;
  private readonly engagementTtlMs = 5 * 60 * 1000;
  // Enable visibility-based subscription unloading to reduce Firebase reads for inactive tabs
  private readonly enableVisibilityUnloading = true; // Set to true to enable
  private userLikedPostIds = new Map<
    string,
    { ids: Set<string>; expiresAt: number }
  >();
  private readonly userLikesTtlMs = 5 * 60 * 1000;
  private friendIdsCache = new Map<
    string,
    { ids: string[]; expiresAt: number; inFlight?: Promise<string[]> }
  >();
  private authorDetailsCache = new Map<
    string,
    { data: PostWithAuthor["author"]; expiresAt: number }
  >();
  private engagementCache = new Map<
    string,
    {
      likesCount: number;
      commentsCount: number;
      isLikedByUser: boolean;
      expiresAt: number;
    }
  >();

  private async preloadUserLikes(userId: string): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.userLikedPostIds.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.ids;
    }

    try {
      // Check Redis cache first
      const cacheKey = `likes:${userId}`;
      const cached = await redisCache.get<string[]>(cacheKey);
      if (cached) {
        const ids = new Set(cached);
        this.userLikedPostIds.set(userId, {
          ids,
          expiresAt: now + this.userLikesTtlMs,
        });
        return ids;
      }

      // Fetch from Firestore
      const q = query(
        collection(db, "post_likes"),
        where("user_id", "==", userId),
        firestoreLimit(200),
      );
      const snap = await getDocs(q);
      const ids = new Set<string>();
      snap.forEach((d) => ids.add(d.data().post_id));
      this.userLikedPostIds.set(userId, {
        ids,
        expiresAt: now + this.userLikesTtlMs,
      });

      // Cache in Redis with 5min TTL
      redisCache.set(cacheKey, Array.from(ids), 300).catch(() => {});

      return ids;
    } catch {
      return new Set<string>();
    }
  }

  // Called by optimistic like/unlike to keep preloaded cache in sync
  updateLikeCache(userId: string, postId: string, liked: boolean): void {
    const cached = this.userLikedPostIds.get(userId);
    if (cached) {
      if (liked) {
        cached.ids.add(postId);
      } else {
        cached.ids.delete(postId);
      }
    }
  }

  private normalizeTimestamp(value: any): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value?.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (
      typeof value === "object" &&
      typeof value.seconds === "number" &&
      typeof value.nanoseconds === "number"
    ) {
      return new Date(
        value.seconds * 1000 + value.nanoseconds / 1_000_000,
      ).toISOString();
    }
    return "";
  }

  private async getFeedAuthorIds(userId: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.friendIdsCache.get(userId);

    if (cached && cached.expiresAt > now && !cached.inFlight) {
      return cached.ids;
    }

    if (cached?.inFlight) {
      return cached.inFlight;
    }

    const inFlight = (async () => {
      const { friendsService } = await import("./service-factory");
      const friendsResponse = await friendsService.getFriends(userId);
      const friendIds = (friendsResponse.friends || [])
        .map((f: any) => f.user_id || f.userId || f.id)
        .filter(Boolean);

      const ids = [...new Set([userId, ...friendIds])].slice(0, 30);
      this.friendIdsCache.set(userId, {
        ids,
        expiresAt: Date.now() + this.friendIdsTtlMs,
      });
      return ids;
    })();

    this.friendIdsCache.set(userId, {
      ids: cached?.ids || [userId],
      expiresAt: now + this.friendIdsTtlMs,
      inFlight,
    });

    try {
      return await inFlight;
    } catch (error) {
      this.friendIdsCache.delete(userId);
      throw error;
    }
  }

  private getAuthorCache(authorId: string): PostWithAuthor["author"] | null {
    const cached = this.authorDetailsCache.get(authorId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.authorDetailsCache.delete(authorId);
      return null;
    }
    return cached.data;
  }

  private getEngagementCache(
    postId: string,
    userId: string,
  ): {
    likesCount: number;
    commentsCount: number;
    isLikedByUser: boolean;
  } | null {
    const cached = this.engagementCache.get(`${postId}:${userId}`);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.engagementCache.delete(`${postId}:${userId}`);
      return null;
    }
    return cached;
  }

  private async enrichRawPosts(
    rawPosts: any[],
    userId: string,
    limitEngagementToFirst: number = 10,
  ): Promise<PostWithAuthor[]> {
    const now = Date.now();
    const authorIds = [
      ...new Set(rawPosts.map((p) => p.author_id).filter(Boolean)),
    ];
    const postIds = rawPosts.map((p) => p.id);

    // Prime author cache from denormalized fields on post docs (0 reads)
    for (const post of rawPosts) {
      if (
        post.author_id &&
        post.author_username &&
        !this.getAuthorCache(post.author_id)
      ) {
        this.authorDetailsCache.set(post.author_id, {
          data: {
            id: post.author_id,
            user_id: post.author_id,
            username: post.author_username,
            display_name: post.author_display_name || null,
            avatar_url: post.author_avatar_url || "",
          },
          expiresAt: now + this.authorDetailsTtlMs,
        });
      }
    }

    const missingAuthorIds = authorIds.filter((id) => !this.getAuthorCache(id));
    const missingEngagementPostIds = postIds
      .filter((id) => !this.getEngagementCache(id, userId))
      .slice(0, limitEngagementToFirst);

    const rawPostsMap = new Map<string, any>(rawPosts.map((p) => [p.id, p]));

    // Preload user's liked post IDs (1 query, cached 5min)
    // + fetch missing authors in parallel
    // + check Redis for cached authors
    const [freshAuthorsMap, userLikedIds] = await Promise.all([
      this.fetchAuthorsWithRedis(missingAuthorIds),
      missingEngagementPostIds.length > 0
        ? this.preloadUserLikes(userId)
        : Promise.resolve(new Set<string>()),
    ]);

    // For posts WITHOUT denormalized counts → fall back to batch queries
    const legacyPostIds = missingEngagementPostIds.filter((id) => {
      const raw = rawPostsMap.get(id);
      return (
        typeof raw?.likes_count !== "number" ||
        typeof raw?.comments_count !== "number"
      );
    });

    let legacyLikesMap = new Map<
      string,
      { likesCount: number; isLikedByUser: boolean }
    >();
    let legacyCommentsMap = new Map<string, number>();

    if (legacyPostIds.length > 0) {
      const storedLikesCounts = new Map<string, number | undefined>(
        legacyPostIds.map((id) => {
          const v = rawPostsMap.get(id)?.likes_count;
          return [id, typeof v === "number" ? v : undefined];
        }),
      );
      const storedCommentsCounts = new Map<string, number | undefined>(
        legacyPostIds.map((id) => {
          const v = rawPostsMap.get(id)?.comments_count;
          return [id, typeof v === "number" ? v : undefined];
        }),
      );

      [legacyLikesMap, legacyCommentsMap] = await Promise.all([
        feedService.batchGetPostLikes(legacyPostIds, userId, storedLikesCounts),
        feedService.batchGetPostCommentsCounts(
          legacyPostIds,
          storedCommentsCounts,
        ),
      ]);
    }

    freshAuthorsMap.forEach((author, authorId) => {
      if (!author) return;
      this.authorDetailsCache.set(authorId, {
        data: author,
        expiresAt: now + this.authorDetailsTtlMs,
      });
    });

    // Load comment counts from aggregated counters for all posts
    const commentsCounts = await Promise.all(
      missingEngagementPostIds.map((postId) =>
        aggregatedCounters.getCounter(postId, "comments"),
      ),
    );

    missingEngagementPostIds.forEach((postId, index) => {
      const raw = rawPostsMap.get(postId);
      const hasDenormalized =
        typeof raw?.likes_count === "number" &&
        typeof raw?.comments_count === "number";

      if (hasDenormalized) {
        // Use aggregated counters for comments, denormalized for likes
        const engagementData = {
          likesCount: raw.likes_count,
          commentsCount: commentsCounts[index],
          isLikedByUser: userLikedIds.has(postId),
        };
        this.engagementCache.set(`${postId}:${userId}`, {
          ...engagementData,
          expiresAt: now + this.engagementTtlMs,
        });
        // Cache in Redis with 5min TTL
        const cacheKey = `engagement:${postId}:${userId}`;
        redisCache.set(cacheKey, engagementData, 300).catch(() => {});
      } else {
        // Legacy fallback - use aggregated counters for comments
        const engagementData = {
          likesCount: legacyLikesMap.get(postId)?.likesCount ?? 0,
          commentsCount: commentsCounts[index],
          isLikedByUser: legacyLikesMap.get(postId)?.isLikedByUser ?? false,
        };
        this.engagementCache.set(`${postId}:${userId}`, {
          ...engagementData,
          expiresAt: now + this.engagementTtlMs,
        });
        // Cache in Redis with 5min TTL
        const cacheKey = `engagement:${postId}:${userId}`;
        redisCache.set(cacheKey, engagementData, 300).catch(() => {});
      }
    });

    return rawPosts.map((post: any) => {
      const author = this.getAuthorCache(post.author_id) || {
        id: post.author_id,
        user_id: post.author_id,
        username: `user_${post.author_id.slice(0, 8)}`,
        display_name: null,
        avatar_url: "",
      };
      const engagement = this.getEngagementCache(post.id, userId);

      return {
        id: post.id,
        author_id: post.author_id,
        author,
        content: post.content || "",
        media_url: post.media_url || null,
        media_type: post.media_type || null,
        view_count: post.view_count || 0,
        likes_count: engagement?.likesCount ?? 0,
        comments_count: engagement?.commentsCount ?? 0,
        is_liked_by_user: engagement?.isLikedByUser ?? false,
        created_at:
          this.normalizeTimestamp(post.created_at) ||
          this.normalizeTimestamp(post.updated_at) ||
          this.fallbackTimestamp,
        updated_at:
          this.normalizeTimestamp(post.updated_at) ||
          this.normalizeTimestamp(post.created_at) ||
          this.fallbackTimestamp,
      };
    });
  }

  /**
   * Get feed with intelligent caching
   * - First load: Shows cached data immediately (if available)
   * - Background: Fetches fresh data and updates cache
   * - Real-time: Subscribes to updates after initial load
   */
  async getFeedCached(
    userId: string,
    limitCount: number = 20,
    options: { forceRefresh?: boolean } = {},
  ): Promise<PostWithAuthor[]> {
    const cacheKey = `feed:${userId}:${limitCount}`;

    return feedCache.get(
      cacheKey,
      async () => {
        console.log("🔄 [Optimized] Fetching feed from Firebase...");

        const queryAuthorIds = await this.getFeedAuthorIds(userId);

        const { collection, query, where, orderBy, limit, getDocs } =
          await import("firebase/firestore");
        const { db } = await import("@/backend/lib/firebase");

        const q = query(
          collection(db, "posts"),
          where("author_id", "in", queryAuthorIds),
          orderBy("created_at", "desc"),
          limit(limitCount),
        );

        const snapshot = await getDocs(q);

        // Step 1: Extract raw posts
        const rawPosts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as any[];

        return this.enrichRawPosts(rawPosts, userId);
      },
      { forceRefresh: options.forceRefresh },
    );
  }

  /**
   * Get user posts with caching
   */
  async getUserPostsCached(
    userId: string,
    limitCount: number = 20,
    options: { forceRefresh?: boolean } = {},
  ): Promise<PostWithAuthor[]> {
    const cacheKey = `user-posts:${userId}:${limitCount}`;

    return userPostsCache.get(
      cacheKey,
      async () => {
        console.log(
          "🔄 [Optimized] Fetching user posts from Firebase for user:",
          userId,
        );
        // Use the direct user posts method for efficiency
        const userPosts = await feedService.getUserPosts(userId, limitCount);
        console.log(
          "📊 [Optimized] Got user posts:",
          userPosts.length,
          "for user:",
          userId,
        );
        return userPosts;
      },
      { forceRefresh: options.forceRefresh || true }, // Always force refresh for user posts to avoid cross-user contamination
    );
  }

  private lastPostCreatedAt: any = null;

  /**
   * Fetch authors with Redis caching
   * Checks Redis first, falls back to Firestore, then caches result
   */
  private async fetchAuthorsWithRedis(
    authorIds: string[],
  ): Promise<Map<string, PostWithAuthor["author"]>> {
    if (authorIds.length === 0) {
      return new Map();
    }

    const authorsMap = new Map<string, PostWithAuthor["author"]>();
    const missingIds: string[] = [];

    // Check Redis cache first
    for (const authorId of authorIds) {
      const cacheKey = `author:${authorId}`;
      try {
        const cached = await redisCache.get<PostWithAuthor["author"]>(cacheKey);
        if (cached) {
          authorsMap.set(authorId, cached);
        } else {
          missingIds.push(authorId);
        }
      } catch {
        // Redis error, fall back to Firestore
        missingIds.push(authorId);
      }
    }

    // Fetch missing authors from Firestore
    if (missingIds.length > 0) {
      const freshAuthors = await feedService.batchGetAuthors(missingIds);
      freshAuthors.forEach((author, authorId) => {
        if (author) {
          authorsMap.set(authorId, author);
          // Cache in Redis with 15min TTL
          const cacheKey = `author:${authorId}`;
          redisCache.set(cacheKey, author, 900).catch(() => {});
        }
      });
    }

    return authorsMap;
  }

  /**
   * Subscribe to real-time feed updates.
   * First delivery is BLOCKED until complete data is ready — no partial renders.
   * After the first delivery, subsequent real-time updates flow with light throttle.
   * Checks Redis cache FIRST to prevent Firestore reads on reload.
   */
  subscribeToFeedOptimized(
    userId: string,
    onUpdate: (posts: any[]) => void,
    initialLimit: number = 10,
  ): () => void {
    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      try {
        const queryAuthorIds = await this.getFeedAuthorIds(userId);

        console.log("🔄 Feed query for authors:", queryAuthorIds);

        // Check Redis cache FIRST to prevent Firestore reads on reload
        const cacheKey = `feed:${userId}`;
        const cachedFeed = await redisCache.get<any[]>(cacheKey);
        if (cachedFeed && cachedFeed.length > 0) {
          console.log(
            "✅ Using cached feed from Redis:",
            cachedFeed.length,
            "posts",
          );
          onUpdate(cachedFeed);

          // Track last post's created_at for pagination
          if (cachedFeed.length > 0) {
            this.lastPostCreatedAt =
              cachedFeed[cachedFeed.length - 1].created_at;
          }
        }

        // Set up real-time listener for updates (even if we used cache)
        const {
          collection,
          query,
          where,
          orderBy,
          limit,
          onSnapshot,
          startAfter,
        } = await import("firebase/firestore");
        const { db } = await import("@/backend/lib/firebase");

        let q = query(
          collection(db, "posts"),
          where("author_id", "in", queryAuthorIds),
          orderBy("created_at", "desc"),
          limit(initialLimit),
        );

        unsubscribe = onSnapshot(q, async (snapshot) => {
          // Step 1: Extract raw posts immediately
          const rawPosts = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as any[];

          // Track last post's created_at for pagination
          if (rawPosts.length > 0) {
            this.lastPostCreatedAt = rawPosts[rawPosts.length - 1].created_at;
          }

          const enrichedPosts = await this.enrichRawPosts(
            rawPosts,
            userId,
            initialLimit,
          );

          // Update Redis cache with latest data
          redisCache.set(cacheKey, enrichedPosts, 300).catch(() => {});

          onUpdate(enrichedPosts);
        });
      } catch (error) {
        console.error("Error setting up feed subscription:", error);
        onUpdate([]);
      }
    };

    setup();

    // Use visibility manager to automatically unsubscribe when tab is hidden
    if (this.enableVisibilityUnloading) {
      const subscriptionKey = `feed:${userId}`;
      return visibilitySubscriptionManager.register(subscriptionKey, () => {
        // Return the actual unsubscribe function
        return () => {
          if (unsubscribe) unsubscribe();
        };
      });
    }

    // Default behavior without visibility management
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }

  /**
   * Load more posts (pagination)
   * Returns additional posts beyond the initial batch
   */
  async loadMorePosts(userId: string, limit: number = 10): Promise<any[]> {
    if (!this.lastPostCreatedAt) return [];

    try {
      const queryAuthorIds = await this.getFeedAuthorIds(userId);

      const {
        collection,
        query,
        where,
        orderBy,
        limit: firestoreLimit,
        getDocs,
        startAfter,
      } = await import("firebase/firestore");
      const { db } = await import("@/backend/lib/firebase");

      let q = query(
        collection(db, "posts"),
        where("author_id", "in", queryAuthorIds),
        orderBy("created_at", "desc"),
        startAfter(this.lastPostCreatedAt),
        firestoreLimit(limit),
      );

      const snapshot = await getDocs(q);
      const rawPosts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      // Update cursor for next loadMore
      if (rawPosts.length > 0) {
        this.lastPostCreatedAt = rawPosts[rawPosts.length - 1].created_at;
      }

      return await this.enrichRawPosts(rawPosts, userId, limit);
    } catch (error) {
      console.error("Error loading more posts:", error);
      return [];
    }
  }

  /**
   * Subscribe to user posts.
   * First delivery blocked until complete data is ready.
   */
  subscribeToUserPostsOptimized(
    userId: string,
    callback: (posts: PostWithAuthor[]) => void,
    limitCount: number = 20,
  ): Unsubscribe {
    let firstDeliveryDone = false;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 1000;

    let unsubscribe: Unsubscribe = () => {};

    const setup = async () => {
      const { collection, query, where, orderBy, limit, onSnapshot } =
        await import("firebase/firestore");
      const { db } = await import("@/backend/lib/firebase");

      const userPostsQuery = query(
        collection(db, "posts"),
        where("author_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(limitCount),
      );

      unsubscribe = onSnapshot(userPostsQuery, async (snapshot) => {
        const rawPosts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as any[];
        const posts = await this.enrichRawPosts(rawPosts, userId);

        if (!firstDeliveryDone) {
          firstDeliveryDone = true;
          console.log(
            "📡 [Optimized] First complete user posts delivery:",
            posts.length,
          );

          const cacheKey = `user-posts:${userId}:${limitCount}`;
          userPostsCache.get(cacheKey, async () => posts, {
            forceRefresh: true,
          });

          callback(posts);
          lastUpdateTime = Date.now();
          return;
        }

        const now = Date.now();
        if (now - lastUpdateTime < THROTTLE_MS) {
          return;
        }
        lastUpdateTime = now;

        const cacheKey = `user-posts:${userId}:${limitCount}`;
        userPostsCache.get(cacheKey, async () => posts, { forceRefresh: true });

        callback(posts);
      });
    };

    setup().catch((error) => {
      console.error("Error setting up user posts subscription:", error);
      callback([]);
    });

    // Use visibility manager to automatically unsubscribe when tab is hidden
    if (this.enableVisibilityUnloading) {
      const subscriptionKey = `user-posts:${userId}`;
      return visibilitySubscriptionManager.register(subscriptionKey, () => {
        return () => unsubscribe();
      });
    }

    // Default behavior without visibility management
    return () => unsubscribe();
  }

  /**
   * Load engagement data for specific posts on-demand
   * Called when posts scroll into viewport to avoid loading for off-screen posts
   */
  async loadEngagementForPosts(
    postIds: string[],
    userId: string,
  ): Promise<void> {
    const now = Date.now();
    const missingPostIds = postIds.filter(
      (id) => !this.getEngagementCache(id, userId),
    );

    if (missingPostIds.length === 0) return;

    // Fetch posts to check for denormalized counts
    const postsRef = collection(db, "posts");
    const chunks: string[][] = [];
    for (let i = 0; i < missingPostIds.length; i += 10) {
      chunks.push(missingPostIds.slice(i, i + 10));
    }

    const rawPostsMap = new Map<string, any>();
    await Promise.all(
      chunks.map(async (chunk) => {
        const q = query(postsRef, where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        snap.forEach((d) => rawPostsMap.set(d.id, d.data()));
      }),
    );

    const legacyPostIds = missingPostIds.filter((id) => {
      const raw = rawPostsMap.get(id);
      return (
        typeof raw?.likes_count !== "number" ||
        typeof raw?.comments_count !== "number"
      );
    });

    if (legacyPostIds.length === 0) {
      // All have denorm counts, use aggregated counters for comments
      const userLikedIds = await this.preloadUserLikes(userId);
      const commentsCounts = await Promise.all(
        missingPostIds.map((postId) =>
          aggregatedCounters.getCounter(postId, "comments"),
        ),
      );

      missingPostIds.forEach((postId, index) => {
        const raw = rawPostsMap.get(postId);
        if (raw) {
          this.engagementCache.set(`${postId}:${userId}`, {
            likesCount: raw.likes_count || 0,
            commentsCount: commentsCounts[index],
            isLikedByUser: userLikedIds.has(postId),
            expiresAt: now + this.engagementTtlMs,
          });
        }
      });
      return;
    }

    // Legacy posts need batch queries
    const storedLikesCounts = new Map<string, number | undefined>(
      legacyPostIds.map((id) => {
        const v = rawPostsMap.get(id)?.likes_count;
        return [id, typeof v === "number" ? v : undefined];
      }),
    );

    // Use aggregated counters for comments instead of batch queries
    const commentsCounts = await Promise.all(
      missingPostIds.map((postId) =>
        aggregatedCounters.getCounter(postId, "comments"),
      ),
    );

    const legacyLikesMap = await feedService.batchGetPostLikes(
      legacyPostIds,
      userId,
      storedLikesCounts,
    );

    const userLikedIds = await this.preloadUserLikes(userId);

    missingPostIds.forEach((postId, index) => {
      const raw = rawPostsMap.get(postId);
      if (!raw) return;

      this.engagementCache.set(`${postId}:${userId}`, {
        likesCount:
          legacyLikesMap.get(postId)?.likesCount ?? raw.likes_count ?? 0,
        commentsCount: commentsCounts[index],
        isLikedByUser:
          legacyLikesMap.get(postId)?.isLikedByUser ??
          userLikedIds.has(postId) ??
          false,
        expiresAt: now + this.engagementTtlMs,
      });
    });
  }

  /**
   * Clear engagement cache for specific posts or all posts
   * Useful after enabling aggregated counters to force fresh reads
   */
  clearEngagementCache(postId?: string, userId?: string): void {
    if (postId && userId) {
      // Clear specific post engagement
      this.engagementCache.delete(`${postId}:${userId}`);
      console.log(`🧹 Cleared engagement cache for post ${postId}`);
    } else if (userId) {
      // Clear all engagement for a user
      for (const key of this.engagementCache.keys()) {
        if (key.endsWith(`:${userId}`)) {
          this.engagementCache.delete(key);
        }
      }
      console.log(`🧹 Cleared all engagement cache for user ${userId}`);
    } else {
      // Clear all engagement cache
      this.engagementCache.clear();
      console.log(`🧹 Cleared all engagement cache`);
    }
  }

  /**
   * Enrich posts with batched author and likes data
   * This reduces Firebase reads by 80%+ by batching queries
   */
  private async enrichPostsWithBatchData(
    posts: PostWithAuthor[],
    userId: string,
  ): Promise<void> {
    if (posts.length === 0) return;

    console.log(
      `🔄 [Optimized] Enriching ${posts.length} posts with batch data`,
    );

    // Extract unique author IDs
    const authorIds = [...new Set(posts.map((post) => post.author_id))];

    // Extract post IDs
    const postIds = posts.map((post) => post.id);

    // Batch fetch authors and likes in parallel
    const [authorsMap, likesMap] = await Promise.all([
      batchQueryOptimizer.getAuthors(authorIds),
      batchQueryOptimizer.getPostLikesBatch(postIds, userId),
    ]);

    // Enrich posts with the fetched data
    for (const post of posts) {
      const author = authorsMap.get(post.author_id);
      if (author) {
        post.author = author;
      }

      const likes = likesMap.get(post.id);
      if (likes) {
        post.likes_count = likes.likesCount;
        post.is_liked_by_user = likes.isLikedByUser;
      }
    }

    console.log(
      `✅ [Optimized] Enriched ${posts.length} posts with batch data`,
    );
  }

  /**
   * Create post and invalidate relevant caches
   */
  async createPostOptimized(request: any): Promise<PostWithAuthor | null> {
    const post = await feedService.createPost(request);

    if (post) {
      // Invalidate feed caches
      feedCache.invalidatePattern(/^feed:feed:/);
      userPostsCache.invalidatePattern(
        new RegExp(`^feed:user-posts:${request.author_id}`),
      );

      // Get enriched post
      return feedService.getPostWithAuthor(post.id, request.author_id);
    }

    return null;
  }

  /**
   * Like post and invalidate cache
   */
  async likePostOptimized(postId: string, userId: string): Promise<void> {
    await feedService.likePost(postId, userId);

    // Invalidate relevant caches including the per-post engagement TTL cache
    this.engagementCache.delete(`${postId}:${userId}`);
    feedCache.invalidatePattern(/^feed:feed:/);
    userPostsCache.invalidatePattern(/^feed:user-posts:/);

    // Invalidate Redis engagement cache and user likes cache
    redisCache.invalidatePattern(`engagement:${postId}:*`).catch(() => {});
    redisCache.delete(`likes:${userId}`).catch(() => {});
  }

  /**
   * Unlike post and invalidate cache
   */
  async unlikePostOptimized(postId: string, userId: string): Promise<void> {
    await feedService.unlikePost(postId, userId);

    // Invalidate relevant caches including the per-post engagement TTL cache
    this.engagementCache.delete(`${postId}:${userId}`);
    feedCache.invalidatePattern(/^feed:feed:/);
    userPostsCache.invalidatePattern(/^feed:user-posts:/);

    // Invalidate Redis engagement cache and user likes cache
    redisCache.invalidatePattern(`engagement:${postId}:*`).catch(() => {});
    redisCache.delete(`likes:${userId}`).catch(() => {});
  }

  /**
   * Delete post and invalidate cache
   */
  async deletePostOptimized(postId: string, userId: string): Promise<boolean> {
    const result = await feedService.deletePost(postId, userId);

    if (result) {
      // Invalidate all feed caches
      feedCache.invalidatePattern(/^feed:/);
      userPostsCache.invalidatePattern(/^feed:/);
    }

    return result;
  }

  /**
   * Force refresh feed (pull-to-refresh)
   */
  async refreshFeed(
    userId: string,
    limitCount: number = 20,
  ): Promise<PostWithAuthor[]> {
    console.log("🔄 [Optimized] Force refreshing feed...");
    return this.getFeedCached(userId, limitCount, { forceRefresh: true });
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      feedCache: feedCache.getStats(),
      userPostsCache: userPostsCache.getStats(),
    };
  }

  /**
   * Clear all caches (useful for logout)
   */
  clearAllCaches(): void {
    feedCache.clear();
    userPostsCache.clear();
    this.friendIdsCache.clear();
    this.authorDetailsCache.clear();
    this.engagementCache.clear();
    batchQueryOptimizer.clear();
    console.log("🗑️ [Optimized] Cleared all caches");
  }
}

export const optimizedFeedService = new OptimizedFeedService();
