import { create } from "zustand";
import {
  storyService,
  StoryDTO,
  CreateStoryDTO,
} from "@/middleware/services/story.service";

interface StoryState {
  // Data
  stories: StoryDTO[];
  userStories: StoryDTO[];
  isLoading: boolean;
  error: string | null;

  // Upload state
  isUploading: boolean;
  uploadProgress: number;

  // Actions
  loadFriendsStories: (userId: string) => Promise<void>;
  loadUserStories: (userId: string) => Promise<void>;
  createStory: (
    userId: string,
    request: CreateStoryDTO,
  ) => Promise<StoryDTO | null>;
  markStoryAsViewed: (storyId: string, viewerId: string) => Promise<void>;
  deleteStory: (storyId: string, userId: string) => Promise<void>;
  cleanupExpiredStories: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
  clearAllStories: () => void;
}

export const useStoryStore = create<StoryState>((set, get) => ({
  // Initial state
  stories: [],
  userStories: [],
  isLoading: false,
  error: null,
  isUploading: false,
  uploadProgress: 0,

  // Load friends' stories (no blob migration)
  loadFriendsStories: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const stories = await storyService.getFriendsStories(userId);
      set({ stories, isLoading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load stories";
      set({ error: errorMessage, isLoading: false });
    }
  },

  // Load user stories
  loadUserStories: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const stories = await storyService.getUserStories(userId);
      set({ userStories: stories, isLoading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load user stories";
      set({ error: errorMessage, isLoading: false });
    }
  },

  // Create story — real Firebase Storage upload with live progress
  createStory: async (userId: string, request: CreateStoryDTO) => {
    set({ isUploading: true, uploadProgress: 0, error: null });
    try {
      const story = await storyService.createStory(userId, request);

      set({ uploadProgress: 100, isUploading: false });

      setTimeout(() => set({ uploadProgress: 0 }), 1000);

      // Refresh both story lists
      await get().loadFriendsStories(userId);
      await get().loadUserStories(userId);

      return story;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create story";
      set({ error: errorMessage, isUploading: false, uploadProgress: 0 });
      return null;
    }
  },

  // Mark story as viewed
  markStoryAsViewed: async (storyId: string, viewerId: string) => {
    try {
      await storyService.markStoryAsViewed(storyId, viewerId);
      set((state) => ({
        stories: state.stories.map((story) =>
          story.id === storyId
            ? { ...story, hasViewed: true, viewCount: story.viewCount + 1 }
            : story,
        ),
        userStories: state.userStories.map((story) =>
          story.id === storyId
            ? { ...story, hasViewed: true, viewCount: story.viewCount + 1 }
            : story,
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to mark story as viewed";
      set({ error: errorMessage });
    }
  },

  // Delete story — removes from both lists and refreshes
  deleteStory: async (storyId: string, userId: string) => {
    try {
      await storyService.deleteStory(storyId);
      set((state) => ({
        stories: state.stories.filter((s) => s.id !== storyId),
        userStories: state.userStories.filter((s) => s.id !== storyId),
      }));
      // Refresh to stay in sync with server
      await get().loadUserStories(userId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete story";
      set({ error: errorMessage });
    }
  },

  // Cleanup expired stories
  cleanupExpiredStories: async () => {
    try {
      await storyService.cleanupExpiredStories();
      const userId =
        get().userStories[0]?.author.id ?? get().stories[0]?.author.id;
      if (userId) {
        await get().loadFriendsStories(userId);
        await get().loadUserStories(userId);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to cleanup expired stories";
      set({ error: errorMessage });
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      stories: [],
      userStories: [],
      isLoading: false,
      error: null,
      isUploading: false,
      uploadProgress: 0,
    }),

  clearAllStories: () => set({ stories: [], userStories: [] }),
}));

// Selectors
export const useFriendsStories = () => useStoryStore((state) => state.stories);
export const useUserStories = () => useStoryStore((state) => state.userStories);
export const useStoryLoading = () => useStoryStore((state) => state.isLoading);
export const useStoryError = () => useStoryStore((state) => state.error);
export const useStoryUploadState = () =>
  useStoryStore((state) => ({
    isUploading: state.isUploading,
    uploadProgress: state.uploadProgress,
  }));
