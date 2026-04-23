/**
 * FeedCacheManager - Intelligent caching layer for social media feed
 *
 * Implements Instagram-style caching strategy:
 * - Multi-layer cache (memory + persistent storage)
 * - Stale-while-revalidate pattern
 * - Request deduplication
 * - Smart cache invalidation
 * - Batch operations
 */

import { PostWithAuthor } from "../services/feed.service";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface InFlightRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

export interface CacheConfig {
  // How long data is considered fresh (no refetch needed)
  freshDuration: number; // 30 seconds for feed
  // How long stale data can be served while revalidating
  staleDuration: number; // 5 minutes
  // Maximum cache size
  maxEntries: number;
  // Enable persistent storage
  persistentCache: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  freshDuration: 30 * 1000, // 30 seconds
  staleDuration: 5 * 60 * 1000, // 5 minutes
  maxEntries: 50, // Reduced from 100 to prevent storage issues
  persistentCache: true,
};

export class FeedCacheManager {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private inFlightRequests: Map<string, InFlightRequest<any>> = new Map();
  private config: CacheConfig;
  private storageKey = "dare-feed-cache-v2";

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromPersistentStorage();
    this.startCleanupInterval();
  }

  /**
   * Get data from cache or fetch with deduplication
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { skipCache?: boolean; forceRefresh?: boolean } = {},
  ): Promise<T> {
    const cacheKey = this.getCacheKey(key);

    // Force refresh bypasses all caching
    if (options.forceRefresh) {
      return this.fetchAndCache(cacheKey, fetcher);
    }

    // Check if there's an in-flight request for this key (deduplication)
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      console.log(`🔄 [Cache] Deduplicating request for: ${key}`);
      return inFlight.promise;
    }

    // Check memory cache
    const cached = this.memoryCache.get(cacheKey);
    const now = Date.now();

    if (cached && !options.skipCache) {
      const age = now - cached.timestamp;
      const isFresh = age < this.config.freshDuration;
      const isStale = age > this.config.staleDuration;

      if (isFresh) {
        // Data is fresh, return immediately
        console.log(
          `✅ [Cache] Fresh hit for: ${key} (age: ${Math.round(age / 1000)}s)`,
        );
        return cached.data;
      }

      if (!isStale) {
        // Data is stale but usable - return immediately and revalidate in background
        console.log(
          `⚡ [Cache] Stale hit for: ${key} (age: ${Math.round(age / 1000)}s) - revalidating in background`,
        );
        this.revalidateInBackground(cacheKey, fetcher);
        return cached.data;
      }

      // Data is too stale, fetch fresh
      console.log(
        `❌ [Cache] Expired for: ${key} (age: ${Math.round(age / 1000)}s)`,
      );
    }

    // No cache or expired - fetch fresh data
    return this.fetchAndCache(cacheKey, fetcher);
  }

  /**
   * Fetch data and update cache with deduplication
   */
  private async fetchAndCache<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // Create in-flight request to prevent duplicates
    const promise = fetcher();
    this.inFlightRequests.set(cacheKey, {
      promise,
      timestamp: Date.now(),
    });

    try {
      const data = await promise;
      const now = Date.now();

      // Update memory cache
      this.memoryCache.set(cacheKey, {
        data,
        timestamp: now,
        expiresAt: now + this.config.staleDuration,
      });

      // Enforce max cache size (LRU eviction)
      this.enforceMaxSize();

      // Persist to storage
      if (this.config.persistentCache) {
        this.saveToPersistentStorage();
      }

      console.log(`💾 [Cache] Stored fresh data for: ${cacheKey}`);
      return data;
    } finally {
      // Clean up in-flight request
      this.inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * Revalidate cache in background without blocking
   */
  private revalidateInBackground<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
  ): void {
    // Don't revalidate if already in-flight
    if (this.inFlightRequests.has(cacheKey)) {
      return;
    }

    this.fetchAndCache(cacheKey, fetcher).catch((error) => {
      console.error(
        `❌ [Cache] Background revalidation failed for ${cacheKey}:`,
        error,
      );
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    const cacheKey = this.getCacheKey(key);
    this.memoryCache.delete(cacheKey);
    console.log(`🗑️ [Cache] Invalidated: ${key}`);
  }

  /**
   * Invalidate all cache entries matching pattern
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        this.memoryCache.delete(key);
        count++;
      }
    }
    console.log(
      `🗑️ [Cache] Invalidated ${count} entries matching pattern: ${pattern}`,
    );
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.inFlightRequests.clear();
    if (this.config.persistentCache) {
      try {
        // Check if sessionStorage is available (prevents SSR errors)
        if (typeof window !== "undefined" && window.sessionStorage) {
          sessionStorage.removeItem(this.storageKey);
        }
      } catch (error) {
        console.error("Failed to clear persistent cache:", error);
      }
    }
    console.log("🗑️ [Cache] Cleared all cache");
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let freshCount = 0;
    let staleCount = 0;
    let expiredCount = 0;

    for (const entry of this.memoryCache.values()) {
      const age = now - entry.timestamp;
      if (age < this.config.freshDuration) {
        freshCount++;
      } else if (age < this.config.staleDuration) {
        staleCount++;
      } else {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.memoryCache.size,
      freshEntries: freshCount,
      staleEntries: staleCount,
      expiredEntries: expiredCount,
      inFlightRequests: this.inFlightRequests.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Enforce maximum cache size using LRU eviction
   */
  private enforceMaxSize(): void {
    if (this.memoryCache.size <= this.config.maxEntries) {
      return;
    }

    // Sort by timestamp (oldest first)
    const entries = Array.from(this.memoryCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    // Remove oldest entries
    const toRemove = this.memoryCache.size - this.config.maxEntries;
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }

    console.log(`🗑️ [Cache] Evicted ${toRemove} old entries (LRU)`);
  }

  /**
   * Periodic cleanup of expired entries and stale in-flight requests
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpired();
      this.cleanupStaleInFlight();
    }, 60 * 1000); // Every minute
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🗑️ [Cache] Cleaned up ${removed} expired entries`);
    }
  }

  private cleanupStaleInFlight(): void {
    const now = Date.now();
    const staleThreshold = 30 * 1000; // 30 seconds
    let removed = 0;

    for (const [key, request] of this.inFlightRequests.entries()) {
      if (now - request.timestamp > staleThreshold) {
        this.inFlightRequests.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🗑️ [Cache] Cleaned up ${removed} stale in-flight requests`);
    }
  }

  /**
   * Load cache from persistent storage
   */
  private loadFromPersistentStorage(): void {
    if (!this.config.persistentCache) return;

    try {
      // Check if sessionStorage is available (prevents SSR errors)
      if (typeof window === "undefined" || !window.sessionStorage) {
        return;
      }
      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        let parsed;
        try {
          parsed = JSON.parse(stored);
        } catch (error) {
          console.error("Failed to parse cached data:", error);
          return;
        }
        const now = Date.now();

        // Only load non-expired entries
        for (const [key, entry] of Object.entries(parsed)) {
          const cacheEntry = entry as CacheEntry<any>;
          if (now < cacheEntry.expiresAt) {
            this.memoryCache.set(key, cacheEntry);
          }
        }

        console.log(
          `💾 [Cache] Loaded ${this.memoryCache.size} entries from storage`,
        );
      }
    } catch (error) {
      console.error("Failed to load cache from storage:", error);
    }
  }

  /**
   * Save cache to persistent storage
   */
  private saveToPersistentStorage = this.throttle(() => {
    if (!this.config.persistentCache) return;

    try {
      const toStore: Record<string, CacheEntry<any>> = {};

      // Only persist entries that haven't expired
      const now = Date.now();
      let totalSize = 0;
      const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit (sessionStorage is typically 5-10MB)

      // Sort entries by timestamp (newest first) to prioritize recent data
      const sortedEntries = Array.from(this.memoryCache.entries())
        .filter(([_, entry]) => now < entry.expiresAt)
        .sort((a, b) => b[1].timestamp - a[1].timestamp);

      for (const [key, entry] of sortedEntries) {
        // Create a lightweight version of the entry for storage
        const lightEntry = this.createLightweightEntry(entry);
        const entrySize = JSON.stringify(lightEntry).length;

        // Stop if we would exceed storage limit
        if (totalSize + entrySize > MAX_STORAGE_SIZE) {
          console.warn(
            `⚠️ [Cache] Storage limit reached, stopping at ${Math.round(totalSize / 1024)}KB`,
          );
          break;
        }

        toStore[key] = lightEntry;
        totalSize += entrySize;
      }

      // Check if sessionStorage is available (prevents SSR errors)
      if (typeof window === "undefined" || !window.sessionStorage) {
        return;
      }
      sessionStorage.setItem(this.storageKey, JSON.stringify(toStore));
      console.log(
        `💾 [Cache] Saved ${Object.keys(toStore).length} entries (${Math.round(totalSize / 1024)}KB)`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.error(
          "❌ [Cache] Storage quota exceeded, clearing old cache...",
        );
        // Clear the cache and try again with just the most recent entries
        this.clearPersistentStorage();
        this.saveLimitedCache();
      } else {
        console.error("❌ [Cache] Failed to save cache to storage:", error);
      }
    }
  }, 5000); // Throttle to once per 5 seconds

  /**
   * Create a lightweight version of cache entry for storage.
   * Keeps all fields needed for instant render (media, avatars, counts)
   * but drops inline data URLs that bloat storage.
   */
  private createLightweightEntry<T>(entry: CacheEntry<T>): CacheEntry<any> {
    const data = entry.data;

    // If data is an array of posts, drop only truly heavy inline data
    if (Array.isArray(data)) {
      const lightData = data.map((item: any) => {
        if (item && typeof item === "object") {
          // Drop base64 data URLs but keep normal URLs (Firebase Storage, CDN, etc.)
          const isDataUrl = (v?: string) =>
            typeof v === "string" && v.startsWith("data:");

          return {
            id: item.id,
            author_id: item.author_id,
            author: item.author
              ? {
                  id: item.author.id,
                  user_id: item.author.user_id,
                  username: item.author.username,
                  display_name: item.author.display_name,
                  avatar_url: isDataUrl(item.author.avatar_url)
                    ? ""
                    : item.author.avatar_url || "",
                }
              : undefined,
            content: item.content || "",
            media_url: isDataUrl(item.media_url) ? undefined : item.media_url,
            media_type: item.media_type,
            view_count: item.view_count,
            likes_count: item.likes_count,
            comments_count: item.comments_count,
            is_liked_by_user: item.is_liked_by_user,
            created_at: item.created_at,
            updated_at: item.updated_at,
          };
        }
        return item;
      });

      return {
        data: lightData,
        timestamp: entry.timestamp,
        expiresAt: entry.expiresAt,
      };
    }

    return entry;
  }

  /**
   * Save only the most recent, essential cache entries
   */
  private saveLimitedCache(): void {
    try {
      const toStore: Record<string, CacheEntry<any>> = {};
      const now = Date.now();
      const MAX_ENTRIES = 10; // Only save 10 most recent entries

      const sortedEntries = Array.from(this.memoryCache.entries())
        .filter(([_, entry]) => now < entry.expiresAt)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, MAX_ENTRIES);

      for (const [key, entry] of sortedEntries) {
        toStore[key] = this.createLightweightEntry(entry);
      }

      // Check if sessionStorage is available (prevents SSR errors)
      if (typeof window === "undefined" || !window.sessionStorage) {
        return;
      }
      sessionStorage.setItem(this.storageKey, JSON.stringify(toStore));
      console.log(
        `💾 [Cache] Saved limited cache (${Object.keys(toStore).length} entries)`,
      );
    } catch (error) {
      console.error("❌ [Cache] Failed to save limited cache:", error);
      // If even limited cache fails, disable persistent cache
      this.config.persistentCache = false;
      console.warn(
        "⚠️ [Cache] Disabled persistent cache due to storage errors",
      );
    }
  }

  /**
   * Clear persistent storage
   */
  private clearPersistentStorage(): void {
    try {
      // Check if sessionStorage is available (prevents SSR errors)
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.removeItem(this.storageKey);
      }
    } catch (error) {
      console.error("Failed to clear persistent storage:", error);
    }
  }

  private getCacheKey(key: string): string {
    return `feed:${key}`;
  }

  private estimateMemoryUsage(): string {
    const size = JSON.stringify(Array.from(this.memoryCache.entries())).length;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  private throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) return;
      timeout = setTimeout(() => {
        func(...args);
        timeout = null;
      }, wait);
    };
  }
}

// Singleton instances for different cache types
export const feedCache = new FeedCacheManager({
  freshDuration: 30 * 1000, // 30 seconds
  staleDuration: 5 * 60 * 1000, // 5 minutes
  maxEntries: 30, // Reduced to prevent storage quota issues
  persistentCache: true,
});

export const userPostsCache = new FeedCacheManager({
  freshDuration: 60 * 1000, // 1 minute
  staleDuration: 10 * 60 * 1000, // 10 minutes
  maxEntries: 20, // Reduced to prevent storage quota issues
  persistentCache: true,
});

export const authorCache = new FeedCacheManager({
  freshDuration: 5 * 60 * 1000, // 5 minutes (authors don't change often)
  staleDuration: 30 * 60 * 1000, // 30 minutes
  maxEntries: 100, // Reduced from 200
  persistentCache: false, // Disable persistence for author cache (can be refetched quickly)
});
