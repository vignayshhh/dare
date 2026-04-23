import { create } from "zustand";
import { activityService, GroupedActivity } from "@/middleware/services/activity.service";

interface ActivityState {
  items: GroupedActivity[];
  loading: boolean;
  error: string | null;
  lastFetchedUserId: string | null;
  lastFetchedAt: number | null;
}

interface ActivityActions {
  fetchActivity: (userId: string, hours?: number) => Promise<void>;
  refresh: (userId: string, hours?: number) => Promise<void>;
  clear: () => void;
}

export const useActivityStore = create<ActivityState & ActivityActions>(
  (set, get) => ({
    items: [],
    loading: false,
    error: null,
    lastFetchedUserId: null,
    lastFetchedAt: null,

    fetchActivity: async (userId, hours = 24) => {
      if (get().loading) return;
      set({ loading: true, error: null });
      try {
        const items = await activityService.getUserActivity(userId, hours);
        set({
          items,
          loading: false,
          lastFetchedUserId: userId,
          lastFetchedAt: Date.now(),
        });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    refresh: async (userId, hours = 24) => {
      activityService.invalidate(userId);
      set({ items: [], loading: true, error: null });
      try {
        const items = await activityService.getUserActivity(userId, hours);
        set({
          items,
          loading: false,
          lastFetchedUserId: userId,
          lastFetchedAt: Date.now(),
        });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    clear: () =>
      set({
        items: [],
        loading: false,
        error: null,
        lastFetchedUserId: null,
        lastFetchedAt: null,
      }),
  }),
);
