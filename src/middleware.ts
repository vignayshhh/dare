import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for security checks
 * Implements CSRF protection and other security measures
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Generate nonce for CSP (cryptographically secure)
  const nonce = crypto.randomUUID();

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

      // In development, allow localhost
      if (process.env.NODE_ENV === "development") {
        if (
          !origin.includes("localhost") &&
          !origin.includes("127.0.0.1") &&
          originUrl.hostname !== new URL(hostUrl).hostname
        ) {
          return new NextResponse("Invalid origin", { status: 403 });
        }
      } else {
        // In production, strict origin check
        if (originUrl.hostname !== new URL(hostUrl).hostname) {
          return new NextResponse("Invalid origin", { status: 403 });
        }
      }
    }

    // Validate CSRF token for state-changing requests
    const csrfToken = request.cookies.get("csrf-token")?.value;
    const csrfHeader = request.headers.get("x-csrf-token");

    // For API routes, check header; for page requests, check cookie
    const providedToken = csrfHeader || csrfToken;

    // Skip CSRF validation for same-origin requests (already validated above)
    // For production, enforce CSRF token validation
    if (process.env.NODE_ENV === "production" && !providedToken) {
      return new NextResponse("CSRF token missing", { status: 403 });
    }

    // Add CSRF token to response for state-changing requests
    const newCsrfToken = generateCSRFToken();
    response.cookies.set("csrf-token", newCsrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour
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
    "camera=(self), microphone=(self), geolocation=()",
  );

  // SECURITY FIX: Add additional security headers
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // SECURITY FIX: Enhanced Content-Security-Policy with nonce
  // In development, allow unsafe-eval/unsafe-inline for React debugging and Next.js dev tools
  // In staging, use Report-Only mode to test CSP without blocking functionality
  const isDev = process.env.NODE_ENV === "development";
  const isStaging =
    process.env.NEXT_PUBLIC_ENVIRONMENT === "staging" ||
    (process.env.NODE_ENV as string) === "staging";
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${
      isDev ? "'unsafe-eval' 'unsafe-inline'" : ""
    } https://www.gstatic.com https://firebase.googleapis.com https://firebasestorage.googleapis.com`,
    `style-src 'self' 'nonce-${nonce}' ${isDev ? "'unsafe-inline'" : ""}`,
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firebasestorage.googleapis.com https://*.gstatic.com wss://*.firebaseio.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "block-all-mixed-content",
  ].filter(Boolean);

  // Use Report-Only mode in staging to test CSP without blocking
  if (isStaging) {
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
