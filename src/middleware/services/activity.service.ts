import { auth, db } from "@/backend/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  documentId,
  Timestamp,
} from "firebase/firestore";
import {
  getCachedResolvedUserProfile,
  resolveUserProfile,
} from "@/utils/profileResolver";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export type ActivityType =
  | "liked_post"
  | "commented_post"
  | "shared_post"
  | "dedicated_story"
  | "dare_sent"
  | "dare_received"
  | "truth_sent"
  | "truth_received";

export interface ActivityUser {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface ActivityPost {
  id: string;
  content?: string;
  media_url?: string;
  media_type?: string;
  author?: ActivityUser;
  created_at?: string;
  view_count?: number;
}

export interface ActivityStory {
  id: string;
  media_url?: string;
  media_type?: string;
  dedicated_to_user_id?: string;
  dedicated_to?: ActivityUser;
  created_at?: string;
}

export interface ActivityDare {
  id: string;
  description: string;
  state: string;
  challenger_id: string;
  receiver_id: string;
}

export interface ActivityTruth {
  id: string;
  question: string;
  answer?: string;
  state: string;
  challenger_id: string;
  receiver_id: string;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  post?: ActivityPost;
  story?: ActivityStory;
  dare?: ActivityDare;
  truth?: ActivityTruth;
  comment_text?: string;
  comment_id?: string;
  like_tap_count?: number;
  other_user?: ActivityUser;
}

export interface GroupedActivity {
  id: string;
  type: ActivityType;
  timestamp: string;
  count: number;
  items: ActivityItem[];
  post?: ActivityPost;
  story?: ActivityStory;
  dare?: ActivityDare;
  truth?: ActivityTruth;
  comment_text?: string;
  other_user?: ActivityUser;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000;
interface CacheEntry {
  data: GroupedActivity[];
  ts: number;
}

class ActivityService {
  private cache = new Map<string, CacheEntry>();

