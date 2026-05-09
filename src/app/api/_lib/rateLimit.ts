/**
 * Server-authoritative rate limiting via Redis INCR with PEXPIRE.
 *
 * Key pattern: rl:{bucket}:{subject}. `subject` is typically the uid or
 * IP. First request in a window runs INCR then PEXPIRE, so the window
 * is fixed to the first request's timestamp. Deleting the Firestore
 * rate_limits doc cannot bypass this — the state lives in Redis.
 */
import "server-only";
import { redis, redisAvailable } from "./redis";

export interface LimitConfig {
  bucket: string;
  max: number;
  windowMs: number;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export const LIMITS = {
  LIKE: { bucket: "like", max: 60, windowMs: 60_000 }, // 60 / min
  UNLIKE: { bucket: "unlike", max: 60, windowMs: 60_000 },
  VIEW: { bucket: "view", max: 600, windowMs: 60_000 },
  COMMENT: { bucket: "comment", max: 20, windowMs: 60_000 },
  POST_CREATE: { bucket: "post", max: 10, windowMs: 15 * 60_000 },
  MESSAGE: { bucket: "message", max: 60, windowMs: 60_000 },
  REPORT: { bucket: "report", max: 5, windowMs: 15 * 60_000 },
  PROFILE_EDIT: { bucket: "profile", max: 10, windowMs: 15 * 60_000 },
  MODERATION: { bucket: "mod", max: 60, windowMs: 60_000 },
  // SECURITY FIX: Added rate limiting for read operations to prevent scraping
  PROFILE_VIEW: { bucket: "profile_view", max: 100, windowMs: 60_000 }, // 100 / min
  FEED_FETCH: { bucket: "feed", max: 30, windowMs: 60_000 }, // 30 / min
  USER_SEARCH: { bucket: "search", max: 50, windowMs: 60_000 }, // 50 / min
  POST_FETCH: { bucket: "post_fetch", max: 200, windowMs: 60_000 }, // 200 / min
  DARE_FETCH: { bucket: "dare_fetch", max: 100, windowMs: 60_000 }, // 100 / min
} satisfies Record<string, LimitConfig>;

/**
 * Check + increment a rate-limit bucket atomically. Returns allowed=false
 * when the caller is over the threshold.
 */
export async function enforceRateLimit(
  cfg: LimitConfig,
  subject: string,
): Promise<LimitResult> {
  const key = `rl:${cfg.bucket}:${subject}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, cfg.windowMs);
  }
  const ttl = await redis.pttl(key);
  const allowed = count <= cfg.max;
  return {
    allowed,
    remaining: Math.max(0, cfg.max - count),
    retryAfterMs: allowed ? 0 : Math.max(0, ttl),
  };
}

export { redisAvailable };
