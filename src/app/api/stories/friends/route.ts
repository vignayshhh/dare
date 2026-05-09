import "server-only";
import { withSecurity } from "../../_lib/withSecurity";
import { adminDb } from "../../_lib/admin";
import { LIMITS } from "../../_lib/rateLimit";

function toIsoString(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date().toISOString();
}

export const GET = withSecurity(
  { rateLimit: LIMITS.FEED_FETCH, skipCsrf: true },
  async (_req, ctx) => {
    const [requesterSnap, addresseeSnap] = await Promise.all([
      adminDb
        .collection("friendships")
        .where("requester_id", "==", ctx.uid)
        .where("status", "==", "accepted")
        .get(),
      adminDb
        .collection("friendships")
        .where("addressee_id", "==", ctx.uid)
        .where("status", "==", "accepted")
        .get(),
    ]);

    const friendIds = [
      ...requesterSnap.docs.map((docSnap) => docSnap.get("addressee_id")),
      ...addresseeSnap.docs.map((docSnap) => docSnap.get("requester_id")),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    const uniqueFriendIds = [...new Set(friendIds)];
    if (uniqueFriendIds.length === 0) {
      return [];
    }

    const now = Date.now();
    const storySnapshots = await Promise.all(
      uniqueFriendIds.map((friendId) =>
        adminDb
          .collection("stories")
          .where("userId", "==", friendId)
          .get(),
      ),
    );

    const stories = storySnapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((storyDoc) => {
        const data = storyDoc.data();
        const viewers = Array.isArray(data.viewers) ? data.viewers : [];

        return {
          id: storyDoc.id,
          userId: data.userId,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          caption: data.caption ?? null,
          createdAt: toIsoString(data.createdAt),
          expiresAt: toIsoString(data.expiresAt),
          viewCount: data.viewCount || 0,
          viewers,
          author: {
            id: data.userId,
            username: `@user_${String(data.userId || "").slice(0, 8)}`,
            displayName: `User ${String(data.userId || "").slice(0, 8)}`,
            avatar: "",
          },
          hasViewed: viewers.includes(ctx.uid),
        };
      })
      .filter(
        (story) => new Date(story.expiresAt).getTime() > now,
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );

    return stories;
  },
);
