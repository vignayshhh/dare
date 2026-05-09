/**
 * Upstash Redis client (edge/serverless-friendly REST).
 *
 * Falls back to an in-memory stub when `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` are missing so local dev doesn't crash,
 * but the stub is NOT multi-process safe and must not be used in
 * production. `redisAvailable` lets callers fail closed when required.
 */
import "server-only";
import { Redis } from "@upstash/redis";

const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Reject the placeholder values shipped in .env.development so the server
// doesn't try to hit `https://your-redis-host.upstash.io` and throw a DNS
// error on every rate-limit check. A value is "real" only if it's set AND
// doesn't look like a template string.
function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  const lower = v.toLowerCase();
  return (
    lower.includes("your-") ||
    lower.includes("your_") ||
    lower.includes("_here") ||
    lower.includes("changeme") ||
    lower.includes("example")
  );
}

const url = isPlaceholder(rawUrl) ? undefined : rawUrl;
const token = isPlaceholder(rawToken) ? undefined : rawToken;

export const redisAvailable = Boolean(url && token);

if (process.env.NODE_ENV !== "production" && !redisAvailable) {
  console.warn(
    "[redis] UPSTASH_REDIS_REST_URL/TOKEN not set (or placeholder). Using in-memory stub. Not safe for production.",
  );
}

interface MiniRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
  sismember(key: string, member: string): Promise<0 | 1>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: string,
    opts?: { ex?: number },
  ): Promise<string | null>;
  del(key: string): Promise<number>;
}

let client: MiniRedis;

if (redisAvailable) {
  client = new Redis({ url: url!, token: token! }) as unknown as MiniRedis;
} else {
  // Local fallback: in-memory store with TTL. DO NOT use in production.
  const store = new Map<string, { v: unknown; exp: number | null }>();
  const sets = new Map<string, Set<string>>();
  function now() {
    return Date.now();
  }
  function cleanup(key: string) {
    const e = store.get(key);
    if (e && e.exp !== null && e.exp < now()) store.delete(key);
  }
  client = {
    async incr(key) {
      cleanup(key);
      const cur = (store.get(key)?.v as number) ?? 0;
      const next = cur + 1;
      store.set(key, { v: next, exp: store.get(key)?.exp ?? null });
      return next;
    },
    async expire(key, seconds) {
      const e = store.get(key);
      if (!e) return 0;
      e.exp = now() + seconds * 1000;
      return 1;
    },
    async pexpire(key, ms) {
      const e = store.get(key);
      if (!e) return 0;
      e.exp = now() + ms;
      return 1;
    },
    async pttl(key) {
      cleanup(key);
      const e = store.get(key);
      if (!e) return -2;
      if (e.exp === null) return -1;
      return Math.max(0, e.exp - now());
    },
    async sismember(key, member) {
      return sets.get(key)?.has(member) ? 1 : 0;
    },
    async sadd(key, member) {
      if (!sets.has(key)) sets.set(key, new Set());
      const s = sets.get(key)!;
      const had = s.has(member);
      s.add(member);
      return had ? 0 : 1;
    },
    async srem(key, member) {
      const s = sets.get(key);
      if (!s) return 0;
      const had = s.delete(member);
      return had ? 1 : 0;
    },
    async smembers(key) {
      return Array.from(sets.get(key) ?? []);
    },
    async get<T>(key: string): Promise<T | null> {
      cleanup(key);
      return (store.get(key)?.v as T) ?? null;
    },
    async set(key, value, opts) {
      store.set(key, {
        v: value,
        exp: opts?.ex ? now() + opts.ex * 1000 : null,
      });
      return "OK";
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
  };
}

export const redis: MiniRedis = client;
