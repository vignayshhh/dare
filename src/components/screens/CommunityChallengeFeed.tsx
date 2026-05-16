"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CommunityChallengeCard } from "./CommunityChallengeCard";
import {
  COMMUNITY_CHALLENGES,
  type CommunityChallenge,
} from "./communityChallengeData";

export function CommunityChallengeFeed({
  joinedChallengeIds,
  onPreview,
  onJoin,
}: {
  joinedChallengeIds: Set<string>;
  onPreview: (challenge: CommunityChallenge) => void;
  onJoin: (challengeId: string) => void;
}) {
  const reelRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  const wheelUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const container = reelRef.current;
    if (!container) return;

    const maxIndex = Math.max(0, COMMUNITY_CHALLENGES.length - 1);
    const targetIndex = Math.min(maxIndex, Math.max(0, index));
    activeIndexRef.current = targetIndex;
    setActiveIndex(targetIndex);
    container.scrollTo({
      top: container.clientHeight * targetIndex,
      behavior: "smooth",
    });
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const verticalDelta = Math.abs(event.deltaY);
      const horizontalDelta = Math.abs(event.deltaX);
      if (verticalDelta < 10 || horizontalDelta > verticalDelta) return;

      event.preventDefault();
      if (wheelLocked.current) return;

      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex = activeIndexRef.current + direction;
      scrollToIndex(nextIndex);

      wheelLocked.current = true;
      if (wheelUnlockTimer.current) clearTimeout(wheelUnlockTimer.current);
      wheelUnlockTimer.current = setTimeout(() => {
        wheelLocked.current = false;
      }, 520);
    },
    [scrollToIndex],
  );

  useEffect(() => {
    const container = reelRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollFrame.current !== null) return;
      scrollFrame.current = window.requestAnimationFrame(() => {
        scrollFrame.current = null;
        const slideHeight = container.clientHeight;
        if (!slideHeight) return;
        const maxIndex = Math.max(0, COMMUNITY_CHALLENGES.length - 1);
        const nextIndex = Math.min(
          maxIndex,
          Math.max(0, Math.round(container.scrollTop / slideHeight)),
        );
        if (nextIndex === activeIndexRef.current) return;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: false });
    handleScroll();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      if (scrollFrame.current !== null) {
        window.cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
      }
      if (wheelUnlockTimer.current) {
        clearTimeout(wheelUnlockTimer.current);
        wheelUnlockTimer.current = null;
      }
    };
  }, [handleWheel]);

  return (
    <div
      ref={reelRef}
      aria-label="Community dares"
      className="community-challenge-reel min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      style={{
        scrollSnapType: "y mandatory",
        scrollBehavior: "smooth",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        touchAction: "pan-y",
        scrollbarWidth: "none",
      }}
    >
      <style>{`
        .community-challenge-reel::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {COMMUNITY_CHALLENGES.map((challenge, index) => (
        <section
          key={challenge.id}
          data-community-card-active={activeIndex === index ? "true" : undefined}
          className="flex h-full min-h-full snap-start snap-always items-start justify-center overflow-hidden px-4 pt-3"
          style={{
            paddingBottom: "calc(var(--bottom-nav-total-height) + 12px)",
            contain: "layout paint style",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        >
          <div className="w-full max-w-[430px]">
            <CommunityChallengeCard
              challenge={challenge}
              isJoined={joinedChallengeIds.has(challenge.id)}
              onPreview={() => onPreview(challenge)}
              onJoin={() => onJoin(challenge.id)}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
