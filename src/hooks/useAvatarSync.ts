import { useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore-v2';
import { useAvatarStore } from '../stores/avatarStore';
import { AvatarSyncManager } from '../utils/avatarSync';

/**
 * SURESHOT AVATAR SYNC HOOK
 * Ensures avatar persistence and synchronization across all scenarios:
 * - Login/logout persistence
 * - Search results
 * - Friend views
 * - Story displays
 * - Feed posts
 */
export const useAvatarSync = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { 
    setGlobalAvatar, 
    setCurrentUserId, 
    setCurrentUsername, 
    setUserAvatar,
    getStoredAvatar 
  } = useAvatarStore();

  // Sync current user info when auth state changes
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log("🔄 AVATAR SYNC: User authenticated, syncing data");
      
      // Set current user info
      setCurrentUserId(user.id);
      if (user.username) {
        setCurrentUsername(user.username);
      }

      // Priority: Firebase avatar > stored avatar
      if (user.avatar) {
        setGlobalAvatar(user.avatar);
        setUserAvatar(user.id, user.avatar);
        console.log("🔄 AVATAR SYNC: Set from Firebase");
      } else {
        const storedAvatar = getStoredAvatar(user.id);
        if (storedAvatar) {
          setGlobalAvatar(storedAvatar);
          console.log("🔄 AVATAR SYNC: Restored from storage");
        }
      }
    }
  }, [isAuthenticated, user, setGlobalAvatar, setCurrentUserId, setCurrentUsername, setUserAvatar, getStoredAvatar]);

  // Ensure avatar persistence on user changes
  useEffect(() => {
    if (user?.id && user?.avatar) {
      // Always store the latest avatar from Firebase
      setUserAvatar(user.id, user.avatar);
      console.log("💾 AVATAR SYNC: Stored latest avatar for user:", user.id);
    }
  }, [user?.id, user?.avatar, setUserAvatar]);

  // Get avatar for any user with proper fallback logic
  const getUserAvatar = (userId: string, firebaseAvatar?: string, username?: string) => {
    // Priority: Firebase avatar > stored avatar > global avatar (if current user)
    if (firebaseAvatar) {
      return firebaseAvatar;
    }

    if (userId === user?.id && user?.avatar) {
      return user.avatar;
    }

    const storedAvatar = getStoredAvatar(userId);
    if (storedAvatar) {
      console.log("🔄 AVATAR SYNC: Using stored avatar for user:", userId);
      return storedAvatar;
    }

    return "";
  };

  // Force refresh avatar from Firebase
  const refreshAvatar = async () => {
    if (user?.id) {
      await AvatarSyncManager.refreshAllAvatars();
    }
  };

  return {
    getUserAvatar,
    refreshAvatar,
    isSynced: isAuthenticated && !!user
  };
};
