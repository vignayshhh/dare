import { create } from "zustand";

// Inline types for profile
export interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  is_18_plus: boolean;
  consent_accepted: boolean;
  dares_completed: number;
  dares_refused: number;
  ghost_mode_active: boolean;
  ghost_mode_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileRequest {
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  is_18_plus: boolean;
  consent_accepted: boolean;
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  accepted_at: string | null;
}

export interface ProfileStore {
  // State
  currentProfile: Profile | null;
  viewedProfile: Profile | null;
  friends: Profile[];
  friendRequests: FriendRequest[];
  sentFriendRequests: FriendRequest[];
  profileViewers: any[];
  userStats: any;
  loading: boolean;
  error: string | null;
  updatingProfile: boolean;

  // Actions
  loadProfile: (userId: string) => Promise<void>;
  createProfile: (request: CreateProfileRequest) => Promise<void>;
  updateProfile: (userId: string, updates: any) => Promise<void>;
  getProfileByUsername: (username: string) => Promise<Profile | null>;
  searchProfiles: (query: string) => Promise<Profile[]>;
  trackProfileView: (profileId: string, viewerId: string) => Promise<void>;
  getProfileViewers: (profileId: string) => Promise<void>;
  activateGhostMode: (userId: string, durationHours?: number) => Promise<void>;
  deactivateGhostMode: (userId: string) => Promise<void>;
  getUserStats: (userId: string) => Promise<void>;
  loadFriends: (userId: string) => Promise<void>;
  loadFriendRequests: (userId: string) => Promise<void>;
  loadSentFriendRequests: (userId: string) => Promise<void>;
  sendFriendRequest: (userId: string, friendId: string) => Promise<void>;
  acceptFriendRequest: (userId: string, requestId: string) => Promise<void>;
  rejectFriendRequest: (userId: string, requestId: string) => Promise<void>;
  removeFriend: (userId: string, friendId: string) => Promise<void>;
  getFriendSuggestions: (userId: string) => Promise<Profile[]>;
  getMutualFriends: (userId: string, targetUserId: string) => Promise<Profile[]>;
  blockUser: (userId: string, targetUserId: string) => Promise<void>;
  clearViewedProfile: () => void;
  clearError: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  // Initial state
  currentProfile: null,
  viewedProfile: null,
  friends: [],
  friendRequests: [],
  sentFriendRequests: [],
  profileViewers: [],
  userStats: null,
  loading: false,
  error: null,
  updatingProfile: false,

  // Actions
  loadProfile: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      // Profile loading not implemented in Firebase version
      console.log(`Loading profile for user ${userId}`);
      set({ loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load profile";
      set({ loading: false, error: errorMessage });
    }
  },

