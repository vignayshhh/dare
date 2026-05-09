import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  storyService,
  StoryDTO,
  CreateStoryDTO,
} from "@/middleware/services/story.service";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import { FriendshipRepository } from "@/backend/repositories/FriendshipRepository";
import { userService } from "@/middleware/services/user.service";
import { getDefaultAvatarUrl } from "@/utils/placeholderImages";

// ── Helpers ──────────────────────────────────────────────────────────────────

// Race-guard counter for subscribeToFriendsStories
let _friendsSubCounter = 0;

const isDataUrl = (url?: string) =>
  typeof url === "string" && url.startsWith("data:");

const sanitizeStoryForPersist = (story: StoryDTO): StoryDTO => ({
  ...story,
  media: isDataUrl(story.media.url) ? { ...story.media, url: "" } : story.media,
  author: {
    ...story.author,
    avatar: isDataUrl(story.author.avatar) ? "" : story.author.avatar,
  },
});

// Legacy request-ID guards (used by one-shot loaders)
let friendsStoriesRequestId = 0;
let userStoriesRequestId = 0;
let inFlightStoryLoads = 0;

// ── Types ────────────────────────────────────────────────────────────────────

interface StoryState {
  // Data
  stories: StoryDTO[];
  userStories: StoryDTO[];
  isLoading: boolean;
  error: string | null;

  // Upload state
  isUploading: boolean;
  uploadProgress: number;

  // Active subscription handles (never persisted)
  _friendsUnsub: Unsubscribe | null;
  _userUnsub: Unsubscribe | null;

  // Real-time subscription actions
  subscribeToFriendsStories: (userId: string) => Promise<void>;
  subscribeToUserStories: (userId: string) => Promise<void>;
  unsubscribeFromAllStories: () => void;

  // Legacy one-shot loaders (kept for createStory / deleteStory fallbacks)
  loadFriendsStories: (userId: string) => Promise<void>;
  loadUserStories: (userId: string) => Promise<void>;

  createStory: (
    userId: string,
    request: CreateStoryDTO,
  ) => Promise<StoryDTO | null>;
  markStoryAsViewed: (storyId: string, viewerId: string) => Promise<void>;
  deleteStory: (storyId: string, userId: string) => Promise<void>;
  cleanupExpiredStories: (userId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
  clearAllStories: () => void;
}

export const useStoryStore = create<StoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      stories: [],
      userStories: [],
      isLoading: false,
      error: null,
      isUploading: false,
      uploadProgress: 0,
      _friendsUnsub: null,
      _userUnsub: null,

      // ── Real-time subscriptions ─────────────────────────────────────────────

