import type { FeedPost } from "@/stores/usePostsStore";

export const SHARED_POST_MEDIA_PREFIX = "shared-post:";
export const SHARED_POST_FALLBACK_TEXT = "Shared a post";

export interface SharedPostPayload {
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  content: string;
  timestamp: string;
  media?: FeedPost["media"];
}

export function buildSharedPostPayload(post: FeedPost): SharedPostPayload | null {
  if (!post.id || !post.author?.id) return null;

  return {
    postId: post.id,
    authorId: post.author.id,
    authorName: post.author.name,
    authorUsername: post.author.username,
    authorAvatar: post.author.avatar,
    content: post.content || "",
    timestamp: post.timestamp,
    media: post.media,
  };
}

export function encodeSharedPostPayload(payload: SharedPostPayload): string {
  return `${SHARED_POST_MEDIA_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

export function parseSharedPostPayload(
  mediaUrl?: string | null,
): SharedPostPayload | null {
  if (!mediaUrl || !mediaUrl.startsWith(SHARED_POST_MEDIA_PREFIX)) {
    return null;
  }

  try {
    const rawPayload = mediaUrl.slice(SHARED_POST_MEDIA_PREFIX.length);
    const parsed = JSON.parse(
      decodeURIComponent(rawPayload),
    ) as Partial<SharedPostPayload>;

    if (!parsed.postId || !parsed.authorId) {
      return null;
    }

    return {
      postId: parsed.postId,
      authorId: parsed.authorId,
      authorName: parsed.authorName || "Unknown",
      authorUsername: parsed.authorUsername || "unknown",
      authorAvatar: parsed.authorAvatar || "",
      content: parsed.content || "",
      timestamp: parsed.timestamp || new Date().toISOString(),
      media: parsed.media,
    };
  } catch (error) {
    console.error("Failed to parse shared post payload:", error);
    return null;
  }
}
