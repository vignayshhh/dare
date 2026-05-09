import { db, auth } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  increment,
  onSnapshot,
  Unsubscribe,
  documentId,
  serverTimestamp,
} from "firebase/firestore";
import { friendsService } from "./friends.service";
import { userService } from "./user.service";
import { redisCache } from "@/services/redisCache.server";
import { aggregatedCounters } from "@/services/aggregatedCounters";
import { generatePlaceholderMedia } from "@/utils/placeholderImages";
import {
  requireAuthenticatedUser,
  secureLogError,
  validateOptionalMediaUrl,
  validateOptionalText,
  SECURITY_LIMITS,
} from "@/security/appSecurity";

export interface Post {
  id: string;
  author_id: string;
  content?: string;
  media_url?: string;
  media_type?: "TEXT" | "PHOTO" | "VIDEO" | "AUDIO";
  view_count: number;
  likes_count?: number;
  comments_count?: number;
  created_at: string | Timestamp | any;
  updated_at: string | Timestamp | any;
}

export interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
  tap_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface PostView {
  id: string;
  post_id: string;
  user_id: string;
  viewed_at: string;
}

export interface FeedEvent {
  id: string;
  user_id: string;
  event_type:
    | "POST_CREATED"
    | "DARE_COMPLETED"
    | "DARE_ACCEPTED"
    | "TRUTH_TOLD";
  related_post_id?: string;
  related_dare_id?: string;
  related_truth_id?: string;
  created_at: string | Timestamp | any;
}

export interface CreatePostRequest {
  author_id: string;
  content?: string;
  media_url?: string;
  media_type?: "TEXT" | "PHOTO" | "VIDEO" | "AUDIO";
}

export interface PostWithAuthor extends Omit<Post, "view_count"> {
  author: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked_by_user?: boolean;
  view_count?: number;
}

export interface FeedEventWithUser extends FeedEvent {
  user: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  related_post?: PostWithAuthor;
  related_dare?: any;
}

class FeedService {
  private readonly postEnrichmentCacheTtlMs = 5 * 60 * 1000;
  // Enable aggregated counters to reduce reads by ~90% for count queries
  private readonly enableAggregatedCounters = true; // Set to true to enable
  private readonly viewedPostsThisSession = new Set<string>();
  private postEnrichmentCache = new Map<
    string,
    {
      likesCount: number;
      isLikedByUser: boolean;
      commentsCount: number;
      expiresAt: number;
    }
  >();

