import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "@/backend/lib/firebase";
import {
  IStoryRepository,
  Story,
  CreateStoryRequest,
  StoryWithViewerInfo,
} from "../domain/interfaces/IStoryRepository";
import { IFriendshipRepository } from "../domain/interfaces/IFriendshipRepository";
import { FriendshipRepository } from "./FriendshipRepository";

const normalizeViewerViewCounts = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const counts: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>).forEach(([userId, count]) => {
    if (typeof count !== "number" || !Number.isFinite(count)) return;

    const normalizedCount = Math.max(0, Math.floor(count));
    if (normalizedCount > 0) {
      counts[userId] = normalizedCount;
    }
  });

  return counts;
};

export class StoryRepository implements IStoryRepository {
  private friendshipRepository: IFriendshipRepository;

  private async fetchFriendsStoriesFromApi(): Promise<StoryWithViewerInfo[]> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User must be authenticated to fetch friends stories");
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch("/api/stories/friends", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error ||
          payload?.message ||
          "Failed to fetch friends stories from server",
      );
    }

    if (Array.isArray(payload?.data)) {
      return payload.data as StoryWithViewerInfo[];
    }

    if (Array.isArray(payload)) {
      return payload as StoryWithViewerInfo[];
    }

    return [];
  }

  private async postStoryViewToApi(storyId: string): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("User must be authenticated to mark story as viewed");
    }

    const idToken = await currentUser.getIdToken();
    const response = await fetch(`/api/stories/${storyId}/view`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error ||
          payload?.message ||
          "Failed to mark story as viewed on server",
      );
    }
  }

  constructor() {
    this.friendshipRepository = new FriendshipRepository();
  }

  async createStory(request: CreateStoryRequest): Promise<Story> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      const storyData = {
        userId: request.userId,
        mediaUrl: request.mediaUrl,
        mediaType: request.mediaType,
        storyType: request.storyType || "personal",
        dedicatedToUserId: request.dedicatedToUserId || null,
        storyText: request.storyText || null,
        storyFilter: request.storyFilter || "original",
        storyMusic: request.storyMusic || null,
        caption: request.caption || null,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        viewCount: 0,
        viewers: [],
        viewerViewCounts: {},
      };

      const docRef = await addDoc(collection(db, "stories"), storyData);
      const newStory = await this.getStoryById(docRef.id);

      if (!newStory) {
        throw new Error("Failed to create story");
      }

      return newStory;
    } catch (error) {
      console.error("Error creating story:", error);
      throw error;
    }
  }

  async getStoryById(storyId: string): Promise<Story | null> {
    try {
      const storyDoc = await getDoc(doc(db, "stories", storyId));

      if (!storyDoc.exists()) {
        return null;
      }

      const data = storyDoc.data();
      return {
        id: storyDoc.id,
        userId: data.userId,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        storyType: data.storyType || "personal",
        dedicatedToUserId: data.dedicatedToUserId || null,
        storyText: data.storyText || null,
        storyFilter: data.storyFilter || "original",
        storyMusic: data.storyMusic || null,
        caption: data.caption,
        createdAt:
          data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
        expiresAt:
          data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
        viewCount: data.viewCount || 0,
        viewers: data.viewers || [],
        viewerViewCounts: normalizeViewerViewCounts(data.viewerViewCounts),
      } as Story;
    } catch (error) {
      console.error("Error fetching story:", error);
      return null;
    }
  }

  async getStoriesByUserId(userId: string): Promise<Story[]> {
    try {
      const q = query(
        collection(db, "stories"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const stories: Story[] = [];

      for (const storyDoc of querySnapshot.docs) {
        const data = storyDoc.data();
        const story = {
          id: storyDoc.id,
          userId: data.userId,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          storyType: data.storyType || "personal",
          dedicatedToUserId: data.dedicatedToUserId || null,
          storyText: data.storyText || null,
          storyFilter: data.storyFilter || "original",
          storyMusic: data.storyMusic || null,
          caption: data.caption,
          createdAt:
            data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          expiresAt:
            data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
          viewCount: data.viewCount || 0,
          viewers: data.viewers || [],
          viewerViewCounts: normalizeViewerViewCounts(data.viewerViewCounts),
        } as Story;

        // Only include non-expired stories
        if (new Date(story.expiresAt) > new Date()) {
          stories.push(story);
        }
      }

      return stories;
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return [];
    }
  }

  async getActiveStoriesForUser(userId: string): Promise<Story[]> {
    try {
      const now = new Date();
      const q = query(
        collection(db, "stories"),
        where("expiresAt", ">", Timestamp.fromDate(now)),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const stories: Story[] = [];

      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        stories.push({
          id: doc.id,
          userId: data.userId,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          storyType: data.storyType || "personal",
          dedicatedToUserId: data.dedicatedToUserId || null,
          storyText: data.storyText || null,
          storyFilter: data.storyFilter || "original",
          storyMusic: data.storyMusic || null,
          caption: data.caption,
          createdAt:
            data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          expiresAt:
            data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
          viewCount: data.viewCount || 0,
          viewers: data.viewers || [],
          viewerViewCounts: normalizeViewerViewCounts(data.viewerViewCounts),
        } as Story);
      }

      return stories;
    } catch (error) {
      console.error("Error fetching active stories:", error);
      return [];
    }
  }

  async getFriendsStories(userId: string): Promise<StoryWithViewerInfo[]> {
    try {
      return await this.fetchFriendsStoriesFromApi();
    } catch (serverError) {
      console.warn(
        "Falling back to direct Firestore friends stories fetch:",
        serverError,
      );
    }

    try {
      // Get user's friends
      const friendships =
        await this.friendshipRepository.getAcceptedFriends(userId);
      const friendIds = friendships.map((f) =>
        f.requesterId === userId ? f.addresseeId : f.requesterId,
      );

      if (friendIds.length === 0) {
        return [];
      }

      // Get stories from friends that haven't expired
      const now = new Date();
      const q = query(
        collection(db, "stories"),
        where("userId", "in", friendIds),
        where("expiresAt", ">", Timestamp.fromDate(now)),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const storiesWithViewerInfo: StoryWithViewerInfo[] = [];

      for (const storyDoc of querySnapshot.docs) {
        const data = storyDoc.data();
        const story = {
          id: storyDoc.id,
          userId: data.userId,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          storyType: data.storyType || "personal",
          dedicatedToUserId: data.dedicatedToUserId || null,
          storyText: data.storyText || null,
          storyFilter: data.storyFilter || "original",
          storyMusic: data.storyMusic || null,
          caption: data.caption,
          createdAt:
            data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          expiresAt:
            data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
          viewCount: data.viewCount || 0,
          viewers: data.viewers || [],
          viewerViewCounts: normalizeViewerViewCounts(data.viewerViewCounts),
        } as Story;

        // Get author info - fetch actual user data
        const userDoc = await getDoc(doc(db, "users", story.userId));
        const userData = userDoc.exists() ? (userDoc.data() as any) : null;

        // Try to get avatar from multiple sources
        let avatar = userData?.avatar_url || "";

        // If no avatar in Firebase, check if we have one in the avatar store
        if (!avatar) {
          try {
            // Dynamically import the store to avoid SSR issues
            const { useAvatarStore } = await import("../../stores/avatarStore");
            avatar = useAvatarStore.getState().getStoredAvatar(story.userId);
            if (avatar) {
              console.log(
                "🔥 STORY: Using stored avatar for user:",
                story.userId,
              );
            }
          } catch (error) {
            console.log("🔥 STORY: Could not access avatar store");
          }
        }

        const author = {
          id: story.userId,
          username: userData?.username || `@user_${story.userId.slice(0, 8)}`,
          displayName:
            userData?.display_name || `User ${story.userId.slice(0, 8)}`,
          avatar: avatar, // Use actual avatar from Firebase or stored
        };

        const hasViewed = story.viewers.includes(userId);

        storiesWithViewerInfo.push({
          ...story,
          author,
          hasViewed,
        });
      }

      return storiesWithViewerInfo;
    } catch (error) {
      console.error("Error fetching friends stories:", error);
      return [];
    }
  }

  async markStoryAsViewed(storyId: string, viewerId: string): Promise<void> {
    try {
      await this.postStoryViewToApi(storyId);
      return;
    } catch (serverError) {
      console.warn(
        "Falling back to direct Firestore story view update:",
        serverError,
      );
    }

    try {
      const storyRef = doc(db, "stories", storyId);
      const storyDoc = await getDoc(storyRef);

      if (!storyDoc.exists()) {
        throw new Error("Story not found");
      }

      const data = storyDoc.data();
      const viewers = data.viewers || [];
      const viewerViewCounts = normalizeViewerViewCounts(data.viewerViewCounts);
      const currentViewerCount =
        viewerViewCounts[viewerId] ?? (viewers.includes(viewerId) ? 1 : 0);
      const nextViewerViewCounts = {
        ...viewerViewCounts,
        [viewerId]: currentViewerCount + 1,
      };

      if (!viewers.includes(viewerId)) {
        await updateDoc(storyRef, {
          viewers: arrayUnion(viewerId),
          viewCount: (data.viewCount || 0) + 1,
          viewerViewCounts: nextViewerViewCounts,
        });
        return;
      }

      await updateDoc(storyRef, {
        viewerViewCounts: nextViewerViewCounts,
      });
    } catch (error) {
      console.error("Error marking story as viewed:", error);
      throw error;
    }
  }

  async deleteStory(storyId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, "stories", storyId));
    } catch (error) {
      console.error("Error deleting story:", error);
      throw error;
    }
  }

  async deleteExpiredStories(userId: string): Promise<void> {
    try {
      const now = new Date();
      const q = query(
        collection(db, "stories"),
        where("userId", "==", userId),
        where("expiresAt", "<=", Timestamp.fromDate(now)),
      );

      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        await deleteDoc(doc.ref);
      }
    } catch (error) {
      console.error("Error deleting expired stories:", error);
      throw error;
    }
  }

  async isUserViewerOfStory(
    storyId: string,
    viewerId: string,
  ): Promise<boolean> {
    try {
      const story = await this.getStoryById(storyId);
      return story ? story.viewers.includes(viewerId) : false;
    } catch (error) {
      console.error("Error checking if user viewed story:", error);
      return false;
    }
  }
}
