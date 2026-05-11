/**
 * POST /api/posts/[postId]/comment — create a comment. The comments_count
 * trigger handles aggregation. Body: { content: string }.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { adminDb, FieldValue } from "../../../_lib/admin";
import { LIMITS } from "../../../_lib/rateLimit";

export const POST = withSecurity(
  { rateLimit: LIMITS.COMMENT },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId || postId.length > 128) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }

    let body: { content?: string; parent_id?: string | null } = {};
    try {
      body = (await req.json()) as {
        content?: string;
        parent_id?: string | null;
      };
    } catch {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }
    const content = (body.content ?? "").trim();
    if (!content || content.length > 2000) {
      return NextResponse.json({ error: "bad content" }, { status: 400 });
    }
    const parentId =
      typeof body.parent_id === "string" && body.parent_id.length > 0
        ? body.parent_id
        : null;

    const postSnap = await adminDb.collection("posts").doc(postId).get();
    if (!postSnap.exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const postRef = adminDb.collection("posts").doc(postId);
    const ref = adminDb.collection("post_comments").doc();
    const commentData: Record<string, unknown> = {
      post_id: postId,
      user_id: ctx.uid,
      content,
      text: content,
      likes: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    if (parentId) commentData.parent_id = parentId;

    await adminDb.runTransaction(async (tx) => {
      tx.set(ref, commentData);
      tx.update(postRef, {
        comments_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, id: ref.id });
  },
);
