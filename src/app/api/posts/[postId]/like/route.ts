/**
 * POST   /api/posts/[postId]/like    — idempotent like (creates post_likes doc id=postId_uid).
 * DELETE /api/posts/[postId]/like    — unlike.
 *
 * Likes are written by the Admin SDK so Firestore rules can deny direct
 * client writes to `post_likes` and `posts.likes_count` (the counter
 * trigger `onPostLikeCreated` / `onPostLikeDeleted` handles aggregation).
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { adminDb, FieldValue } from "../../../_lib/admin";
import { LIMITS } from "../../../_lib/rateLimit";

function likeId(postId: string, uid: string) {
  return `${postId}_${uid}`;
}

export const POST = withSecurity(
  { rateLimit: LIMITS.LIKE },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId || postId.length > 128) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }

    // Verify target exists + not blocked / auto-flagged (soft).
    const postSnap = await adminDb.collection("posts").doc(postId).get();
    if (!postSnap.exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const ref = adminDb.collection("post_likes").doc(likeId(postId, ctx.uid));
    const postRef = adminDb.collection("posts").doc(postId);
    let duplicate = false;

    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(ref);

      if (existing.exists) {
        duplicate = true;
        // Idempotent: treat as success but bump tap_count for double-tap UX.
        tx.update(ref, {
          tap_count: FieldValue.increment(1),
          updated_at: FieldValue.serverTimestamp(),
        });
        return;
      }

      tx.set(ref, {
        post_id: postId,
        user_id: ctx.uid,
        tap_count: 1,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      tx.update(postRef, {
        likes_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, liked: true, duplicate });
  },
);

export const DELETE = withSecurity(
  { rateLimit: LIMITS.UNLIKE },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }
    const ref = adminDb.collection("post_likes").doc(likeId(postId, ctx.uid));
    const postRef = adminDb.collection("posts").doc(postId);

    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (!existing.exists) return;

      tx.delete(ref);
      tx.update(postRef, {
        likes_count: FieldValue.increment(-1),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, liked: false });
  },
);
