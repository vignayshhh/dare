/**
 * GET /api/debug/whoami
 *
 * Production-safe diagnostic for "why am I getting 401?" investigations.
 *
 * It deliberately does NOT use `withSecurity` (which short-circuits on
 * auth failure) — it inspects each layer manually and reports which one
 * failed, so the browser devtools reveals the root cause without needing
 * server-log access.
 *
 * Reveals only:
 *   - presence of bearer header
 *   - the project the server thinks it is configured for
 *   - the project the client claims to be configured for
 *   - whether verifyIdToken succeeded, and if not, the error code
 *   - the decoded token's uid + aud + iss (NOT the raw token)
 *
 * Nothing here exposes the service account or any other secret.
 */
import "server-only";
import { NextResponse } from "next/server";
import { adminAuth } from "../../_lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const result: Record<string, unknown> = {
    server_project_env: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    service_account_set: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    service_account_project: null as string | null,
    bearer_present: false,
    verify: { ok: false } as Record<string, unknown>,
  };

  // Reveal the service-account's project_id (NOT the key).
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      result.service_account_project = parsed.project_id || null;
      result.project_match =
        parsed.project_id === process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    } catch {
      result.service_account_project = "INVALID_JSON";
    }
  }

  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    result.verify = {
      ok: false,
      reason: "Missing Authorization: Bearer header",
    };
    return NextResponse.json(result, { status: 200 });
  }
  result.bearer_present = true;
  const token = header.slice(7).trim();
  if (!token) {
    result.verify = { ok: false, reason: "Empty bearer token" };
    return NextResponse.json(result, { status: 200 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token, false);
    result.verify = {
      ok: true,
      uid: decoded.uid,
      aud: decoded.aud,
      iss: decoded.iss,
      email_verified: decoded.email_verified ?? null,
    };
  } catch (e) {
    const code =
      (e as { code?: string; errorInfo?: { code?: string } })?.code ||
      (e as { errorInfo?: { code?: string } })?.errorInfo?.code ||
      null;
    result.verify = {
      ok: false,
      code,
      message: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json(result, { status: 200 });
}
