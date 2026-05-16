import type { FeedPost } from "@/stores/usePostsStore";
import type { StoryDTO } from "@/middleware/services/story.service";

export const SHARED_POST_MEDIA_PREFIX = "shared-post:";
export const SHARED_POST_FALLBACK_TEXT = "Shared a post";
export const SHARED_STORY_MEDIA_PREFIX = "shared-story:";
export const SHARED_STORY_FALLBACK_TEXT = "Replied to your story";

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

export interface SharedStoryPayload {
  storyId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  replyText: string;
  createdAt: string;
  expiresAt: string;
  media: {
    type: StoryDTO["media"]["type"];
    url?: string;
    thumbnail?: string;
  };
  caption?: string | null;
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

export function buildSharedStoryPayload(
  story: StoryDTO,
  replyText: string,
  previewUrl?: string,
): SharedStoryPayload | null {
  if (!story.id || !story.author?.id || !story.media?.type) return null;
  const originalMediaUrl = story.media.url || "";
  const canEmbedOriginalMedia =
    originalMediaUrl && !originalMediaUrl.startsWith("data:");

  return {
    storyId: story.id,
    authorId: story.author.id,
    authorName: story.author.displayName,
    authorUsername: story.author.username,
    authorAvatar: story.author.avatar,
    replyText: replyText.trim(),
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    media: {
      type: story.media.type,
      url: canEmbedOriginalMedia ? originalMediaUrl : previewUrl || "",
      thumbnail: previewUrl || "",
    },
    caption: story.caption,
  };
}

export function encodeSharedStoryPayload(payload: SharedStoryPayload): string {
  return `${SHARED_STORY_MEDIA_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

export function parseSharedStoryPayload(
  mediaUrl?: string | null,
): SharedStoryPayload | null {
  if (!mediaUrl || !mediaUrl.startsWith(SHARED_STORY_MEDIA_PREFIX)) {
    return null;
  }

  try {
    const rawPayload = mediaUrl.slice(SHARED_STORY_MEDIA_PREFIX.length);
    const parsed = JSON.parse(
      decodeURIComponent(rawPayload),
    ) as Partial<SharedStoryPayload>;

    if (!parsed.storyId || !parsed.authorId || !parsed.media?.type) {
      return null;
    }

    return {
      storyId: parsed.storyId,
      authorId: parsed.authorId,
      authorName: parsed.authorName || "Unknown",
      authorUsername: parsed.authorUsername || "unknown",
      authorAvatar: parsed.authorAvatar || "",
      replyText: parsed.replyText || "",
      createdAt: parsed.createdAt || new Date().toISOString(),
      expiresAt: parsed.expiresAt || new Date().toISOString(),
      media: {
        type: parsed.media.type,
        url: parsed.media.url || "",
        thumbnail: parsed.media.thumbnail || "",
      },
      caption: parsed.caption || null,
    };
  } catch (error) {
    console.error("Failed to parse shared story payload:", error);
    return null;
  }
}

export function isSharedStoryPreviewActive(payload: SharedStoryPayload): boolean {
  const expiresAtMs = new Date(payload.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}
