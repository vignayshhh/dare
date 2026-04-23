import { Redis } from "@upstash/redis";

/**
 * Redis cache service for reducing Firebase reads
 * Provides caching layer with TTL support and pattern-based invalidation
 * Falls back gracefully if Redis is unavailable
 *
 * SECURITY: This file uses runtime checks (typeof window !== "undefined") to prevent
 * execution in browser environments, preventing UPSTASH_REDIS_REST_TOKEN from being exposed.
 */
class RedisCacheService {
  private redis: Redis | null = null;
  private enabled: boolean = false;
  private initialized: boolean = false;

  constructor() {
    // SECURITY: Disable cache in browser environment
    if (typeof window !== "undefined") {
      this.enabled = false;
      this.initialized = true;
      console.warn("⚠️ Redis cache disabled in browser environment");
      return;
    }
    this.initialize();
  }

  private initialize() {
    if (this.initialized) return;

    try {
      const restUrl = process.env.UPSTASH_REDIS_REST_URL;
      const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (!restUrl || !restToken) {
        console.warn("⚠️ Redis credentials not found, caching disabled");
        this.enabled = false;
        this.initialized = true;
        return;
      }

      this.redis = new Redis({
        url: restUrl,
        token: restToken,
      });

      this.enabled = true;
      this.initialized = true;
      console.log("✅ Redis cache initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Redis:", error);
      this.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Get value from cache
   * @param key Cache key
   * @returns Cached value or null if not found/Redis disabled
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.redis) return null;

    try {
      const value = await this.redis.get<string>(key);
      if (!value) return null;

      try {
        const parsed = JSON.parse(value) as T;
        // Validate parsed data is an object (basic validation)
        if (parsed !== null && typeof parsed === "object") {
          return parsed;
        }
        return null;
      } catch (parseError) {
        console.error("❌ Redis JSON parse error:", parseError);
        return null;
      }
    } catch (error) {
      console.error("❌ Redis get error:", error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds Time to live in seconds (default: 300 = 5min)
   */
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    if (!this.enabled || !this.redis) return;

    try {
      await this.redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (error) {
      console.error("❌ Redis set error:", error);
    }
  }

  /**
   * Delete specific key from cache
   * @param key Cache key to delete
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled || !this.redis) return;

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error("❌ Redis delete error:", error);
    }
  }

  /**
   * Invalidate all keys matching a pattern
   * @param pattern Pattern to match (e.g., "feed:*" to invalidate all feeds)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.enabled || !this.redis) return;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(
          `🗑️ Invalidated ${keys.length} keys matching pattern: ${pattern}`,
        );
      }
    } catch (error) {
      console.error("❌ Redis invalidate pattern error:", error);
    }
  }

  /**
   * Check if Redis is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
export const redisCache = new RedisCacheService();
