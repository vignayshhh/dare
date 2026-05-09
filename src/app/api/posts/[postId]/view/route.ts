/**
 * POST /api/posts/[postId]/view — idempotent view registration.
 * Doc id = postId_uid so the same user can't inflate the counter.
 * CSRF check is skipped because views are fired from visibility observers
 * and often batched via sendBeacon; we still require the ID token.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { adminDb, FieldValue } from "../../../_lib/admin";
import { LIMITS } from "../../../_lib/rateLimit";

export const POST = withSecurity(
  { rateLimit: LIMITS.VIEW, skipCsrf: true },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId || postId.length > 128) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }
    const id = `${postId}_${ctx.uid}`;
    const ref = adminDb.collection("post_views").doc(id);
    // set w/ merge + create_once semantics. The counter trigger fires
    // only on the first create, so duplicates are effectively no-ops.
    await ref.set(
      {
        post_id: postId,
        user_id: ctx.uid,
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  },
);
