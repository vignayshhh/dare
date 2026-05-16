"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  X,
  Trash2,
  Eye,
  Volume2,
  VolumeX,
  Heart,
  ThumbsDown,
  Send,
  Users,
  MoreVertical,
  Sparkles,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import {
  storyService,
  type StoryDTO,
  type StoryAudienceDTO,
  type StoryAudienceScope,
} from "../../middleware/services/story.service";
import { storyReactionService } from "../../middleware/services/story-reaction.service";
import {
  createGeneratedStoryMusicPlayer,
  getStoryFilterPreset,
  getStoryMusicPreset,
} from "../../utils/storyEnhancements";

const STORY_DURATION = 5000;

const mergeStoryAudience = (
  previous: StoryAudienceDTO | undefined,
  incoming: StoryAudienceDTO,
  scope: StoryAudienceScope,
): StoryAudienceDTO => {
  if (scope === "all") return incoming;

  return {
    viewers: scope === "views" ? incoming.viewers : previous?.viewers ?? [],
    likes: scope === "likes" ? incoming.likes : previous?.likes ?? [],
    hates: scope === "hates" ? incoming.hates : previous?.hates ?? [],
  };
};

const getStoryCreatedAtTime = (story: StoryDTO) => {
  const createdAt = new Date(story.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const getAuthorStoryIndexes = (stories: StoryDTO[], authorId?: string) => {
  if (!authorId) return [];

  return stories
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.author.id === authorId)
    .sort((a, b) => {
      const timeDifference =
        getStoryCreatedAtTime(a.item) - getStoryCreatedAtTime(b.item);
      return timeDifference || a.index - b.index;
    })
    .map(({ index }) => index);
};

interface StoryViewerProps {
  stories: StoryDTO[];
  initialIndex: number;
  isOwner: boolean;
  currentUserId: string;
  onClose: () => void;
  onDelete?: (storyId: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onReact?: (
    storyId: string,
    authorId: string,
    type: "like" | "hate",
  ) => Promise<"like" | "hate" | null> | "like" | "hate" | null;
  onReply?: (
    storyId: string,
    authorId: string,
    text: string,
  ) => Promise<void> | void;
}

export function StoryViewer({
  stories,
  initialIndex,
  isOwner,
  currentUserId,
  onClose,
  onDelete,
  onNavigateToProfile,
  onReact,
  onReply,
}: StoryViewerProps) {
  type AudienceTab = "views" | "likes" | "hates";
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, stories.length - 1)),
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [imageProgress, setImageProgress] = useState(0);
  const [loadedMediaKey, setLoadedMediaKey] = useState<string | null>(null);
  const [reactionMap, setReactionMap] = useState<
    Record<string, "like" | "hate" | undefined>
  >({});
  const [reactionPending, setReactionPending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replySendStatus, setReplySendStatus] = useState<
    "idle" | "sending" | "sent"
  >("idle");
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);
  const [audienceTab, setAudienceTab] = useState<AudienceTab>("views");
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceByStoryId, setAudienceByStoryId] = useState<
    Record<string, StoryAudienceDTO | undefined>
  >({});
  const [showOwnerOptions, setShowOwnerOptions] = useState(false);

  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageProgressRef = useRef<{
    elapsedMs: number;
    startedAt: number | null;
    rafId: number | null;
  }>({
    elapsedMs: 0,
    startedAt: null,
    rafId: null,
  });
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const activeMediaGestureRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const story = stories[currentIndex];
  const currentStoryId = story?.id;
  const currentStoryMediaType = story?.media.type;
  const currentStoryMusicId = story?.storyMusic?.id;
  const storyIdsKey = useMemo(
    () => stories.map((item) => item.id).join("|"),
    [stories],
  );
  const mediaKey = story ? `${story.id}:${story.media.type}:${story.media.url}` : null;
  const mediaLoaded = mediaKey !== null && loadedMediaKey === mediaKey;
  const reaction = reactionMap[story?.id] ?? null;
  const storyAudience = story ? audienceByStoryId[story.id] : undefined;
  const shouldPauseStory =
    isPaused ||
    replyFocused ||
    sendingReply ||
    showAudienceSheet ||
    showOwnerOptions;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(() => onCloseRef.current(), 220);
  }, []);

  const storiesLengthRef = useRef(stories.length);
  const storiesRef = useRef(stories);
  useEffect(() => {
    storiesRef.current = stories;
    storiesLengthRef.current = stories.length;
  }, [stories]);

  const resetStoryProgress = useCallback(() => {
    setImageProgress(0);
    setVideoProgress(0);
    setProgressKey((key) => key + 1);
  }, []);

  const getAdjacentSameAuthorStoryIndex = useCallback(
    (index: number, direction: 1 | -1) => {
      const storiesList = storiesRef.current;
      const currentStory = storiesList[index];
      if (!currentStory) return null;

      const authorStoryIndexes = getAuthorStoryIndexes(
        storiesList,
        currentStory.author.id,
      );
      if (authorStoryIndexes.length <= 1) return null;

      const authorStoryIndex = authorStoryIndexes.indexOf(index);
      const nextAuthorStoryIndex =
        authorStoryIndexes[authorStoryIndex + direction];

      return typeof nextAuthorStoryIndex === "number"
        ? nextAuthorStoryIndex
        : null;
    },
    [],
  );

  const goNext = useCallback(() => {
    setCurrentIndex((index) => {
      const sameAuthorNextIndex = getAdjacentSameAuthorStoryIndex(index, 1);
      if (sameAuthorNextIndex !== null) {
        resetStoryProgress();
        return sameAuthorNextIndex;
      }

      if (isOwner) {
        handleClose();
        return index;
      }

      if (index < storiesLengthRef.current - 1) {
        resetStoryProgress();
        return index + 1;
      }
      handleClose();
      return index;
    });
  }, [getAdjacentSameAuthorStoryIndex, handleClose, isOwner, resetStoryProgress]);

  const goPrev = useCallback(() => {
    setCurrentIndex((index) => {
      const sameAuthorPrevIndex = getAdjacentSameAuthorStoryIndex(index, -1);
      if (sameAuthorPrevIndex !== null) {
        resetStoryProgress();
        return sameAuthorPrevIndex;
      }

      if (isOwner) {
        return index;
      }

      if (index > 0) {
        resetStoryProgress();
        return index - 1;
      }
      return index;
    });
  }, [getAdjacentSameAuthorStoryIndex, isOwner, resetStoryProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = isMuted;
    if (shouldPauseStory) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => {});
    });
  }, [isMuted, shouldPauseStory]);

  useEffect(() => {
    setReplyText("");
    setReplyFocused(false);
    setReplySendStatus("idle");
    setVideoProgress(0);
    setImageProgress(0);
    setProgressKey((key) => key + 1);
    imageProgressRef.current.elapsedMs = 0;
    imageProgressRef.current.startedAt = null;
    if (imageProgressRef.current.rafId) {
      cancelAnimationFrame(imageProgressRef.current.rafId);
      imageProgressRef.current.rafId = null;
    }

    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    }
  }, [currentIndex, story?.id]);

  useEffect(() => {
    let cancelled = false;

    storyReactionService.getUserReactions(currentUserId).then((reactions) => {
      if (cancelled) return;

      const nextMap: Record<string, "like" | "hate" | undefined> = {};
      for (const storyId of storyIdsKey ? storyIdsKey.split("|") : []) {
        const existingReaction = reactions.get(storyId);
        if (existingReaction) {
          nextMap[storyId] = existingReaction;
        }
      }
      setReactionMap(nextMap);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, storyIdsKey]);

  useEffect(() => {
    if (!currentStoryId || currentStoryMediaType === "video") {
      if (imageProgressRef.current.rafId) {
        cancelAnimationFrame(imageProgressRef.current.rafId);
      }
      imageProgressRef.current.rafId = null;
      imageProgressRef.current.startedAt = null;
      return;
    }

    if (!mediaLoaded) {
      if (imageProgressRef.current.rafId) {
        cancelAnimationFrame(imageProgressRef.current.rafId);
      }
      imageProgressRef.current.rafId = null;
      return;
    }

    if (imageProgressRef.current.rafId) {
      cancelAnimationFrame(imageProgressRef.current.rafId);
      imageProgressRef.current.rafId = null;
    }

    if (shouldPauseStory) {
      if (imageProgressRef.current.startedAt !== null) {
        imageProgressRef.current.elapsedMs +=
          performance.now() - imageProgressRef.current.startedAt;
        imageProgressRef.current.startedAt = null;
      }
      return;
    }

    const animate = (now: number) => {
      if (imageProgressRef.current.startedAt === null) {
        imageProgressRef.current.startedAt = now;
      }

      const elapsed =
        imageProgressRef.current.elapsedMs +
        (now - imageProgressRef.current.startedAt);
      const progress = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setImageProgress(progress);

      if (elapsed >= STORY_DURATION) {
        imageProgressRef.current.elapsedMs = STORY_DURATION;
        imageProgressRef.current.startedAt = null;
        imageProgressRef.current.rafId = null;
        goNext();
        return;
      }

      imageProgressRef.current.rafId = requestAnimationFrame(animate);
    };

    imageProgressRef.current.rafId = requestAnimationFrame(animate);

    return () => {
      if (imageProgressRef.current.rafId) {
        cancelAnimationFrame(imageProgressRef.current.rafId);
        imageProgressRef.current.rafId = null;
      }
    };
  }, [
    currentStoryId,
    currentStoryMediaType,
    goNext,
    shouldPauseStory,
    mediaLoaded,
  ]);

  useEffect(() => {
    const nextStory = stories[currentIndex + 1];
    if (!nextStory || nextStory.media.type === "video" || !nextStory.media.url)
      return;

    const img = new Image();
    img.src = nextStory.media.url;
  }, [currentIndex, stories]);

  useEffect(() => {
    setShowAudienceSheet(false);
    setShowOwnerOptions(false);
  }, [story?.id]);

  useEffect(() => {
    if (isOwner || !currentStoryId || !currentUserId) return;

    void storyService.markStoryAsViewed(currentStoryId, currentUserId).catch(
      (error) => {
        console.error("Error marking story as viewed:", error);
      },
    );
  }, [currentStoryId, currentUserId, isOwner]);

  useEffect(() => {
    const musicId = currentStoryMusicId;
    if (!musicId || musicId === "none" || shouldPauseStory || isMuted) return;

    const player = createGeneratedStoryMusicPlayer(musicId, {
      masterGain: 0.035,
      noteDurationMs: 240,
    });
    return () => player?.stop();
  }, [currentStoryId, currentStoryMusicId, isMuted, shouldPauseStory]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setVideoProgress((video.currentTime / video.duration) * 100);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, handleClose]);

  const isStoryNavigationTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !target.closest(
      'button, input, textarea, [role="dialog"], [data-story-interactive="true"]',
    );

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const resetTouchGesture = () => {
    activeMediaGestureRef.current = false;
    touchStartX.current = 0;
    touchStartY.current = 0;
    touchStartTime.current = 0;
    clearHoldTimer();
    setIsPaused(false);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (!isStoryNavigationTarget(event.target)) {
      resetTouchGesture();
      return;
    }
    activeMediaGestureRef.current = true;
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    touchStartTime.current = Date.now();
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => setIsPaused(true), 120);
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (!activeMediaGestureRef.current) {
      resetTouchGesture();
      return;
    }
    activeMediaGestureRef.current = false;
    clearHoldTimer();
    setIsPaused(false);

    const dx = event.changedTouches[0].clientX - touchStartX.current;
    const dy = event.changedTouches[0].clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;

    if (dy > 80 && Math.abs(dx) < 80) {
      suppressClickUntilRef.current = Date.now() + 400;
      handleClose();
      return;
    }

    if (Math.abs(dx) > 55 && Math.abs(dy) < 55) {
      suppressClickUntilRef.current = Date.now() + 400;
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    const target = event.target as HTMLElement;
    if (dt < 200 && Math.abs(dx) < 15 && Math.abs(dy) < 15) {
      if (target.closest("button") || target.closest("input")) {
        return;
      }

      const x = touchStartX.current;
      const width = (event.currentTarget as HTMLElement).clientWidth;
      suppressClickUntilRef.current = Date.now() + 400;
      if (x < width / 2) goPrev();
      else goNext();
    }
  };

  const onTouchCancel = () => {
    resetTouchGesture();
  };

  const onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isStoryNavigationTarget(event.target)) {
      resetTouchGesture();
      return;
    }
    activeMediaGestureRef.current = true;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => setIsPaused(true), 150);
  };

  const onMouseUp = () => {
    activeMediaGestureRef.current = false;
    clearHoldTimer();
    setIsPaused(false);
  };

  const onMouseLeave = () => {
    resetTouchGesture();
  };

  const onClickZone = (event: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntilRef.current) return;
    if ((event.target as HTMLElement).closest("button, input, textarea")) return;
    if (!isStoryNavigationTarget(event.target)) return;

    const x = event.clientX;
    const width = event.currentTarget.clientWidth;
    if (x < width / 2) goPrev();
    else goNext();
  };

  const handleReact = useCallback(
    async (type: "like" | "hate") => {
      if (!story || reactionPending) return;

      const previousReaction = reaction;
      const optimisticReaction = previousReaction === type ? null : type;

      setReactionMap((prev) => ({
        ...prev,
        [story.id]: optimisticReaction ?? undefined,
      }));
      setReactionPending(true);

      try {
        let finalReaction: "like" | "hate" | null = optimisticReaction;

        if (onReact) {
          finalReaction = await onReact(story.id, story.author.id, type);
        } else {
          const result = await storyReactionService.toggleReaction(
            story.id,
            currentUserId,
            type,
          );

          if (!result.success) {
            throw new Error("Failed to save story reaction");
          }

          finalReaction = result.currentReaction;
        }

        setReactionMap((prev) => ({
          ...prev,
          [story.id]: finalReaction ?? undefined,
        }));
      } catch (error) {
        console.error("Error saving story reaction:", error);
        setReactionMap((prev) => ({
          ...prev,
          [story.id]: previousReaction ?? undefined,
        }));
      } finally {
        setReactionPending(false);
      }
    },
    [currentUserId, onReact, reaction, reactionPending, story],
  );

  const handleSendReply = useCallback(async () => {
    if (!story) return;

    const text = replyText.trim();
    if (!text || sendingReply) return;

    setSendingReply(true);
    setReplySendStatus("sending");
    try {
      if (onReply) await onReply(story.id, story.author.id, text);
      setReplyText("");
      setReplyFocused(false);
      setReplySendStatus("sent");
      replyInputRef.current?.blur();
      window.setTimeout(() => setReplySendStatus("idle"), 1400);
    } catch (error) {
      console.error("Error sending story reply:", error);
      setReplySendStatus("idle");
    } finally {
      setSendingReply(false);
    }
  }, [onReply, replyText, sendingReply, story]);

  const loadAudienceForTab = useCallback(
    async (tab: AudienceTab = "views") => {
      if (!story) return;

      setAudienceLoading(true);
      try {
        const audience = await storyService.getStoryAudience(story.id, tab);
        setAudienceByStoryId((prev) => ({
          ...prev,
          [story.id]: mergeStoryAudience(prev[story.id], audience, tab),
        }));
      } finally {
        setAudienceLoading(false);
      }
    },
    [story],
  );

  const openAudienceSheet = useCallback(
    async (tab: AudienceTab = "views") => {
      if (!story) return;

      setAudienceTab(tab);
      setShowAudienceSheet(true);
      await loadAudienceForTab(tab);
    },
    [loadAudienceForTab, story],
  );

  if (!story) return null;

  const isVideo = story.media.type === "video";
  const audienceCounts = {
    views: storyAudience?.viewers.length ?? story.viewCount,
    likes: storyAudience?.likes.length ?? 0,
    hates: storyAudience?.hates.length ?? 0,
  };
  const audienceEntries =
    audienceTab === "likes"
      ? storyAudience?.likes ?? []
      : audienceTab === "hates"
        ? storyAudience?.hates ?? []
        : storyAudience?.viewers ?? [];
  const totalViewerOpens =
    storyAudience?.viewers.reduce(
      (total, entry) => total + Math.max(1, entry.viewCount || 1),
      0,
    ) ?? story.viewCount;
  const shellStyle: React.CSSProperties = {
    maxWidth: 430,
    width: "100%",
    height: "100dvh",
    minHeight: "100vh",
    opacity: visible && !exiting ? 1 : 0,
    transform:
      visible && !exiting
        ? "translate3d(0,0,0) scale(1)"
        : "translate3d(0,16px,0) scale(0.975)",
    transition:
      "opacity 240ms var(--motion-ease-out), transform 280ms var(--motion-ease-out)",
    willChange: "opacity, transform",
    overscrollBehavior: "none",
    touchAction: "none",
  };
  const mediaClassName =
    "relative z-10 block h-auto max-h-full w-auto max-w-full object-contain object-center";
  const filterPreset = getStoryFilterPreset(story.storyFilter);
  const musicPreset = getStoryMusicPreset(story.storyMusic?.id);
  const storyProgress = isVideo ? videoProgress : imageProgress;
  const currentAuthorStoryIndexes = getAuthorStoryIndexes(
    stories,
    story.author.id,
  );
  const currentAuthorStoryPosition =
    currentAuthorStoryIndexes.indexOf(currentIndex);
  const shouldSegmentProgress =
    currentAuthorStoryIndexes.length > 1 && currentAuthorStoryPosition >= 0;
  const hasStoryMusic = Boolean(
    currentStoryMusicId && currentStoryMusicId !== "none",
  );
  const dedicatedAuthorUsername = story.author.username.replace(/^@/, "");
  const dedicatedTargetUsername = story.dedicatedTo?.username.replace(/^@/, "");

  return (
    <div
      className="app-modal-backdrop fixed inset-0 flex items-center justify-center overflow-hidden bg-black"
      style={{
        zIndex: 200,
        backgroundColor: `rgba(0,0,0,${visible && !exiting ? 0.96 : 0})`,
        transition: "background-color 220ms ease",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <div
        className="relative flex w-full select-none flex-col overflow-hidden"
        style={shellStyle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onClick={onClickZone}
      >
        <div
          className="absolute left-0 right-0 top-0 z-40 px-2"
          style={{ paddingTop: "calc(var(--safe-area-top) + 8px)" }}
        >
          {shouldSegmentProgress ? (
            <div
              key={`${progressKey}-${currentStoryId ?? currentIndex}`}
              className="flex h-[3px] w-full gap-1"
            >
              {currentAuthorStoryIndexes.map((storyIndex, segmentIndex) => {
                const segmentProgress =
                  segmentIndex < currentAuthorStoryPosition
                    ? 100
                    : segmentIndex === currentAuthorStoryPosition
                      ? storyProgress
                      : 0;

                return (
                  <div
                    key={stories[storyIndex]?.id ?? storyIndex}
                    className="h-full flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <div
                      className="h-full bg-[#00ff88] transition-all duration-100 ease-linear"
                      style={{ width: `${segmentProgress}%` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              key={`${progressKey}-${currentStoryId ?? currentIndex}`}
              className="h-[3px] w-full overflow-hidden rounded-full bg-white/25"
            >
              <div
                className="h-full bg-[#00ff88] transition-all duration-100 ease-linear"
                style={{ width: `${storyProgress}%` }}
              />
            </div>
          )}
        </div>

        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-black">
          {!mediaLoaded && (
            <div
              className="absolute inset-0 z-20"
              style={{
                background:
                  "linear-gradient(135deg, #141414 25%, #1e1e1e 50%, #141414 75%)",
                backgroundSize: "400% 400%",
                animation: "shimmer 1.4s ease-in-out infinite",
              }}
            />
          )}

          {isVideo ? (
            <video
              key={mediaKey ?? story.id}
              data-story-media="true"
              ref={videoRef}
              src={story.media.url || undefined}
              className={mediaClassName}
              autoPlay
              playsInline
              muted={isMuted}
              onCanPlay={() => {
                if (mediaKey) {
                  setLoadedMediaKey(mediaKey);
                }
              }}
              onLoadedData={() => {
                if (mediaKey) {
                  setLoadedMediaKey(mediaKey);
                }
              }}
              onError={() => {
                if (mediaKey) {
                  setLoadedMediaKey(mediaKey);
                }
              }}
              onEnded={goNext}
              onTimeUpdate={onTimeUpdate}
              style={{
                pointerEvents: "auto",
                maxHeight: "100dvh",
                filter: filterPreset.cssFilter,
              }}
            />
          ) : (
            <img
              key={mediaKey ?? story.id}
              data-story-media="true"
              src={story.media.url || undefined}
              alt={story.caption ?? "Story"}
              className={mediaClassName}
              draggable={false}
              onLoad={() => {
                if (mediaKey) {
                  setLoadedMediaKey(mediaKey);
                }
              }}
              onError={() => {
                if (mediaKey) {
                  setLoadedMediaKey(mediaKey);
                }
              }}
              style={{
                pointerEvents: "auto",
                maxHeight: "100dvh",
                filter: filterPreset.cssFilter,
              }}
            />
          )}

          {filterPreset.overlay !== "transparent" && (
            <div
              className="pointer-events-none absolute inset-0 z-[12]"
              style={{ background: filterPreset.overlay }}
            />
          )}

          {story.storyText?.text && (
            <div
              className="pointer-events-none absolute z-[25] max-w-[86%] text-center"
              style={{
                left: `${story.storyText.xPct ?? 50}%`,
                top: `${story.storyText.yPct ?? 50}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span
                className="inline-block max-w-full break-words rounded-2xl bg-black/24 px-4 py-2.5 font-black leading-tight shadow-[0_10px_28px_rgba(0,0,0,0.4)] backdrop-blur-sm"
                style={{
                  color: story.storyText.color || "#ffffff",
                  fontSize: `${story.storyText.fontSize ?? 26}px`,
                  textShadow: "0 2px 14px rgba(0,0,0,0.82)",
                }}
              >
                {story.storyText.text}
              </span>
            </div>
          )}

          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.24) 12%, rgba(0,0,0,0.02) 34%, rgba(0,0,0,0.02) 62%, rgba(0,0,0,0.72) 100%)",
            }}
          />
        </div>

        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-3 pb-6"
          style={{ paddingTop: "calc(var(--safe-area-top) + 28px)" }}
        >
          <div className="pointer-events-auto flex items-center gap-2.5">
            {isOwner && onDelete && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowOwnerOptions((value) => !value);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-95"
                  aria-label="Story options"
                >
                  <MoreVertical size={16} />
                </button>
                {showOwnerOptions && (
                  <div className="absolute left-0 top-10 w-40 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(21,26,22,0.98),rgba(8,11,9,0.98))] p-1.5 shadow-[0_18px_36px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowOwnerOptions(false);
                        onDelete(story.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-300 transition-colors active:scale-[0.98]"
                      style={{ background: "rgba(248,113,113,0.1)" }}
                    >
                      <Trash2 size={13} />
                      Delete story
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="relative shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                if (!isOwner && onNavigateToProfile) {
                  handleClose();
                  setTimeout(() => onNavigateToProfile(story.author.id), 260);
                }
              }}
            >
              <Avatar
                src={story.author.avatar}
                alt={story.author.displayName}
                size="md"
                userId={story.author.id}
                className="ring-2 ring-white/70 shadow-lg"
              />
            </button>
            <div className="pointer-events-none">
              {story.storyType === "dedication" &&
              story.dedicatedTo &&
              dedicatedTargetUsername ? (
                <div
                  className="flex min-w-0 max-w-[calc(100vw-96px)] items-center gap-2 text-sm font-semibold leading-tight text-white"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}
                >
                  <span className="truncate">@{dedicatedAuthorUsername}</span>
                  <span className="mr-1 shrink-0 animate-pulse rounded-full bg-[#4ade80]/18 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#bbf7d0] shadow-[0_0_14px_rgba(74,222,128,0.35)]">
                    for
                  </span>
                  <Avatar
                    src={story.dedicatedTo.avatar}
                    alt={story.dedicatedTo.displayName}
                    size="md"
                    userId={story.dedicatedTo.id}
                    username={story.dedicatedTo.username}
                    className="shrink-0 ring-2 ring-[#4ade80]/80 shadow-[0_0_16px_rgba(74,222,128,0.36)]"
                  />
                  <span className="truncate">@{dedicatedTargetUsername}</span>
                </div>
              ) : (
                <p
                  className="text-sm font-semibold leading-tight text-white"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}
                >
                  {story.author.displayName}
                </p>
              )}
              {hasStoryMusic && (
                <p
                  className="mt-0.5 text-[11px] text-white/65"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
                >
                  {musicPreset.label}
                </p>
              )}
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {(isVideo || hasStoryMusic) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsMuted((value) => !value);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleClose();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          className="pointer-events-none absolute left-0 right-0 bottom-0 z-50 px-4 pb-[calc(var(--safe-area-bottom)+32px)] pt-14"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.58) 46%, rgba(0,0,0,0) 100%)",
          }}
        >
          {isOwner ? (
            <div className="pointer-events-auto flex items-center justify-between gap-3 pb-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void openAudienceSheet("views");
                }}
                aria-label={`View story viewers, ${story.viewCount} ${
                  story.viewCount === 1 ? "person" : "people"
                }`}
                className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(25,31,26,0.88),rgba(9,12,10,0.9))] text-[#a8f0bf] shadow-[0_16px_34px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all active:scale-95"
              >
                <Users
                  size={17}
                  className="transition-colors group-hover:text-[#c7f8d4]"
                />
              </button>
            </div>
          ) : (
            <div
              className="pointer-events-auto flex items-center gap-2"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleReact("like");
                }}
                disabled={reactionPending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm transition-all active:scale-90 disabled:opacity-70"
                style={{
                  background:
                    reaction === "like"
                      ? "rgba(0,255,136,0.18)"
                      : "rgba(255,255,255,0.10)",
                  borderColor:
                    reaction === "like"
                      ? "rgba(0,255,136,0.55)"
                      : "rgba(255,255,255,0.18)",
                  boxShadow:
                    reaction === "like"
                      ? "0 0 12px rgba(0,255,136,0.4)"
                      : "none",
                }}
              >
                <Heart
                  size={18}
                  fill={reaction === "like" ? "#00ff88" : "none"}
                  stroke={
                    reaction === "like" ? "#00ff88" : "rgba(255,255,255,0.85)"
                  }
                  strokeWidth={2}
                />
              </button>

              <div
                className="flex flex-1 items-center gap-2 rounded-full border px-4 py-2.5 backdrop-blur-sm transition-all"
                style={{
                  background:
                    replySendStatus === "sent"
                      ? "rgba(0,255,136,0.16)"
                      : replyFocused
                    ? "rgba(0,0,0,0.65)"
                    : "rgba(255,255,255,0.10)",
                  borderColor:
                    replySendStatus === "sent"
                      ? "rgba(0,255,136,0.55)"
                      : replyFocused
                    ? "rgba(0,255,136,0.55)"
                    : "rgba(255,255,255,0.18)",
                  boxShadow: replyFocused || replySendStatus === "sent"
                    ? "0 0 0 1px rgba(0,255,136,0.25)"
                    : "none",
                }}
              >
                {replySendStatus === "sent" ? (
                  <div className="min-w-0 flex-1 text-sm font-semibold text-[#bbf7d0]">
                    Sent
                  </div>
                ) : replySendStatus === "sending" ? (
                  <div className="min-w-0 flex-1 text-sm font-semibold text-[#bbf7d0]">
                    Sending...
                  </div>
                ) : (
                  <input
                    ref={replyInputRef}
                    type="text"
                    value={replyText}
                    onChange={(event) => {
                      setReplySendStatus("idle");
                      setReplyText(event.target.value);
                    }}
                    onFocus={() => setReplyFocused(true)}
                    onBlur={() => {
                      if (!replyText.trim()) setReplyFocused(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSendReply();
                      }
                    }}
                    placeholder="Send message..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
                  />
                )}
                {replyText.trim() && replySendStatus === "idle" && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleSendReply();
                    }}
                    disabled={sendingReply}
                    className="shrink-0 transition-transform active:scale-90"
                  >
                    <Send
                      size={16}
                      style={{
                        color: "#00ff88",
                        filter: "drop-shadow(0 0 4px rgba(0,255,136,0.6))",
                      }}
                    />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleReact("hate");
                }}
                disabled={reactionPending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm transition-all active:scale-90 disabled:opacity-70"
                style={{
                  background:
                    reaction === "hate"
                      ? "rgba(255,68,68,0.18)"
                      : "rgba(255,255,255,0.10)",
                  borderColor:
                    reaction === "hate"
                      ? "rgba(255,68,68,0.55)"
                      : "rgba(255,255,255,0.18)",
                  boxShadow:
                    reaction === "hate"
                      ? "0 0 12px rgba(255,68,68,0.4)"
                      : "none",
                }}
              >
                <ThumbsDown
                  size={18}
                  fill={reaction === "hate" ? "#ff4444" : "none"}
                  stroke={
                    reaction === "hate" ? "#ff4444" : "rgba(255,255,255,0.85)"
                  }
                  strokeWidth={2}
                />
              </button>
            </div>
          )}
        </div>

        {showAudienceSheet && isOwner && (
          <div
            className="app-modal-backdrop absolute inset-0 z-[70] flex items-end bg-black/78 backdrop-blur-[2px]"
            onClick={() => setShowAudienceSheet(false)}
          >
            <div
              className="app-modal-sheet flex max-h-[78dvh] w-full flex-col rounded-t-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.98),rgba(7,9,8,0.99))] shadow-[0_-30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Story viewers"
            >
              <div className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-white/15" />
              <div className="app-modal-sheet-content relative px-4 pb-[calc(var(--safe-area-bottom)+16px)] pt-4">
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
                <div className="pointer-events-none absolute left-1/2 top-16 h-36 w-36 -translate-x-1/2 rounded-full bg-[#4ade80]/10 blur-3xl" />

                <div className="relative z-10 mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#4ade80] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
                      <Eye size={21} />
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                        <Sparkles size={11} />
                        Story activity
                      </div>
                      <p className="truncate text-xl font-black leading-none text-white">
                        Viewers
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAudienceSheet(false)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.26)] transition-colors active:scale-95"
                    aria-label="Close story viewers"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="relative z-10 mb-4 overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["views", "Views", audienceCounts.views, <Users size={13} key="views" />],
                        ["likes", "Likes", audienceCounts.likes, <Heart size={13} key="likes" />],
                        ["hates", "Hates", audienceCounts.hates, <ThumbsDown size={13} key="hates" />],
                      ] as Array<[AudienceTab, string, number, React.ReactNode]>
                    ).map(([tabKey, label, count, icon]) => {
                      const active = audienceTab === tabKey;
                      return (
                        <button
                          key={tabKey}
                          type="button"
                          onClick={() => {
                            setAudienceTab(tabKey);
                            void loadAudienceForTab(tabKey);
                          }}
                          className={`rounded-[22px] border px-3 py-3 text-left transition-all ${
                            active
                              ? "border-[#4ade80]/35 bg-[#4ade80]/12 text-white shadow-[0_12px_30px_rgba(74,222,128,0.14)]"
                              : "border-white/8 bg-white/[0.04] text-[#94a3b8]"
                          }`}
                        >
                          <div
                            className={`mb-2 flex items-center gap-2 ${
                              active ? "text-[#86efac]" : "text-[#64748b]"
                            }`}
                          >
                            {icon}
                            <span className="text-[10px] font-black uppercase tracking-[0.14em]">
                              {label}
                            </span>
                          </div>
                          <div className="text-xl font-black text-white">
                            {count}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {audienceTab === "views" && audienceCounts.views > 0 && (
                    <div className="mt-3 flex items-center justify-between rounded-[22px] border border-[#4ade80]/18 bg-[#4ade80]/10 px-3.5 py-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                          Total opens
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-[#94a3b8]">
                          Includes repeat story views
                        </p>
                      </div>
                      <span className="text-lg font-black text-white">
                        {totalViewerOpens}
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className="app-modal-sheet-scroll relative z-10 pr-0.5"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {audienceLoading && !storyAudience ? (
                    <div className="flex items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.035] py-10 text-sm font-semibold text-[#94a3b8]">
                      Loading story activity...
                    </div>
                  ) : audienceEntries.length === 0 ? (
                    <div className="rounded-[28px] border border-white/8 bg-white/[0.035] px-4 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#64748b]">
                        <Users size={20} />
                      </div>
                      <p className="text-sm font-black text-white/85">
                        No {audienceTab} yet
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#64748b]">
                        Activity will appear here as people interact.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 pb-1">
                      {audienceEntries.map((entry) => (
                        <div
                          key={`${audienceTab}-${entry.userId}`}
                          className="flex items-center gap-3 rounded-[24px] border border-white/8 bg-white/[0.04] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        >
                          <Avatar
                            src={entry.avatar}
                            alt={entry.displayName}
                            userId={entry.userId}
                            username={entry.username}
                            size="sm"
                            className="ring-1 ring-[#4ade80]/16"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-white">
                              {entry.username}
                            </p>
                            <p className="truncate text-xs font-semibold text-[#64748b]">
                              {entry.displayName}
                            </p>
                          </div>
                          {audienceTab === "views" ? (
                            <div className="shrink-0 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1 text-xs font-black text-[#86efac]">
                              {Math.max(1, entry.viewCount || 1)}x
                            </div>
                          ) : (
                            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-bold text-[#94a3b8]">
                              {audienceTab === "likes" ? "Liked" : "Hated"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


