/**
 * GET /api/users/me/email — returns the caller's email from the
 * owner-only private subcollection. Client code that needs its own
 * email (e.g. settings page, account export) should call this instead
 * of reading it directly from Firestore.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { adminDb } from "../../../_lib/admin";
import { LIMITS } from "../../../_lib/rateLimit";

export const GET = withSecurity(
  { rateLimit: LIMITS.PROFILE_EDIT, skipCsrf: true },
  async (_req, ctx) => {
    // Primary: private subcollection (post-migration).
    const priv = await adminDb
      .collection("users")
      .doc(ctx.uid)
      .collection("private")
      .doc("contact")
      .get();
    if (priv.exists && priv.get("email")) {
      return NextResponse.json({ ok: true, email: priv.get("email") });
    }
    // Fallback: Auth record (pre-migration or Google sign-in).
    return NextResponse.json({ ok: true, email: ctx.token.email ?? null });
  },
);
