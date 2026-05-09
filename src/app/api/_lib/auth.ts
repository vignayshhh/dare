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
    throw new AuthError(401, "Invalid or expired ID token");
  }

  if (opts.requireAdmin && decoded.admin !== true) {
    throw new AuthError(403, "Admin role required");
  }

  return decoded;
}
