/**
 * IP block list (§2.8) backed by Redis for low-latency checks.
 *
 * Uses a Redis SET `ip:blocked`. Edge middleware also reads this set so
 * blocked IPs never even hit the app route handlers.
 */
import "server-only";
import { redis } from "./redis";

const BLOCK_KEY = "ip:blocked";

export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export async function isIpBlocked(ip: string | null | undefined): Promise<boolean> {
  if (!ip) return false;
  return (await redis.sismember(BLOCK_KEY, ip)) === 1;
}

export async function blockIp(ip: string, reason: string | undefined): Promise<void> {
  await redis.sadd(BLOCK_KEY, ip);
  // Audit trail in Firestore handled separately by the callers (admin API).
  void reason;
}

export async function unblockIp(ip: string): Promise<void> {
  await redis.srem(BLOCK_KEY, ip);
}

export async function listBlockedIps(): Promise<string[]> {
  return redis.smembers(BLOCK_KEY);
}