  createProfile: async (request: CreateProfileRequest) => {
    set({ updatingProfile: true, error: null });

    try {
      // Profile creation not implemented in Firebase version
      console.log("Creating profile:", request);
      set({ updatingProfile: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create profile";
      set({ updatingProfile: false, error: errorMessage });
    }
  },

  updateProfile: async (userId: string, updates: any) => {
    set({ updatingProfile: true, error: null });

    try {
      // Profile update not implemented in Firebase version
      console.log(`Updating profile for user ${userId}:`, updates);
      set({ updatingProfile: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update profile";
      set({ updatingProfile: false, error: errorMessage });
    }
  },

  getProfileByUsername: async (username: string) => {
    try {
      // Profile lookup not implemented in Firebase version
      console.log(`Getting profile by username: ${username}`);
      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load profile";
      set({ error: errorMessage });
      return null;
    }
  },

  searchProfiles: async (query: string) => {
    set({ loading: true, error: null });

    try {
      // Profile search not implemented in Firebase version
      console.log(`Searching profiles: ${query}`);
      const profiles: Profile[] = [];
      set({ loading: false });
      return profiles;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search profiles";
      set({ loading: false, error: errorMessage });
      return [];
    }
  },

  trackProfileView: async (profileId: string, viewerId: string) => {
    try {
      // Profile view tracking not implemented in Firebase version
      console.log(`Profile view tracked: ${viewerId} viewed ${profileId}`);
    } catch (error) {
      console.error("Error tracking profile view:", error);
    }
  },

  getProfileViewers: async (profileId: string) => {
    try {
      // Get profile viewers not implemented in Firebase version
      console.log(`Getting profile viewers for ${profileId}`);
      const viewers: any[] = [];
      set({ profileViewers: viewers });
    } catch (error) {
      console.error("Error getting profile viewers:", error);
    }
  },

  activateGhostMode: async (userId: string, durationHours = 24) => {
    try {
      // Ghost mode activation not implemented in Firebase version
      console.log(`Ghost mode activated for user ${userId} for ${durationHours} hours`);
    } catch (error) {
      console.error("Error activating ghost mode:", error);
    }
  },

  deactivateGhostMode: async (userId: string) => {
    try {
      // Ghost mode deactivation not implemented in Firebase version
      console.log(`Ghost mode deactivated for user ${userId}`);
    } catch (error) {
      console.error("Error deactivating ghost mode:", error);
    }
  },

  getUserStats: async (userId: string) => {
    try {
      // Get user stats not implemented in Firebase version
      console.log(`Getting user stats for user ${userId}`);
    } catch (error) {
      console.error("Error getting user stats:", error);
    }
  },

  loadFriends: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      // Load friends not implemented in Firebase version
      console.log(`Loading friends for user ${userId}`);
      set({ loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load friends";
      set({ loading: false, error: errorMessage });
    }
  },

  loadFriendRequests: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      // Load friend requests not implemented in Firebase version
      console.log(`Loading friend requests for user ${userId}`);
      set({ loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load friend requests";
      set({ loading: false, error: errorMessage });
    }
  },

  loadSentFriendRequests: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      // Load sent friend requests not implemented in Firebase version
      console.log(`Loading sent friend requests for user ${userId}`);
      set({ loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load sent friend requests";
      set({ loading: false, error: errorMessage });
    }
  },

  sendFriendRequest: async (userId: string, friendId: string) => {
    try {
      // Send friend request not implemented in Firebase version
      console.log(`Friend request sent from ${userId} to ${friendId}`);
    } catch (error) {
      console.error("Error sending friend request:", error);
    }
  },

  acceptFriendRequest: async (userId: string, requestId: string) => {
    try {
      // Accept friend request not implemented in Firebase version
      console.log(`Friend request ${requestId} accepted by ${userId}`);
    } catch (error) {
      console.error("Error accepting friend request:", error);
    }
  },

  rejectFriendRequest: async (userId: string, requestId: string) => {
    try {
      // Reject friend request not implemented in Firebase version
      console.log(`Friend request ${requestId} rejected by ${userId}`);
    } catch (error) {
      console.error("Error rejecting friend request:", error);
    }
  },

  removeFriend: async (userId: string, friendId: string) => {
    try {
      // Remove friend not implemented in Firebase version
      console.log(`Friend ${friendId} removed by ${userId}`);
    } catch (error) {
      console.error("Error removing friend:", error);
    }
  },

  getFriendSuggestions: async (userId: string) => {
    try {
      // Get friend suggestions not implemented in Firebase version
      console.log(`Getting friend suggestions for user ${userId}`);
      return [];
    } catch (error) {
      console.error("Error getting friend suggestions:", error);
      return [];
    }
  },

  getMutualFriends: async (userId: string, targetUserId: string) => {
    try {
      // Get mutual friends not implemented in Firebase version
      console.log(`Getting mutual friends between ${userId} and ${targetUserId}`);
      return [];
    } catch (error) {
      console.error("Error getting mutual friends:", error);
      return [];
    }
  },

  blockUser: async (userId: string, targetUserId: string) => {
    try {
      // Block user not implemented in Firebase version
      console.log(`User ${targetUserId} blocked by ${userId}`);
    } catch (error) {
      console.error("Error blocking user:", error);
    }
  },

  clearViewedProfile: () => {
    set({ viewedProfile: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));
