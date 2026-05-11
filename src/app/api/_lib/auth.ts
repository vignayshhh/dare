/**
 * ID-token verification helpers for API routes.
 *
 * Client must send the Firebase ID token in the `Authorization: Bearer
 * <token>` header. Tokens are verified via the Admin SDK; a revoked or
 * expired token is rejected. The resolved `uid`, `email`, and custom
 * claims are returned for the route handler to use.
 */
import "server-only";
import { adminAuth } from "./admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function verifyRequestAuth(
  req: Request,
  opts: { requireAdmin?: boolean } = {},
): Promise<DecodedIdToken> {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw new AuthError(401, "Missing Authorization: Bearer header");
  }
  const token = header.slice(7).trim();
  if (!token) throw new AuthError(401, "Empty bearer token");

  let decoded: DecodedIdToken;
  try {
    // Pass checkRevoked=true so revoked sessions (e.g. after a ban) reject.
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (e) {
    const code =
      (e as { code?: string; errorInfo?: { code?: string } })?.code ||
      (e as { errorInfo?: { code?: string } })?.errorInfo?.code ||
      "";
    const msg = e instanceof Error ? e.message : String(e);

    // `checkRevoked=true` makes an Identity Toolkit call that can fail for
    // reasons unrelated to token validity (transient network, missing IAM
    // scope on the service account). If the failure is clearly NOT a bad
    // token, retry once without revocation check so a flaky upstream
    // doesn't lock every user out.
    const isClearlyBadToken =
      code === "auth/id-token-expired" ||
      code === "auth/id-token-revoked" ||
      code === "auth/argument-error" ||
      code === "auth/invalid-id-token" ||
      /audience|issuer|signature|expired|revoked|malformed/i.test(msg);

    if (!isClearlyBadToken) {
      try {
        decoded = await adminAuth.verifyIdToken(token, false);
        // eslint-disable-next-line no-console
        console.warn(
          `[auth] verifyIdToken(checkRevoked=true) failed transiently (${code || "no-code"}: ${msg}); fell back to checkRevoked=false`,
        );
        if (opts.requireAdmin && decoded.admin !== true) {
          throw new AuthError(403, "Admin role required");
        }
        return decoded;
      } catch {
        // fall through to 401 below
      }
    }

    // eslint-disable-next-line no-console
    console.error(
      `[auth] verifyIdToken rejected token (${code || "no-code"}): ${msg}`,
    );
    throw new AuthError(
      401,
      `Invalid or expired ID token${code ? ` (${code})` : ""}`,
    );
  }

  if (opts.requireAdmin && decoded.admin !== true) {
    throw new AuthError(403, "Admin role required");
  }

  return decoded;
}
