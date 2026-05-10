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
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import {
  storyService,
  type StoryDTO,
  type StoryAudienceDTO,
} from "../../middleware/services/story.service";
import { storyReactionService } from "../../middleware/services/story-reaction.service";
import {
  getStoryFilterPreset,
  getStoryMusicPreset,
} from "../../utils/storyEnhancements";

const STORY_DURATION = 5000;

function startGeneratedStoryMusic(musicId: string) {
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor || musicId === "none") return null;

  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.035;
  master.connect(context.destination);

  const patterns: Record<string, { notes: number[]; tempo: number; type: OscillatorType }> = {
    pulse: { notes: [196, 247, 294, 247], tempo: 320, type: "sine" },
    glow: { notes: [330, 392, 494, 587], tempo: 520, type: "triangle" },
    afterhours: { notes: [110, 147, 165, 147], tempo: 420, type: "sine" },
  };
  const pattern = patterns[musicId] || patterns.pulse;
  let step = 0;

  const playNote = () => {
    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = pattern.type;
    oscillator.frequency.value = pattern.notes[step % pattern.notes.length];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.42, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    step += 1;
  };

  playNote();
  const timer = window.setInterval(playNote, pattern.tempo);

  return {
    stop: () => {
      window.clearInterval(timer);
      void context.close();
    },
  };
}

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
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);
  const [audienceTab, setAudienceTab] = useState<AudienceTab>("views");
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceByStoryId, setAudienceByStoryId] = useState<
    Record<string, StoryAudienceDTO | undefined>
  >({});

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

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(() => onCloseRef.current(), 220);
  }, []);

  const storiesLengthRef = useRef(stories.length);
  useEffect(() => {
    storiesLengthRef.current = stories.length;
  }, [stories.length]);

  const goNext = useCallback(() => {
    setCurrentIndex((index) => {
      if (index < storiesLengthRef.current - 1) {
        setProgressKey((key) => key + 1);
        return index + 1;
      }
      handleClose();
      return index;
    });
  }, [handleClose]);

  const goPrev = useCallback(() => {
    setCurrentIndex((index) => {
      if (index > 0) {
        setProgressKey((key) => key + 1);
        return index - 1;
      }
      return index;
    });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = isMuted;
    if (isPaused) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => {});
    });
  }, [isMuted, isPaused]);

  useEffect(() => {
    setReplyText("");
    setReplyFocused(false);
    setVideoProgress(0);
    setImageProgress(0);
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

    if (isPaused) {
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
  }, [currentStoryId, currentStoryMediaType, goNext, isPaused, mediaLoaded]);

  useEffect(() => {
    const nextStory = stories[currentIndex + 1];
    if (!nextStory || nextStory.media.type === "video" || !nextStory.media.url)
      return;

    const img = new Image();
    img.src = nextStory.media.url;
  }, [currentIndex, stories]);

  useEffect(() => {
    setIsPaused(replyFocused);
  }, [replyFocused]);

  useEffect(() => {
    setShowAudienceSheet(false);
  }, [story?.id]);

  useEffect(() => {
    const musicId = currentStoryMusicId;
    if (!musicId || musicId === "none" || isPaused || isMuted) return;

    const player = startGeneratedStoryMusic(musicId);
    return () => player?.stop();
  }, [currentStoryId, currentStoryMusicId, isMuted, isPaused]);

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

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    touchStartTime.current = Date.now();
    holdTimerRef.current = setTimeout(() => setIsPaused(true), 120);
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setIsPaused(false);

    const dx = event.changedTouches[0].clientX - touchStartX.current;
    const dy = event.changedTouches[0].clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;

    if (dy > 80 && Math.abs(dx) < 80) {
      handleClose();
      return;
    }

    if (Math.abs(dx) > 55 && Math.abs(dy) < 55) {
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
      if (x < width / 3) goPrev();
      else goNext();
    }
  };

  const onMouseDown = () => {
    holdTimerRef.current = setTimeout(() => setIsPaused(true), 150);
  };

  const onMouseUp = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setIsPaused(false);
  };

  const onMouseLeave = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setIsPaused(false);
  };

  const onClickZone = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;

    const x = event.clientX;
    const width = event.currentTarget.clientWidth;
    if (x < width / 3) goPrev();
    else if (x > (width * 2) / 3) goNext();
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
    try {
      if (onReply) await onReply(story.id, story.author.id, text);
      setReplyText("");
      setReplyFocused(false);
      replyInputRef.current?.blur();
    } finally {
      setSendingReply(false);
    }
  }, [onReply, replyText, sendingReply, story]);

  const openAudienceSheet = useCallback(
    async (tab: AudienceTab = "views") => {
      if (!story) return;

      setAudienceTab(tab);
      setShowAudienceSheet(true);

      if (audienceByStoryId[story.id]) {
        return;
      }

      setAudienceLoading(true);
      try {
        const audience = await storyService.getStoryAudience(story.id);
        setAudienceByStoryId((prev) => ({
          ...prev,
          [story.id]: audience,
        }));
      } finally {
        setAudienceLoading(false);
      }
    },
    [audienceByStoryId, story],
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
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onClick={onClickZone}
      >
        <div className="absolute left-0 right-0 top-0 z-40 flex gap-1 px-2 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
          {stories.map((_, idx) => {
            const isCurrent = idx === currentIndex;
            const isPast = idx < currentIndex;
            const progress = isCurrent
              ? isVideo
                ? videoProgress
                : imageProgress
              : isPast
                ? 100
                : 0;

            return (
              <div
                key={`${progressKey}-${idx}`}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
              >
                <div
                  className="h-full bg-[#00ff88] transition-all duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            );
          })}
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
                pointerEvents: "none",
                maxHeight: "100dvh",
                filter: filterPreset.cssFilter,
              }}
            />
          ) : (
            <img
              key={mediaKey ?? story.id}
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
                pointerEvents: "none",
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

        <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-3 pb-6 pt-[calc(env(safe-area-inset-top,0px)+28px)]">
          <div className="pointer-events-auto flex items-center gap-2.5">
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
          className="pointer-events-none absolute left-0 right-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+32px)] pt-14"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.58) 46%, rgba(0,0,0,0) 100%)",
          }}
        >
          {isOwner ? (
            <div className="pointer-events-auto flex items-center justify-between pb-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void openAudienceSheet("views");
                }}
                className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm transition-transform active:scale-95"
              >
                <Eye size={13} style={{ color: "#00ff88" }} />
                <span className="text-xs font-semibold text-white/80">
                  {story.viewCount} {story.viewCount === 1 ? "view" : "views"}
                </span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(story.id);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition-transform active:scale-95"
                  style={{ background: "rgba(255,68,68,0.15)" }}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </div>
          ) : (
            <div
              className="pointer-events-auto flex items-center gap-2"
              onClick={(event) => event.stopPropagation()}
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
                  background: replyFocused
                    ? "rgba(0,0,0,0.65)"
                    : "rgba(255,255,255,0.10)",
                  borderColor: replyFocused
                    ? "rgba(0,255,136,0.55)"
                    : "rgba(255,255,255,0.18)",
                  boxShadow: replyFocused
                    ? "0 0 0 1px rgba(0,255,136,0.25)"
                    : "none",
                }}
              >
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
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
                {replyText.trim() && (
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

        {isPaused && !replyFocused && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              <div className="flex gap-[5px]">
                <div className="h-5 w-[5px] rounded-full bg-white" />
                <div className="h-5 w-[5px] rounded-full bg-white" />
              </div>
            </div>
          </div>
        )}

        {showAudienceSheet && isOwner && (
          <div
            className="app-modal-backdrop absolute inset-0 z-[70] flex items-end bg-black/70"
            onClick={() => setShowAudienceSheet(false)}
          >
            <div
              className="app-modal-sheet w-full rounded-t-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,18,0.98),rgba(10,12,10,0.99))] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-4 shadow-[0_-20px_40px_rgba(0,0,0,0.38)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/15" />
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Story Activity</p>
                  <p className="text-xs text-white/45">
                    Views, likes, and hates for this story
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAudienceSheet(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/75"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
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
                      onClick={() => setAudienceTab(tabKey)}
                      className={`rounded-[22px] border px-3 py-3 text-left transition-all ${
                        active
                          ? "border-[#4ade80]/30 bg-[#4ade80]/10"
                          : "border-white/8 bg-white/[0.03]"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2 text-white/70">
                        {icon}
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                          {label}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-white">{count}</div>
                    </button>
                  );
                })}
              </div>

              <div className="max-h-[42vh] overflow-y-auto">
                {audienceLoading && !storyAudience ? (
                  <div className="flex items-center justify-center py-10 text-sm text-white/55">
                    Loading story activity...
                  </div>
                ) : audienceEntries.length === 0 ? (
                  <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-white/80">
                      No {audienceTab} yet
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      This story does not have any {audienceTab} to show right now.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {audienceEntries.map((entry) => (
                      <div
                        key={`${audienceTab}-${entry.userId}`}
                        className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-3.5 py-3"
                      >
                        <Avatar
                          src={entry.avatar}
                          alt={entry.displayName}
                          userId={entry.userId}
                          username={entry.username}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {entry.username}
                          </p>
                          <p className="truncate text-xs text-white/45">
                            {entry.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


