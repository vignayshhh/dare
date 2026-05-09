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
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  storyService,
  type StoryDTO,
  type StoryAudienceDTO,
} from "../../middleware/services/story.service";
import { storyReactionService } from "../../middleware/services/story-reaction.service";

const STORY_DURATION = 5000;

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

    video.play().catch(() => {});
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
      video.play().catch(() => {});
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
    if (!story || story.media.type === "video") {
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
  }, [goNext, isPaused, mediaLoaded, story]);

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

  return (
    <div
      className="fixed inset-0 flex items-start justify-center overflow-hidden"
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
        className="relative flex h-screen w-full select-none flex-col overflow-hidden"
        style={{
          maxWidth: 430,
          opacity: visible && !exiting ? 1 : 0,
          transition: "opacity 220ms ease",
          overscrollBehavior: "none",
          touchAction: "none",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onClickZone}
      >
        <div className="absolute left-0 right-0 top-0 z-30 flex gap-1 px-2 pt-2">
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
                className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <div
                  className="h-full bg-[#00ff88] transition-all duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            );
          })}
        </div>

        <div className="absolute inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
          {!mediaLoaded && (
            <div
              className="absolute inset-0 z-10"
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
              className="h-full max-h-full w-full max-w-full object-contain"
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
              style={{ pointerEvents: "none" }}
            />
          ) : (
            <img
              key={mediaKey ?? story.id}
              src={story.media.url || undefined}
              alt={story.caption ?? "Story"}
              className="h-full max-h-full w-full max-w-full object-contain"
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
              style={{ pointerEvents: "none" }}
            />
          )}

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 22%, transparent 75%, rgba(0,0,0,0.3) 100%)",
            }}
          />
        </div>

        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-3 pb-6 pt-8">
          <div className="pointer-events-auto flex items-center gap-2.5">
            <button
              type="button"
              className="shrink-0"
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
                size="sm"
                userId={story.author.id}
                className="ring-2 ring-white/70 shadow-lg"
              />
            </button>
            <div className="pointer-events-none">
              <p
                className="text-sm font-semibold leading-tight text-white"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}
              >
                {story.author.displayName}
              </p>
              <p
                className="mt-0.5 text-[11px] text-white/65"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
              >
                {formatTimeAgo(story.createdAt)}
              </p>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {isVideo && (
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
          className="pointer-events-none absolute left-0 right-0 bottom-0 z-50 px-4"
          style={{
            bottom: "52px",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2px)",
            paddingTop: "14px",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 46%, rgba(0,0,0,0) 100%)",
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
            className="absolute inset-0 z-[70] flex items-end bg-black/70"
            onClick={() => setShowAudienceSheet(false)}
          >
            <div
              className="w-full rounded-t-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,18,0.98),rgba(10,12,10,0.99))] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-4 shadow-[0_-20px_40px_rgba(0,0,0,0.38)]"
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
