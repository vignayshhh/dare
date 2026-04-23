// Surveillance Hook - Easy integration for profile and photo viewing tracking
// Follows architecture contract: clean interface, no business logic in UI

import { useCallback, useEffect, useRef } from "react";
import { surveillanceService } from "../middleware/services/surveillance.service";
import { useAuthStore } from "../stores/useAuthStore-v2";

interface SurveillanceOptions {
  targetUserId: string;
  screen: "profile" | "posts";
}

/**
 * Hook to track when a user is viewing another user's profile or posts
 * Automatically handles start/stop viewing with proper cleanup
 */
export const useSurveillance = ({
  targetUserId,
  screen,
}: SurveillanceOptions) => {
  const currentUser = useAuthStore((state) => state.user);
  const isActiveRef = useRef(false);

  const canTrack =
    !!currentUser && !!targetUserId && currentUser.id !== targetUserId;

  const startViewing = useCallback(async () => {
    if (!currentUser || !targetUserId || currentUser.id === targetUserId) {
      return;
    }

    if (isActiveRef.current) return;
    isActiveRef.current = true;

    try {
      if (screen === "profile") {
        await surveillanceService.startViewingProfile(
          currentUser.id,
          targetUserId,
          currentUser.username || "unknown",
          currentUser.displayName || currentUser.username || "Someone",
          currentUser.avatar || "/default-avatar.svg",
        );
      } else {
        await surveillanceService.startViewingPhotos(
          currentUser.id,
          targetUserId,
          currentUser.username || "unknown",
          currentUser.displayName || currentUser.username || "Someone",
          currentUser.avatar || "/default-avatar.svg",
        );
      }
    } catch (error) {
      isActiveRef.current = false;
      console.error("Error starting surveillance:", error);
    }
  }, [currentUser, targetUserId, screen]);

  const stopViewing = useCallback(async () => {
    if (!currentUser || !targetUserId || currentUser.id === targetUserId) {
      return;
    }

    if (!isActiveRef.current) return;
    isActiveRef.current = false;

    try {
      if (screen === "profile") {
        await surveillanceService.stopViewingProfile(
          currentUser.id,
          targetUserId,
          currentUser.username || "unknown",
          currentUser.displayName || currentUser.username || "Someone",
          currentUser.avatar || "/default-avatar.svg",
        );
      } else {
        await surveillanceService.stopViewingPhotos(
          currentUser.id,
          targetUserId,
          currentUser.username || "unknown",
          currentUser.displayName || currentUser.username || "Someone",
          currentUser.avatar || "/default-avatar.svg",
        );
      }
    } catch (error) {
      console.error("Error stopping surveillance:", error);
    }
  }, [currentUser, targetUserId, screen]);

  useEffect(() => {
    if (!canTrack) {
      return;
    }

    startViewing();

    return () => {
      stopViewing();
    };
  }, [canTrack, startViewing, stopViewing]);

  useEffect(() => {
    if (!canTrack) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopViewing();
      } else {
        startViewing();
      }
    };

    const handleBeforeUnload = () => {
      stopViewing();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [canTrack, startViewing, stopViewing]);

  return {
    startViewing,
    stopViewing,
    isActive: () => isActiveRef.current,
  };
};

/**
 * Hook to track individual photo views (for existing functionality)
 */
export function usePhotoViewTracking() {
  const { user: currentUser } = useAuthStore();

  const trackPhotoView = async (params: {
    targetUserId: string;
    postId: string;
    postThumbnail?: string;
  }) => {
    if (!currentUser || currentUser.id === params.targetUserId) return;

    try {
      await surveillanceService.trackPhotoView({
        viewerUserId: currentUser.id,
        viewerUsername: currentUser.username || "unknown",
        viewerDisplayName:
          currentUser.displayName || currentUser.username || "Someone",
        viewerAvatar: currentUser.avatar || "/default-avatar.svg",
        targetUserId: params.targetUserId,
        postId: params.postId,
        postThumbnail: params.postThumbnail,
      });
    } catch (error) {
      console.error("Error tracking photo view:", error);
    }
  };

  return { trackPhotoView };
}
