/** @type {import('next').NextConfig} */

const isDevelopment = process.env.NODE_ENV === "development";

// CSP is now handled by middleware.ts with nonce-based security
// No need to set it here to avoid conflicts

const nextConfig = {
  // ─────────────────────────────────────────────────────────────────────
  // ROOT CAUSE OF "TOUCH BLOCKED ON MOBILE VIA LAN IP" BUG
  // ─────────────────────────────────────────────────────────────────────
  // Next.js 15.2+ (and now 16) blocks cross-origin requests to /_next/*
  // resources by default. When you run `next dev` on your laptop and open
  // the app from your phone via http://192.168.x.x:3000, the browser
  // origin is the LAN IP, but the dev server only whitelists `localhost`.
  // The initial HTML loads (so the page renders + native <input> works),
  // but the RSC payload, HMR socket, and webpack chunks are rejected as
  // cross-origin → React never hydrates → onClick / onTouch handlers
  // never get attached → "touch is blocked, only inputs work".
  //
  // This is why it works perfectly on desktop localhost but breaks on
  // mobile via a network link. It is NOT caused by CSP, CSRF, IP
  // blocking, body overflow lock, touch-action, or any of the security
  // features that were disabled while debugging.
  //
  // The wildcard pattern below allows any private LAN range (10.x, 172.16-31.x,
  // 192.168.x) so you can connect from any phone on the same Wi-Fi.
  // This setting only affects the dev server; production is unaffected.
  // Docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: [
    "*.local",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    "192.168.*.*",
    "127.0.0.1",
    "localhost",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dare-web-app-61360.firebasestorage.app",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "dare-web-app.vercel.app",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
    ],
    unoptimized: true,
  },
  // SECURITY FIX (§3.4): Strip ALL console calls (including error/warn) in
  // production builds. Preserving console.error / console.warn was leaking
  // tokens, userIds, and internal paths into shipped bundles. Hosts that
  // still need warnings should route them through a structured logger
  // (e.g. `src/security/securityLogger.ts`) before reaching `console`.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? true : false,
  },
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    NEXT_PUBLIC_ENABLE_FIREBASE_TEST_PAGE:
      process.env.NEXT_PUBLIC_ENABLE_FIREBASE_TEST_PAGE,
  },
  async headers() {
    // TEMPORARILY DISABLED FOR MOBILE DEBUGGING
    return [];
  },
};

module.exports = nextConfig;
