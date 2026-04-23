import { db } from "@/backend/lib/firebase";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

type CloseFriendActivityType = "commented" | "repeated_like" | "multi_like";

interface CloseFriendProfile {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

const CLOSE_FRIENDS_COLLECTION = "close_friends";
const CLOSE_FRIEND_ACTIVITY_COLLECTION = "close_friend_activity";
const ALERTS_COLLECTION = "alerts";
const CACHE_TTL_MS = 5 * 60 * 1000;

const makeRelationId = (ownerId: string, targetUserId: string) =>
  `${encodeURIComponent(ownerId)}__${encodeURIComponent(targetUserId)}`;

const makeAlertDocId = (...parts: string[]) =>
  parts.map((part) => encodeURIComponent(part || "unknown")).join("__");

class CloseFriendsService {
  private ownerCloseFriendIdsCache = new Map<
    string,
    { ids: string[]; expiresAt: number }
  >();
  private reverseWatchersCache = new Map<
    string,
    { ids: string[]; expiresAt: number }
  >();

  private invalidateOwnerCache(ownerId: string) {
    this.ownerCloseFriendIdsCache.delete(ownerId);
  }

  private invalidateWatcherCache(targetUserId: string) {
    this.reverseWatchersCache.delete(targetUserId);
  }

  async addCloseFriend(ownerId: string, targetUserId: string) {
    try {
      if (!ownerId || !targetUserId) {
        return { success: false, error: "Missing user ids" };
      }

      if (ownerId === targetUserId) {
        return {
          success: false,
          error: "You cannot add yourself as a close friend",
        };
      }

      const { friendsService } = await import("./service-factory");
      const friendshipResponse = await friendsService.getFriendshipStatus(
        ownerId,
        targetUserId,
      );

      if (
        !friendshipResponse.success ||
        friendshipResponse.friendship?.status !== "accepted"
      ) {
        return {
          success: false,
          error: "You can only add accepted friends to close friends",
        };
      }

      const relationRef = doc(
        db,
        CLOSE_FRIENDS_COLLECTION,
        makeRelationId(ownerId, targetUserId),
      );

      await setDoc(relationRef, {
        owner_id: ownerId,
        close_friend_id: targetUserId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      this.invalidateOwnerCache(ownerId);
      this.invalidateWatcherCache(targetUserId);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async removeCloseFriend(ownerId: string, targetUserId: string) {
    try {
      const relationRef = doc(
        db,
        CLOSE_FRIENDS_COLLECTION,
        makeRelationId(ownerId, targetUserId),
      );
      await deleteDoc(relationRef);

      this.invalidateOwnerCache(ownerId);
      this.invalidateWatcherCache(targetUserId);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async isCloseFriend(ownerId: string, targetUserId: string) {
    try {
      const relationRef = doc(
        db,
        CLOSE_FRIENDS_COLLECTION,
        makeRelationId(ownerId, targetUserId),
      );
      const relationSnap = await getDoc(relationRef);
      return { success: true, isCloseFriend: relationSnap.exists() };
    } catch (error) {
      return {
        success: false,
        isCloseFriend: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getCloseFriendIds(ownerId: string): Promise<string[]> {
    const cached = this.ownerCloseFriendIdsCache.get(ownerId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    const snapshot = await getDocs(
      query(
        collection(db, CLOSE_FRIENDS_COLLECTION),
        where("owner_id", "==", ownerId),
      ),
    );

    const ids = snapshot.docs
      .map((docSnap) => docSnap.data().close_friend_id as string)
      .filter(Boolean);

    this.ownerCloseFriendIdsCache.set(ownerId, {
      ids,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return ids;
  }

  async getWatcherIdsForActor(actorId: string): Promise<string[]> {
    const cached = this.reverseWatchersCache.get(actorId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    const snapshot = await getDocs(
      query(
        collection(db, CLOSE_FRIENDS_COLLECTION),
        where("close_friend_id", "==", actorId),
      ),
    );

    const ids = snapshot.docs
      .map((docSnap) => docSnap.data().owner_id as string)
      .filter(Boolean);

    this.reverseWatchersCache.set(actorId, {
      ids,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return ids;
  }

  async getCloseFriends(ownerId: string) {
    try {
      const closeFriendIds = await this.getCloseFriendIds(ownerId);

      if (closeFriendIds.length === 0) {
        return { success: true, friends: [] as CloseFriendProfile[] };
      }

      const profiles = await this.getProfilesByIds(closeFriendIds);
      return { success: true, friends: profiles };
    } catch (error) {
      return {
        success: false,
        friends: [] as CloseFriendProfile[],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async getProfilesByIds(
    userIds: string[],
  ): Promise<CloseFriendProfile[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < userIds.length; i += 10) {
      chunks.push(userIds.slice(i, i + 10));
    }

    const profilesById = new Map<string, CloseFriendProfile>();

    await Promise.all(
      chunks.map(async (chunk) => {
        const snapshot = await getDocs(
          query(
            collection(db, "users"),
            where(documentId(), "in", chunk),
            limit(10),
          ),
        );

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          profilesById.set(docSnap.id, {
            id: docSnap.id,
            userId: data.user_id || docSnap.id,
            username: data.username || "unknown",
            displayName: data.displayName || data.display_name || null,
            avatarUrl: data.avatar_url || null,
          });
        });
      }),
    );

    return userIds
      .map((userId) => profilesById.get(userId))
      .filter(Boolean) as CloseFriendProfile[];
  }

  async trackPostCommentActivity(params: {
    actorId: string;
    actorName: string;
    actorUsername: string;
    actorAvatar: string;
    postId: string;
    commentId: string;
    commentText: string;
    postAuthorId?: string;
    postAuthorUsername: string;
    postThumbnail?: string;
    postContent?: string;
  }) {
    if (!params.actorId || !params.postId || !params.commentId) return;
    if (!params.postAuthorId || params.postAuthorId === params.actorId) return;

    const watcherIds = await this.getWatcherIdsForActor(params.actorId);
    if (watcherIds.length === 0) return;

    await Promise.all(
      watcherIds
        .filter((watcherId) => watcherId !== params.actorId)
        .map((watcherId) =>
          this.upsertCloseFriendAlert({
            watcherId,
            actorId: params.actorId,
            entityId: params.postId,
            alertDocId: makeAlertDocId(
              "sus-close-comment",
              watcherId,
              params.actorId,
              params.commentId,
            ),
            message: `${this.toHandle(params.actorUsername)} commented on ${this.toHandle(params.postAuthorUsername)}'s post`,
            metadata: {
              interactionType: "commented" satisfies CloseFriendActivityType,
              postId: params.postId,
              commentId: params.commentId,
              commentText: params.commentText,
              targetUserId: params.postAuthorId,
              targetUsername: params.postAuthorUsername.replace(/^@/, ""),
              postThumbnail: params.postThumbnail || "",
              postContent: params.postContent || "",
              actorName: params.actorName,
              actorUsername: params.actorUsername.replace(/^@/, ""),
              actorAvatar: params.actorAvatar || "",
            },
          }),
        ),
    );
  }

  async trackPostLikeActivity(params: {
    actorId: string;
    actorName: string;
    actorUsername: string;
    actorAvatar: string;
    postId: string;
    tapCount: number;
    postAuthorId?: string;
    postAuthorUsername: string;
    postThumbnail?: string;
    postContent?: string;
  }) {
    if (!params.actorId || !params.postId) return;
    if (!params.postAuthorId || params.postAuthorId === params.actorId) return;

    const watcherIds = await this.getWatcherIdsForActor(params.actorId);
    if (watcherIds.length === 0) return;

    if (params.tapCount >= 5) {
      await Promise.all(
        watcherIds
          .filter((watcherId) => watcherId !== params.actorId)
          .map((watcherId) =>
            this.upsertCloseFriendAlert({
              watcherId,
              actorId: params.actorId,
              entityId: params.postId,
              alertDocId: makeAlertDocId(
                "sus-close-repeated-like",
                watcherId,
                params.actorId,
                params.postId,
              ),
              message: `${this.toHandle(params.actorUsername)} liked ${this.toHandle(params.postAuthorUsername)}'s post ${params.tapCount} times`,
              metadata: {
                interactionType:
                  "repeated_like" satisfies CloseFriendActivityType,
                postId: params.postId,
                tapCount: params.tapCount,
                targetUserId: params.postAuthorId,
                targetUsername: params.postAuthorUsername.replace(/^@/, ""),
                postThumbnail: params.postThumbnail || "",
                postContent: params.postContent || "",
                actorName: params.actorName,
                actorUsername: params.actorUsername.replace(/^@/, ""),
                actorAvatar: params.actorAvatar || "",
              },
            }),
          ),
      );
    }

    const activityDocId = makeAlertDocId(
      "multi-post-like",
      params.actorId,
      params.postAuthorId,
    );
    const activityRef = doc(
      db,
      CLOSE_FRIEND_ACTIVITY_COLLECTION,
      activityDocId,
    );

    const activitySnapshot = await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(activityRef);
      const existingData = existingSnap.exists() ? existingSnap.data() : {};
      const existingPosts = Array.isArray(existingData?.likedPostIds)
        ? existingData.likedPostIds
        : [];
      const alreadyCounted = existingPosts.includes(params.postId);
      const nextCount = alreadyCounted
        ? existingPosts.length
        : existingPosts.length + 1;

      if (!alreadyCounted) {
        transaction.set(
          activityRef,
          {
            actor_id: params.actorId,
            target_user_id: params.postAuthorId,
            likedPostIds: arrayUnion(params.postId),
            likedPostsCount: nextCount,
            updated_at: serverTimestamp(),
          },
          { merge: true },
        );
      }

      return {
        distinctLikedPosts: nextCount,
      };
    });

    if (activitySnapshot.distinctLikedPosts < 3) return;

    await Promise.all(
      watcherIds
        .filter((watcherId) => watcherId !== params.actorId)
        .map((watcherId) =>
          this.upsertCloseFriendAlert({
            watcherId,
            actorId: params.actorId,
            entityId: params.postId,
            alertDocId: makeAlertDocId(
              "sus-close-multi-like",
              watcherId,
              params.actorId,
              params.postAuthorId!,
            ),
            message: `${this.toHandle(params.actorUsername)} liked ${activitySnapshot.distinctLikedPosts} of ${this.toHandle(params.postAuthorUsername)}'s posts`,
            metadata: {
              interactionType: "multi_like" satisfies CloseFriendActivityType,
              postId: params.postId,
              distinctLikedPosts: activitySnapshot.distinctLikedPosts,
              targetUserId: params.postAuthorId,
              targetUsername: params.postAuthorUsername.replace(/^@/, ""),
              postThumbnail: params.postThumbnail || "",
              postContent: params.postContent || "",
              actorName: params.actorName,
              actorUsername: params.actorUsername.replace(/^@/, ""),
              actorAvatar: params.actorAvatar || "",
            },
          }),
        ),
    );
  }

  private async upsertCloseFriendAlert(params: {
    watcherId: string;
    actorId: string;
    entityId: string;
    alertDocId: string;
    message: string;
    metadata: Record<string, any>;
  }) {
    await setDoc(doc(db, ALERTS_COLLECTION, params.alertDocId), {
      userId: params.watcherId,
      type: "SUS_CLOSE_FRIEND_ACTIVITY",
      entityId: params.entityId,
      actorId: params.actorId,
      message: params.message,
      metadata: params.metadata,
      isRead: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  private toHandle(username: string) {
    const normalized = (username || "someone").replace(/^@/, "");
    return `@${normalized}`;
  }
}

export const closeFriendsService = new CloseFriendsService();
