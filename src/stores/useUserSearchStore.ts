import { create } from "zustand";
import { userService, UserProfile } from "@/middleware/services/user.service";

let activeSearchRequest = 0;

interface UserSearchState {
  searchResults: UserProfile[];
  isSearching: boolean;
  searchQuery: string;
  error: string | null;
  searchUsers: (query: string) => Promise<void>;
  clearSearch: () => void;
  setError: (error: string | null) => void;
}

export const useUserSearchStore = create<UserSearchState>((set) => ({
  searchResults: [],
  isSearching: false,
  searchQuery: "",
  error: null,

  searchUsers: async (query: string) => {
    const trimmedQuery = query.trim();
    const requestId = ++activeSearchRequest;

    set({
      searchQuery: trimmedQuery,
      isSearching: true,
      error: null,
    });

    try {
      if (!trimmedQuery) {
        if (requestId !== activeSearchRequest) return;
        set({ searchResults: [], isSearching: false });
        return;
      }

      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;
      const results = await userService.searchProfiles(trimmedQuery.toLowerCase());

      const filteredResults = currentUser
        ? results.filter((user) => {
            return (
              user.user_id !== currentUser.id &&
              user.id !== currentUser.id
            );
          })
        : results;

      if (requestId !== activeSearchRequest) {
        return;
      }

      set({
        searchResults: filteredResults,
        isSearching: false,
      });
    } catch (error) {
      if (requestId !== activeSearchRequest) {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to search users";
      set({
        error: errorMessage,
        isSearching: false,
        searchResults: [],
      });
    }
  },

  clearSearch: () => {
    activeSearchRequest += 1;
    set({
      searchResults: [],
      searchQuery: "",
      error: null,
      isSearching: false,
    });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
