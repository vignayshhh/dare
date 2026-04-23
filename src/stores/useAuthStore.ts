import { create } from "zustand";
import authService from "@/middleware/services/auth.service";
import type {
  AuthState,
  SignUpRequest,
  AuthResponse,
} from "@/middleware/services/auth.service";

interface AuthStore {
  // State
  user: any;
  loading: boolean;
  error: string | null;

  // Actions
  initializeAuth: () => void;
  signUp: (request: SignUpRequest) => Promise<AuthResponse>;
  signIn: (email: string) => Promise<AuthResponse>;
  signInWithGoogle: () => Promise<AuthResponse>;
  completeSignIn: (email: string) => Promise<AuthResponse>;
  isSignInLink: () => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (updates: any) => Promise<AuthResponse>;
  clearError: () => void;
  checkIsAuthenticated: () => boolean;

  // Computed values
  isAuthenticated: boolean;
  currentUser: any;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  user: null,
  loading: true,
  error: null,

  // Computed values - simplified
  get isAuthenticated() {
    const user = get().user;
    return !!user && typeof user === "object" && !!user?.user_id;
  },

  checkIsAuthenticated: () => {
    const user = get().user;
    return !!user && typeof user === "object" && !!user?.user_id;
  },

  get currentUser() {
    return get().user;
  },

  // Actions
  initializeAuth: () => {
    authService.initializeAuth();

    // Subscribe to auth state changes
    authService.subscribe((authState) => {
      // Only update if user is valid object or null
      if (authState.user && typeof authState.user !== "object") {
        console.log("🚫 Invalid user type received, skipping update");
        return;
      }

      set({
        user: authState.user,
        loading: authState.loading,
        error: authState.error,
      });
    });
  },

  signUp: async (request: SignUpRequest) => {
    set({ loading: true, error: null });

    try {
      const response = await authService.signUp(request);

      if (response.success) {
        set({ loading: false });
      } else {
        set({ loading: false, error: response.error });
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  signIn: async (email: string) => {
    set({ loading: true, error: null });

    try {
      const response = await authService.signIn(email);

      if (response.success) {
        set({ loading: false });
      } else {
        set({ loading: false, error: response.error });
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null });

    try {
      const response = await authService.signInWithGoogle();

      if (response.success) {
        set({ loading: false });
      } else {
        set({ loading: false, error: response.error });
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });

    try {
      await authService.signOut();
      // Auth listener will handle state update
    } catch (error) {
      console.error("Sign out error:", error);
      set({ loading: false, error: "Failed to sign out" });
    }
  },

  updateProfile: async (updates: any) => {
    const { user } = get();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    set({ loading: true, error: null });

    try {
      const response = await authService.updateProfile(updates);

      if (response.success) {
        set({
          user: response.user,
          loading: false,
        });
      } else {
        set({ loading: false, error: response.error });
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  clearError: () => {
    set({ error: null });
  },

  completeSignIn: async (email: string) => {
    set({ loading: true, error: null });

    try {
      const response = await authService.completeSignIn(email);

      if (response.success) {
        set({
          user: response.user,
          loading: false,
        });
      } else {
        set({ loading: false, error: response.error });
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set({ loading: false, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  isSignInLink: async () => {
    return await authService.isSignInLink();
  },
}));
