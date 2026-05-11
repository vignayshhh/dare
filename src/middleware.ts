import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * Middleware for security checks.
 *
 * Responsibilities (runs on the edge for every request):
 *   1. Redis-backed IP blocklist (§2.8). Blocked IPs are rejected with
 *      403 before any route handler or API runs. Fail-OPEN when Redis
 *      env is unset so local dev doesn't break; production deploys must
 *      set UPSTASH_REDIS_REST_URL/TOKEN.
 *   2. Origin check for state-changing requests.
 *   3. Double-submit CSRF token (§1.4).
 *   4. Security headers + CSP with per-request nonce.
 */

// Initialise Redis lazily at module scope so connections are reused.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function getHostname(value?: string | null): string | null {
  if (!value) return null;

  try {
    const normalized = value.includes("://") ? value : `https://${value}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return value.split(":")[0]?.toLowerCase() || null;
  }
}

export async function middleware(request: NextRequest) {
  // ── IP blocklist (§2.8) ─────────────────────────────────────────────
  if (redis) {
    const ip = getClientIp(request);
    if (ip) {
      try {
        const blocked = await redis.sismember("ip:blocked", ip);
        if (blocked === 1) {
          return new NextResponse("Forbidden", { status: 403 });
        }
      } catch {
        // Redis transient failure: fail open (don't lock out real users
        // during an outage). The API-layer check in `withSecurity` will
        // catch it again when Redis recovers.
      }
    }
  }

  const response = NextResponse.next();

  // Generate nonce for CSP (cryptographically secure)
  // Fallback for browsers that don't support crypto.randomUUID()
  const nonce =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // CSRF Protection: Validate Origin header for state-changing requests
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS"
  ) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    // Allow requests from same origin
    if (origin) {
      const originUrl = new URL(origin);
      const hostUrl = host ? `https://${host}` : "https://localhost:3000";

      // In development, allow localhost and LAN IPs (for mobile testing)
      if (process.env.NODE_ENV === "development") {
        if (
          !origin.includes("localhost") &&
          !origin.includes("127.0.0.1") &&
          !origin.match(/^192\.168\./) &&
          !origin.match(/^10\./) &&
          !origin.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) &&
          originUrl.hostname !== new URL(hostUrl).hostname
        ) {
          return new NextResponse("Invalid origin", { status: 403 });
        }
      } else {
        // In production, prefer strict same-origin, but account for hosts
        // rewritten by proxies/platforms and configured deployment URLs.
        const allowedProductionHosts = new Set(
          [
            getHostname(host),
            getHostname(request.headers.get("x-forwarded-host")),
            getHostname(request.nextUrl.hostname),
            getHostname(process.env.NEXT_PUBLIC_APP_URL),
            getHostname(process.env.VERCEL_URL),
            "dare-g5ijg25ue-vignayshhhs-projects.vercel.app",
            "dare-web-app.vercel.app",
          ]
            .filter((value): value is string => Boolean(value))
            .map((value) => value.toLowerCase()),
        );
        if (
          originUrl.hostname !== new URL(hostUrl).hostname &&
          !allowedProductionHosts.has(originUrl.hostname.toLowerCase())
        ) {
          return new NextResponse("Invalid origin", { status: 403 });
        }
      }
    }

    // SECURITY FIX (§1.4): Proper double-submit CSRF check.
    // Previous implementation had three bugs:
    //   1. It never compared the cookie value against the header value, so
    //      any request carrying any token passed.
    //   2. It overwrote the CSRF cookie on every state-changing request,
    //      which race-conditioned legitimate concurrent tabs.
    //   3. It was httpOnly:true so the client JS couldn't read the token to
    //      echo it in the x-csrf-token header — making double-submit
    //      physically impossible.
    //
    // Fix:
    //   * Cookie is set httpOnly:false (readable by same-origin JS) so the
    //     client can copy it into the x-csrf-token header.
    //   * The cookie is only issued when absent — existing tabs keep their
    //     token.
    //   * For API routes (x-csrf-token header present) we require the
    //     header to equal the cookie. Same-origin page navigations rely on
    //     the SameSite=strict cookie + origin check above.
    //
    const csrfCookie = request.cookies.get("csrf-token")?.value;
    const csrfHeader = request.headers.get("x-csrf-token");
    const isApiRequest =
      request.nextUrl.pathname.startsWith("/api/") || csrfHeader !== null;

    if (process.env.NODE_ENV === "production" && isApiRequest) {
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return new NextResponse("CSRF validation failed", { status: 403 });
      }
    }

    // Only issue a token if the client doesn't already have one. Never
    // rotate mid-session — that would invalidate in-flight requests from
    // other tabs.
    // Use lax in development to allow mobile testing from LAN IPs
    if (!csrfCookie) {
      const newCsrfToken = generateCSRFToken();
      response.cookies.set("csrf-token", newCsrfToken, {
        httpOnly: false, // client JS needs to echo this into x-csrf-token
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "development" ? "lax" : "strict",
        path: "/",
        maxAge: 60 * 60, // 1 hour
      });
    }
  } else if (!request.cookies.get("csrf-token")?.value) {
    // Ensure GET responses also seed a CSRF token so the client can read
    // it before issuing a POST.
    const newCsrfToken = generateCSRFToken();
    response.cookies.set("csrf-token", newCsrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "strict",
      path: "/",
      maxAge: 60 * 60,
    });
  }

  // SECURITY FIX: Enhanced security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // SECURITY FIX: Add HSTS header for HTTPS enforcement
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // SECURITY FIX: Add Permissions-Policy header
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(), fullscreen=(self), payment=(), usb=(), magnetometer=(), gyroscope=()",
  );

  // TEMPORARILY DISABLED: COOP/CORP headers blocking clicks in production
  // response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // SECURITY FIX: Enhanced Content-Security-Policy with nonce
  // In development, allow unsafe-eval/unsafe-inline for React debugging and Next.js dev tools
  // TEMPORARILY: Use Report-Only mode in production to diagnose click blocking issues
  const isDev = process.env.NODE_ENV === "development";
  const isStaging =
    process.env.NEXT_PUBLIC_ENVIRONMENT === "staging" ||
    (process.env.NODE_ENV as string) === "staging";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://firebase.googleapis.com https://firebasestorage.googleapis.com"
    : `script-src 'self' 'nonce-${nonce}' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://firebase.googleapis.com https://firebasestorage.googleapis.com`;
  const styleSrc = isDev
    ? "style-src 'self' 'unsafe-inline' https://www.gstatic.com"
    : `style-src 'self' 'nonce-${nonce}' https://www.gstatic.com`;

  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    // SECURITY FIX (§3.2): Tighten img-src. Previously allowed any https:
    // origin to serve images, which widens the XSS exfiltration surface.
    // We now explicitly allow-list Firebase Storage / gstatic and keep
    // data:/blob: for small inline previews (canvas, file previews).
    // TEMPORARILY: Added i.pravatar.cc, images.unsplash.com for GuestApp mock data
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.firebasestorage.app https://storage.googleapis.com https://*.googleusercontent.com https://www.gstatic.com https://i.pravatar.cc https://images.unsplash.com",
    "media-src 'self' blob: https://firebasestorage.googleapis.com https://*.firebasestorage.app https://storage.googleapis.com",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firebasestorage.googleapis.com https://*.firebasestorage.app https://*.gstatic.com https://www.google.com https://www.recaptcha.net wss://*.firebaseio.com",
    "font-src 'self' data:",
    "frame-src 'self' https://www.google.com https://www.recaptcha.net",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "block-all-mixed-content",
  ].filter(Boolean);

  // TEMPORARILY: Use Report-Only mode in production to diagnose click blocking
  if (isStaging || process.env.NODE_ENV === "production") {
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      cspDirectives.join("; "),
    );
  } else {
    response.headers.set("Content-Security-Policy", cspDirectives.join("; "));
  }

  // Pass nonce to client via header for use in HTML
  response.headers.set("x-csp-nonce", nonce);

  return response;
}

/**
 * Generate a cryptographically secure CSRF token
 * Uses crypto.randomUUID() for secure random token generation
 */
function generateCSRFToken(): string {
  // Use crypto.randomUUID() for cryptographically secure random token
  // Fallback to crypto.randomBytes() if randomUUID is not available
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without randomUUID
  const timestamp = Date.now().toString(36);
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${timestamp}-${randomPart}`;
}

/**
 * Configure which paths the middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
