/**
 * Server-side bot / abuse signal detection (§2.9).
 *
 * Two layers:
 *   1. Cheap heuristics on every state-changing request (UA allow-list,
 *      missing headers, obvious bot UAs, per-IP fanout).
 *   2. Optional Cloudflare Turnstile challenge verification. If the
 *      `TURNSTILE_SECRET_KEY` env is present and the client sent a
 *      `cf-turnstile-response` header, we verify it with Cloudflare.
 *
 * Set `BOT_CHECK_STRICT=true` in prod to require a Turnstile token on
 * sensitive endpoints (signup, post create, report, message).
 */
import "server-only";
import { redis } from "./redis";

const STRICT = process.env.BOT_CHECK_STRICT === "true";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

// Crude but effective: deny well-known scrape UAs.
const BLOCKED_UA_PATTERNS = [
  /curl\//i,
  /python-requests/i,
  /wget/i,
  /scrapy/i,
  /httpclient/i,
  /headlesschrome/i,
  /phantomjs/i,
  /slimerjs/i,
  /selenium/i,
  /bot\b/i,
  /crawler/i,
  /spider/i,
];

export interface BotCheckResult {
  ok: boolean;
  reason?: string;
}

export async function cheapBotCheck(req: Request, ip: string | null): Promise<BotCheckResult> {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua) return { ok: false, reason: "missing user-agent" };
  if (ua.length > 512) return { ok: false, reason: "user-agent too long" };
  for (const re of BLOCKED_UA_PATTERNS) {
    if (re.test(ua)) return { ok: false, reason: `blocked ua pattern ${re}` };
  }
  // Humans almost always send Accept-Language on browser navigations.
  if (!req.headers.get("accept-language")) {
    return { ok: false, reason: "missing accept-language" };
  }
  // Per-IP burst: > 30 distinct state-changing requests in 5s is scripted.
  if (ip) {
    const key = `bot:burst:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.pexpire(key, 5_000);
    if (n > 30) return { ok: false, reason: "burst" };
  }
  return { ok: true };
}

export async function verifyTurnstile(
  req: Request,
  ip: string | null,
  required: boolean,
): Promise<BotCheckResult> {
  if (!TURNSTILE_SECRET) {
    if (required && STRICT) {
      return { ok: false, reason: "turnstile secret unset" };
    }
    return { ok: true };
  }
  const token = req.headers.get("cf-turnstile-response");
  if (!token) {
    if (required && STRICT) return { ok: false, reason: "missing turnstile token" };
    return { ok: true };
  }
  // For endpoints where Turnstile is optional, a stale page-level token should
  // not break authenticated app actions such as liking a post. Required
  // endpoints still verify and fail closed below.
  if (!required) return { ok: true };

  try {
    const body = new URLSearchParams();
    body.set("secret", TURNSTILE_SECRET);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const json = (await res.json()) as { success?: boolean };
    if (!json.success) return { ok: false, reason: "turnstile failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "turnstile verify error" };
  }
}
