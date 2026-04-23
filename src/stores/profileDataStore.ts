import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserProfileData {
  displayName: string;
  username: string;
  avatarUrl?: string;
}

interface ProfileDataStore {
  // Current user's profile data
  currentDisplayName: string;
  currentUsername: string;
  currentUserId: string;

  // Cache of all users' profile data (userId -> { displayName, username })
  userProfiles: Record<string, UserProfileData>;

  // Actions
  setCurrentUserProfile: (
    userId: string,
    displayName: string,
    username: string,
    avatarUrl?: string,
  ) => void;
  setUserProfile: (
    userId: string,
    displayName: string,
    username: string,
    avatarUrl?: string,
  ) => void;
  getUserProfile: (userId: string) => UserProfileData | null;
  clearProfileDataStore: () => void;
}

export const useProfileDataStore = create<ProfileDataStore>()(
  persist(
    (set, get) => ({
      currentDisplayName: "",
      currentUsername: "",
      currentUserId: "",
      userProfiles: {},

      setCurrentUserProfile: (
        userId: string,
        displayName: string,
        username: string,
        avatarUrl?: string,
      ) => {
        set({
          currentUserId: userId,
          currentDisplayName: displayName,
          currentUsername: username,
          userProfiles: {
            ...get().userProfiles,
            [userId]: { displayName, username, avatarUrl },
          },
        });
      },

      setUserProfile: (
        userId: string,
        displayName: string,
        username: string,
        avatarUrl?: string,
      ) => {
        set((state) => ({
          userProfiles: {
            ...state.userProfiles,
            [userId]: { displayName, username, avatarUrl },
          },
          // Also update current user fields if this is the current user
          ...(state.currentUserId === userId
            ? { currentDisplayName: displayName, currentUsername: username }
            : {}),
        }));
      },

      getUserProfile: (userId: string) => {
        const { userProfiles } = get();
        return userProfiles[userId] || null;
      },

      clearProfileDataStore: () => {
        set({
          currentDisplayName: "",
          currentUsername: "",
          currentUserId: "",
          userProfiles: {},
        });
      },
    }),
    {
      name: "profile-data-store",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

/**
 * Get the most up-to-date display name for a user.
 * Priority:
 * 1. If current user → use currentDisplayName from store
 * 2. If cached in userProfiles → use cached value
 * 3. Fallback to provided value
 */
export const getResolvedDisplayName = (
  providedName?: string,
  userId?: string,
  username?: string,
): string => {
  const { currentUserId, currentDisplayName, currentUsername, userProfiles } =
    useProfileDataStore.getState();

  // Check if this is the current user
  const isCurrentUser =
    (userId && currentUserId && userId === currentUserId) ||
    (username && currentUsername && username === currentUsername);

  if (isCurrentUser && currentDisplayName) {
    return currentDisplayName;
  }

  // Check cached profile
  if (userId && userProfiles[userId]) {
    return userProfiles[userId].displayName;
  }

  return providedName || "";
};

/**
 * Get the most up-to-date username for a user.
 * Priority:
 * 1. If current user → use currentUsername from store
 * 2. If cached in userProfiles → use cached value
 * 3. Fallback to provided value
 */
export const getResolvedUsername = (
  providedUsername?: string,
  userId?: string,
): string => {
  const { currentUserId, currentUsername, userProfiles } =
    useProfileDataStore.getState();

  // Check if this is the current user
  if (userId && currentUserId && userId === currentUserId && currentUsername) {
    return currentUsername;
  }

  // Check cached profile
  if (userId && userProfiles[userId]) {
    return userProfiles[userId].username;
  }

  return providedUsername || "";
};
