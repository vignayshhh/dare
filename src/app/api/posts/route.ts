/**
 * POST /api/posts - create a feed post using the Admin SDK.
 *
 * Production can enforce Firestore App Check / stricter client rules without
 * blocking normal posting, because the browser only supplies a Firebase ID
 * token and the server owns the write.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../_lib/withSecurity";
import { adminDb, FieldValue } from "../_lib/admin";
import { LIMITS } from "../_lib/rateLimit";

type CreatePostBody = {
  content?: string;
  media_url?: string | null;
  media_type?: "TEXT" | "PHOTO" | "VIDEO" | "AUDIO";
};

const MAX_CONTENT_LENGTH = 10_000;
const MAX_MEDIA_URL_LENGTH = 2_000;
const ALLOWED_MEDIA_TYPES = new Set(["TEXT", "PHOTO", "VIDEO", "AUDIO"]);
const ALLOWED_MEDIA_HOSTS = [
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "firebasestorage.app",
];

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateMediaUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("bad media url");
  }

  const mediaUrl = value.trim();
  if (!mediaUrl) return null;
  if (mediaUrl.length > MAX_MEDIA_URL_LENGTH) {
    throw new Error("media url too long");
  }

  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new Error("bad media url");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("bad media url");
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_MEDIA_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (!allowed) {
    throw new Error("bad media url");
  }

  return mediaUrl;
}

export const POST = withSecurity(
  { rateLimit: LIMITS.POST_CREATE },
  async (req, ctx) => {
    let body: CreatePostBody = {};
    try {
      body = (await req.json()) as CreatePostBody;
    } catch {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }

    const content = sanitizeText(body.content);
    if (!content) {
      return NextResponse.json(
        { error: "caption required" },
        { status: 400 },
      );
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "content too long" }, { status: 400 });
    }

    let mediaUrl: string | null;
    try {
      mediaUrl = validateMediaUrl(body.media_url);
    } catch {
      return NextResponse.json({ error: "bad media url" }, { status: 400 });
    }

    const mediaType = ALLOWED_MEDIA_TYPES.has(body.media_type || "")
      ? body.media_type!
      : mediaUrl
        ? "PHOTO"
        : "TEXT";

    const userSnap = await adminDb.collection("users").doc(ctx.uid).get();
    const user = userSnap.exists ? userSnap.data() || {} : {};

    const postRef = adminDb.collection("posts").doc();
    const eventRef = adminDb.collection("feed_events").doc();
    const now = FieldValue.serverTimestamp();
    const postData = {
      author_id: ctx.uid,
      author_username:
        typeof user.username === "string" ? user.username : "",
      author_display_name:
        typeof user.display_name === "string" ? user.display_name : "",
      author_avatar_url:
        typeof user.avatar_url === "string"
          ? user.avatar_url
          : typeof user.avatar === "string"
            ? user.avatar
            : "",
      content,
      media_url: mediaUrl,
      media_type: mediaType,
      view_count: 0,
      likes_count: 0,
      comments_count: 0,
      created_at: now,
      updated_at: now,
    };

    await adminDb.runTransaction(async (tx) => {
      tx.set(postRef, postData);
      tx.set(eventRef, {
        user_id: ctx.uid,
        event_type: "POST_CREATED",
        related_post_id: postRef.id,
        created_at: now,
      });
    });

    return NextResponse.json({
      ok: true,
      post: {
        ...postData,
        id: postRef.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  },
);
