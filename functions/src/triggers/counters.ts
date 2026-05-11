/**
 * Authoritative counter aggregation triggers.
 *
 * Client-side counter writes are blocked by Firestore rules after this
 * migration (see firestore.rules §1.6). These triggers are the ONLY
 * code path that may mutate `likes_count`, `comments_count`, and
 * `view_count` on posts, and the comment / dare / truth `likes`
 * counters. Each trigger is idempotent: the authoritative source is
 * the presence/absence of the child document (post_like / comment /
 * view), not a delta the client sends.
 */
import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/firestore";
import { logger } from "firebase-functions";
import { adminDb, FieldValue } from "../lib/admin";

const REGION = "asia-south1";

/** Utility: bump a numeric field on a post doc, clamped at 0. */
async function bumpPostCounter(postId: string, field: string, delta: number) {
  const ref = adminDb.collection("posts").doc(postId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = (snap.get(field) as number | undefined) ?? 0;
    const next = Math.max(0, current + delta);
    tx.update(ref, { [field]: next, updated_at: FieldValue.serverTimestamp() });
  });
}

async function getCollectionCount(collectionName: string, postId: string) {
  const snapshot = await adminDb
    .collection(collectionName)
    .where("post_id", "==", postId)
    .count()
    .get();
  return snapshot.data().count;
}

async function reconcilePostCounter(
  postId: string,
  field: "likes_count" | "comments_count",
  collectionName: "post_likes" | "post_comments",
) {
  const count = await getCollectionCount(collectionName, postId);
  await adminDb.collection("posts").doc(postId).set(
    {
      [field]: count,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// ─── POST LIKES ─────────────────────────────────────────────────────
export const onPostLikeCreated = onDocumentCreated(
  "post_likes/{likeId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.post_id) return;
    await reconcilePostCounter(data.post_id, "likes_count", "post_likes");
    logger.info("post like counter reconciled", { post_id: data.post_id });
  },
);

export const onPostLikeDeleted = onDocumentDeleted(
  "post_likes/{likeId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.post_id) return;
    await reconcilePostCounter(data.post_id, "likes_count", "post_likes");
    logger.info("post like counter reconciled", { post_id: data.post_id });
  },
);

// ─── POST COMMENTS ──────────────────────────────────────────────────
export const onPostCommentCreated = onDocumentCreated(
  "post_comments/{commentId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.post_id) return;
    await reconcilePostCounter(
      data.post_id,
      "comments_count",
      "post_comments",
    );
  },
);

export const onPostCommentDeleted = onDocumentDeleted(
  "post_comments/{commentId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.post_id) return;
    await reconcilePostCounter(
      data.post_id,
      "comments_count",
      "post_comments",
    );
  },
);

// ─── POST VIEWS (idempotent via composite id) ───────────────────────
// post_views docs must be created with id `${postId}_${userId}` so the
// same user cannot inflate the counter by spamming. Enforced in rules.
export const onPostViewCreated = onDocumentCreated(
  "post_views/{viewId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.post_id) return;
    await bumpPostCounter(data.post_id, "view_count", 1);
  },
);

// ─── COMMENT LIKE SUBCOLLECTION (likes on a comment) ────────────────
// We model it as `/post_comments/{commentId}/likes/{userId}` so the id
// prevents double-liking. Trigger mirrors the count onto parent.
export const onCommentLikeCreated = onDocumentCreated(
  "post_comments/{commentId}/likes/{userId}",
  async (event) => {
    const commentId = event.params.commentId;
    const ref = adminDb.collection("post_comments").doc(commentId);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = (snap.get("likes") as number | undefined) ?? 0;
      tx.update(ref, {
        likes: current + 1,
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  },
);

export const onCommentLikeDeleted = onDocumentDeleted(
  "post_comments/{commentId}/likes/{userId}",
  async (event) => {
    const commentId = event.params.commentId;
    const ref = adminDb.collection("post_comments").doc(commentId);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = (snap.get("likes") as number | undefined) ?? 0;
      tx.update(ref, {
        likes: Math.max(0, current - 1),
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  },
);
