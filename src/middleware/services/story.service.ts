import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  documentId,
  Timestamp,
} from "firebase/firestore";
import {
  IStoryRepository,
  Story,
  CreateStoryRequest,
  StoryWithViewerInfo,
  StoryMediaType,
} from "../../backend/domain/interfaces/IStoryRepository";
import { StoryRepository } from "../../backend/repositories/StoryRepository";
import { userService, UserProfile } from "./user.service";
import { storyReactionService } from "./story-reaction.service";
import { getDefaultAvatarUrl } from "@/utils/placeholderImages";

export interface StoryDTO {
  id: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  media: {
    type: StoryMediaType;
    url: string;
  };
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  hasViewed: boolean;
}

export interface CreateStoryDTO {
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption?: string;
}

export interface StoryAudienceEntry {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
}

export interface StoryAudienceDTO {
  viewers: StoryAudienceEntry[];
  likes: StoryAudienceEntry[];
  hates: StoryAudienceEntry[];
}

class StoryService {
  private storyRepository: StoryRepository;
  private audienceCache = new Map<
    string,
    { data: StoryAudienceDTO; expiresAt: number }
  >();
  private readonly audienceCacheTtlMs = 60 * 1000;

  constructor() {
    this.storyRepository = new StoryRepository();
  }

  async createStory(
    userId: string,
    request: CreateStoryDTO,
  ): Promise<StoryDTO | null> {
    try {
      const storyRequest: CreateStoryRequest = {
        userId,
        mediaUrl: request.mediaUrl,
        mediaType: request.mediaType,
        caption: request.caption,
      };

      const story = await this.storyRepository.createStory(storyRequest);

      const userProfile = await userService.getProfile(userId);
      if (!userProfile) {
        throw new Error("User profile not found");
      }

      return this.convertToStoryDTO(story, userProfile);
    } catch (error) {
      console.error("Error creating story:", error);
      return null;
    }
  }

  async getFriendsStories(userId: string): Promise<StoryDTO[]> {
    try {
      const storiesWithViewerInfo =
        await this.storyRepository.getFriendsStories(userId);

      const authorIds = [
        ...new Set(storiesWithViewerInfo.map((s) => s.userId)),
      ];
      const authorProfiles = await this.getAuthorProfiles(authorIds);

      return storiesWithViewerInfo.map((story) => {
        let authorProfile = authorProfiles.find(
          (p) => p.user_id === story.userId,
        );

        console.log(
          `🔍 Processing story ${story.id} - Looking for profile with userId: ${story.userId}`,
        );
        console.log(
          `🔍 Available profiles:`,
          authorProfiles.map((p) => ({
            user_id: p.user_id,
            id: p.id,
            username: p.username,
            display_name: p.display_name,
          })),
        );
        console.log(`🔍 Found author profile by user_id:`, authorProfile);

        // Fallback: try matching by id field if user_id doesn't match
        if (!authorProfile) {
          authorProfile = authorProfiles.find((p) => p.id === story.userId);
          console.log(`🔍 Found author profile by id:`, authorProfile);
        }

        // Final fallback: try partial matching
        if (!authorProfile) {
          authorProfile = authorProfiles.find(
            (p) =>
              (p.user_id && p.user_id.includes(story.userId)) ||
              story.userId.includes(p.user_id || ""),
          );
          console.log(
            `🔍 Found author profile by partial match:`,
            authorProfile,
          );
        }

        if (!authorProfile) {
          console.warn(
            `⚠️ No profile found for story author ${story.userId}, using fallback`,
          );
          return {
            id: story.id,
            author: {
              id: story.userId,
              username: `@user_${story.userId.slice(-6)}`,
              displayName: "Unknown User",
              avatar: getDefaultAvatarUrl(story.userId),
            },
            media: {
              type: story.mediaType,
              url: story.mediaUrl,
            },
            caption: story.caption,
            createdAt: story.createdAt,
            expiresAt: story.expiresAt,
            viewCount: story.viewCount,
            hasViewed: story.hasViewed,
          };
        }

        console.log(
          `✅ Using real profile for ${story.userId}:`,
          authorProfile.display_name || authorProfile.username,
        );
        return this.convertToStoryDTO(story, authorProfile);
      });
    } catch (error) {
      console.error("Error fetching friends stories:", error);
      return [];
    }
  }

  async getUserStories(userId: string): Promise<StoryDTO[]> {
    try {
      const stories = await this.storyRepository.getStoriesByUserId(userId);
      const userProfile = await userService.getProfile(userId);

      if (!userProfile) {
        return [];
      }

      return stories.map((story) => this.convertToStoryDTO(story, userProfile));
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return [];
    }
  }

  async markStoryAsViewed(storyId: string, viewerId: string): Promise<void> {
    try {
      await this.storyRepository.markStoryAsViewed(storyId, viewerId);
    } catch (error) {
      console.error("Error marking story as viewed:", error);
      throw error;
    }
  }

  async deleteStory(storyId: string): Promise<void> {
    try {
      await this.storyRepository.deleteStory(storyId);
      this.audienceCache.delete(storyId);
    } catch (error) {
      console.error("Error deleting story:", error);
      throw error;
    }
  }

  async cleanupExpiredStories(userId: string): Promise<void> {
    try {
      await this.storyRepository.deleteExpiredStories(userId);
    } catch (error) {
      console.error("Error cleaning up expired stories:", error);
    }
  }

