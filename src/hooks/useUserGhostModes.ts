import { useEffect, useMemo, useRef, useState } from "react";
import { presenceDocSubscriptionService } from "../services/presenceDocSubscriptionService";

type GhostModeMap = Record<string, boolean>;

function isPresenceGhostActive(
  data: {
    ghostMode?: boolean;
    ghostModeExpiresAt?: string | null;
  } | null,
): boolean {
  if (!data?.ghostMode || !data.ghostModeExpiresAt) {
    return false;
  }

  const expiresAtMs = new Date(data.ghostModeExpiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

export function useUserGhostModes(userIds: Array<string | undefined | null>) {
  const normalizedUserIds = useMemo(
    () =>
      [
        ...new Set(
          userIds.filter((userId): userId is string => Boolean(userId)),
        ),
      ].sort(),
    [userIds],
  );
  const [ghostModesByUserId, setGhostModesByUserId] = useState<GhostModeMap>(
    {},
  );
  const expiryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const activeUserIds = new Set(normalizedUserIds);
    const expiryTimers = expiryTimersRef.current;

    Array.from(expiryTimers.keys()).forEach((userId) => {
      if (!activeUserIds.has(userId)) {
        const timer = expiryTimers.get(userId);
        if (timer) clearTimeout(timer);
        expiryTimers.delete(userId);
      }
    });

    setGhostModesByUserId((prev) => {
      const next: GhostModeMap = {};
      normalizedUserIds.forEach((userId) => {
        next[userId] = prev[userId] || false;
      });
      return next;
    });

    const unsubscribes = normalizedUserIds.map((userId) =>
      presenceDocSubscriptionService.subscribe(userId, (data) => {
        const nextActive = isPresenceGhostActive(data);
        const existingTimer = expiryTimers.get(userId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          expiryTimers.delete(userId);
        }

        if (nextActive && data?.ghostModeExpiresAt) {
          const remainingMs =
            new Date(data.ghostModeExpiresAt).getTime() - Date.now();
          if (remainingMs > 0) {
            const timeoutId = setTimeout(() => {
              setGhostModesByUserId((prev) => ({
                ...prev,
                [userId]: false,
              }));
              expiryTimers.delete(userId);
            }, remainingMs + 250);
            expiryTimers.set(userId, timeoutId);
          }
        }

        setGhostModesByUserId((prev) =>
          prev[userId] === nextActive
            ? prev
            : { ...prev, [userId]: nextActive },
        );
      }),
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(normalizedUserIds)]);

  useEffect(
    () => () => {
      expiryTimersRef.current.forEach((timer) => clearTimeout(timer));
      expiryTimersRef.current.clear();
    },
    [],
  );

  return ghostModesByUserId;
}
