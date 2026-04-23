import { create } from "zustand";
import { userService, UserProfile } from "@/middleware/services/user.service";

interface UserSearchState {
  // Data
  searchResults: UserProfile[];
  isSearching: boolean;
  searchQuery: string;
  error: string | null;

  // Actions
  searchUsers: (query: string) => Promise<void>;
  clearSearch: () => void;
  setError: (error: string | null) => void;
}

export const useUserSearchStore = create<UserSearchState>((set, get) => ({
  // Initial state
  searchResults: [],
  isSearching: false,
  searchQuery: "",
  error: null,

  // Search users
  searchUsers: async (query: string) => {
    const { isSearching } = get();

    if (isSearching) return;

    set({
      searchQuery: query,
      isSearching: true,
      error: null,
    });

    try {
      if (!query.trim()) {
        set({ searchResults: [], isSearching: false });
        return;
      }

      console.log(`🔍 UserSearchStore - Searching for: "${query}"`);

      // Get current user to exclude from results
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      console.log(`🔍 UserSearchStore - Current user:`, currentUser?.id);

      const results = await userService.searchProfiles(query.toLowerCase());

      console.log(`🔍 UserSearchStore - Raw results count: ${results.length}`);

      // Filter out current user - handle undefined user_id properly
      const filteredResults = currentUser
        ? results.filter((user) => {
            const excludeUser =
              (user.user_id && user.user_id === currentUser.id) ||
              (user.id && user.id === currentUser.id);
            console.log(
              `🔍 UserSearchStore - User ${user.username}: user_id=${user.user_id}, id=${user.id}, exclude=${excludeUser}`,
            );
            return !excludeUser;
          })
        : results;

      console.log(
        `🔍 UserSearchStore - Filtered results count: ${filteredResults.length}`,
      );
      console.log(
        `🔍 UserSearchStore - Filtered results:`,
        filteredResults.map((u) => ({
          username: u.username,
          user_id: u.user_id,
          id: u.id,
        })),
      );

      set({
        searchResults: filteredResults,
        isSearching: false,
      });
    } catch (error) {
      console.error("🔥 UserSearchStore - Search error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search users";
      set({
        error: errorMessage,
        isSearching: false,
        searchResults: [],
      });
    }
  },

  // Clear search
  clearSearch: () => {
    set({
      searchResults: [],
      searchQuery: "",
      error: null,
    });
  },

  // Set error
  setError: (error: string | null) => {
    set({ error });
  },
}));
