import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { adminDb, FieldValue } from "../../../_lib/admin";
import { LIMITS } from "../../../_lib/rateLimit";

async function areAcceptedFriends(userA: string, userB: string): Promise<boolean> {
  const [forward, reverse] = await Promise.all([
    adminDb
      .collection("friendships")
      .where("requester_id", "==", userA)
      .where("addressee_id", "==", userB)
      .where("status", "==", "accepted")
      .limit(1)
      .get(),
    adminDb
      .collection("friendships")
      .where("requester_id", "==", userB)
      .where("addressee_id", "==", userA)
      .where("status", "==", "accepted")
      .limit(1)
      .get(),
  ]);

  return !forward.empty || !reverse.empty;
}

export const POST = withSecurity(
  { rateLimit: LIMITS.VIEW, skipCsrf: true },
  async (req, ctx) => {
    const storyId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!storyId || storyId.length > 128) {
      return NextResponse.json({ error: "bad story id" }, { status: 400 });
    }

    const storyRef = adminDb.collection("stories").doc(storyId);
    const storySnap = await storyRef.get();
    if (!storySnap.exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const story = storySnap.data()!;
    const ownerId = story.userId;
    if (typeof ownerId !== "string" || !ownerId) {
      return NextResponse.json({ error: "invalid_story" }, { status: 400 });
    }

    if (ownerId !== ctx.uid) {
      const canView = await areAcceptedFriends(ctx.uid, ownerId);
      if (!canView) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const viewers = Array.isArray(story.viewers) ? story.viewers : [];
    if (viewers.includes(ctx.uid)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    await storyRef.update({
      viewers: FieldValue.arrayUnion(ctx.uid),
      viewCount: FieldValue.increment(1),
    });

    return NextResponse.json({ ok: true });
  },
);
