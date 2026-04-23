import { useAvatarStore } from "../stores/avatarStore";
import { useAuthStore } from "../stores/useAuthStore-v2";

/**
 * SURESHOT AVATAR SYNC UTILITY
 * Ensures avatars are properly synced between Firebase and local storage
 */

export class AvatarSyncManager {
  /**
   * Sync current user's avatar from Firebase to local storage
   */
  static syncCurrentUserAvatar() {
    const { user } = useAuthStore.getState();
    const { setGlobalAvatar, setUserAvatar } = useAvatarStore.getState();
    
    if (user?.id && user?.avatar) {
      console.log("🔄 SYNCING USER AVATAR FROM FIREBASE:", user.id);
      setGlobalAvatar(user.avatar);
      setUserAvatar(user.id, user.avatar);
      return true;
    }
    
    return false;
  }
  
  /**
   * Force refresh all avatars from Firebase
   */
  static async refreshAllAvatars() {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    
    console.log("🔄 FORCE REFRESHING ALL AVATARS");
    
    // Sync current user
    this.syncCurrentUserAvatar();
    
    // Clear posts cache to force refresh
    try {
      const { usePostsStore } = await import("../stores/usePostsStore");
      const postsStore = usePostsStore.getState();
      if ('clearCachedData' in postsStore) {
        (postsStore as any).clearCachedData();
      }
    } catch (error) {
      console.log("🔄 Could not clear posts cache");
    }
  }
  
  /**
   * Initialize avatar sync on app start
   */
  static initializeAvatarSync() {
    console.log("🚀 INITIALIZING AVATAR SYNC MANAGER");
    
    // Sync current user avatar immediately
    this.syncCurrentUserAvatar();
    
    // Set up periodic sync (every 30 seconds)
    const syncInterval = setInterval(() => {
      this.syncCurrentUserAvatar();
    }, 30000);
    
    // Clear interval on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(syncInterval);
    });
    
    return syncInterval;
  }
  
  /**
   * Get avatar for any user with fallback to stored avatar
   */
  static getUserAvatar(userId: string, firebaseAvatar?: string): string {
    const { getStoredAvatar } = useAvatarStore.getState();
    
    // Priority: Firebase avatar > stored avatar
    if (firebaseAvatar) {
      return firebaseAvatar;
    }
    
    const storedAvatar = getStoredAvatar(userId);
    if (storedAvatar) {
      console.log("🔄 USING STORED AVATAR FOR USER:", userId);
      return storedAvatar;
    }
    
    return "";
  }
}

// Auto-initialize on import
let syncInterval: NodeJS.Timeout | null = null;

export const startAvatarSync = () => {
  if (!syncInterval) {
    syncInterval = AvatarSyncManager.initializeAvatarSync();
  }
  return syncInterval;
};

export const stopAvatarSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};
