import { useState, useEffect } from "react";
import { useAvatarStore } from "../stores/avatarStore";
import { userDocSubscriptionService } from "../services/userDocSubscriptionService";

/**
 * Custom hook for fetching and caching user avatars with real-time updates
 *
 * Features:
 * - Checks avatarStore cache first for instant display
 * - Fetches from Firestore if not cached
 * - Subscribes to real-time avatar updates
 * - Automatically updates when user changes their avatar
 *
 * @param userId - The user ID to fetch avatar for
 * @returns Object containing avatar URL and loading state
 */
export function useUserAvatar(userId: string | undefined) {
  const [avatar, setAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setAvatar("");
      setLoading(false);
      return;
    }

    // Use getState() directly to avoid depending on store function references
    const { getStoredAvatar } = useAvatarStore.getState();

    // Check cache first for instant display
    const cachedAvatar = getStoredAvatar(userId);
    if (cachedAvatar) {
      setAvatar(cachedAvatar);
      setLoading(false);
    }

    const unsubscribe = userDocSubscriptionService.subscribe(userId, (data) => {
      const avatarUrl = data?.avatarUrl || "";

      setAvatar(avatarUrl);
      if (avatarUrl) {
        useAvatarStore.getState().setUserAvatar(userId, avatarUrl);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [userId]);

  return { avatar, loading };
}

/**
 * Hook for fetching multiple user avatars at once
 * Useful for lists of users (e.g., likes modal, friend lists)
 *
 * @param userIds - Array of user IDs to fetch avatars for
 * @returns Map of userId -> avatar URL
 */
export function useUserAvatars(userIds: string[]) {
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const userIdsKey = userIds.join(",");

  useEffect(() => {
    if (!userIds || userIds.length === 0) {
      setAvatars({});
      setLoading(false);
      return;
    }

    const unsubscribers: (() => void)[] = [];
    const avatarMap: Record<string, string> = {};

    // Check cache first using getState() to avoid unstable deps
    const { getStoredAvatar } = useAvatarStore.getState();
    userIds.forEach((userId) => {
      const cached = getStoredAvatar(userId);
      if (cached) {
        avatarMap[userId] = cached;
      }
    });
    setAvatars({ ...avatarMap });

    userIds.forEach((userId) => {
      const unsubscribe = userDocSubscriptionService.subscribe(userId, (data) => {
        avatarMap[userId] = data?.avatarUrl || "";
        setAvatars({ ...avatarMap });

        if (data?.avatarUrl) {
          useAvatarStore.getState().setUserAvatar(userId, data.avatarUrl);
        }
      });
      unsubscribers.push(unsubscribe);
    });
    setLoading(false);

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIdsKey]);

  return { avatars, loading };
}