  async getUserActivity(
    userId: string,
    hours = 24,
  ): Promise<GroupedActivity[]> {
    const cacheKey = `${userId}:${hours}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

    const sinceMs = Date.now() - hours * 3_600_000;
    const since = new Date(sinceMs).toISOString();
    const sinceTs = Timestamp.fromMillis(sinceMs);
    const isOwnActivity = auth?.currentUser?.uid === userId;

    // ── Parallel Firestore reads ──────────────────────────────────────────
    // All queries use composite indexes on (<user_field>, created_at DESC)
    // so the DB returns only the most recent N records inside the time
    // window. This is the read-optimization tier for a social-feed pattern:
    // ordering + bounding happen at the DB, not in app memory.
    //
    // Required indexes (declared in firestore.indexes.json):
    //   post_likes:    (user_id ASC, created_at DESC)
    //   post_comments: (user_id ASC, created_at DESC)
    //   dares:         (challenger_id ASC, created_at DESC)
    //   dares:         (receiver_id  ASC, created_at DESC)
    //   truths:        (challenger_id ASC, created_at DESC)
    //   truths:        (receiver_id  ASC, created_at DESC)
    //   messages:      (sender_id    ASC, created_at DESC)
    //
    // Firestore-rules allow signed-in reads on every collection above
    // (post_likes, post_comments, dares, truths) so any user can browse
    // any other user's activity feed. Messages are gated to own-user
    // (rule allows sender_id == auth.uid OR conversation participant).
    const userScopedLimit = 50;
    const dareLimit = 25;

    const [
      likesSnap,
      commentsSnap,
      dedicatedStoriesSnap,
      daresSentSnap,
      daresReceivedSnap,
      truthsSentSnap,
      truthsReceivedSnap,
      messagesSnap,
    ] = await Promise.all([
      getDocs(
        query(
          collection(db, "post_likes"),
          where("user_id", "==", userId),
          where("created_at", ">=", sinceTs),
          orderBy("created_at", "desc"),
          limit(userScopedLimit),
        ),
      ),
      getDocs(
        query(
          collection(db, "post_comments"),
          where("user_id", "==", userId),
          where("created_at", ">=", sinceTs),
          orderBy("created_at", "desc"),
          limit(userScopedLimit),
        ),
      ),
      getDocs(
        query(
          collection(db, "stories"),
          where("userId", "==", userId),
          where("createdAt", ">=", sinceTs),
          orderBy("createdAt", "desc"),
          limit(userScopedLimit),
        ),
      ),
      getDocs(
        query(
          collection(db, "dares"),
          where("challenger_id", "==", userId),
          where("created_at", ">=", sinceTs),
          orderBy("created_at", "desc"),
          limit(dareLimit),
        ),
      ),
      getDocs(
        query(
          collection(db, "dares"),
          where("receiver_id", "==", userId),
          where("created_at", ">=", sinceTs),
          orderBy("created_at", "desc"),
          limit(dareLimit),
        ),
      ),
      getDocs(
        query(
          collection(db, "truths"),
          where("challenger_id", "==", userId),
          where("created_at", ">=", sinceTs),
          orderBy("created_at", "desc"),
          limit(dareLimit),
        ),
      ),
      getDocs(
        query(
          collection(db, "truths"),
          where("receiver_id", "==", userId),
          where("created_at", ">=", sinceTs),
          orderBy("created_at", "desc"),
          limit(dareLimit),
        ),
      ),
      // Shared-post activity comes from private messages, so only the
      // signed-in user can load that slice of their own activity (rule
      // requires sender_id == auth.uid OR conversation participant).
      isOwnActivity
        ? getDocs(
            query(
              collection(db, "messages"),
              where("sender_id", "==", userId),
              where("created_at", ">=", sinceTs),
              orderBy("created_at", "desc"),
              limit(userScopedLimit),
            ),
          )
        : Promise.resolve({ forEach: () => {} } as any),
    ]);

    // ── Collect IDs for batch enrichment ──────────────────────────────────
    const postIds = new Set<string>();
    const userIds = new Set<string>();

    likesSnap.forEach((d) => postIds.add(d.data().post_id));
    commentsSnap.forEach((d) => postIds.add(d.data().post_id));
    dedicatedStoriesSnap.forEach((d) => {
      const data = d.data();
      if (data.storyType === "dedication" && data.dedicatedToUserId) {
        userIds.add(data.dedicatedToUserId);
      }
    });
    daresSentSnap.forEach((d) => userIds.add(d.data().receiver_id));
    daresReceivedSnap.forEach((d) => userIds.add(d.data().challenger_id));
    truthsSentSnap.forEach((d) => userIds.add(d.data().receiver_id));
    truthsReceivedSnap.forEach((d) => userIds.add(d.data().challenger_id));

    // Extract shared post IDs from messages
    messagesSnap.forEach((d: any) => {
      const data = d.data();
      if (data.media_url?.startsWith("shared-post:")) {
        try {
          const payload = JSON.parse(
            decodeURIComponent(data.media_url.slice(13)),
          );
          if (payload.postId) postIds.add(payload.postId);
        } catch {
          // Ignore malformed shared posts
        }
      }
    });

    // ── Batch fetch posts ─────────────────────────────────────────────────
    // Store raw author_ids alongside posts so we can attach profiles later.
    const postMap = new Map<string, ActivityPost & { _authorId: string }>();
    const postAuthorIds = new Set<string>();

    const postIdArr = Array.from(postIds);
    const postChunks: string[][] = [];
    for (let i = 0; i < postIdArr.length; i += 10)
      postChunks.push(postIdArr.slice(i, i + 10));

    if (postChunks.length > 0) {
      await Promise.all(
        postChunks.map(async (chunk) => {
          const snap = await getDocs(
            query(collection(db, "posts"), where(documentId(), "in", chunk)),
          );
          snap.forEach((d) => {
            const data = d.data();
            if (data.author_id) postAuthorIds.add(data.author_id);
            postMap.set(d.id, {
              id: d.id,
              content: data.content,
              media_url: data.media_url,
              media_type: data.media_type,
              created_at: data.created_at,
              view_count: data.view_count,
              _authorId: data.author_id ?? "",
            });
          });
        }),
      );
    }

    // ── Batch fetch profiles (dare participants + post authors) ───────────
    const allUserIds = new Set([...userIds, ...postAuthorIds]);
    const profileMap = new Map<string, ActivityUser>();

    await Promise.all(
      Array.from(allUserIds).map(async (uid) => {
        const cached = getCachedResolvedUserProfile(uid);
        const p = cached ?? (await resolveUserProfile(uid));
        if (p) {
          profileMap.set(uid, {
            id: (p as any).id ?? uid,
            username: p.username,
            display_name:
              (p as any).display_name ?? (p as any).displayName ?? null,
            avatar_url: (p as any).avatar_url ?? null,
          });
        }
      }),
    );

    // Attach author profiles to posts
    for (const post of postMap.values()) {
      if (post._authorId) post.author = profileMap.get(post._authorId);
    }

    // Build raw items
    const items: ActivityItem[] = [];

    const normaliseTs = (raw: any): string => {
      if (typeof raw === "string") return raw;
      if (raw?.toDate) return (raw.toDate() as Date).toISOString();
      return new Date().toISOString();
    };

    likesSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.updated_at || data.created_at);
      if (ts < since) return;
      items.push({
        id: d.id,
        type: "liked_post",
        timestamp: ts,
        post: postMap.get(data.post_id),
        like_tap_count: data.tap_count || 1,
      });
    });

    commentsSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.created_at);
      if (ts < since) return;
      items.push({
        id: d.id,
        type: "commented_post",
        timestamp: ts,
        comment_text: data.text,
        comment_id: d.id,
        post: postMap.get(data.post_id),
      });
    });

    dedicatedStoriesSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.createdAt);
      if (ts < since || data.storyType !== "dedication") return;

      const dedicatedToUserId = data.dedicatedToUserId;
      items.push({
        id: `story_dedicated_${d.id}`,
        type: "dedicated_story",
        timestamp: ts,
        story: {
          id: d.id,
          media_url: data.mediaUrl,
          media_type: data.mediaType,
          dedicated_to_user_id: dedicatedToUserId,
          dedicated_to: dedicatedToUserId
            ? profileMap.get(dedicatedToUserId)
            : undefined,
          created_at: ts,
        },
        other_user: dedicatedToUserId
          ? profileMap.get(dedicatedToUserId)
          : undefined,
      });
    });

    // Process shared posts from messages
    messagesSnap.forEach((d: any) => {
      const data = d.data();
      const ts = normaliseTs(data.created_at);
      if (ts < since) return;

      if (data.media_url?.startsWith("shared-post:")) {
        try {
          const payload = JSON.parse(
            decodeURIComponent(data.media_url.slice(13)),
          );
          if (payload.postId && postMap.has(payload.postId)) {
            items.push({
              id: `shared_${d.id}`,
              type: "shared_post",
              timestamp: ts,
              post: postMap.get(payload.postId),
            });
          }
        } catch {
          // Ignore malformed shared posts
        }
      }
    });

    daresSentSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.created_at);
      if (ts < since) return;
      const otherUser = profileMap.get(data.receiver_id);
      items.push({
        id: d.id,
        type: "dare_sent",
        timestamp: ts,
        dare: {
          id: d.id,
          description: data.description ?? "",
          state: data.state ?? "SENT",
          challenger_id: data.challenger_id,
          receiver_id: data.receiver_id,
        },
        other_user: otherUser,
      });
    });

    daresReceivedSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.created_at);
      if (ts < since) return;
      const otherUser = profileMap.get(data.challenger_id);
      items.push({
        id: `recv_${d.id}`,
        type: "dare_received",
        timestamp: ts,
        dare: {
          id: d.id,
          description: data.description ?? "",
          state: data.state ?? "SENT",
          challenger_id: data.challenger_id,
          receiver_id: data.receiver_id,
        },
        other_user: otherUser,
      });
    });

    truthsSentSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.created_at);
      if (ts < since) return;
      const otherUser = profileMap.get(data.receiver_id);
      items.push({
        id: `truth_sent_${d.id}`,
        type: "truth_sent",
        timestamp: ts,
        truth: {
          id: d.id,
          question: data.question ?? "",
          answer: data.answer ?? "",
          state: data.state ?? "SENT",
          challenger_id: data.challenger_id,
          receiver_id: data.receiver_id,
        },
        other_user: otherUser,
      });
    });

    truthsReceivedSnap.forEach((d) => {
      const data = d.data();
      const ts = normaliseTs(data.created_at);
      if (ts < since) return;
      const otherUser = profileMap.get(data.challenger_id);
      items.push({
        id: `truth_recv_${d.id}`,
        type: "truth_received",
        timestamp: ts,
        truth: {
          id: d.id,
          question: data.question ?? "",
          answer: data.answer ?? "",
          state: data.state ?? "SENT",
          challenger_id: data.challenger_id,
          receiver_id: data.receiver_id,
        },
        other_user: otherUser,
      });
    });

    // Sort newest first
    items.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const grouped = this.groupItems(items);
    this.cache.set(cacheKey, { data: grouped, ts: Date.now() });
    return grouped;
  }

  private groupItems(items: ActivityItem[]): GroupedActivity[] {
    const HOUR_MS = 3_600_000;
    const buckets = new Map<string, ActivityItem[]>();

    const getTargetKey = (item: ActivityItem): string => {
      if (
        item.type === "liked_post" ||
        item.type === "commented_post" ||
        item.type === "shared_post"
      ) {
        return item.post?.id || item.id;
      }
      if (item.type === "dedicated_story") {
        return item.story?.id || item.other_user?.id || item.id;
      }
      if (item.type === "dare_sent" || item.type === "dare_received") {
        return item.dare?.id || item.other_user?.id || item.id;
      }
      if (item.type === "truth_sent" || item.type === "truth_received") {
        return item.truth?.id || item.other_user?.id || item.id;
      }
      return item.id;
    };

    for (const item of items) {
      const bucket = Math.floor(new Date(item.timestamp).getTime() / HOUR_MS);
      const key = `${item.type}:${getTargetKey(item)}:${bucket}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }

    const grouped: GroupedActivity[] = [];
    const emitted = new Set<string>();

    for (const item of items) {
      const bucket = Math.floor(new Date(item.timestamp).getTime() / HOUR_MS);
      const key = `${item.type}:${getTargetKey(item)}:${bucket}`;
      if (emitted.has(key)) continue;
      emitted.add(key);

      const group = buckets.get(key)!;
      const first = group[0];
      grouped.push({
        id: key,
        type: first.type,
        timestamp: first.timestamp,
        count: group.length,
        items: group,
        post: first.post,
        story: first.story,
        dare: first.dare,
        truth: first.truth,
        comment_text: first.comment_text,
        other_user: first.other_user,
      });
    }

    return grouped;
  }

  invalidate(userId: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) this.cache.delete(key);
    }
  }
}

export const activityService = new ActivityService();