  async getStoryAudience(storyId: string): Promise<StoryAudienceDTO> {
    const cached = this.audienceCache.get(storyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const [story, reactions] = await Promise.all([
        this.storyRepository.getStoryById(storyId),
        storyReactionService.getStoryReactions(storyId),
      ]);

      if (!story) {
        return { viewers: [], likes: [], hates: [] };
      }

      const likeUserIds = reactions
        .filter((reaction) => reaction.type === "like")
        .map((reaction) => reaction.userId);
      const hateUserIds = reactions
        .filter((reaction) => reaction.type === "hate")
        .map((reaction) => reaction.userId);
      const allUserIds = [
        ...new Set([...story.viewers, ...likeUserIds, ...hateUserIds]),
      ];

      const profilesById = await this.getProfilesByIdsBatch(allUserIds);

      const toEntry = (userId: string): StoryAudienceEntry | null => {
        const profile = profilesById.get(userId);
        if (!profile) return null;

        return {
          userId,
          username: profile.username.startsWith("@")
            ? profile.username
            : `@${profile.username}`,
          displayName: profile.display_name || profile.username,
          avatar: profile.avatar_url || getDefaultAvatarUrl(userId),
        };
      };

      const audience: StoryAudienceDTO = {
        viewers: story.viewers
          .map((userId) => toEntry(userId))
          .filter((entry): entry is StoryAudienceEntry => Boolean(entry)),
        likes: [...new Set(likeUserIds)]
          .map((userId) => toEntry(userId))
          .filter((entry): entry is StoryAudienceEntry => Boolean(entry)),
        hates: [...new Set(hateUserIds)]
          .map((userId) => toEntry(userId))
          .filter((entry): entry is StoryAudienceEntry => Boolean(entry)),
      };

      this.audienceCache.set(storyId, {
        data: audience,
        expiresAt: Date.now() + this.audienceCacheTtlMs,
      });

      return audience;
    } catch (error) {
      console.error("Error fetching story audience:", error);
      return { viewers: [], likes: [], hates: [] };
    }
  }

  /**
   * Converts a file to base64 data URL (same approach as profile avatars and feed posts)
   * This avoids Firebase Storage CORS issues entirely
   */
  async uploadStoryMedia(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log(
          "🖼️ Converting story media to base64 (same as profile avatars & feed posts)",
        );
        onProgress?.(10);

        const reader = new FileReader();

        reader.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            onProgress?.(Math.round(percent));
          }
        };

        reader.onload = () => {
          try {
            const base64Data = reader.result as string;
            console.log("✅ Story media converted to base64 successfully");
            onProgress?.(100);
            resolve(base64Data);
          } catch (error) {
            console.error("Error processing base64 data:", error);
            reject(new Error("Failed to process image data"));
          }
        };

        reader.onerror = () => {
          console.error("Error reading file:");
          reject(new Error("Failed to read file"));
        };

        // Read file as base64 data URL (same as CreateFeedPostScreen)
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error initiating file read:", error);
        reject(new Error("Failed to initiate file upload"));
      }
    });
  }

  private async getAuthorProfiles(authorIds: string[]): Promise<UserProfile[]> {
    const profiles: UserProfile[] = [];

    console.log("🔍 getAuthorProfiles - Fetching profiles for IDs:", authorIds);

    for (const authorId of authorIds) {
      console.log(
        `🔍 getAuthorProfiles - Fetching profile for author: ${authorId}`,
      );
      const profile = await userService.getProfile(authorId);
      console.log(
        `🔍 getAuthorProfiles - Profile result for ${authorId}:`,
        profile,
      );
      if (profile) {
        profiles.push(profile);
      } else {
        console.warn(
          `⚠️ getAuthorProfiles - No profile found for author: ${authorId}`,
        );
      }
    }

    console.log("🔍 getAuthorProfiles - Final profiles array:", profiles);
    return profiles;
  }

  private async getProfilesByIdsBatch(
    userIds: string[],
  ): Promise<Map<string, UserProfile | null>> {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    const profiles = new Map<string, UserProfile | null>();

    if (uniqueUserIds.length === 0) {
      return profiles;
    }

    const chunks: string[][] = [];
    for (let index = 0; index < uniqueUserIds.length; index += 10) {
      chunks.push(uniqueUserIds.slice(index, index + 10));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const usersRef = collection(db, "users");
        const usersQuery = query(usersRef, where(documentId(), "in", chunk));
        const snapshot = await getDocs(usersQuery);

        snapshot.forEach((userDoc) => {
          profiles.set(userDoc.id, {
            id: userDoc.id,
            ...userDoc.data(),
          } as UserProfile);
        });

        chunk.forEach((userId) => {
          if (!profiles.has(userId)) {
            profiles.set(userId, null);
          }
        });
      }),
    );

    return profiles;
  }

  private convertToStoryDTO(
    story: Story | StoryWithViewerInfo,
    userProfile: UserProfile,
  ): StoryDTO {
    const baseStory = story as Story;
    const storyWithViewer = story as StoryWithViewerInfo;

    return {
      id: baseStory.id,
      author: {
        id: userProfile.user_id,
        username: userProfile.username.startsWith("@")
          ? userProfile.username
          : `@${userProfile.username}`,
        displayName: userProfile.display_name || userProfile.username,
        avatar:
          userProfile.avatar_url || getDefaultAvatarUrl(userProfile.user_id),
      },
      media: {
        type: baseStory.mediaType,
        url: baseStory.mediaUrl,
      },
      caption: baseStory.caption,
      createdAt: baseStory.createdAt,
      expiresAt: baseStory.expiresAt,
      viewCount: baseStory.viewCount,
      hasViewed: storyWithViewer.hasViewed || false,
    };
  }

  isStoryExpired(story: StoryDTO): boolean {
    return new Date(story.expiresAt) <= new Date();
  }

  getTimeRemaining(story: StoryDTO): string {
    const now = new Date();
    const expiresAt = new Date(story.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return "Expired";
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

export const storyService = new StoryService();
