/**
 * Minimal authenticated-fetch helper for Next.js API routes.
 *
 * Attaches the Firebase ID token (Bearer), the double-submit CSRF
 * token (`x-csrf-token`), and — when Turnstile is enabled — the
 * Cloudflare Turnstile response token. Keeps callers ignorant of the
 * security pipeline so adding Turnstile later is transparent.
 *
 * Usage:
 *   await apiFetch("/api/posts/abc/like", { method: "POST" });
 */
import { auth } from "@/backend/lib/firebase";
import type { User } from "firebase/auth";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

function ensureCsrfToken(): string | null {
  const existing = readCookie("csrf-token");
  if (existing || typeof document === "undefined") return existing;

  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const sameSite = window.location.protocol === "https:" ? "Strict" : "Lax";
  document.cookie = `csrf-token=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=3600; SameSite=${sameSite}${secure}`;

  return token;
}

async function waitForIdToken(timeoutMs = 5000): Promise<string> {
  const user = auth.currentUser;
  if (user) return user.getIdToken();
  // Wait briefly for auth to hydrate on first load.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("Not signed in"));
    }, timeoutMs);
    const unsub = auth.onAuthStateChanged((u: User | null) => {
      if (u) {
        clearTimeout(timer);
        unsub();
        u.getIdToken().then(resolve, reject);
      }
    });
  });
}

export interface ApiFetchOptions extends RequestInit {
  /**
   * When true, will NOT throw on non-2xx; caller inspects `response.ok`.
   * Default false (throws on 4xx/5xx).
   */
  raw?: boolean;
  /**
   * Send a page-level Turnstile token with this request. Most in-app actions
   * do not need it; keeping this opt-in prevents stale challenge tokens from
   * turning normal authenticated writes into production-only 401s.
   */
  turnstile?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const token = await waitForIdToken();
  const csrf = ensureCsrfToken();
  // Window.turnstile widget stashes the latest response on window; pick
  // it up if present. Ignored server-side when TURNSTILE_SECRET_KEY unset.
  const turnstile =
    opts.turnstile && typeof window !== "undefined"
      ? (window as unknown as { __turnstileToken?: string }).__turnstileToken
      : undefined;

  const headers = new Headers(opts.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (csrf) headers.set("x-csrf-token", csrf);
  if (turnstile) headers.set("cf-turnstile-response", turnstile);
  if (opts.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: "same-origin",
  });
  if (opts.raw) return res as unknown as T;
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`API ${res.status} ${path}: ${detail}`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as unknown as T;
  }
}