      subscribeToFriendsStories: async (userId: string) => {
        // Cancel any existing subscription
        const prevUnsub = get()._friendsUnsub;
        if (prevUnsub) prevUnsub();
        set({ _friendsUnsub: null });

        if (!userId) {
          set({ stories: [], isLoading: false });
          return;
        }

        // Race guard: if a newer call supersedes this one while awaiting friend IDs, bail out
        const subId = ++_friendsSubCounter;
        set({ isLoading: true });

        try {
          const friendshipRepo = new FriendshipRepository();
          const friendships = await friendshipRepo.getAcceptedFriends(userId);

          if (subId !== _friendsSubCounter) return; // superseded

          const friendIds = friendships
            .map((f) =>
              f.requesterId === userId ? f.addresseeId : f.requesterId,
            )
            .filter(Boolean);

          if (friendIds.length === 0) {
            set({ stories: [], isLoading: false, _friendsUnsub: null });
            return;
          }

          // Profile cache shared across all snapshot callbacks for this subscription
          const profileCache: Record<string, any> = {};

          // Firestore "in" supports max 30 values per query; cap at 30 friends
          const queryIds = friendIds.slice(0, 30);

          const q = query(
            collection(db, "stories"),
            where("userId", "in", queryIds),
            orderBy("createdAt", "desc"),
          );

          const unsub = onSnapshot(
            q,
            async (snapshot) => {
              const now = new Date();

              // Collect author IDs not yet in cache
              const uncachedIds = [
                ...new Set(
                  snapshot.docs
                    .map((d) => d.data().userId as string)
                    .filter((id) => id && !profileCache[id]),
                ),
              ];

              // Fetch missing profiles in parallel
              await Promise.all(
                uncachedIds.map(async (id) => {
                  try {
                    const profile = await userService.getProfile(id);
                    if (profile) profileCache[id] = profile;
                  } catch {
                    // will use fallback avatar
                  }
                }),
              );

              const stories: StoryDTO[] = snapshot.docs
                .filter((docSnap) => {
                  const exp = docSnap.data().expiresAt?.toDate?.();
                  return exp instanceof Date && exp > now;
                })
                .map((docSnap) => {
                  const data = docSnap.data();
                  const profile = profileCache[data.userId];
                  const hasViewed =
                    Array.isArray(data.viewers) &&
                    data.viewers.includes(userId);

                  if (!profile) {
                    return {
                      id: docSnap.id,
                      author: {
                        id: data.userId,
                        username: `@user_${data.userId.slice(-6)}`,
                        displayName: "Unknown User",
                        avatar: getDefaultAvatarUrl(data.userId),
                      },
                      media: { type: data.mediaType, url: data.mediaUrl },
                      caption: data.caption ?? null,
                      createdAt:
                        data.createdAt?.toDate()?.toISOString() ??
                        new Date().toISOString(),
                      expiresAt:
                        data.expiresAt?.toDate()?.toISOString() ??
                        new Date().toISOString(),
                      viewCount: data.viewCount ?? 0,
                      hasViewed,
                    } as StoryDTO;
                  }

                  return {
                    id: docSnap.id,
                    author: {
                      id: profile.user_id,
                      username: profile.username.startsWith("@")
                        ? profile.username
                        : `@${profile.username}`,
                      displayName: profile.display_name || profile.username,
                      avatar:
                        profile.avatar_url ||
                        getDefaultAvatarUrl(profile.user_id),
                    },
                    media: { type: data.mediaType, url: data.mediaUrl },
                    caption: data.caption ?? null,
                    createdAt:
                      data.createdAt?.toDate()?.toISOString() ??
                      new Date().toISOString(),
                    expiresAt:
                      data.expiresAt?.toDate()?.toISOString() ??
                      new Date().toISOString(),
                    viewCount: data.viewCount ?? 0,
                    hasViewed,
                  } as StoryDTO;
                });

              set({ stories, isLoading: false });
            },
            (err) => {
              console.error("Friends stories onSnapshot error:", err);
              set({ isLoading: false });
              // Fall back to one-shot load so circles still appear
              get().loadFriendsStories(userId);
            },
          );

          set({ _friendsUnsub: unsub });
        } catch (error) {
          console.error("Error subscribing to friends stories:", error);
          // Fall back to one-shot load
          await get().loadFriendsStories(userId);
        }
      },