  private convertTimestampToISO(timestamp: any): string {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate().toISOString();
    }
    if (typeof timestamp === "string") {
      return timestamp;
    }
    if (timestamp && typeof timestamp.toDate === "function") {
      return timestamp.toDate().toISOString();
    }
    // If timestamp is a Firestore Timestamp object with seconds property
    if (
      timestamp &&
      typeof timestamp === "object" &&
      "seconds" in timestamp &&
      "nanoseconds" in timestamp
    ) {
      const date = new Date(
        timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000,
      );
      return date.toISOString();
    }
    // Fallback to current time if timestamp is invalid
    console.warn(
      "Invalid timestamp detected, using fallback epoch:",
      timestamp,
    );
    return "1970-01-01T00:00:00.000Z";
  }

  async createPost(request: CreatePostRequest): Promise<Post> {
    try {
      const authenticatedUserId = requireAuthenticatedUser(request.author_id);
      console.log("🔐 Authenticated user ID:", authenticatedUserId);
      console.log("📝 Request author_id:", request.author_id);
      console.log("🔑 Firebase Auth UID:", auth.currentUser?.uid);
      const sanitizedContent = validateOptionalText(
        request.content,
        SECURITY_LIMITS.postContent,
      );
      console.log("🔍 Media URL before validation:", request.media_url);
      const sanitizedMediaUrl = validateOptionalMediaUrl(request.media_url);
      console.log("✅ Media URL after validation:", sanitizedMediaUrl);
      const postRef = doc(collection(db, "posts"));

      // Fetch author profile to denormalize onto post doc
      let authorUsername = "";
      let authorDisplayName = "";
      let authorAvatarUrl = "";
      try {
        const authorProfile = await userService.getProfile(authenticatedUserId);
        if (authorProfile) {
          authorUsername = authorProfile.username || "";
          authorDisplayName = authorProfile.display_name || "";
          authorAvatarUrl = authorProfile.avatar_url || "";
        }
      } catch {
        /* non-fatal */
      }

      const postData = {
        author_id: authenticatedUserId,
        author_username: authorUsername,
        author_display_name: authorDisplayName,
        author_avatar_url: authorAvatarUrl,
        content: sanitizedContent || null,
        media_url: sanitizedMediaUrl || null,
        media_type: request.media_type || "TEXT",
        view_count: 0,
        likes_count: 0,
        comments_count: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      console.log("📤 Attempting to create post with data:", postData);
      await setDoc(postRef, postData);
      const newPost = { id: postRef.id, ...postData } as Post;
      console.log("✅ Post created successfully:", newPost.id);

      // Create feed event
      await this.createFeedEvent({
        user_id: authenticatedUserId,
        event_type: "POST_CREATED",
        related_post_id: newPost.id,
      });

      // Invalidate feed cache so new post appears immediately
      redisCache.invalidatePattern("feed:*").catch(() => {});

      return newPost;
    } catch (error) {
      secureLogError("createPost failed", error);
      throw error;
    }
  }

  async createFeedEvent(
    eventData: Omit<FeedEvent, "id" | "created_at">,
  ): Promise<FeedEvent> {
    try {
      const eventRef = doc(collection(db, "feed_events"));
      const feedEventData = {
        ...eventData,
        created_at: serverTimestamp(),
      };

      await setDoc(eventRef, feedEventData);
      return { id: eventRef.id, ...feedEventData } as FeedEvent;
    } catch (error) {
      secureLogError("createFeedEvent failed", error);
      throw error;
    }
  }

  async getFeed(
    userId: string,
    limitCount: number = 20,
    lastDoc?: any,
  ): Promise<PostWithAuthor[]> {
    try {
      // Use new friends service to get friends
      const { friendsService: newFriendsService } =
        await import("./service-factory");
      const friendsResponse = await newFriendsService.getFriends(userId);

      console.log("🔍 FEED - Friends response:", friendsResponse);

      let friendIds: string[];

      if (!friendsResponse.success || !friendsResponse.friends) {
        friendIds = [userId];
        console.log("🔍 FEED - No friends found, using only user ID");
      } else {
        friendIds = friendsResponse.friends
          .map((friend: any) => friend?.userId || friend?.id)
          .filter((id: any): id is string => !!id && typeof id === "string");
        friendIds = [...new Set([...friendIds, userId])];
        console.log("🔍 FEED - Friend IDs:", friendIds);
      }

      let feedQuery = query(
        collection(db, "posts"),
        where("author_id", "in", friendIds),
        orderBy("created_at", "desc"),
        limit(limitCount),
      );

      if (lastDoc) {
        feedQuery = query(feedQuery, startAfter(lastDoc));
      }

      console.log("🔍 FEED - Executing query for", friendIds.length, "users");
      const querySnapshot = await getDocs(feedQuery);
      console.log("🔍 FEED - Query returned", querySnapshot.size, "posts");

      // Extract raw posts (no async)
      const rawPosts: Post[] = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          created_at: this.convertTimestampToISO(data.created_at),
          updated_at: this.convertTimestampToISO(data.updated_at),
        } as Post;
      });

      // Batch fetch ALL enrichment data in parallel
      const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
      const postIds = rawPosts.map((p) => p.id);

      const [authorsMap, likesMap, commentsMap] = await Promise.all([
        this.batchGetAuthors(authorIds),
        this.batchGetPostLikes(postIds, userId),
        this.batchGetPostCommentsCounts(postIds),
      ]);

      // Assemble enriched posts (no async, pure mapping)
      const posts: PostWithAuthor[] = rawPosts.map((post) => ({
        ...post,
        author: authorsMap.get(post.author_id) || {
          id: post.author_id,
          user_id: post.author_id,
          username: `user_${post.author_id.slice(0, 8)}`,
          display_name: null,
          avatar_url: "",
        },
        likes_count: likesMap.get(post.id)?.likesCount ?? 0,
        comments_count: commentsMap.get(post.id) ?? 0,
        is_liked_by_user: likesMap.get(post.id)?.isLikedByUser ?? false,
      }));

      return posts;
    } catch (error) {
      console.error("Error getting feed:", error);
      return [];
    }
  }

  async getPost(postId: string): Promise<Post | null> {
    try {
      const postDocRef = doc(db, "posts", postId);
      const postDoc = await getDoc(postDocRef);

      if (!postDoc.exists()) return null;
      const data = postDoc.data();
      return {
        id: postDoc.id,
        ...data,
        created_at: this.convertTimestampToISO(data.created_at),
        updated_at: this.convertTimestampToISO(data.updated_at),
      } as Post;
    } catch (error) {
      console.error("Error getting post:", error);
      return null;
    }
  }

  async getPostWithAuthor(
    postId: string,
    userId?: string,
  ): Promise<PostWithAuthor | null> {
    try {
      const post = await this.getPost(postId);
      if (!post) return null;

      // Fix blob URLs if needed
      const fixedPost = await this.fixBlobUrlIfNeeded(post);

      const author = await this.getPostAuthor(fixedPost.author_id);
      if (!author) return null;

      const likesCount = await this.getPostLikesCount(fixedPost.id);
      const commentsCount = await this.getPostCommentsCount(fixedPost.id);
      const isLikedByUser = userId
        ? await this.isPostLikedByUser(fixedPost.id, userId)
        : false;

      return {
        ...fixedPost,
        author,
        likes_count: likesCount,
        comments_count: commentsCount,
        is_liked_by_user: isLikedByUser,
      };
    } catch (error) {
      console.error("Error getting post with author:", error);
      return null;
    }
  }

  private async getPostAuthor(
    authorId: string,
  ): Promise<PostWithAuthor["author"] | null> {
    try {
      const userDocRef = doc(db, "users", authorId);
      const userDoc = await getDoc(userDocRef);

      let avatarUrl = "";

      if (userDoc.exists()) {
        const userData = userDoc.data();
        avatarUrl = userData.avatar_url || "";
      }

      // ALWAYS try to get from stored avatars as backup/enhancement
      try {
        const { useAvatarStore } = require("../../stores/avatarStore");
        const { getStoredAvatar } = useAvatarStore.getState();
        const storedAvatar = getStoredAvatar(authorId);

        if (storedAvatar && storedAvatar !== avatarUrl) {
          avatarUrl = storedAvatar;
        }
      } catch (error) {}

      // If we have an avatar, return the author data
      if (avatarUrl || userDoc.exists()) {
        const userData = userDoc.exists() ? userDoc.data() : {};

        return {
          id: userDoc.id || authorId,
          user_id: userData.user_id || authorId,
          username: userData.username || `user_${authorId.slice(0, 8)}`,
          display_name: userData.displayName || userData.display_name || null,
          avatar_url: avatarUrl,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting post author:", error);
      return null;
    }
  }

  // SECURITY FIX (§1.6): Likes/unlikes are written server-side via the
  // Next.js API route. The client no longer touches `post_likes` or
  // `posts.likes_count` directly — Firestore rules block both. The
  // Cloud Function trigger aggregates the authoritative count, and
  // existing onSnapshot listeners on the client pick up the change
  // automatically so realtime feels unchanged.
  async likePost(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      const { apiFetch } = await import("@/lib/apiClient");
      await apiFetch(`/api/posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
      });
      this.postEnrichmentCache.delete(postId);
      return true;
    } catch (error) {
      // CRITICAL: re-throw so the caller can roll back the optimistic UI.
      // Previously this swallowed the error and returned false, which made
      // failed likes appear successful in the UI until the user refreshed
      // and saw the heart vanish (because nothing was ever written to
      // Firestore).
      secureLogError("likePost failed", error);
      console.error("❌ [LIKE API] failed:", postId, error);
      throw error;
    }
  }

  async unlikePost(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      const { apiFetch } = await import("@/lib/apiClient");
      await apiFetch(`/api/posts/${encodeURIComponent(postId)}/like`, {
        method: "DELETE",
      });
      this.postEnrichmentCache.delete(postId);
      return true;
    } catch (error) {
      secureLogError("unlikePost failed", error);
      console.error("❌ [UNLIKE API] failed:", postId, error);
      throw error;
    }
  }

  private async getPostLike(
    postId: string,
    userId: string,
  ): Promise<PostLike | null> {
    try {
      const likesRef = collection(db, "post_likes");
      const q = query(
        likesRef,
        where("post_id", "==", postId),
        where("user_id", "==", userId),
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) return null;
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as PostLike;
    } catch (error) {
      console.error("Error getting post like:", error);
      return null;
    }
  }

  async isPostLikedByUser(postId: string, userId: string): Promise<boolean> {
    const like = await this.getPostLike(postId, userId);
    return !!like;
  }

  async getPostLikesCount(postId: string): Promise<number> {
    try {
      const likesRef = collection(db, "post_likes");
      const q = query(likesRef, where("post_id", "==", postId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error("Error getting post likes count:", error);
      return 0;
    }
  }

  async getPostCommentsCount(postId: string): Promise<number> {
    try {
      const commentsRef = collection(db, "post_comments");
      const q = query(commentsRef, where("post_id", "==", postId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error("Error getting post comments count:", error);
      return 0;
    }
  }

  // SECURITY FIX (§1.6): View tracking is server-side. The API route
  // writes `post_views/${postId}_${uid}` idempotently and the trigger
  // aggregates `view_count`. `skipCsrf` is set server-side for this
  // endpoint so sendBeacon() can be used for page-unload flushes.
  async trackPostView(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      const sessionKey = `${postId}:${userId}`;
      if (this.viewedPostsThisSession.has(sessionKey)) return true;

      const { apiFetch } = await import("@/lib/apiClient");
      await apiFetch(`/api/posts/${encodeURIComponent(postId)}/view`, {
        method: "POST",
      });
      this.viewedPostsThisSession.add(sessionKey);
      return true;
    } catch (error) {
      secureLogError("trackPostView failed", error);
      return false;
    }
  }

  private async getPostView(
    postId: string,
    userId: string,
  ): Promise<PostView | null> {
    try {
      const viewsRef = collection(db, "post_views");
      const q = query(
        viewsRef,
        where("post_id", "==", postId),
        where("user_id", "==", userId),
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) return null;
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as PostView;
    } catch (error) {
      console.error("Error getting post view:", error);
      return null;
    }
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      const post = await this.getPost(postId);
      if (!post || post.author_id !== userId) {
        throw new Error("Unauthorized to delete this post");
      }

      const postRef = doc(db, "posts", postId);
      await deleteDoc(postRef);

      await this.deletePostLikes(postId);
      await this.deletePostViews(postId);

      return true;
    } catch (error) {
      secureLogError("deletePost failed", error);
      return false;
    }
  }

  private async deletePostLikes(postId: string): Promise<void> {
    try {
      const likesRef = collection(db, "post_likes");
      const q = query(likesRef, where("post_id", "==", postId));
      const querySnapshot = await getDocs(q);
      for (const doc of querySnapshot.docs) {
        await deleteDoc(doc.ref);
      }
    } catch (error) {
      console.error("Error deleting post likes:", error);
    }
  }

  private async deletePostViews(postId: string): Promise<void> {
    try {
      const viewsRef = collection(db, "post_views");
      const q = query(viewsRef, where("post_id", "==", postId));
      const querySnapshot = await getDocs(q);
      for (const doc of querySnapshot.docs) {
        await deleteDoc(doc.ref);
      }
    } catch (error) {
      console.error("Error deleting post views:", error);
    }
  }

  private async fixBlobUrlIfNeeded(post: Post): Promise<Post> {
    if (post.media_url && post.media_url.startsWith("blob:")) {
      const placeholderUrl = generatePlaceholderMedia(
        800,
        600,
        "Media Migrated",
      );

      const postRef = doc(db, "posts", post.id);
      await updateDoc(postRef, {
        media_url: placeholderUrl,
        updated_at: new Date().toISOString(),
      });

      return { ...post, media_url: placeholderUrl };
    }
    return post;
  }

  async migrateBlobUrls(): Promise<void> {
    try {
      const postsRef = collection(db, "posts");
      const querySnapshot = await getDocs(postsRef);

      let migratedCount = 0;
      for (const doc of querySnapshot.docs) {
        const post = { id: doc.id, ...doc.data() } as Post;
        if (post.media_url && post.media_url.startsWith("blob:")) {
          await this.fixBlobUrlIfNeeded(post);
          migratedCount++;
        }
      }

      console.log(`✅ MIGRATION COMPLETE: ${migratedCount} posts migrated`);
    } catch (error) {
      console.error("❌ ERROR DURING MIGRATION:", error);
    }
  }

  // FIX: Rebuilt subscribeToFeed — uses parallel batch enrichment instead of
  // sequential N+1 queries. Removed migrateBlobUrls() from hot path.
  subscribeToFeed(
    userId: string,
    callback: (posts: PostWithAuthor[]) => void,
    limitCount: number = 20,
  ): Unsubscribe {
    // We need to return an Unsubscribe synchronously, so we use a ref pattern
    // that gets replaced once the async setup resolves.
    let innerUnsubscribe: Unsubscribe = () => {};

    const setupSubscription = async () => {
      try {
        // Use new friends service to get friends
        const { friendsService: newFriendsService } =
          await import("./service-factory");
        const friendsResponse = await newFriendsService.getFriends(userId);

        let friendIds: string[];

        if (!friendsResponse.success || !friendsResponse.friends) {
          friendIds = [userId];
        } else {
          friendIds = friendsResponse.friends
            .map((friend: any) => friend?.userId || friend?.id)
            .filter((id: any): id is string => !!id && typeof id === "string");
          friendIds = [...new Set([...friendIds, userId])];
        }

        const feedQuery = query(
          collection(db, "posts"),
          where("author_id", "in", friendIds),
          orderBy("created_at", "desc"),
          limit(limitCount),
        );

        const authorCache = new Map<string, PostWithAuthor["author"]>();

        innerUnsubscribe = onSnapshot(
          feedQuery,
          async (querySnapshot) => {
            // Extract raw posts (no async)
            const rawPosts: Post[] = querySnapshot.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                ...data,
                created_at: this.convertTimestampToISO(data.created_at),
                updated_at: this.convertTimestampToISO(data.updated_at),
              } as Post;
            });

            // Step 1: Collect unique author IDs and post IDs
            const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
            const postIds = rawPosts.map((p) => p.id);

            // Step 2a: Only fetch authors not already in cache (persists across fires)
            const missingAuthorIds = authorIds.filter(
              (id) => !authorCache.has(id),
            );
            if (missingAuthorIds.length > 0) {
              const fetched = await this.batchGetAuthors(missingAuthorIds);
              fetched.forEach((author, id) => authorCache.set(id, author));
            }
            const authorsMap = new Map<string, PostWithAuthor["author"]>(
              authorIds.map((id) => [
                id,
                authorCache.get(id) ?? {
                  id,
                  user_id: id,
                  username: `user_${id.slice(0, 8)}`,
                  display_name: null,
                  avatar_url: "",
                },
              ]),
            );

            // Step 3b: Fetch likes+comments only for posts not in the TTL cache
            const now = Date.now();
            const staleFeedPostIds = postIds.filter((id) => {
              const c = this.postEnrichmentCache.get(id);
              return !c || c.expiresAt <= now;
            });

            if (staleFeedPostIds.length > 0) {
              const [freshLikes, freshComments] = await Promise.all([
                this.batchGetPostLikes(staleFeedPostIds, userId),
                this.batchGetPostCommentsCounts(staleFeedPostIds),
              ]);
              const expiresAt = now + this.postEnrichmentCacheTtlMs;
              staleFeedPostIds.forEach((id) => {
                this.postEnrichmentCache.set(id, {
                  likesCount: freshLikes.get(id)?.likesCount ?? 0,
                  isLikedByUser: freshLikes.get(id)?.isLikedByUser ?? false,
                  commentsCount: freshComments.get(id) ?? 0,
                  expiresAt,
                });
              });
            }

            // Step 4: Assemble enriched posts from cache (no extra reads).
            // Use Math.max(raw, cached) so that:
            //   a) realtime CF-incremented counts supersede a stale cache, and
            //   b) legacy posts where likes_count=0 on the doc (pre-CF) still
            //      show the actual count from the batchGetPostLikes query.
            const posts: PostWithAuthor[] = rawPosts.map((post) => {
              const enrichment = this.postEnrichmentCache.get(post.id);
              const rawLikes =
                typeof post.likes_count === "number" ? post.likes_count : 0;
              const rawComments =
                typeof post.comments_count === "number"
                  ? post.comments_count
                  : 0;
              return {
                ...post,
                author: authorsMap.get(post.author_id) || {
                  id: post.author_id,
                  user_id: post.author_id,
                  username: `user_${post.author_id.slice(0, 8)}`,
                  display_name: null,
                  avatar_url: "",
                },
                likes_count: Math.max(rawLikes, enrichment?.likesCount ?? 0),
                comments_count: Math.max(
                  rawComments,
                  enrichment?.commentsCount ?? 0,
                ),
                is_liked_by_user: enrichment?.isLikedByUser ?? false,
              };
            });

            callback(posts);
          },
          (error) => {
            console.error("❌ Real-time feed subscription error:", error);
          },
        );
      } catch (error) {
        console.error("❌ Error setting up feed subscription:", error);
      }
    };

    setupSubscription();

    // Return a stable unsubscribe handle that delegates to the inner one
    return () => innerUnsubscribe();
  }

  // Get user posts directly (for profile pages)
  async getUserPosts(
    userId: string,
    limitCount: number = 20,
  ): Promise<PostWithAuthor[]> {
    const userPostsQuery = query(
      collection(db, "posts"),
      where("author_id", "==", userId),
      orderBy("created_at", "desc"),
      limit(limitCount),
    );

    const querySnapshot = await getDocs(userPostsQuery);

    // Extract raw posts
    const rawPosts: Post[] = querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        created_at: this.convertTimestampToISO(data.created_at),
        updated_at: this.convertTimestampToISO(data.updated_at),
      } as Post;
    });

    // Batch fetch all enrichment in parallel
    const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
    const postIds = rawPosts.map((p) => p.id);

    const [authorsMap, likesMap, commentsMap] = await Promise.all([
      this.batchGetAuthors(authorIds),
      this.batchGetPostLikes(postIds, userId),
      this.batchGetPostCommentsCounts(postIds),
    ]);

    const posts: PostWithAuthor[] = rawPosts.map((post) => ({
      ...post,
      author: authorsMap.get(post.author_id) || {
        id: post.author_id,
        user_id: post.author_id,
        username: `user_${post.author_id.slice(0, 8)}`,
        display_name: null,
        avatar_url: "",
      },
      likes_count: likesMap.get(post.id)?.likesCount ?? 0,
      comments_count: commentsMap.get(post.id) ?? 0,
      is_liked_by_user: likesMap.get(post.id)?.isLikedByUser ?? false,
    }));

    return posts;
  }

  // Separate method for subscribing to a single user's posts (profile page)
  subscribeToUserPosts(
    userId: string,
    callback: (posts: PostWithAuthor[]) => void,
    limitCount: number = 20,
  ): Unsubscribe {
    const userPostsQuery = query(
      collection(db, "posts"),
      where("author_id", "==", userId),
      orderBy("created_at", "desc"),
      limit(limitCount),
    );

    const authorCache = new Map<string, PostWithAuthor["author"]>();

    const unsubscribe = onSnapshot(
      userPostsQuery,
      async (querySnapshot) => {
        // Extract raw posts (no async)
        const rawPosts: Post[] = querySnapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            created_at: this.convertTimestampToISO(data.created_at),
            updated_at: this.convertTimestampToISO(data.updated_at),
          } as Post;
        });

        const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
        const postIds = rawPosts.map((p) => p.id);

        // Only fetch authors not already in cache
        const missingAuthorIds = authorIds.filter((id) => !authorCache.has(id));
        if (missingAuthorIds.length > 0) {
          const fetched = await this.batchGetAuthors(missingAuthorIds);
          fetched.forEach((author, id) => authorCache.set(id, author));
        }
        const authorsMap = new Map<string, PostWithAuthor["author"]>(
          authorIds.map((id) => [
            id,
            authorCache.get(id) ?? {
              id,
              user_id: id,
              username: `user_${id.slice(0, 8)}`,
              display_name: null,
              avatar_url: "",
            },
          ]),
        );

        // Fetch likes+comments only for posts not in the TTL cache
        const nowUp = Date.now();
        const staleUserPostIds = postIds.filter((id) => {
          const c = this.postEnrichmentCache.get(id);
          return !c || c.expiresAt <= nowUp;
        });

        if (staleUserPostIds.length > 0) {
          const [freshLikes, freshComments] = await Promise.all([
            this.batchGetPostLikes(staleUserPostIds, userId),
            this.batchGetPostCommentsCounts(staleUserPostIds),
          ]);
          const expiresAt = nowUp + this.postEnrichmentCacheTtlMs;
          staleUserPostIds.forEach((id) => {
            this.postEnrichmentCache.set(id, {
              likesCount: freshLikes.get(id)?.likesCount ?? 0,
              isLikedByUser: freshLikes.get(id)?.isLikedByUser ?? false,
              commentsCount: freshComments.get(id) ?? 0,
              expiresAt,
            });
          });
        }

        const posts: PostWithAuthor[] = rawPosts.map((post) => {
          const enrichment = this.postEnrichmentCache.get(post.id);
          return {
            ...post,
            author: authorsMap.get(post.author_id) || {
              id: post.author_id,
              user_id: post.author_id,
              username: `user_${post.author_id.slice(0, 8)}`,
              display_name: null,
              avatar_url: "",
            },
            likes_count: enrichment?.likesCount ?? 0,
            comments_count: enrichment?.commentsCount ?? 0,
            is_liked_by_user: enrichment?.isLikedByUser ?? false,
          };
        });

        callback(posts);
      },
      (error) => {
        console.error("❌ Real-time user posts subscription error:", error);
      },
    );

    console.log("✅ Real-time user posts subscription established");
    return unsubscribe;
  }

  async getPostLikes(postId: string): Promise<
    Array<{
      userId: string;
      name: string;
      username: string;
      avatar: string;
      tapCount: number;
    }>
  > {
    try {
      const likesRef = collection(db, "post_likes");
      const q = query(likesRef, where("post_id", "==", postId));
      const querySnapshot = await getDocs(q);

      const likes = [];
      for (const docSnap of querySnapshot.docs) {
        const like = docSnap.data() as PostLike;
        const author = await this.getPostAuthor(like.user_id);

        if (author) {
          likes.push({
            userId: like.user_id,
            name: author.display_name || author.username,
            username: author.username,
            avatar: author.avatar_url || "",
            tapCount: like.tap_count || 1,
          });
        }
      }

      return likes;
    } catch (error) {
      console.error("Error getting post likes:", error);
      return [];
    }
  }

  // ─── Batch enrichment methods ──────────────────────────────────────────────
  // These fetch data for multiple posts/authors in a single Firestore query,
  // replacing the sequential N+1 pattern that caused slow feed loading.

  async batchGetAuthors(
    authorIds: string[],
  ): Promise<Map<string, PostWithAuthor["author"]>> {
    const results = new Map<string, PostWithAuthor["author"]>();
    if (authorIds.length === 0) return results;

    try {
      // Firebase 'in' queries support max 10 items; chunk if needed
      const chunks: string[][] = [];
      for (let i = 0; i < authorIds.length; i += 10) {
        chunks.push(authorIds.slice(i, i + 10));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where(documentId(), "in", chunk));
          const snapshot = await getDocs(q);

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            results.set(docSnap.id, {
              id: docSnap.id,
              user_id: data.user_id || docSnap.id,
              username: data.username || `user_${docSnap.id.slice(0, 8)}`,
              display_name: data.displayName || data.display_name || null,
              avatar_url: data.avatar_url || "",
            });
          });
        }),
      );
    } catch (error) {
      console.error("❌ batchGetAuthors error:", error);
    }

    return results;
  }

  async batchGetPostLikes(
    postIds: string[],
    userId: string,
    storedLikesCounts?: Map<string, number | undefined>,
  ): Promise<Map<string, { likesCount: number; isLikedByUser: boolean }>> {
    const results = new Map<
      string,
      { likesCount: number; isLikedByUser: boolean }
    >();

    // Seed defaults — if stored counts are provided use them, otherwise 0
    for (const id of postIds) {
      const stored = storedLikesCounts?.get(id);
      results.set(id, {
        likesCount: typeof stored === "number" ? stored : 0,
        isLikedByUser: false,
      });
    }

    if (postIds.length === 0) return results;

    try {
      const chunks: string[][] = [];
      for (let i = 0; i < postIds.length; i += 10) {
        chunks.push(postIds.slice(i, i + 10));
      }

      if (storedLikesCounts !== undefined) {
        // ── Optimized path (posts that have likes_count on the document) ────
        // likesCount is already seeded above. Only query current user's own
        // likes so we can set isLikedByUser without scanning every like doc.
        //
        // Posts whose stored count is undefined (field not yet written, e.g.
        // old posts created before denormalization) fall into legacyIds and
        // go through the full scan so their count is always correct.
        const legacyIds = postIds.filter(
          (id) => typeof storedLikesCounts.get(id) !== "number",
        );
        const optimizedIds = postIds.filter(
          (id) => typeof storedLikesCounts.get(id) === "number",
        );

        const optimizedChunks: string[][] = [];
        for (let i = 0; i < optimizedIds.length; i += 10)
          optimizedChunks.push(optimizedIds.slice(i, i + 10));

        const legacyChunks: string[][] = [];
        for (let i = 0; i < legacyIds.length; i += 10)
          legacyChunks.push(legacyIds.slice(i, i + 10));

        await Promise.all([
          // Narrow user-only query for posts with a stored count
          ...optimizedChunks.map(async (chunk) => {
            const q = query(
              collection(db, "post_likes"),
              where("user_id", "==", userId),
              where("post_id", "in", chunk),
            );
            const snapshot = await getDocs(q);
            snapshot.forEach((docSnap) => {
              const pid = docSnap.data().post_id as string;
              const existing = results.get(pid)!;
              results.set(pid, { ...existing, isLikedByUser: true });
            });
          }),
          // Full scan for posts without a stored count
          ...legacyChunks.map(async (chunk) => {
            const q = query(
              collection(db, "post_likes"),
              where("post_id", "in", chunk),
            );
            const snapshot = await getDocs(q);
            const byPost = new Map<string, Array<{ user_id: string }>>();
            snapshot.forEach((docSnap) => {
              const d = docSnap.data();
              const pid = d.post_id as string;
              if (!byPost.has(pid)) byPost.set(pid, []);
              byPost.get(pid)!.push({ user_id: d.user_id });
            });
            for (const pid of chunk) {
              const likes = byPost.get(pid) || [];
              results.set(pid, {
                likesCount: likes.length,
                isLikedByUser: likes.some((l) => l.user_id === userId),
              });
            }
          }),
        ]);
      } else {
        // ── Legacy path (no stored counts provided by caller) ────────────────
        // Read ALL like docs per chunk to derive count + user status.
        await Promise.all(
          chunks.map(async (chunk) => {
            const q = query(
              collection(db, "post_likes"),
              where("post_id", "in", chunk),
            );
            const snapshot = await getDocs(q);

            const byPost = new Map<string, Array<{ user_id: string }>>();
            snapshot.forEach((docSnap) => {
              const d = docSnap.data();
              const pid = d.post_id as string;
              if (!byPost.has(pid)) byPost.set(pid, []);
              byPost.get(pid)!.push({ user_id: d.user_id });
            });

            for (const pid of chunk) {
              const likes = byPost.get(pid) || [];
              results.set(pid, {
                likesCount: likes.length,
                isLikedByUser: likes.some((l) => l.user_id === userId),
              });
            }
          }),
        );
      }
    } catch (error) {
      console.error("❌ batchGetPostLikes error:", error);
    }

    return results;
  }

  async batchGetPostCommentsCounts(
    postIds: string[],
    storedCommentsCounts?: Map<string, number | undefined>,
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    if (postIds.length === 0) return results;

    if (storedCommentsCounts !== undefined) {
      // ── Optimized path ──────────────────────────────────────────────────
      // Use the comments_count field stored on the post document.
      // No Firestore reads needed for posts that have this field.
      const needsQuery: string[] = [];
      for (const id of postIds) {
        const stored = storedCommentsCounts.get(id);
        if (typeof stored === "number") {
          results.set(id, stored);
        } else {
          results.set(id, 0);
          needsQuery.push(id); // old posts without the stored field
        }
      }
      if (needsQuery.length === 0) return results;
      // Fall through with only the legacy posts that need querying
      postIds = needsQuery;
    } else {
      // Initialise all with 0 for legacy path
      for (const id of postIds) {
        results.set(id, 0);
      }
    }

    try {
      const chunks: string[][] = [];
      for (let i = 0; i < postIds.length; i += 10) {
        chunks.push(postIds.slice(i, i + 10));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const commentsRef = collection(db, "post_comments");
          const q = query(commentsRef, where("post_id", "in", chunk));
          const snapshot = await getDocs(q);

          const counts = new Map<string, number>();
          snapshot.forEach((docSnap) => {
            const pid = docSnap.data().post_id as string;
            counts.set(pid, (counts.get(pid) || 0) + 1);
          });

          for (const pid of chunk) {
            results.set(pid, counts.get(pid) || 0);
          }
        }),
      );
    } catch (error) {
      console.error("❌ batchGetPostCommentsCounts error:", error);
    }

    return results;
  }

  subscribeToPostLikes(
    postId: string,
    callback: (
      likes: Array<{
        userId: string;
        name: string;
        username: string;
        avatar: string;
        tapCount: number;
      }>,
    ) => void,
  ): Unsubscribe {
    const likesRef = collection(db, "post_likes");
    const q = query(likesRef, where("post_id", "==", postId));

    return onSnapshot(
      q,
      async (querySnapshot) => {
        const rawLikes = querySnapshot.docs.map(
          (docSnap) => docSnap.data() as PostLike,
        );
        const authorIds = [...new Set(rawLikes.map((like) => like.user_id))];
        const authorsMap = await this.batchGetAuthors(authorIds);

        const likes = rawLikes.map((like) => {
          const author = authorsMap.get(like.user_id);
          const fallbackUsername = `user_${like.user_id.slice(0, 8)}`;

          return {
            userId: like.user_id,
            name: author?.display_name || author?.username || fallbackUsername,
            username: author?.username || fallbackUsername,
            avatar: author?.avatar_url || "",
            tapCount: like.tap_count || 1,
          };
        });

        callback(likes);
      },
      (error) => {
        console.error("Real-time likes subscription error:", error);
      },
    );
  }
}

export const feedService = new FeedService();
