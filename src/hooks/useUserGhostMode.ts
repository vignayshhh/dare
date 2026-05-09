import { useEffect, useRef, useState } from "react";
import { presenceDocSubscriptionService } from "../services/presenceDocSubscriptionService";

function normalizeExpiry(
  value: unknown,
): { expiresAt: string | null; expiresAtMs: number | null } {
  if (!value) {
    return { expiresAt: null, expiresAtMs: null };
  }

  let date: Date | null = null;

  if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  } else if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    date = (value as { toDate: () => Date }).toDate();
  }

  if (!date || Number.isNaN(date.getTime())) {
    return { expiresAt: null, expiresAtMs: null };
  }

  return {
    expiresAt: date.toISOString(),
    expiresAtMs: date.getTime(),
  };
}

export function useUserGhostMode(userId: string | undefined) {
  const [isGhostModeActive, setIsGhostModeActive] = useState(false);
  const [ghostModeExpiresAt, setGhostModeExpiresAt] = useState<string | null>(
    null,
  );
  const expiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (expiryTimeoutRef.current) {
      clearTimeout(expiryTimeoutRef.current);
      expiryTimeoutRef.current = null;
    }

    if (!userId) {
      setIsGhostModeActive(false);
      setGhostModeExpiresAt(null);
      return;
    }

    const unsubscribe = presenceDocSubscriptionService.subscribe(
      userId,
      (data) => {
        if (expiryTimeoutRef.current) {
          clearTimeout(expiryTimeoutRef.current);
          expiryTimeoutRef.current = null;
        }

        const hasGhostFlag = Boolean(data?.ghostMode);
        const { expiresAt, expiresAtMs } = normalizeExpiry(
          data?.ghostModeExpiresAt,
        );

        if (!hasGhostFlag || !expiresAt || !expiresAtMs) {
          setIsGhostModeActive(false);
          setGhostModeExpiresAt(null);
          return;
        }

        const remainingMs = expiresAtMs - Date.now();
        if (remainingMs <= 0) {
          setIsGhostModeActive(false);
          setGhostModeExpiresAt(null);
          return;
        }

        setIsGhostModeActive(true);
        setGhostModeExpiresAt(expiresAt);

        expiryTimeoutRef.current = setTimeout(() => {
          setIsGhostModeActive(false);
          setGhostModeExpiresAt(null);
          expiryTimeoutRef.current = null;
        }, remainingMs + 250);
      },
    );

    return () => {
      if (expiryTimeoutRef.current) {
        clearTimeout(expiryTimeoutRef.current);
        expiryTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [userId]);

  return { isGhostModeActive, ghostModeExpiresAt };
}