      subscribeToUserStories: async (userId: string) => {
        const prevUnsub = get()._userUnsub;
        if (prevUnsub) prevUnsub();
        set({ _userUnsub: null });

        if (!userId) {
          set({ userStories: [] });
          return;
        }

        // Fetch user profile once for the subscription lifetime
        let userProfile: any = null;
        try {
          userProfile = await userService.getProfile(userId);
        } catch {
          // will use fallback
        }

        const q = query(
          collection(db, "stories"),
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
        );

        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const now = new Date();
            const userStories: StoryDTO[] = snapshot.docs
              .filter((docSnap) => {
                const exp = docSnap.data().expiresAt?.toDate?.();
                return exp instanceof Date && exp > now;
              })
              .map((docSnap) => {
                const data = docSnap.data();
                return {
                  id: docSnap.id,
                  author: {
                    id: userId,
                    username: userProfile
                      ? userProfile.username.startsWith("@")
                        ? userProfile.username
                        : `@${userProfile.username}`
                      : `@user_${userId.slice(-6)}`,
                    displayName:
                      userProfile?.display_name ||
                      userProfile?.username ||
                      "You",
                    avatar:
                      userProfile?.avatar_url || getDefaultAvatarUrl(userId),
                  },
                  media: { type: data.mediaType, url: data.mediaUrl },
                  caption: data.caption ?? null,
                  createdAt:
                    data.createdAt?.toDate()?.toISOString() ??
                    new Date().toISOString(),
                  expiresAt:
                    data.expiresAt?.toDate()?.toISOString() ??
                    new Date().toISOString(),
                  viewCount: data.viewCount ?? 0,
                  hasViewed: false,
                } as StoryDTO;
              });

            set({ userStories });
          },
          (err) => {
            console.error("User stories onSnapshot error:", err);
            get().loadUserStories(userId);
          },
        );

        set({ _userUnsub: unsub });
      },

      unsubscribeFromAllStories: () => {
        const { _friendsUnsub, _userUnsub } = get();
        if (_friendsUnsub) _friendsUnsub();
        if (_userUnsub) _userUnsub();
        set({ _friendsUnsub: null, _userUnsub: null });
      },

      // ── Legacy one-shot loaders ───────────────────────────────────────────────

      // Load friends' stories (no blob migration)
      loadFriendsStories: async (userId: string) => {
        const requestId = ++friendsStoriesRequestId;
        inFlightStoryLoads += 1;
        set({ isLoading: true, error: null });
        try {
          const stories = await storyService.getFriendsStories(userId);
          if (requestId === friendsStoriesRequestId) {
            set({ stories });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to load stories";
          if (requestId === friendsStoriesRequestId) {
            set({ error: errorMessage });
          }
        } finally {
          inFlightStoryLoads = Math.max(0, inFlightStoryLoads - 1);
          set({ isLoading: inFlightStoryLoads > 0 });
        }
      },

      // Load user stories
      loadUserStories: async (userId: string) => {
        const requestId = ++userStoriesRequestId;
        inFlightStoryLoads += 1;
        set({ isLoading: true, error: null });
        try {
          const stories = await storyService.getUserStories(userId);
          if (requestId === userStoriesRequestId) {
            set({ userStories: stories });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to load user stories";
          if (requestId === userStoriesRequestId) {
            set({ error: errorMessage });
          }
        } finally {
          inFlightStoryLoads = Math.max(0, inFlightStoryLoads - 1);
          set({ isLoading: inFlightStoryLoads > 0 });
        }
      },

      // Create story — real Firebase Storage upload with live progress
      createStory: async (userId: string, request: CreateStoryDTO) => {
        set({ isUploading: true, uploadProgress: 0, error: null });
        try {
          const story = await storyService.createStory(userId, request);

          set({ uploadProgress: 100, isUploading: false });

          setTimeout(() => set({ uploadProgress: 0 }), 1000);

          // onSnapshot subscriptions pick up the new doc automatically.
          // Only fall back to manual reload if no subscription is active.
          const { _friendsUnsub, _userUnsub } = get();
          if (!_friendsUnsub) await get().loadFriendsStories(userId);
          if (!_userUnsub) await get().loadUserStories(userId);

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

      // Cleanup expired story docs from Firestore.
      // Active onSnapshot subscriptions pick up deletions automatically;
      // only falls back to a manual reload when no subscription is active.
      cleanupExpiredStories: async (userId: string) => {
        try {
          if (!userId) return;
          await storyService.cleanupExpiredStories(userId);
          const { _friendsUnsub, _userUnsub } = get();
          if (!_friendsUnsub) get().loadFriendsStories(userId);
          if (!_userUnsub) get().loadUserStories(userId);
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

      clearAllStories: () => {
        friendsStoriesRequestId += 1;
        userStoriesRequestId += 1;
        _friendsSubCounter += 1;
        inFlightStoryLoads = 0;
        const { _friendsUnsub, _userUnsub } = get();
        if (_friendsUnsub) _friendsUnsub();
        if (_userUnsub) _userUnsub();
        set({
          stories: [],
          userStories: [],
          isLoading: false,
          _friendsUnsub: null,
          _userUnsub: null,
        });
      },
    }),

    // ── Persist config ─────────────────────────────────────────────────────────
    {
      name: "dare-stories",
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the data arrays; functions / unsubscribers are never serialisable
      partialize: (state) => ({
        stories: state.stories
          .map(sanitizeStoryForPersist)
          .filter((s) => !!s.media.url),
        userStories: state.userStories
          .map(sanitizeStoryForPersist)
          .filter((s) => !!s.media.url),
      }),
    },
  ),
);

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
