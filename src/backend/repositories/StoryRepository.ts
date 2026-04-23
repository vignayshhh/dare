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
import {
  IStoryRepository,
  Story,
  CreateStoryRequest,
  StoryWithViewerInfo,
  StoryMediaType,
} from "../domain/interfaces/IStoryRepository";
import { IFriendshipRepository } from "../domain/interfaces/IFriendshipRepository";
import { FriendshipRepository } from "./FriendshipRepository";

export class StoryRepository implements IStoryRepository {
  private friendshipRepository: IFriendshipRepository;

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
        caption: request.caption || null,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        viewCount: 0,
        viewers: [],
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
        caption: data.caption,
        createdAt:
          data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
        expiresAt:
          data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
        viewCount: data.viewCount || 0,
        viewers: data.viewers || [],
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
          caption: data.caption,
          createdAt:
            data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          expiresAt:
            data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
          viewCount: data.viewCount || 0,
          viewers: data.viewers || [],
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
          caption: data.caption,
          createdAt:
            data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          expiresAt:
            data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
          viewCount: data.viewCount || 0,
          viewers: data.viewers || [],
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
          caption: data.caption,
          createdAt:
            data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          expiresAt:
            data.expiresAt?.toDate()?.toISOString() || new Date().toISOString(),
          viewCount: data.viewCount || 0,
          viewers: data.viewers || [],
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
      const storyRef = doc(db, "stories", storyId);
      const storyDoc = await getDoc(storyRef);

      if (!storyDoc.exists()) {
        throw new Error("Story not found");
      }

      const data = storyDoc.data();
      const viewers = data.viewers || [];

      // Only add viewer if they haven't viewed it yet
      if (!viewers.includes(viewerId)) {
        await updateDoc(storyRef, {
          viewers: arrayUnion(viewerId),
          viewCount: (data.viewCount || 0) + 1,
        });
      }
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

  async deleteExpiredStories(): Promise<void> {
    try {
      const now = new Date();
      const q = query(
        collection(db, "stories"),
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
