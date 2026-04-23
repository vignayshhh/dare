import { create } from "zustand";

// Inline types for presence
export interface Presence {
  user_id: string;
  is_online: boolean;
  last_seen: string;
  current_screen?: string;
  screen_content?: any;
}

export interface PresenceStore {
  // State
  userPresence: Presence | null;
  onlineFriends: Presence[];
  profileViewers: Presence[];
  presenceStats: any;
  onlineUsersNotFriends: Presence[];
  loading: boolean;
  error: string | null;

  // Actions
  initializePresence: (userId: string) => void
  updatePresence: (userId: string, updates: any) => Promise<void>;
  getUserPresence: (userId: string) => Promise<Presence | null>;
  getOnlineFriends: (userId: string) => Promise<void>;
  trackProfileView: (viewerId: string, profileId: string) => Promise<void>;
  stopProfileView: (viewerId: string) => Promise<void>;
  trackTypingInChat: (userId: string, chatPartnerId: string) => Promise<void>;
  stopTypingInChat: (userId: string, chatPartnerId: string) => Promise<void>;
  setGhostMode: (userId: string, enabled: boolean) => Promise<void>;
  goOffline: (userId: string) => Promise<void>;
  getWhoUserIsChattingWith: (userId: string) => Promise<string | null>;
  getProfileViewers: (profileId: string) => Promise<void>;
  isUserBeingIgnored: (userId: string, targetUserId: string) => Promise<boolean>;
  getPresenceStats: (userId: string) => Promise<void>;
  getBulkPresence: (userIds: string[]) => Promise<Presence[]>;
  getOnlineUsersNotFriends: (userId: string, limit?: number) => Promise<void>;
  cleanup: () => void;

  // Realtime
  subscribeToUserPresence: (userId: string, callback: (payload: any) => void) => any;
  subscribeToFriendsPresence: (userId: string, callback: (payload: any) => void) => any;

  // Utility
  clearError: () => void;

  // Computed values
  isOnline: boolean;
  isGhostMode: boolean;
  isTyping: boolean;
  onlineFriendsCount: number;
  profileViewersCount: number;
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  // Initial state
  userPresence: null,
  onlineFriends: [],
  profileViewers: [],
  presenceStats: null,
  onlineUsersNotFriends: [],
  loading: false,
  error: null,

  // Computed values
  get isOnline() {
    return get().userPresence?.is_online || false;
  },

  get isGhostMode() {
    return false; // Ghost mode not implemented in Firebase version
  },

  get isTyping() {
    return false; // Typing tracking not implemented in Firebase version
  },

  get onlineFriendsCount() {
    return get().onlineFriends.length;
  },

  get profileViewersCount() {
    return get().profileViewers.length;
  },

  // Actions
  initializePresence: (userId: string) => {
    try {
      // Presence initialization not implemented in Firebase version
      console.log(`Presence initialized for user ${userId}`);
    } catch (error) {
      console.error("Error initializing presence:", error);
    }
  },

  updatePresence: async (userId: string, updates: any) => {
    try {
      // Presence updates not implemented in Firebase version
      console.log(`Presence updated for user ${userId}:`, updates);
    } catch (error) {
      console.error("Error updating presence:", error);
    }
  },

  getUserPresence: async (userId: string) => {
    try {
      // Get user presence not implemented in Firebase version
      console.log(`Getting presence for user ${userId}`);
      return null;
    } catch (error) {
      console.error("Error getting user presence:", error);
      return null;
    }
  },

  getOnlineFriends: async (userId: string) => {
    try {
      // Get online friends not implemented in Firebase version
      console.log(`Getting online friends for user ${userId}`);
    } catch (error) {
      console.error("Error getting online friends:", error);
    }
  },

  trackProfileView: async (viewerId: string, profileId: string) => {
    try {
      // Profile view tracking not implemented in Firebase version
      console.log(`Profile view tracked: ${viewerId} viewed ${profileId}`);
    } catch (error) {
      console.error("Error tracking profile view:", error);
    }
  },

