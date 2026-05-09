import { create } from "zustand";
import {
  authService,
  type AuthUser,
  type NotificationPreferences,
} from "../middleware/services/auth-v2.service";
import { useAvatarStore } from "./avatarStore";

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
}

export interface AuthStore extends AuthState {
  // Sign up
  signUp: (userData: CreateUserData) => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
  }>;

  // Sign in
  signIn: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
  }>;

  // Sign in with Google
  signInWithGoogle: () => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
  }>;

  // Clear error
  clearError: () => void;

  // Sign out
  signOut: () => Promise<void>;

  // Update profile
  updateProfile: (updates: {
    displayName?: string;
    username?: string;
    bio?: string;
    avatar?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    hasCompletedProfileCreation?: boolean;
    is_18_plus?: boolean;
    consent_accepted?: boolean;
    notificationPreferences?: NotificationPreferences;
  }) => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
  }>;

  // Upload avatar
  uploadAvatar: (file: File) => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
  }>;

  // Initialize auth
  initializeAuth: () => Promise<void>;

  // Complete profile creation
  completeProfileCreation: () => Promise<void>;

  // Subscribe to auth changes
  subscribe: (callback: (user: AuthUser | null) => void) => () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  // Initialize auth on mount
  const initializeAuth = async () => {
    set({ loading: true, error: null });
    try {
      await authService.initializeAuth();
      const currentUser = authService.getCurrentUser();
      set({
        user: currentUser,
        loading: false,
        error: null,
        isAuthenticated: !!currentUser,
      });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Auth initialization failed",
        isAuthenticated: false,
      });
    }
  };

  // Subscribe to auth service for real-time updates
  const subscribeToAuthService = () => {
    return authService.subscribe((user) => {
      set({
        user,
        loading: false,
        error: null,
        isAuthenticated: !!user,
      });
    });
  };

  // Read cached user synchronously (authService restores from localStorage in its constructor)
  const initialUser =
    typeof window !== "undefined" ? authService.getCurrentUser() : null;

  return {
    // Initial state — pre-populated from localStorage cache for instant display on refresh
    user: initialUser,
    loading: false,
    error: null,
    isAuthenticated: !!initialUser,

    // Sign up
    signUp: async (userData) => {
      set({ loading: true, error: null });
      try {
        const response = await authService.signUp(userData);
        if (response.success && response.user) {
          set({
            user: response.user,
            loading: false,
            error: null,
            isAuthenticated: true,
          });
        } else {
          set({
            loading: false,
            error: response.error || "Sign up failed",
            isAuthenticated: false,
          });
        }
        return response;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Sign up failed",
          isAuthenticated: false,
        });
        throw error;
      }
    },

    // Sign in
    signIn: async (email, password) => {
      if (process.env.NODE_ENV === "development") {
        console.log("🔍 STORE SIGN IN - Starting:", email);
      }
      set({ loading: true, error: null });

      try {
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 STORE SIGN IN - Calling authService.signIn");
        }
        const response = await authService.signIn(email, password);
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 STORE SIGN IN - Got response:", response);
        }

        if (response.success && response.user) {
          if (process.env.NODE_ENV === "development") {
            console.log("🔍 STORE SIGN IN - Success, updating state");
          }
          set({
            user: response.user,
            loading: false,
            error: null,
            isAuthenticated: true,
          });
          if (process.env.NODE_ENV === "development") {
            console.log("✅ STORE SIGN IN SUCCESSFUL:", response.user.username);
          }
        } else {
          if (process.env.NODE_ENV === "development") {
            console.log("❌ STORE SIGN IN - Failed:", response.error);
          }
          set({
            loading: false,
            error: response.error || "Sign in failed",
            isAuthenticated: false,
          });
        }
        return response;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("💥 STORE SIGN IN - Exception:", error);
        }
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Sign in failed",
          isAuthenticated: false,
        });
        throw error;
      }
    },

    // Sign in with Google
    signInWithGoogle: async () => {
      set({ loading: true, error: null });
      try {
        // For now, Google sign in is not implemented
        throw new Error("Google sign in not implemented yet");
      } catch (error) {
        set({
          loading: false,
          error:
            error instanceof Error ? error.message : "Google sign in failed",
          isAuthenticated: false,
        });
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Google sign in failed",
        };
      }
    },

    // Clear error
    clearError: () => {
      set({ error: null });
    },

    // Sign out
    signOut: async () => {
      if (process.env.NODE_ENV === "development") {
        console.log("🔍 STORE SIGN OUT CALLED");
      }
      set({ loading: true, error: null });
      try {
        await authService.signOut();
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 STORE - UPDATING STATE AFTER SIGN OUT");
        }
        // Directly update Zustand state
        set({
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
        });
        if (process.env.NODE_ENV === "development") {
          console.log("✅ STORE SIGN OUT SUCCESSFUL - State updated");
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("❌ STORE SIGN OUT ERROR:", error);
        }
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Sign out failed",
          isAuthenticated: false,
        });
      }
    },

    // Update profile
    updateProfile: async (updates) => {
      set({ loading: true, error: null });
      try {
        const response = await authService.updateProfile(updates);
        if (response.success && response.user) {
          set({
            user: response.user,
            loading: false,
            error: null,
            isAuthenticated: true,
          });
        } else {
          set({
            loading: false,
            error: response.error || "Update failed",
            isAuthenticated: !!get().user,
          });
        }
        return response;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Update failed",
          isAuthenticated: !!get().user,
        });
        throw error;
      }
    },

    // Complete profile creation
    completeProfileCreation: async () => {
      set({ loading: true, error: null });
      try {
        await authService.completeProfileCreation();
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          set({
            user: currentUser,
            loading: false,
            error: null,
            isAuthenticated: true,
          });
        }
      } catch (error) {
        set({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to complete profile creation",
        });
        throw error;
      }
    },

    // Upload avatar
    uploadAvatar: async (file) => {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "🔍 AUTH STORE - uploadAvatar called with file:",
          file.name,
        );
      }
      // Don't set global loading for avatar upload to prevent app reload
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 AUTH STORE - Calling authService.uploadAvatar...");
        }
        const response = await authService.uploadAvatar(file);
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 AUTH STORE - Got upload response:", response);
        }

        if (response.success && response.user) {
          if (process.env.NODE_ENV === "development") {
            console.log("🔍 AUTH STORE - Upload successful, updating state");
            console.log(
              "🔍 AUTH STORE - New user avatar:",
              response.user.avatar,
            );
          }

          // Update avatar store to maintain global avatar consistency
          if (response.user.avatar && response.user.id) {
            const { setGlobalAvatar, setUserAvatar, setCurrentUserId } =
              useAvatarStore.getState();
            setGlobalAvatar(response.user.avatar);
            setUserAvatar(response.user.id, response.user.avatar);
            setCurrentUserId(response.user.id);
            if (process.env.NODE_ENV === "development") {
              console.log(
                "🔍 AUTH STORE - Avatar store updated with new avatar",
              );
            }
          }

          set({
            user: response.user,
            error: null,
            isAuthenticated: true,
          });
          if (process.env.NODE_ENV === "development") {
            console.log("🔍 AUTH STORE - State updated successfully");
          }
        } else {
          if (process.env.NODE_ENV === "development") {
            console.log("❌ AUTH STORE - Upload failed:", response.error);
          }
          set({
            error: response.error || "Avatar upload failed",
            isAuthenticated: !!get().user,
          });
        }
        return response;
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("💥 AUTH STORE - Upload exception:", error);
        }
        set({
          error:
            error instanceof Error ? error.message : "Avatar upload failed",
          isAuthenticated: !!get().user,
        });
        throw error;
      }
    },

    // Initialize auth
    initializeAuth,

    // Subscribe to auth changes (for real-time sync)
    subscribe: (callback) => {
      // Initialize subscription
      const unsubscribe = subscribeToAuthService();

      // Get current user and call callback immediately
      const currentUser = authService.getCurrentUser();
      callback(currentUser);

      // Return unsubscribe function
      return () => {
        unsubscribe();
      };
    },
  };
});
