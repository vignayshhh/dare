/**
 * Composable request pipeline for state-changing endpoints.
 *
 * Every POST/PATCH/DELETE handler should wrap its body with
 * `withSecurity(...)`. In order, it:
 *   1. Extracts IP from x-forwarded-for / x-real-ip.
 *   2. Rejects blocked IPs (edge middleware already does this but we
 *      double-check in case middleware is bypassed).
 *   3. Runs cheap bot heuristics; optionally verifies Turnstile.
 *   4. Verifies the Firebase ID token; optionally requires admin.
 *   5. Verifies CSRF double-submit token.
 *   6. Enforces a Redis rate-limit bucket (per uid or per ip).
 *
 * Any failure short-circuits with a JSON error. Success calls the
 * handler with a rich `SecurityContext`.
 */
import "server-only";
import { NextResponse } from "next/server";
import { verifyRequestAuth, AuthError } from "./auth";
import { enforceRateLimit, type LimitConfig } from "./rateLimit";
import { getClientIp, isIpBlocked } from "./ipBlock";
import { cheapBotCheck, verifyTurnstile } from "./botCheck";
import { verifyCsrf } from "./csrf";
import type { DecodedIdToken } from "firebase-admin/auth";
import { logSecurityEventServer } from "@/security/securityLogger";

export interface SecurityContext {
  uid: string;
  ip: string | null;
  token: DecodedIdToken;
}

export interface WithSecurityOptions {
  rateLimit: LimitConfig;
  requireAdmin?: boolean;
  requireTurnstile?: boolean;
  skipCsrf?: boolean; // only for idempotent beacons like /api/posts/view
}

export function withSecurity<T>(
  opts: WithSecurityOptions,
  handler: (req: Request, ctx: SecurityContext) => Promise<T>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      const ip = getClientIp(req);

      if (await isIpBlocked(ip)) {
        // Log IP block event
        await logSecurityEventServer({
          type: "ip_blocked",
          userId: undefined,
          details: { reason: "IP blocklist" },
          severity: "high",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      const cheap = await cheapBotCheck(req, ip);
      if (!cheap.ok) {
        // Log bot detection
        await logSecurityEventServer({
          type: "bot_detected",
          userId: undefined,
          details: { reason: cheap.reason },
          severity: "medium",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "blocked", reason: cheap.reason },
          { status: 403 },
        );
      }

      const turnstile = await verifyTurnstile(req, ip, !!opts.requireTurnstile);
      if (!turnstile.ok) {
        // Log Turnstile failure
        await logSecurityEventServer({
          type: "bot_detected",
          userId: undefined,
          details: { reason: turnstile.reason },
          severity: "medium",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "challenge_required", reason: turnstile.reason },
          { status: 401 },
        );
      }

      const token = await verifyRequestAuth(req, {
        requireAdmin: opts.requireAdmin,
      });

      if (!opts.skipCsrf && !verifyCsrf(req)) {
        // Log CSRF failure
        await logSecurityEventServer({
          type: "csrf_failure",
          userId: token.uid,
          details: { path: new URL(req.url).pathname },
          severity: "high",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json({ error: "csrf" }, { status: 403 });
      }

      const rl = await enforceRateLimit(opts.rateLimit, token.uid);
      if (!rl.allowed) {
        // Log rate limit exceeded
        await logSecurityEventServer({
          type: "rate_limit_exceeded",
          userId: token.uid,
          details: {
            bucket: opts.rateLimit.bucket,
            retryAfter: rl.retryAfterMs,
          },
          severity: "medium",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "rate_limited", retry_after_ms: rl.retryAfterMs },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
            },
          },
        );
      }

      const result = await handler(req, { uid: token.uid, ip, token });
      if (result instanceof Response) return result;
      return NextResponse.json({ ok: true, data: result });
    } catch (e) {
      if (e instanceof AuthError) {
        // Log authentication failure
        await logSecurityEventServer({
          type: "auth_failure",
          userId: undefined,
          details: { error: e.message, status: e.status },
          severity: "high",
          ipAddress: getClientIp(req) || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error("withSecurity handler failure", e);
      await logSecurityEventServer({
        type: "security_violation",
        userId: undefined,
        details: { error: e instanceof Error ? e.message : String(e) },
        severity: "critical",
        ipAddress: getClientIp(req) || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      });
      // In development, surface the real error so the browser devtools
      // reveal the root cause without needing terminal access. Production
      // stays opaque to avoid leaking server internals.
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json(
          {
            error: "internal",
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}
