/**
 * Redis cache service for reducing Firebase reads.
 *
 * This module is imported by services that can run in the browser, so it must
 * not statically import server-only Redis code. Browser usage is a silent no-op;
 * server usage dynamically loads Upstash when cache methods are called.
 */
class RedisCacheService {
  private redis: any = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initialized = true;
    }
  }

  private async initialize() {
    if (this.initialized) return;

    if (typeof window !== "undefined") {
      this.enabled = false;
      this.initialized = true;
      return;
    }

    try {
      const restUrl = process.env.UPSTASH_REDIS_REST_URL;
      const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (!restUrl || !restToken) {
        console.warn("Redis credentials not found, caching disabled");
        this.enabled = false;
        this.initialized = true;
        return;
      }

      const { Redis } = await import("@upstash/redis");
      this.redis = new Redis({
        url: restUrl,
        token: restToken,
      });

      this.enabled = true;
      this.initialized = true;
      console.log("Redis cache initialized");
    } catch (error) {
      console.error("Failed to initialize Redis:", error);
      this.enabled = false;
      this.initialized = true;
    }
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    this.initPromise ||= this.initialize();
    await this.initPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureInitialized();
    if (!this.enabled || !this.redis) return null;

    try {
      const value = await this.redis.get(key);
      if (!value) return null;

      try {
        const parsed = JSON.parse(value) as T;
        if (parsed !== null && typeof parsed === "object") {
          return parsed;
        }
        return null;
      } catch (parseError) {
        console.error("Redis JSON parse error:", parseError);
        return null;
      }
    } catch (error) {
      console.error("Redis get error:", error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    await this.ensureInitialized();
    if (!this.enabled || !this.redis) return;

    try {
      await this.redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (error) {
      console.error("Redis set error:", error);
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.enabled || !this.redis) return;

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.enabled || !this.redis) return;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error("Redis invalidate pattern error:", error);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const redisCache = new RedisCacheService();
