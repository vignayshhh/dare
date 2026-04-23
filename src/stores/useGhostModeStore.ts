// Ghost Mode Store - Manages ghost mode state and timer
// Follows architecture contract: UI components only interact with stores

import { create } from "zustand";
import {
  ghostModeService,
  GhostModeStatus,
} from "@/middleware/services/ghost-mode.service";
import { useAuthStore } from "./useAuthStore-v2";

interface GhostModeState {
  // State
  isActive: boolean;
  remainingSeconds: number;
  formattedTime: string;
  dareId?: string;
  activatedAt?: string;
  expiresAt?: string;

  // Loading states
  loading: boolean;
  error: string | null;

  // Actions
  checkGhostModeStatus: (userId: string) => Promise<void>;
  activateGhostMode: (
    userId: string,
    dareId: string,
    durationMinutes?: number,
  ) => Promise<void>;
  deactivateGhostMode: (userId: string) => Promise<void>;
  subscribeToGhostMode: (userId: string) => () => void;
  startTimer: () => void;
  stopTimer: () => void;
  clearError: () => void;
}

let timerInterval: NodeJS.Timeout | null = null;

export const useGhostModeStore = create<GhostModeState>((set, get) => ({
  // Initial state
  isActive: false,
  remainingSeconds: 0,
  formattedTime: "00:00",
  loading: false,
  error: null,

  // Check ghost mode status
  checkGhostModeStatus: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      const status = await ghostModeService.getGhostModeStatus(userId);
      const remainingSeconds = await ghostModeService.getRemainingTime(userId);
      const formattedTime =
        await ghostModeService.getFormattedRemainingTime(userId);

      set({
        isActive: status.isActive,
        remainingSeconds,
        formattedTime,
        dareId: status.dareId,
        activatedAt: status.activatedAt,
        expiresAt: status.expiresAt,
        loading: false,
      });

      // Start timer if active
      if (status.isActive && remainingSeconds > 0) {
        get().startTimer();
      } else {
        get().stopTimer();
      }
    } catch (error) {
      console.error("Error checking ghost mode status:", error);
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to check ghost mode status",
        loading: false,
      });
    }
  },

  // Activate ghost mode
  activateGhostMode: async (
    userId: string,
    dareId: string,
    durationMinutes = 15,
  ) => {
    set({ loading: true, error: null });

    try {
      await ghostModeService.activateGhostMode({
        userId,
        dareId,
        durationMinutes,
      });

      // Update local state
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      const remainingSeconds = durationMinutes * 60;

      set({
        isActive: true,
        remainingSeconds,
        formattedTime: `${durationMinutes.toString().padStart(2, "0")}:00`,
        dareId,
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        loading: false,
      });

      // Start timer
      get().startTimer();

      console.log(`Ghost mode activated for user ${userId}`);
    } catch (error) {
      console.error("Error activating ghost mode:", error);
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to activate ghost mode",
        loading: false,
      });
    }
  },

  // Deactivate ghost mode
  deactivateGhostMode: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      await ghostModeService.deactivateGhostMode(userId);

      // Update local state
      set({
        isActive: false,
        remainingSeconds: 0,
        formattedTime: "00:00",
        dareId: undefined,
        activatedAt: undefined,
        expiresAt: undefined,
        loading: false,
      });

      // Stop timer
      get().stopTimer();

      console.log(`Ghost mode deactivated for user ${userId}`);
    } catch (error) {
      console.error("Error deactivating ghost mode:", error);
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to deactivate ghost mode",
        loading: false,
      });
    }
  },

  // Subscribe to real-time ghost mode changes
  subscribeToGhostMode: (userId: string) => {
    return ghostModeService.subscribeToGhostMode(
      userId,
      (status: GhostModeStatus) => {
        const { isActive } = get();

        // Only update if status actually changed
        if (status.isActive !== isActive) {
          if (status.isActive) {
            // Ghost mode activated
            const remainingSeconds = Math.max(
              0,
              Math.floor(
                (new Date(status.expiresAt!).getTime() - new Date().getTime()) /
                  1000,
              ),
            );
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;

            set({
              isActive: true,
              remainingSeconds,
              formattedTime: `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
              dareId: status.dareId,
              activatedAt: status.activatedAt,
              expiresAt: status.expiresAt,
            });

            get().startTimer();
          } else {
            // Ghost mode deactivated
            set({
              isActive: false,
              remainingSeconds: 0,
              formattedTime: "00:00",
              dareId: undefined,
              activatedAt: undefined,
              expiresAt: undefined,
            });

            get().stopTimer();
          }
        }
      },
    );
  },

  // Start countdown timer
  startTimer: () => {
    // Clear any existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    timerInterval = setInterval(() => {
      const { remainingSeconds } = get();

      if (remainingSeconds <= 0) {
        // Timer expired - deactivate ghost mode in backend
        const { dareId } = get();
        const userId = useAuthStore.getState().user?.id;

        if (userId && dareId) {
          console.log(
            `[@ghostmode] Timer expired - deactivating ghost mode for user ${userId}`,
          );
          // Deactivate in backend to restore alerts
          ghostModeService.deactivateGhostMode(userId).catch((error) => {
            console.error("Error deactivating ghost mode:", error);
          });
        }

        // Update local state
        set({
          isActive: false,
          remainingSeconds: 0,
          formattedTime: "00:00",
          dareId: undefined,
          activatedAt: undefined,
          expiresAt: undefined,
        });

        get().stopTimer();
        return;
      }

      // Decrement timer
      const newRemainingSeconds = remainingSeconds - 1;
      const minutes = Math.floor(newRemainingSeconds / 60);
      const seconds = newRemainingSeconds % 60;

      set({
        remainingSeconds: newRemainingSeconds,
        formattedTime: `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      });
    }, 1000);
  },

  // Stop countdown timer
  stopTimer: () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

// Cleanup timer on store unmount
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });
}
