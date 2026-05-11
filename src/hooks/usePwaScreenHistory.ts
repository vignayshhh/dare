"use client";

import { useCallback, useEffect, useRef } from "react";

const DARE_PWA_HISTORY_KEY = "__darePwaScreenHistory";

type PwaScreenHistoryState<TScreen extends string, TSnapshot> = {
  [DARE_PWA_HISTORY_KEY]: true;
  depth: number;
  screen: TScreen;
  snapshot: TSnapshot;
};

type UsePwaScreenHistoryOptions<TSnapshot> = {
  enabled?: boolean;
  snapshot: TSnapshot;
  restoreSnapshot?: (snapshot: TSnapshot) => void;
};

function isPwaScreenHistoryState<TScreen extends string, TSnapshot>(
  value: unknown,
): value is PwaScreenHistoryState<TScreen, TSnapshot> {
  return (
    typeof value === "object" &&
    value !== null &&
    DARE_PWA_HISTORY_KEY in value &&
    (value as { [DARE_PWA_HISTORY_KEY]?: unknown })[
      DARE_PWA_HISTORY_KEY
    ] === true &&
    typeof (value as { screen?: unknown }).screen === "string" &&
    typeof (value as { depth?: unknown }).depth === "number"
  );
}

export function usePwaScreenHistory<TScreen extends string, TSnapshot>(
  screen: TScreen,
  setScreen: (screen: TScreen) => void,
  {
    enabled = true,
    snapshot,
    restoreSnapshot,
  }: UsePwaScreenHistoryOptions<TSnapshot>,
) {
  const initializedRef = useRef(false);
  const skipNextPushRef = useRef(false);
  const depthRef = useRef(0);
  const screenRef = useRef(screen);
  const snapshotRef = useRef(snapshot);
  const restoreSnapshotRef = useRef(restoreSnapshot);

  screenRef.current = screen;
  snapshotRef.current = snapshot;
  restoreSnapshotRef.current = restoreSnapshot;

  const createHistoryState = useCallback(
    (depth: number): PwaScreenHistoryState<TScreen, TSnapshot> => ({
      [DARE_PWA_HISTORY_KEY]: true,
      depth,
      screen: screenRef.current,
      snapshot: snapshotRef.current,
    }),
    [],
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const currentState = window.history.state;

    if (!initializedRef.current) {
      const initialDepth = isPwaScreenHistoryState<TScreen, TSnapshot>(
        currentState,
      )
        ? currentState.depth
        : 0;

      depthRef.current = initialDepth;
      window.history.replaceState(
        createHistoryState(initialDepth),
        "",
        window.location.href,
      );
      initializedRef.current = true;
      return;
    }

    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      window.history.replaceState(
        createHistoryState(depthRef.current),
        "",
        window.location.href,
      );
      return;
    }

    depthRef.current += 1;
    window.history.pushState(
      createHistoryState(depthRef.current),
      "",
      window.location.href,
    );
  }, [createHistoryState, enabled, screen]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handlePopState = (event: PopStateEvent) => {
      if (
        !isPwaScreenHistoryState<TScreen, TSnapshot>(event.state)
      ) {
        return;
      }

      skipNextPushRef.current = true;
      depthRef.current = Math.max(0, event.state.depth);
      restoreSnapshotRef.current?.(event.state.snapshot);
      setScreen(event.state.screen);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled, setScreen]);

  return useCallback(
    (fallbackScreen: TScreen) => {
      if (typeof window !== "undefined" && depthRef.current > 0) {
        window.history.back();
        return;
      }

      setScreen(fallbackScreen);
    },
    [setScreen],
  );
}
