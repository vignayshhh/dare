/**
 * PredictivePreFetch - Pre-fetch data when users are likely to interact
 * 
 * Pre-fetches comments, likes, and other data on hover/scroll to reduce
 * perceived latency and improve user experience.
 */

import { commentService } from "@/middleware/services/comment.service";
import { optimizedFeedService } from "@/middleware/services/feed.service.optimized";

type PreFetchFunction = () => Promise<void>;

interface PreFetchEntry {
  key: string;
  fetchFn: PreFetchFunction;
  timestamp: number;
  isPrefetched: boolean;
}

export class PredictivePreFetch {
  private preFetchQueue = new Map<string, PreFetchEntry>();
  private readonly PREFETCH_DELAY_MS = 300; // Delay before fetching (prevents accidental triggers)
  private readonly PREFETCH_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
  private readonly MAX_PREFETCH_ENTRIES = 50;

  /**
   * Pre-fetch comments for a post (call on hover)
   */
  prefetchComments(postId: string): void {
    this.queuePreFetch(`comments:${postId}`, async () => {
      console.log(`🎯 [PreFetch] Pre-fetching comments for post: ${postId}`);
      await commentService.getComments(postId);
      console.log(`✅ [PreFetch] Comments pre-fetched for post: ${postId}`);
    });
  }

  /**
   * Pre-fetch likes for a post (call on hover)
   */
  prefetchLikes(postId: string, userId: string): void {
    this.queuePreFetch(`likes:${postId}:${userId}`, async () => {
      console.log(`🎯 [PreFetch] Pre-fetching likes for post: ${postId}`);
      await optimizedFeedService.loadEngagementForPosts([postId], userId);
      console.log(`✅ [PreFetch] Likes pre-fetched for post: ${postId}`);
    });
  }

  /**
   * Pre-fetch user profile (call on hover over username)
   */
  prefetchUserProfile(userId: string): void {
    this.queuePreFetch(`user:${userId}`, async () => {
      console.log(`🎯 [PreFetch] Pre-fetching user profile: ${userId}`);
      const { userService } = await import("@/middleware/services/user.service");
      await userService.getProfile(userId);
      console.log(`✅ [PreFetch] User profile pre-fetched: ${userId}`);
    });
  }

  /**
   * Pre-fetch multiple posts (call on scroll)
   */
  prefetchPosts(postIds: string[], userId: string): void {
    this.queuePreFetch(`posts:${postIds.join(",")}`, async () => {
      console.log(`🎯 [PreFetch] Pre-fetching ${postIds.length} posts`);
      await optimizedFeedService.loadEngagementForPosts(postIds, userId);
      console.log(`✅ [PreFetch] Posts pre-fetched: ${postIds.length}`);
    });
  }

  /**
   * Queue a pre-fetch operation with delay
   */
  private queuePreFetch(key: string, fetchFn: PreFetchFunction): void {
    const now = Date.now();
    const existing = this.preFetchQueue.get(key);

    // Skip if already recently prefetched
    if (existing && existing.isPrefetched && (now - existing.timestamp) < this.PREFETCH_TTL_MS) {
      console.log(`⏭️ [PreFetch] Skipping ${key} - already prefetched recently`);
      return;
    }

    // Update or create entry
    this.preFetchQueue.set(key, {
      key,
      fetchFn,
      timestamp: now,
      isPrefetched: false,
    });

    // Enforce max entries (LRU)
    this.enforceMaxEntries();

    // Delay execution to prevent accidental triggers
    setTimeout(async () => {
      const entry = this.preFetchQueue.get(key);
      if (!entry) return;

      try {
        await entry.fetchFn();
        entry.isPrefetched = true;
        entry.timestamp = Date.now();
      } catch (error) {
        console.error(`❌ [PreFetch] Failed for ${key}:`, error);
        // Remove failed entry
        this.preFetchQueue.delete(key);
      }
    }, this.PREFETCH_DELAY_MS);
  }

  /**
   * Enforce maximum number of pre-fetch entries
   */
  private enforceMaxEntries(): void {
    if (this.preFetchQueue.size <= this.MAX_PREFETCH_ENTRIES) {
      return;
    }

    // Sort by timestamp (oldest first)
    const entries = Array.from(this.preFetchQueue.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest entries
    const toRemove = this.preFetchQueue.size - this.MAX_PREFETCH_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      this.preFetchQueue.delete(entries[i][0]);
    }

    console.log(`🗑️ [PreFetch] Evicted ${toRemove} old entries`);
  }

  /**
   * Check if data is already prefetched
   */
  isPrefetched(key: string): boolean {
    const entry = this.preFetchQueue.get(key);
    if (!entry) return false;

    const now = Date.now();
    return entry.isPrefetched && (now - entry.timestamp) < this.PREFETCH_TTL_MS;
  }

  /**
   * Clear all pre-fetch entries
   */
  clear(): void {
    this.preFetchQueue.clear();
    console.log("🗑️ [PreFetch] Cleared all pre-fetch entries");
  }

  /**
   * Get statistics
   */
  getStats() {
    let prefetchedCount = 0;
    let pendingCount = 0;

    for (const entry of this.preFetchQueue.values()) {
      if (entry.isPrefetched) {
        prefetchedCount++;
      } else {
        pendingCount++;
      }
    }

    return {
      total: this.preFetchQueue.size,
      prefetched: prefetchedCount,
      pending: pendingCount,
    };
  }
}

// Singleton instance
export const predictivePreFetch = new PredictivePreFetch();
