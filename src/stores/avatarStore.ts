import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAuthStore } from "./useAuthStore-v2";

interface AvatarStore {
  globalAvatar: string;
  currentUserId: string;
  currentUsername: string;
  // Store avatars for multiple users
  userAvatars: Record<string, string>; // userId -> avatarUrl
  setGlobalAvatar: (avatar: string) => void;
  setCurrentUserId: (userId: string) => void;
  setCurrentUsername: (username: string) => void;
  setUserAvatar: (userId: string, avatar: string) => void;
  clearAvatarStore: () => void;
  // Get stored avatar for any user
  getStoredAvatar: (userId: string) => string;
}

export const useAvatarStore = create<AvatarStore>()(
  persist(
    (set, get) => ({
      globalAvatar: "",
      currentUserId: "",
      currentUsername: "",
      userAvatars: {},
      setGlobalAvatar: (avatar: string) => {
        const { currentUserId } = get();
        set({ globalAvatar: avatar });
        // Also store in userAvatars for persistence
        if (currentUserId) {
          set((state) => ({
            userAvatars: { ...state.userAvatars, [currentUserId]: avatar },
          }));
        }
      },
      setCurrentUserId: (userId: string) => {
        const { userAvatars } = get();
        set({ currentUserId: userId });
        // Restore avatar for this user if it exists
        if (userId && userAvatars[userId]) {
          set({ globalAvatar: userAvatars[userId] });
        }
      },
      setCurrentUsername: (username: string) => {
        set({ currentUsername: username });
      },
      setUserAvatar: (userId: string, avatar: string) => {
        set((state) => ({
          userAvatars: { ...state.userAvatars, [userId]: avatar },
        }));
      },
      clearAvatarStore: () => {
        set({ globalAvatar: "", currentUserId: "", currentUsername: "" });
      },
      getStoredAvatar: (userId: string) => {
        const { userAvatars } = get();
        return userAvatars[userId] || "";
      },
    }),
    {
      name: "avatar-store",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

// AGGRESSIVE: Get avatar with current user check - applies to ALL instances of current user
export const getAggressiveAvatar = (
  userAvatar?: string,
  fallbackAvatar?: string,
  userId?: string,
  username?: string,
): string => {
  const { globalAvatar, currentUserId, currentUsername, userAvatars } =
    useAvatarStore.getState();

  // Check if this avatar belongs to the current user (by ID or username)
  const isCurrentUser =
    (userId && currentUserId && userId === currentUserId) ||
    (username && currentUsername && username === currentUsername);

  // Priority:
  // 1. Global avatar (for current user instances)
  // 2. Stored avatar (for any user, real-time updated)
  // 3. User avatar from snapshot props
  // 4. Fallback
  let finalAvatar = "";

  if (isCurrentUser && globalAvatar) {
    finalAvatar = globalAvatar;
  } else if (userId && userAvatars[userId]) {
    finalAvatar = userAvatars[userId];
  } else if (userAvatar) {
    finalAvatar = userAvatar;
  } else {
    finalAvatar = fallbackAvatar || "";
  }

  return finalAvatar;
};