  stopProfileView: async (viewerId: string) => {
    try {
      // Profile view stopping not implemented in Firebase version
      console.log(`Profile view stopped: ${viewerId}`);
    } catch (error) {
      console.error("Error stopping profile view:", error);
    }
  },

  trackTypingInChat: async (userId: string, chatPartnerId: string) => {
    try {
      // Typing tracking not implemented in Firebase version
      console.log(`Typing tracked: ${userId} typing to ${chatPartnerId}`);
    } catch (error) {
      console.error("Error tracking typing:", error);
    }
  },

  stopTypingInChat: async (userId: string, chatPartnerId: string) => {
    try {
      // Typing stopping not implemented in Firebase version
      console.log(`Typing stopped: ${userId} stopped typing to ${chatPartnerId}`);
    } catch (error) {
      console.error("Error stopping typing:", error);
    }
  },

  setGhostMode: async (userId: string, enabled: boolean) => {
    try {
      // Ghost mode setting not implemented in Firebase version
      console.log(`Ghost mode set to ${enabled} for user ${userId}`);
    } catch (error) {
      console.error("Error setting ghost mode:", error);
    }
  },

  goOffline: async (userId: string) => {
    try {
      // Going offline not implemented in Firebase version
      console.log(`User ${userId} going offline`);
    } catch (error) {
      console.error("Error going offline:", error);
    }
  },

  getWhoUserIsChattingWith: async (userId: string) => {
    try {
      // Get chat partner not implemented in Firebase version
      console.log(`Getting chat partner for user ${userId}`);
      return null;
    } catch (error) {
      console.error("Error getting chat partner:", error);
      return null;
    }
  },

  getProfileViewers: async (profileId: string) => {
    try {
      // Get profile viewers not implemented in Firebase version
      console.log(`Getting profile viewers for ${profileId}`);
    } catch (error) {
      console.error("Error getting profile viewers:", error);
    }
  },

  isUserBeingIgnored: async (userId: string, targetUserId: string) => {
    try {
      // Check if user is being ignored not implemented in Firebase version
      console.log(`Checking if ${userId} is being ignored by ${targetUserId}`);
      return false;
    } catch (error) {
      console.error("Error checking if user is being ignored:", error);
      return false;
    }
  },

  getPresenceStats: async (userId: string) => {
    try {
      // Get presence stats not implemented in Firebase version
      console.log(`Getting presence stats for user ${userId}`);
    } catch (error) {
      console.error("Error getting presence stats:", error);
    }
  },

  getBulkPresence: async (userIds: string[]) => {
    try {
      // Get bulk presence not implemented in Firebase version
      console.log(`Getting bulk presence for users: ${userIds.join(", ")}`);
      return [];
    } catch (error) {
      console.error("Error getting bulk presence:", error);
      return [];
    }
  },

  getOnlineUsersNotFriends: async (userId: string, limit?: number) => {
    try {
      // Get online users not friends not implemented in Firebase version
      console.log(`Getting online users not friends for user ${userId}`);
    } catch (error) {
      console.error("Error getting online users not friends:", error);
    }
  },

  cleanup: () => {
    // Cleanup not implemented in Firebase version
    console.log("Presence cleanup completed");
  },

  // Realtime
  subscribeToUserPresence: (userId: string, callback: (payload: any) => void) => {
    // For testing purposes, just log the subscription
    console.log(`Subscribed to user presence ${userId}`);
    return () => {
      console.log(`Unsubscribed from user presence ${userId}`);
    };
  },

  subscribeToFriendsPresence: (userId: string, callback: (payload: any) => void) => {
    // For testing purposes, just log the subscription
    console.log(`Subscribed to friends presence ${userId}`);
    return () => {
      console.log(`Unsubscribed from friends presence ${userId}`);
    };
  },

  clearError: () => {
    set({ error: null });
  },
}));
