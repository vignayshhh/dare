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
  getDocsFromServer,
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

  // Cache the auth-ready promise so concurrent callers share one waiter.
  private authReadyPromise: Promise<boolean> | null = null;

  /**
   * Wait until Firebase Auth has restored the current user on the client.
   *
   * After a page refresh our Zustand auth store rehydrates `user` synchronously
   * from localStorage, so `currentUser.userId` flips to a real uid almost
   * immediately and `subscribeToFeed(uid)` is dispatched right away. The
   * Firebase Auth SDK, however, only restores `auth.currentUser` async via
   * `onAuthStateChanged`. Any Firestore read whose security rule requires
   * `isSignedIn()` (e.g. `post_likes`) that runs in this window fails with
   * PERMISSION_DENIED. `getDocsFromServer` surfaces that as a thrown error,
   * `onSnapshot` silently retries. This helper bridges the gap so one-shot
   * reads can wait for auth instead of racing it.
   */
  private waitForAuthReady(timeoutMs = 5000): Promise<boolean> {
    if (this.authReadyPromise) return this.authReadyPromise;

    this.authReadyPromise = (async () => {
      try {
        const { auth } = await import("@/backend/lib/firebase");
        if (auth?.currentUser) return true;
        return await new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            try {
              unsub();
            } catch {}
            clearTimeout(timer);
            // Allow re-evaluation later if auth is still not ready, so a
            // future call can wait again rather than instantly returning false.
            if (!ok) this.authReadyPromise = null;
            resolve(ok);
          };
          const timer = setTimeout(() => finish(false), timeoutMs);
          const unsub = auth.onAuthStateChanged((u: any) => {
            if (u) finish(true);
          });
        });
      } catch (error) {
        console.error("❌ [waitForAuthReady] failed:", error);
        this.authReadyPromise = null;
        return false;
      }
    })();

    return this.authReadyPromise;
  }

  private async preloadUserLikes(userId: string): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.userLikedPostIds.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.ids;
    }

    // CRITICAL: wait for Firebase Auth to restore on the client before
    // issuing the query. Otherwise a page refresh races the SDK's auth
    // restoration and Firestore returns PERMISSION_DENIED for post_likes
    // (rules require isSignedIn). That error used to be swallowed silently
    // and the heart would appear empty even though the like was persisted.
    const authReady = await this.waitForAuthReady();
    if (!authReady) {
      console.warn(
        `⚠️ [preloadUserLikes] auth not ready within timeout for ${userId}; returning empty set`,
      );
      return new Set<string>();
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

      // Fetch from Firestore server directly — bypass the IndexedDB
      // persistent cache. Firestore's local cache is only invalidated when
      // an active onSnapshot listener is on the collection. Since we have
      // no listener on `post_likes`, getDocs() can return stale pre-like
      // results after a page refresh, making hearts appear empty even
      // though the like was successfully written. getDocsFromServer
      // guarantees a fresh read every time the in-memory TTL expires.
      const q = query(
        collection(db, "post_likes"),
        where("user_id", "==", userId),
        firestoreLimit(200),
      );
      const snap = await getDocsFromServer(q);
      const ids = new Set<string>();
      snap.forEach((d) => ids.add(d.data().post_id));
      console.log(
        `🔄 [preloadUserLikes] server fetch \u2192 ${ids.size} liked post(s) for user ${userId}`,
        Array.from(ids),
      );
      this.userLikedPostIds.set(userId, {
        ids,
        expiresAt: now + this.userLikesTtlMs,
      });

      // Cache in Redis with 5min TTL
      redisCache.set(cacheKey, Array.from(ids), 300).catch(() => {});

      return ids;
    } catch (error) {
      console.error(
        `❌ [preloadUserLikes] query failed for user ${userId}:`,
        error,
      );
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

  private async rehydrateCachedFeedLikes<
    T extends { id: string; is_liked_by_user?: boolean; likes_count?: number },
  >(posts: T[], userId: string): Promise<T[]> {
    if (posts.length === 0) return posts;

    const likedPostIds = await this.preloadUserLikes(userId);

    // Fetch fresh like counts from aggregated counters for all posts
    // to ensure cached posts show correct counts immediately
    const postIds = posts.map((p) => p.id);
    const likeCounts = await Promise.all(
      postIds.map((postId) => aggregatedCounters.getCounter(postId, "likes")),
    );

    const likeCountMap = new Map<string, number>();
    postIds.forEach((postId, index) => {
      likeCountMap.set(postId, likeCounts[index]);
    });

    return posts.map((post) => {
      const freshLikeCount = likeCountMap.get(post.id) ?? 0;
      // Use Math.max to prefer the fresh count but fall back to cached if fresh is 0
      const finalLikeCount = Math.max(
        freshLikeCount,
        typeof post.likes_count === "number" ? post.likes_count : 0,
      );
      return {
        ...post,
        is_liked_by_user: likedPostIds.has(post.id),
        likes_count: finalLikeCount,
      };
    });
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
    // Always preload the user's liked-post set so realtime snapshot updates
    // can correctly compute `is_liked_by_user` for posts that are already in
    // the engagement TTL cache (otherwise the heart would not refill after a
    // like flows through the Firestore listener). The result is itself
    // cached for 5min, so this stays cheap.
    const [freshAuthorsMap, userLikedIds] = await Promise.all([
      this.fetchAuthorsWithRedis(missingAuthorIds),
      this.preloadUserLikes(userId),
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

    // Load authoritative counts from aggregated counters for all posts.
    // aggregatedCounters.getCounter falls back to counting the actual
    // post_likes / post_comments documents when the counter doc is missing,
    // so this works even for legacy posts whose denormalized `likes_count`
    // on the `posts` doc is stale (e.g. Cloud Function trigger not yet
    // running when the like was created). This is what fixes "count only
    // shows correctly after opening the likes modal" — the modal path
    // counted docs directly while the feed path trusted the stale
    // denormalized field.
    const [commentsCounts, likesCounts] = await Promise.all([
      Promise.all(
        missingEngagementPostIds.map((postId) =>
          aggregatedCounters.getCounter(postId, "comments"),
        ),
      ),
      Promise.all(
        missingEngagementPostIds.map((postId) =>
          aggregatedCounters.getCounter(postId, "likes"),
        ),
      ),
    ]);

    missingEngagementPostIds.forEach((postId, index) => {
      const raw = rawPostsMap.get(postId);
      const hasDenormalized =
        typeof raw?.likes_count === "number" &&
        typeof raw?.comments_count === "number";

      if (hasDenormalized) {
        // Prefer the aggregated counter (which falls back to an actual
        // post_likes count) over the denormalized field on the post doc,
        // since the latter can be stale.
        const engagementData = {
          likesCount: Math.max(raw.likes_count, likesCounts[index] ?? 0),
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

      // Compute the best likes count from two authoritative sources:
      //
      // 1. `raw.likes_count` — written by the `onPostLikeCreated` /
      //    `onPostLikeDeleted` Cloud Function triggers and delivered live
      //    via the Firestore onSnapshot listener. This is the realtime
      //    source and fixes the stale-cache/no-update problem.
      //
      // 2. `engagement?.likesCount` — populated by `batchGetPostLikes`
      //    which counts actual `post_likes` documents. This is the
      //    accurate fallback for legacy posts where `likes_count` on
      //    the post doc is 0 or missing because the Cloud Function was
      //    not yet deployed when those likes were added.
      //
      // Taking Math.max handles all cases:
      //   - New like arrives:  raw=6, cache=5  → 6  (realtime ✓)
      //   - Legacy post:       raw=0, cache=5  → 5  (actual count ✓)
      //   - Post past limit:   raw=5, cache=0  → 5  (was 0 before ✓)
      //   - Genuine zero:      raw=0, cache=0  → 0  (correct ✓)
      const rawLikes =
        typeof post.likes_count === "number" ? post.likes_count : 0;
      const rawComments =
        typeof post.comments_count === "number" ? post.comments_count : 0;

      const likesCount = Math.max(rawLikes, engagement?.likesCount ?? 0);
      const commentsCount = Math.max(
        rawComments,
        engagement?.commentsCount ?? 0,
      );
      // is_liked_by_user comes from the user's own likes set (preloaded via
      // `preloadUserLikes` and kept warm by `updateLikeCache` on optimistic
      // like/unlike). Fall back to the engagement cache when neither is
      // populated (e.g. posts past the enrichment slice).
      const isLikedByUser =
        userLikedIds.has(post.id) || engagement?.isLikedByUser || false;

      // Keep the TTL cache in sync with the realtime numbers so subsequent
      // calls (loadEngagementForPosts, getFeedCached, etc.) see fresh data.
      this.engagementCache.set(`${post.id}:${userId}`, {
        likesCount,
        commentsCount,
        isLikedByUser,
        expiresAt: now + this.engagementTtlMs,
      });

      return {
        id: post.id,
        author_id: post.author_id,
        author,
        content: post.content || "",
        media_url: post.media_url || null,
        media_type: post.media_type || null,
        view_count: post.view_count || 0,
        likes_count: likesCount,
        comments_count: commentsCount,
        is_liked_by_user: isLikedByUser,
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
        // Wait for Firebase Auth to restore before any Firestore read.
        // Without this, post_likes/legacy batch reads inside enrichRawPosts
        // race the SDK's auth restoration on refresh and silently come back
        // empty due to PERMISSION_DENIED, leaving hearts empty even though
        // the likes were persisted server-side.
        const authReady = await this.waitForAuthReady();
        if (!authReady) {
          console.warn(
            "⚠️ [subscribeToFeedOptimized] auth not ready; delivering empty feed",
          );
          onUpdate([]);
          return;
        }

        const queryAuthorIds = await this.getFeedAuthorIds(userId);

        console.log("🔄 Feed query for authors:", queryAuthorIds);

        // Check Redis cache FIRST to prevent Firestore reads on reload
        const cacheKey = `feed:${userId}`;
        const cachedFeed = await redisCache.get<any[]>(cacheKey);
        if (cachedFeed && cachedFeed.length > 0) {
          const hydratedCachedFeed = await this.rehydrateCachedFeedLikes(
            cachedFeed,
            userId,
          );
          console.log(
            "✅ Using cached feed from Redis:",
            hydratedCachedFeed.length,
            "posts",
          );
          onUpdate(hydratedCachedFeed);

          // Track last post's created_at for pagination
          if (hydratedCachedFeed.length > 0) {
            this.lastPostCreatedAt =
              hydratedCachedFeed[hydratedCachedFeed.length - 1].created_at;
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
      // Wait for Firebase Auth before any Firestore read inside enrichRawPosts.
      // See subscribeToFeedOptimized for the rationale.
      const authReady = await this.waitForAuthReady();
      if (!authReady) {
        console.warn(
          "⚠️ [subscribeToUserPostsOptimized] auth not ready; delivering empty user posts",
        );
        callback([]);
        return;
      }

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
    // Await the API write FIRST. If it throws, we must not update any local
    // cache — otherwise the optimistic UI will keep showing a filled heart
    // for a like that was never persisted, and it will vanish on the next
    // refresh.
    try {
      await feedService.likePost(postId, userId);
      console.log("✅ [LIKE] persisted to Firestore:", postId);
    } catch (error) {
      console.error(
        "❌ [LIKE] not persisted — rolling back local caches:",
        postId,
        error,
      );
      // Make sure no stale entry survives in any cache layer.
      this.updateLikeCache(userId, postId, false);
      this.engagementCache.delete(`${postId}:${userId}`);
      throw error;
    }

    // Keep the warm in-memory liked-post cache aligned with the mutation so
    // the next feed enrichment pass does not briefly regress is_liked_by_user.
    this.updateLikeCache(userId, postId, true);

    // Invalidate relevant caches including the per-post engagement TTL cache
    this.engagementCache.delete(`${postId}:${userId}`);
    feedCache.invalidatePattern(/^feed:feed:/);
    userPostsCache.invalidatePattern(/^feed:user-posts:/);

    // Invalidate Redis engagement cache, feed cache, and user likes cache
    redisCache.delete(`feed:${userId}`).catch(() => {});
    redisCache.invalidatePattern(`engagement:${postId}:*`).catch(() => {});
    redisCache.delete(`likes:${userId}`).catch(() => {});
  }

  /**
   * Unlike post and invalidate cache
   */
  async unlikePostOptimized(postId: string, userId: string): Promise<void> {
    try {
      await feedService.unlikePost(postId, userId);
      console.log("✅ [UNLIKE] persisted to Firestore:", postId);
    } catch (error) {
      console.error(
        "❌ [UNLIKE] not persisted — leaving local caches as-is:",
        postId,
        error,
      );
      throw error;
    }

    // Mirror the unlike locally so cached feed enrichment stays consistent.
    this.updateLikeCache(userId, postId, false);

    // Invalidate relevant caches including the per-post engagement TTL cache
    this.engagementCache.delete(`${postId}:${userId}`);
    feedCache.invalidatePattern(/^feed:feed:/);
    userPostsCache.invalidatePattern(/^feed:user-posts:/);

    // Invalidate Redis engagement cache, feed cache, and user likes cache
    redisCache.delete(`feed:${userId}`).catch(() => {});
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
