const STORAGE_KEY = "comment-like-state-v1";

type LikedCommentMap = Record<string, true>;

function readStore(): LikedCommentMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: LikedCommentMap) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage write failures.
  }
}

function makeKey(
  scope: "post" | "truth" | "dare",
  userId: string,
  commentId: string,
) {
  return `${scope}:${userId}:${commentId}`;
}

export const commentLikePersistence = {
  hasLiked(
    scope: "post" | "truth" | "dare",
    userId: string,
    commentId: string,
  ): boolean {
    if (!userId || !commentId) return false;
    const store = readStore();
    return !!store[makeKey(scope, userId, commentId)];
  },

  markLiked(
    scope: "post" | "truth" | "dare",
    userId: string,
    commentId: string,
  ) {
    if (!userId || !commentId) return;
    const store = readStore();
    store[makeKey(scope, userId, commentId)] = true;
    writeStore(store);
  },
};
