export type StoryMediaType = "image" | "video";
export type StoryType = "personal" | "dedication";
export type StoryTextStyle = "clean" | "bold" | "glass";

export interface StoryTextOverlay {
  text: string;
  color?: string;
  style?: StoryTextStyle;
  xPct?: number;
  yPct?: number;
  fontSize?: number;
}

export interface StoryMusic {
  id: string;
  label: string;
}

export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  storyType?: StoryType;
  dedicatedToUserId?: string | null;
  storyText?: StoryTextOverlay | null;
  storyFilter?: string | null;
  storyMusic?: StoryMusic | null;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  viewers: string[]; // Array of user IDs who viewed the story
  viewerViewCounts: Record<string, number>; // Per-viewer story opens
}

export interface CreateStoryRequest {
  userId: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  storyType?: StoryType;
  dedicatedToUserId?: string | null;
  storyText?: StoryTextOverlay | null;
  storyFilter?: string | null;
  storyMusic?: StoryMusic | null;
  caption?: string;
}

export interface StoryViewer {
  userId: string;
  username: string;
  avatar: string;
  viewedAt: string;
}

export interface StoryWithViewerInfo extends Story {
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  dedicatedTo?: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  } | null;
  hasViewed: boolean;
  viewerInfo?: StoryViewer[];
}

export interface IStoryRepository {
  createStory(request: CreateStoryRequest): Promise<Story>;
  getStoryById(storyId: string): Promise<Story | null>;
  getStoriesByUserId(userId: string): Promise<Story[]>;
  getActiveStoriesForUser(userId: string): Promise<Story[]>; // Stories from friends that are still valid
  getFriendsStories(userId: string): Promise<StoryWithViewerInfo[]>; // Stories from friends only
  markStoryAsViewed(storyId: string, viewerId: string): Promise<void>;
  deleteStory(storyId: string): Promise<void>;
  deleteExpiredStories(userId: string): Promise<void>; // Cleanup function
  isUserViewerOfStory(storyId: string, viewerId: string): Promise<boolean>;
}
