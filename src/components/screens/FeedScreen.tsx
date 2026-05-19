//feed screen
"use client";

import {
  Fragment,
  startTransition,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  type PointerEvent,
} from "react";
import {
  Heart,
  MessageCircle,
  Plus,
  MessageSquare,
  Send,
  Volume2,
  X,
  Music,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Gift,
  UserRound,
  ImagePlus,
  Check,
  Type,
  Wand2,
  Sparkles,
  Play,
  PauseCircle,
  MoreHorizontal,
  Pencil,
  Undo2,
  Redo2,
  Palette,
  AlignCenter,
  ChevronDown,
  ArrowRight,
  SlidersHorizontal,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { usePostsStore, type FeedPost } from "../../stores/usePostsStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useStoryStore } from "../../stores/useStoryStore";
import { useContentStore } from "../../stores/useContentStore";
import type {
  DarePost,
  TruthPost,
} from "../../middleware/adapters/data-adapters";
import {
  StoryDTO,
  CreateStoryDTO,
  StoryType,
  storyService,
} from "../../middleware/services/story.service";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  friendsService,
  type Friend,
} from "../../middleware/services/friends.service";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { useAlertStore } from "../../stores/useAlertStore";
import { useGhostModeStore } from "../../stores/useGhostModeStore";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useUserGhostModes } from "../../hooks/useUserGhostModes";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { GhostModeTimer } from "../ui/GhostModeTimer";
import { StoryViewer } from "../app/StoryViewer";
import { CommunityChallengePreviewScreen } from "./CommunityChallengePreviewScreen";
import { ChallengeHubScreen } from "./ChallengeHubScreen";
import {
  COMMUNITY_CHALLENGES,
  getCommunityChallengeTitle,
  type CommunityChallenge,
} from "./communityChallengeData";
import {
  communityChallengeService,
  type CommunityChallengeSummary,
} from "../../middleware/services/community-challenge.service";
import { ghostModeService } from "../../middleware/services/ghost-mode.service";
import { storyReactionService } from "../../middleware/services/story-reaction.service";
import alertService from "../../middleware/services/alert.service.new";
import {
  createGeneratedStoryMusicPlayer,
  STORY_FILTER_PRESETS,
  STORY_MUSIC_PRESETS,
  getStoryFilterPreset,
  getStoryMusicPreset,
  type StoryFilterId,
} from "../../utils/storyEnhancements";
import {
  buildSharedPostPayload,
  buildSharedStoryPayload,
  encodeSharedPostPayload,
  encodeSharedStoryPayload,
  SHARED_POST_FALLBACK_TEXT,
} from "../../utils/sharedPostMessage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserLikeEntry {
  userId: string;
  name: string;
  username: string;
  avatar: string;
  tapCount: number;
}

interface HeartBurst {
  id: number;
  x: number;
  y: number;
  scale: number;
  colorIdx: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOUBLE_TAP_DELAY = 320;
const BURST_LIFETIME = 950;
const LIKE_PREVIEW_BATCH_SIZE = 12;
const HEART_SIZES = [52, 68, 44, 60, 56];
const HEART_COLORS = [
  "#ff3b6b",
  "#ff6b9d",
  "#ff4d6d",
  "#ff758c",
  "#ff8fa3",
  "#f43f5e",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const totalLikes = (post: FeedPost) => {
  if (typeof post.likes_count === "number") {
    return post.likes_count;
  }
  return Object.keys(getLikesByUser(post)).length;
};

const getLikesByUser = (post?: FeedPost | null) => post?.likesByUser || {};

const totalLikeTaps = (post: FeedPost) =>
  Object.values(getLikesByUser(post)).reduce(
    (sum, entry) => sum + entry.tapCount,
    0,
  );

const iLiked = (post: FeedPost, currentUserId: string) =>
  (getLikesByUser(post)[currentUserId]?.tapCount ?? 0) > 0;

const formatNumber = (n: number | undefined) =>
  n === undefined || n === 0
    ? "0"
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toString();

const stripAtSymbol = (username?: string) =>
  (username || "unknown").replace(/^@/, "");

const getLikeEntryName = (entry: UserLikeEntry) =>
  stripAtSymbol(entry.username).trim() || entry.name?.trim() || "Someone";

const getLikeInitial = (entry: UserLikeEntry) =>
  getLikeEntryName(entry).charAt(0).toUpperCase() || "U";

const isDisplayableLikeEntry = (entry: UserLikeEntry) => {
  const name = entry.name?.trim().toLowerCase();
  const username = stripAtSymbol(entry.username).trim().toLowerCase();

  return (
    entry.tapCount > 0 &&
    Boolean(entry.userId) &&
    Boolean(name || username) &&
    !["anonymous", "unknown", "someone"].includes(name || "") &&
    !["anonymous", "unknown", "someone"].includes(username)
  );
};

const buildLikeSocialProof = (post: FeedPost) => {
  const totalPeople = totalLikes(post);
  if (totalPeople <= 0) return null;

  const entries = Object.values(getLikesByUser(post))
    .filter(isDisplayableLikeEntry)
    .sort((a, b) => b.tapCount - a.tapCount);
  const totalTaps = Math.max(totalLikeTaps(post), totalPeople);

  if (entries.length === 0) return null;

  const visible = entries.slice(0, 3);
  const primary = visible[0];
  const primaryName = getLikeEntryName(primary);
  const remainingPeople = Math.max(totalPeople - 1, 0);
  const primaryTapText = `liked ${formatNumber(primary.tapCount)} ${
    primary.tapCount === 1 ? "time" : "times"
  }`;

  return {
    avatars: visible,
    lead: primaryName,
    rest:
      remainingPeople > 0
        ? `${primaryTapText} with ${formatNumber(remainingPeople)} ${remainingPeople === 1 ? "other" : "others"}`
        : primary.tapCount > 1
          ? primaryTapText
          : totalTaps > 1
            ? `liked ${formatNumber(totalTaps)} times`
            : "liked this",
  };
};

const getStoryCreatedAtTime = (story: StoryDTO) => {
  const createdAt = new Date(story.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const sortStoriesForPlayback = (stories: StoryDTO[]) =>
  [...stories].sort((a, b) => {
    const timeDifference = getStoryCreatedAtTime(a) - getStoryCreatedAtTime(b);
    return timeDifference || a.id.localeCompare(b.id);
  });

const STORY_REPLY_PAYLOAD_URL_LIMIT = 7000;
const STORY_REPLY_ENCODED_PAYLOAD_LIMIT = 15000;
const STORY_TEXT_COLORS = [
  "#ffffff",
  "#4ade80",
  "#facc15",
  "#fb7185",
  "#38bdf8",
];
const STORY_TEXT_FONTS = ["Bubble", "Deco", "Squeeze", "Typewriter", "Classic"];
const STORY_TEXT_SIZE_MIN = 16;
const STORY_TEXT_SIZE_MAX = 72;
const STORY_BRUSHES = ["Pen", "Neon", "Marker", "Chalk"] as const;
const STORY_TEXT_VERTICAL_SNAP_THRESHOLD = 2.4;
const STORY_MEDIA_VERTICAL_SNAP_THRESHOLD = 18;

type StoryComposerStage = "audience" | "capture" | "editor";
type StoryGallerySnap = 25 | 60 | 100;
type StoryBrushId = (typeof STORY_BRUSHES)[number];

function smoothSnapToCenter(value: number, center: number, threshold: number) {
  const distance = value - center;
  const absoluteDistance = Math.abs(distance);
  if (absoluteDistance > threshold) {
    return { value, snapped: false };
  }

  const closeness = 1 - absoluteDistance / threshold;
  const pull = 0.38 + closeness * 0.42;
  const snappedValue = value - distance * pull;

  return {
    value:
      Math.abs(snappedValue - center) < threshold * 0.08
        ? center
        : snappedValue,
    snapped: true,
  };
}

async function createStoryReplyPreviewUrl(story: StoryDTO): Promise<string> {
  const mediaUrl = story.media.url;
  if (!mediaUrl) return "";

  if (!mediaUrl.startsWith("data:")) {
    return mediaUrl.length <= STORY_REPLY_PAYLOAD_URL_LIMIT ? mediaUrl : "";
  }

  if (story.media.type !== "image") {
    return "";
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxWidth = 120;
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        const thumbnail = canvas.toDataURL("image/jpeg", 0.42);
        resolve(
          thumbnail.length <= STORY_REPLY_PAYLOAD_URL_LIMIT ? thumbnail : "",
        );
      } catch (error) {
        console.error("Failed to create story reply preview:", error);
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = mediaUrl;
  });
}

// ---------------------------------------------------------------------------
// HeartBurstLayer
// ---------------------------------------------------------------------------

function HeartBurstLayer({ bursts }: { bursts: HeartBurst[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden z-10">
      {bursts.map((burst) => {
        const size = HEART_SIZES[burst.id % HEART_SIZES.length];
        const color = HEART_COLORS[burst.colorIdx % HEART_COLORS.length];
        return (
          <div
            key={burst.id}
            style={{
              position: "absolute",
              left: burst.x - size / 2,
              top: burst.y - size / 2,
              width: size,
              height: size,
              /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
              /* DISABLED: pointerEvents: "none", */
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -size * 0.6,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}60 0%, transparent 68%)`,
                animation: `hbGlow ${BURST_LIFETIME}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: `2px solid ${color}80`,
                animation: `hbRing ${BURST_LIFETIME * 0.75}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                animation: `hbFloat ${BURST_LIFETIME}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                transformOrigin: "center bottom",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill={color}
                width={size}
                height={size}
                style={{
                  filter: `drop-shadow(0 0 ${size * 0.18}px ${color}dd) drop-shadow(0 2px 6px #0008)`,
                  transform: `scale(${burst.scale})`,
                  transformOrigin: "center",
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostSkeleton — shimmer placeholder while posts load
// ---------------------------------------------------------------------------

function PostSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] shadow-[0_22px_62px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)] animate-pulse">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.68),rgba(14,165,233,0.38),rgba(74,222,128,0))]" />
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <div className="h-[42px] w-[42px] rounded-full bg-[#1a2a1a]/60 ring-2 ring-[#4ade80]/20" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-28 bg-[#1a2a1a]/60 rounded mb-1.5" />
          <div className="h-3 w-20 bg-[#1a2a1a]/50 rounded" />
        </div>
      </div>
      {/* Media skeleton */}
      <div className="px-1">
        <div
          className="w-full bg-[#0a120a]/80 rounded-3xl"
          style={{ height: "500px" }}
        />
      </div>
      {/* Actions skeleton */}
      <div className="px-3 pt-3">
        <div className="flex items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] px-4 py-3">
          <div className="h-[42px] flex-1 bg-[#1a2a1a]/50 rounded-full" />
          <div className="h-[42px] flex-1 bg-[#1a2a1a]/50 rounded-full" />
          <div className="h-[42px] w-[42px] bg-[#1a2a1a]/50 rounded-full" />
        </div>
      </div>
      {/* Caption skeleton */}
      <div className="px-4 pt-3 pb-5">
        <div className="h-4 w-3/4 bg-[#1a2a1a]/60 rounded mb-2" />
        <div className="h-3 w-24 bg-[#1a2a1a]/50 rounded" />
      </div>
    </div>
  );
}

const COMMUNITY_RAIL_REPEAT_EVERY = 12;
const SOCIAL_DARES_RAIL_FIRST_INSERT_AFTER = 3;
const TRUTHS_RAIL_FIRST_INSERT_AFTER = 6;
const COMMUNITY_RAIL_FIRST_INSERT_AFTER = 9;
const SOCIAL_CONTENT_RAIL_REPEAT_EVERY = 12;

const shouldShowRailAfterPost = (
  postIndex: number,
  totalPosts: number,
  firstInsertAfter: number,
  repeatEvery: number,
) => {
  const visiblePostNumber = postIndex + 1;
  if (totalPosts < firstInsertAfter) return false;
  if (visiblePostNumber === firstInsertAfter) return true;
  if (visiblePostNumber < firstInsertAfter) return false;
  return (visiblePostNumber - firstInsertAfter) % repeatEvery === 0;
};

const getCreatedAtMs = (createdAt?: string) => {
  if (!createdAt) return 0;
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTruthPreviewText = (truth: TruthPost) =>
  truth.answer?.trim() || truth.question;

const getTruthRailActor = (truth: TruthPost) => truth.receiver || truth.challenger;

const getTruthRailAction = (truth: TruthPost) =>
  truth.answer?.trim() ? "answered" : "was asked";

const getCommunityRailJoinPreviewText = (challenges: CommunityChallenge[]) => {
  const joinedUsers = challenges
    .flatMap((challenge) => challenge.joinPreview || [])
    .filter((user, index, users) => {
      return (
        user?.id &&
        users.findIndex((candidate) => candidate.id === user.id) === index
      );
    })
    .slice(0, 3);

  if (joinedUsers.length === 0) return "Open now";

  const names = joinedUsers.map(
    (user) => user.username || user.displayName || "Someone",
  );

  if (names.length === 1) return `${names[0]} joined recently`;
  if (names.length === 2) return `${names[0]} and ${names[1]} joined recently`;
  return `${names[0]}, ${names[1]} and ${names[2]} joined recently`;
};

function CommunityDareFeedRail({
  challenges,
  joinedChallengeIds,
  onPreview,
  onExploreAll,
}: {
  challenges: CommunityChallenge[];
  joinedChallengeIds: Set<string>;
  onPreview: (challenge: CommunityChallenge) => void;
  onExploreAll: () => void;
}) {
  const displayChallenges = challenges.slice(0, 5);
  const joinPreviewText = getCommunityRailJoinPreviewText(displayChallenges);

  return (
    <section
      aria-label="Community dares"
      className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,23,18,0.94),rgba(7,10,8,0.98))] py-3 shadow-[0_16px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)]"
    >
      <style>{`
        .community-feed-rail::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.58),rgba(56,189,248,0.28),transparent)]" />
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#4ade80]/20 bg-[#4ade80]/12 text-[#86efac] shadow-[0_10px_24px_rgba(74,222,128,0.08)]">
              <Sparkles size={16} fill="currentColor" strokeWidth={0} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-black uppercase tracking-[0.13em] text-[#bbf7d0]">
                Community dares
              </p>
              <p className="truncate text-xs font-semibold text-[#7c8c80]">
                {joinPreviewText}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onExploreAll}
          className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white transition-colors hover:border-[#4ade80]/30 hover:text-[#86efac]"
          aria-label="Explore community dares"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div
        className="community-feed-rail flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          scrollPaddingInline: "16px",
        }}
      >
        {displayChallenges.map((challenge) => {
          const challengeTitle = getCommunityChallengeTitle(challenge);
          const isJoined = joinedChallengeIds.has(challenge.id);
          const hasStarted = challenge.batchStatus === "started";

          return (
            <button
              key={challenge.id}
              type="button"
              onClick={() => onPreview(challenge)}
              className="app-pressable relative flex h-[228px] w-[148px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[24px] border text-left shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.985]"
              style={{
                borderColor: `${challenge.accent}38`,
                background:
                  "linear-gradient(180deg, rgba(10,15,11,0.98), rgba(5,8,6,0.99))",
              }}
              aria-label={`Open ${challengeTitle}`}
            >
              {challenge.imageUrl && (
                <img
                  src={challenge.imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition: challenge.imagePosition || "center",
                  }}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background: challenge.imageUrl
                    ? "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.22) 38%, rgba(0,0,0,0.82) 100%)"
                    : challenge.banner,
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full opacity-30 blur-2xl"
                style={{ backgroundColor: challenge.accent }}
              />
              <span className="relative z-[1] m-2.5 inline-flex w-fit items-center rounded-full border border-white/12 bg-black/42 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/84 shadow-[0_10px_22px_rgba(0,0,0,0.28)] backdrop-blur-md">
                {hasStarted && !isJoined
                  ? "Wait next batch"
                  : isJoined
                    ? "Joined"
                    : challenge.durationLabel}
              </span>
              <div className="relative z-[1] mt-auto p-3">
                <span className="mb-2 inline-flex rounded-full border border-[#4ade80]/18 bg-[#4ade80]/12 px-2 py-0.5 text-[8.5px] font-black uppercase tracking-[0.12em] text-[#bbf7d0]">
                  Dare official
                </span>
                <p className="line-clamp-4 text-[14px] font-black uppercase leading-[1.08] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                  {challengeTitle}
                </p>
                <p className="mt-1.5 truncate text-[10px] font-bold text-white/68">
                  {challenge.joinedCount > 0
                    ? `${challenge.joinedCount} joined`
                    : "Open community run"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SocialDaresFeedRail({
  dares,
  onExploreAll,
  onOpenDare,
}: {
  dares: DarePost[];
  onExploreAll: () => void;
  onOpenDare: (dare: DarePost) => void;
}) {
  if (dares.length === 0) return null;

  return (
    <section
      aria-label="Social dares"
      className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,23,20,0.94),rgba(7,9,8,0.98))] py-3 shadow-[0_16px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)]"
    >
      <style>{`
        .feed-inline-rail::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.62),rgba(56,189,248,0.34),transparent)]" />
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#4ade80]/22 bg-[#4ade80]/12 text-[#86efac] shadow-[0_10px_24px_rgba(74,222,128,0.1)]">
            <Trophy size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black uppercase tracking-[0.13em] text-[#bbf7d0]">
              Social dares
            </p>
            <p className="truncate text-xs font-semibold text-[#7c8c80]">
              Challenges your friends completed
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExploreAll}
          className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white transition-colors hover:border-[#4ade80]/30 hover:text-[#86efac]"
          aria-label="Explore social dares"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div
        className="feed-inline-rail flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          scrollPaddingInline: "16px",
        }}
      >
        {dares.map((dare) => {
          const thumbnailUrl = dare.proof?.thumbnail || dare.proof?.url;

          return (
            <button
              key={dare.id}
              type="button"
              onClick={() => onOpenDare(dare)}
              className="app-pressable relative flex h-[224px] w-[188px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[24px] border border-white/10 bg-[#030403] p-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.985]"
              aria-label={`Open dare ${dare.description}`}
            >
              {thumbnailUrl ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-42 blur-xl"
                    loading="lazy"
                  />
                  <img
                    src={thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                </>
              ) : (
                <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(74,222,128,0.16),rgba(56,189,248,0.1),rgba(8,12,10,0.98))]" />
              )}
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.2)_44%,rgba(0,0,0,0.9))]" />
              <span className="relative z-[1] line-clamp-3 text-[14px] font-black uppercase leading-[1.08] text-white">
                {dare.description}
              </span>
              <div className="relative z-[1] mt-2 flex min-w-0 items-center gap-1 text-[10.5px] font-bold leading-none text-white/72">
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <Avatar
                    src={dare.challenger.avatar}
                    alt={dare.challenger.nickname}
                    size={17}
                    userId={dare.challengerId}
                    username={dare.challenger.nickname}
                    disableGhostMode
                    className="shrink-0 border border-white/12 bg-black/35"
                  />
                  <span className="truncate">{dare.challenger.nickname}</span>
                </span>
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-[#4ade80] drop-shadow-[0_0_10px_rgba(74,222,128,0.55)]">
                  DARED
                </span>
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <Avatar
                    src={dare.receiver.avatar}
                    alt={dare.receiver.nickname}
                    size={17}
                    userId={dare.receiverId}
                    username={dare.receiver.nickname}
                    disableGhostMode
                    className="shrink-0 border border-white/12 bg-black/35"
                  />
                  <span className="truncate">{dare.receiver.nickname}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TruthsFeedRail({
  truths,
  onExploreAll,
  onOpenTruth,
}: {
  truths: TruthPost[];
  onExploreAll: () => void;
  onOpenTruth: (truth: TruthPost) => void;
}) {
  if (truths.length === 0) return null;

  return (
    <section
      aria-label="Truths"
      className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,22,19,0.94),rgba(6,9,8,0.98))] py-3 shadow-[0_16px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)]"
    >
      <style>{`
        .feed-inline-rail::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.62),rgba(56,189,248,0.34),transparent)]" />
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#4ade80]/20 bg-[#4ade80]/12 text-[#86efac] shadow-[0_10px_24px_rgba(74,222,128,0.08)]">
            <MessageSquare size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black uppercase tracking-[0.13em] text-[#bbf7d0]">
              Truths
            </p>
            <p className="truncate text-xs font-semibold text-[#7c8c80]">
              Fresh answers from friends
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExploreAll}
          className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white transition-colors hover:border-[#4ade80]/30 hover:text-[#86efac]"
          aria-label="Explore truths"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div
        className="feed-inline-rail flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          scrollPaddingInline: "16px",
        }}
      >
        {truths.map((truth) => {
          const actor = getTruthRailActor(truth);
          const action = getTruthRailAction(truth);
          const actorName = actor.nickname || "Someone";
          const question = truth.question?.trim() || getTruthPreviewText(truth);

          return (
            <button
              key={truth.id}
              type="button"
              onClick={() => onOpenTruth(truth)}
              className="app-pressable relative flex h-[156px] w-[286px] shrink-0 snap-start flex-col overflow-hidden rounded-[24px] border border-[#4ade80]/16 bg-[linear-gradient(145deg,rgba(74,222,128,0.12),rgba(255,255,255,0.045)_48%,rgba(56,189,248,0.1)),linear-gradient(180deg,rgba(9,15,12,0.98),rgba(5,8,6,0.99))] p-3.5 text-left shadow-[0_16px_34px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.985]"
              aria-label={`${actorName} ${action} ${question}`}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-[#4ade80] opacity-16 blur-2xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.6),rgba(56,189,248,0.3),transparent)]"
              />

              <div className="relative z-[1] flex items-start gap-3">
                <Avatar
                  src={actor.avatar}
                  alt={actorName}
                  size={40}
                  fallbackText={actorName.charAt(0)}
                  style={{
                    border: "2px solid rgba(3,4,3,0.94)",
                    boxShadow:
                      "0 0 0 1px rgba(74,222,128,0.24), 0 10px 24px rgba(0,0,0,0.34)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-black leading-tight text-white">
                    {actorName}
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                    {action}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-black/28 px-2 py-1 text-[9.5px] font-black uppercase tracking-[0.12em] text-[#bbf7d0]">
                  Truth
                </span>
              </div>

              <p className="relative z-[1] mt-2.5 line-clamp-4 text-[15px] font-black leading-[1.22] text-white">
                <span className="inline-flex max-w-full items-center gap-1.5 align-middle text-[#94a3b8]">
                  <Avatar
                    src={actor.avatar}
                    alt={actorName}
                    size={18}
                    fallbackText={actorName.charAt(0)}
                    className="shrink-0 border border-white/12 bg-black/35"
                  />
                  <span className="truncate">{actorName}</span>
                  <span>{action}</span>
                </span>{" "}
                {question}
              </p>

              <div className="relative z-[1] mt-1.5 flex min-w-0 items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-white/54">
                <span className="shrink-0">Question from</span>
                <Avatar
                  src={truth.challenger.avatar}
                  alt={truth.challenger.nickname}
                  size={16}
                  fallbackText={truth.challenger.nickname.charAt(0)}
                  className="shrink-0 border border-white/10 bg-black/35"
                />
                <span className="truncate">{truth.challenger.nickname}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main FeedScreen
// ---------------------------------------------------------------------------

export function FeedScreen({
  isActive = true,
  onBack,
  onCreatePost,
  onNavigateToChat,
  onNavigateToAlerts,
  onNavigateToSearch,
  onNavigateToDares,
  onNavigateToSocialDares,
  onNavigateToTruths,
  onNavigateToCommunityDares,
  onNavigateToDareCenter,
  onNavigateToProfile,
  onStoryComposerOpenChange,
  onStoryViewerOpenChange,
}: {
  isActive?: boolean;
  onBack: () => void;
  onCreatePost: () => void;
  onNavigateToChat: () => void;
  onNavigateToAlerts: () => void;
  onNavigateToSearch: () => void;
  onNavigateToDares: () => void;
  onNavigateToSocialDares: (dare?: DarePost) => void;
  onNavigateToTruths: (truth?: TruthPost) => void;
  onNavigateToCommunityDares: () => void;
  onNavigateToDareCenter: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onStoryComposerOpenChange?: (isOpen: boolean) => void;
  onStoryViewerOpenChange?: (isOpen: boolean) => void;
}) {
  const { getOrCreateConversation, sendRealTimeMessage } = useMessagingStore();
  const unreadCount = useMessagingStore((s) =>
    s.conversations.reduce(
      (total: number, conv: any) => total + (conv.unread_count || 0),
      0,
    ),
  );
  const {
    posts,
    loading,
    feedBootstrapping,
    addLike: storeAddLike,
    addComment: storeAddComment,
    likeComment: storeLikeComment,
    incrementViews: storeIncrementViews,
    subscribeToPostComments,
    unsubscribeFromPostComments,
    subscribeToPostLikes,
    unsubscribeFromPostLikes,
    loadPostLikePreviews,
    loadMorePosts,
  } = usePostsStore();
  const {
    truthPosts,
    darePosts,
    truthPostsUserId,
    darePostsUserId,
    truthPostsScope,
    darePostsScope,
    loadTruthPosts,
    loadDarePosts,
  } = useContentStore();
  const { user } = useAuthStore();
  const userProfiles = useProfileDataStore((s) => s.userProfiles);
  const currentDisplayName = useProfileDataStore((s) => s.currentDisplayName);
  const currentUsername = useProfileDataStore((s) => s.currentUsername);
  const currentProfileUserId = useProfileDataStore((s) => s.currentUserId);
  const alertUnreadCount = useAlertStore((s) => s.unreadCount);
  const { subscribeToAlerts: subscribeAlerts, markAllAsRead } = useAlertStore();
  const ghostModeIsActive = useGhostModeStore((s) => s.isActive);
  const { checkGhostModeStatus, subscribeToGhostMode } = useGhostModeStore();

  // Initialize ghost mode status and subscribe to updates
  useEffect(() => {
    if (user?.id) {
      // Check initial ghost mode status
      checkGhostModeStatus(user.id);

      // Subscribe to real-time ghost mode changes
      const unsub = subscribeToGhostMode(user.id);
      return () => {
        if (unsub) unsub();
      };
    }
  }, [user?.id, checkGhostModeStatus, subscribeToGhostMode]);

  // Subscribe to alerts early so badge count is live
  useEffect(() => {
    if (isActive && user?.id) {
      const unsub = subscribeAlerts(user.id);
      return () => {
        if (unsub) unsub();
      };
    }
  }, [isActive, user?.id]);

  // Helper: resolve author display name and username from profileDataStore
  const resolveAuthor = useCallback(
    (author: {
      id?: string;
      name: string;
      username: string;
      avatar: string;
    }) => {
      const authorId = author.id;
      const isCurrentUser =
        authorId && currentProfileUserId && authorId === currentProfileUserId;

      let name = author.name;
      let username = author.username;

      if (isCurrentUser && currentDisplayName) {
        name = currentDisplayName;
      } else if (authorId && userProfiles[authorId]) {
        name = userProfiles[authorId].displayName || name;
      }

      if (isCurrentUser && currentUsername) {
        username = currentUsername;
      } else if (authorId && userProfiles[authorId]) {
        username = userProfiles[authorId].username || username;
      }

      return { ...author, name, username };
    },
    [userProfiles, currentDisplayName, currentUsername, currentProfileUserId],
  );

  const [showLikesModal, setShowLikesModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDareCenterPrompt, setShowDareCenterPrompt] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [animatingPosts, setAnimatingPosts] = useState<Set<string>>(new Set());
  const [showStoryTypeSheet, setShowStoryTypeSheet] = useState(false);
  const [showStoryUploadModal, setShowStoryUploadModal] = useState(false);
  const [storyComposerStage, setStoryComposerStage] =
    useState<StoryComposerStage>("audience");
  const [storyPostedPulse, setStoryPostedPulse] = useState(false);
  const [storyUploadMode, setStoryUploadMode] = useState<StoryType | null>(
    null,
  );
  const [storyGallerySnap, setStoryGallerySnap] =
    useState<StoryGallerySnap>(25);
  const [dedicationRecipient, setDedicationRecipient] = useState<Friend | null>(
    null,
  );
  const [storyDraftFiles, setStoryDraftFiles] = useState<File[]>([]);
  const [storyDraftPreviewUrls, setStoryDraftPreviewUrls] = useState<string[]>(
    [],
  );
  const [selectedStoryDraftIndex, setSelectedStoryDraftIndex] = useState(0);
  const [storyMediaTransform, setStoryMediaTransform] = useState({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  });
  const [isStoryMediaDragging, setIsStoryMediaDragging] = useState(false);
  const [storyDraftText, setStoryDraftText] = useState("");
  const [storyDraftTextColor, setStoryDraftTextColor] = useState("#ffffff");
  const [storyDraftTextX, setStoryDraftTextX] = useState(50);
  const [storyDraftTextY, setStoryDraftTextY] = useState(50);
  const [storyDraftTextSize, setStoryDraftTextSize] = useState(22);
  const [storyDraftTextScale, setStoryDraftTextScale] = useState(1);
  const [storyDraftTextRotation, setStoryDraftTextRotation] = useState(0);
  const [storyDraftTextFont, setStoryDraftTextFont] = useState("Bubble");
  const [storyDraftTextBg, setStoryDraftTextBg] = useState(true);
  const [storyDraftTextAlign, setStoryDraftTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [isStoryTextDragging, setIsStoryTextDragging] = useState(false);
  const [isStoryTextEditorOpen, setIsStoryTextEditorOpen] = useState(false);
  const [storyTextSelected, setStoryTextSelected] = useState(false);
  const [storyDeleteActive, setStoryDeleteActive] = useState(false);
  const [storyDeleteArmed, setStoryDeleteArmed] = useState(false);
  const [storyDraftFilter, setStoryDraftFilter] =
    useState<StoryFilterId>("original");
  const [storyDraftMusicId, setStoryDraftMusicId] = useState("none");
  const [storyPublishAudience, setStoryPublishAudience] = useState<
    "story" | "close-friends"
  >("story");
  const [storyToolbarCollapsed, setStoryToolbarCollapsed] = useState(false);
  const [isStoryMusicModalOpen, setIsStoryMusicModalOpen] = useState(false);
  const [storyMusicSearch, setStoryMusicSearch] = useState("");
  const [storyMusicTrim, setStoryMusicTrim] = useState(15);
  const [storyPreviewMusicId, setStoryPreviewMusicId] = useState<string | null>(
    null,
  );
  const [isStoryDrawMode, setIsStoryDrawMode] = useState(false);
  const [storyBrush, setStoryBrush] = useState<StoryBrushId>("Pen");
  const [storyBrushSize, setStoryBrushSize] = useState(7);
  const [storyBrushColor, setStoryBrushColor] = useState("#ffffff");
  const [storyDrawPaths, setStoryDrawPaths] = useState<
    {
      id: string;
      d: string;
      color: string;
      width: number;
      brush: StoryBrushId;
    }[]
  >([]);
  const [showStoryViewerModal, setShowStoryViewerModal] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [viewerStories, setViewerStories] = useState<StoryDTO[]>([]);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [viewerStoryAuthorId, setViewerStoryAuthorId] = useState<string | null>(
    null,
  );
  const [ghostDebugLoading, setGhostDebugLoading] = useState(false);
  const [ghostDebugText, setGhostDebugText] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingRecipientId, setSendingRecipientId] = useState<string | null>(
    null,
  );
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedCommunityChallenge, setSelectedCommunityChallenge] =
    useState<CommunityChallenge | null>(null);
  const [showCommunityChallengeHub, setShowCommunityChallengeHub] =
    useState(false);
  const [communityChallengeSummaries, setCommunityChallengeSummaries] =
    useState<Record<string, CommunityChallengeSummary>>({});
  const [joinedCommunityChallengeIds, setJoinedCommunityChallengeIds] =
    useState<Set<string>>(() => new Set());
  const storyDraftFile = storyDraftFiles[selectedStoryDraftIndex] ?? null;
  const storyDraftPreviewUrl =
    storyDraftPreviewUrls[selectedStoryDraftIndex] ?? "";
  const filteredStoryMusicPresets = useMemo(() => {
    const query = storyMusicSearch.trim().toLowerCase();
    if (!query) return STORY_MUSIC_PRESETS;
    return STORY_MUSIC_PRESETS.filter(
      (music) =>
        music.label.toLowerCase().includes(query) ||
        music.description.toLowerCase().includes(query),
    );
  }, [storyMusicSearch]);

  const {
    stories,
    userStories,
    isLoading: storiesLoading,
    markStoryAsViewed,
    deleteStory,
    isUploading,
    uploadProgress,
    cleanupExpiredStories,
    subscribeToFriendsStories,
    subscribeToUserStories,
    unsubscribeFromAllStories,
  } = useStoryStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const postsCountRef = useRef(0);
  const exhaustedLoadAttemptsRef = useRef(0);
  const hasScrolledSinceFeedActivatedRef = useRef(false);
  const requestedLikePreviewPostIdsRef = useRef<Set<string>>(new Set());
  const [likePreviewBatchTick, setLikePreviewBatchTick] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  const [bursts, setBursts] = useState<Record<string, HeartBurst[]>>({});
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const burstIdCounter = useRef(0);
  const colorCounterRef = useRef(0);
  const storyDraftPreviewRef = useRef<HTMLDivElement | null>(null);
  const storyMediaMainRef = useRef<HTMLDivElement | null>(null);
  const storyTextLayerRef = useRef<HTMLDivElement | null>(null);
  const storyDraftPreviewUrlsRef = useRef<string[]>([]);
  const storyFilterTouchStartXRef = useRef<number | null>(null);
  const storyGalleryTouchStartYRef = useRef<number | null>(null);
  const storyMediaPointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const storyMediaGestureRef = useRef<{
    distance: number;
    angle: number;
    centerX: number;
    centerY: number;
    startX: number;
    startY: number;
    transform: typeof storyMediaTransform;
  } | null>(null);
  const storyMediaVisualRef = useRef(storyMediaTransform);
  const storyMediaMovedRef = useRef(false);
  const storyTextPointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const storyTextGestureRef = useRef<{
    distance: number;
    angle: number;
    scale: number;
    rotation: number;
  } | null>(null);
  const storyTextDragOffsetRef = useRef({ x: 0, y: 0 });
  const storyTextVisualRef = useRef({
    x: storyDraftTextX,
    y: storyDraftTextY,
    scale: storyDraftTextScale,
    rotation: storyDraftTextRotation,
  });
  const storyTextPositionFrameRef = useRef<number | null>(null);
  const storyMediaPositionFrameRef = useRef<number | null>(null);
  const storyDeleteArmedRef = useRef(false);
  const storyTextWasEmptyBeforeEditRef = useRef(true);
  const storyTextTapStartRef = useRef<{ x: number; y: number } | null>(null);
  const storyTextMovedRef = useRef(false);
  const storyActiveDrawPathIdRef = useRef<string | null>(null);
  const storyTypeLongPressTimerRef = useRef<number | null>(null);
  const storyTypeLongPressTriggeredRef = useRef(false);
  const storyPreviewMusicPlayerRef = useRef<{ stop: () => void } | null>(null);
  const storyPostedPulseTimeoutRef = useRef<number | null>(null);
  const dareCenterLongPressTimerRef = useRef<number | null>(null);
  const dareCenterLongPressTriggeredRef = useRef(false);
  const storyTextVerticalSnapActiveRef = useRef(false);
  const storyMediaVerticalSnapActiveRef = useRef(false);

  const clearDareCenterLongPressTimer = useCallback(() => {
    if (dareCenterLongPressTimerRef.current !== null) {
      window.clearTimeout(dareCenterLongPressTimerRef.current);
      dareCenterLongPressTimerRef.current = null;
    }
  }, []);

  const openDareCenterPrompt = useCallback(() => {
    clearDareCenterLongPressTimer();
    dareCenterLongPressTriggeredRef.current = true;
    setIsHeaderVisible(true);
    setShowDareCenterPrompt(true);
  }, [clearDareCenterLongPressTimer]);

  const handleDareLogoPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      clearDareCenterLongPressTimer();
      dareCenterLongPressTriggeredRef.current = false;
      dareCenterLongPressTimerRef.current = window.setTimeout(() => {
        openDareCenterPrompt();
      }, 650);
    },
    [clearDareCenterLongPressTimer, openDareCenterPrompt],
  );

  const handleDareLogoPointerUp = useCallback(() => {
    clearDareCenterLongPressTimer();
  }, [clearDareCenterLongPressTimer]);

  const handleEnterDareCenter = useCallback(() => {
    setShowDareCenterPrompt(false);
    onNavigateToDareCenter();
  }, [onNavigateToDareCenter]);

  const hydratedCommunityChallenges = useMemo(
    () =>
      communityChallengeService.hydrateChallenges(
        COMMUNITY_CHALLENGES,
        communityChallengeSummaries,
      ),
    [communityChallengeSummaries],
  );

  const selectedHydratedCommunityChallenge = selectedCommunityChallenge
    ? hydratedCommunityChallenges.find(
        (challenge) => challenge.id === selectedCommunityChallenge.id,
      ) || selectedCommunityChallenge
    : null;

  const handleJoinCommunityChallenge = useCallback(
    async (challenge: CommunityChallenge) => {
      if (!user?.id) return;

      setJoinedCommunityChallengeIds((current) => {
        if (current.has(challenge.id)) return current;
        const next = new Set(current);
        next.add(challenge.id);
        return next;
      });

      const result = await communityChallengeService.joinChallenge(challenge, {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatar: user.avatar || "",
      });

      if (!result.success) {
        setJoinedCommunityChallengeIds((current) => {
          const next = new Set(current);
          next.delete(challenge.id);
          return next;
        });
      }
    },
    [user?.avatar, user?.displayName, user?.id, user?.username],
  );

  useEffect(() => {
    return () => clearDareCenterLongPressTimer();
  }, [clearDareCenterLongPressTimer]);

  useEffect(() => {
    return communityChallengeService.subscribeToSummaries(
      COMMUNITY_CHALLENGES.map((challenge) => challenge.id),
      setCommunityChallengeSummaries,
    );
  }, []);

  useEffect(() => {
    return communityChallengeService.subscribeToJoinedChallengeIds(
      user?.id,
      setJoinedCommunityChallengeIds,
    );
  }, [user?.id]);

  // ── Header hide/show logic ──
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY =
        window.scrollY || document.documentElement.scrollTop;
      const scrollDifference = currentScrollY - lastScrollY;

      // Hide header when scrolling down, show when scrolling up
      if (scrollDifference > 50) {
        setIsHeaderVisible(false);
      } else if (scrollDifference < -50) {
        setIsHeaderVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const currentUser = user
    ? {
        userId: user.id,
        name:
          currentProfileUserId === user.id && currentDisplayName
            ? currentDisplayName
            : user.displayName || user.username,
        username: (() => {
          const uname =
            currentProfileUserId === user.id && currentUsername
              ? currentUsername
              : user.username;
          return uname.startsWith("@") ? uname : `@${uname}`;
        })(),
        avatar: user.avatar || "", // Use actual avatar or empty string
      }
    : {
        userId: "me",
        name: "You",
        username: "@you",
        avatar: "https://picsum.photos/seed/you/100/100.jpg", // Only fallback if no user
      };

  // Subscribe to real-time feed before first paint to avoid stale persisted flashes
  useLayoutEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      usePostsStore.getState().subscribeToFeed(currentUser.userId);
    }
    return () => {
      usePostsStore.getState().unsubscribeFromFeed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentUser.userId]);

  useEffect(() => {
    if (!isActive || currentUser.userId === "me") return;

    const shouldLoadTruths =
      truthPostsUserId !== currentUser.userId || truthPostsScope !== "feed";
    const shouldLoadDares =
      darePostsUserId !== currentUser.userId || darePostsScope !== "feed";

    if (shouldLoadTruths) {
      void loadTruthPosts(false, "feed");
    }
    if (shouldLoadDares) {
      void loadDarePosts(false, "feed");
    }
  }, [
    currentUser.userId,
    darePostsScope,
    darePostsUserId,
    isActive,
    loadDarePosts,
    loadTruthPosts,
    truthPostsScope,
    truthPostsUserId,
  ]);

  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const aTime = new Date(a.timestamp).getTime();
        const bTime = new Date(b.timestamp).getTime();
        const normalizedATime = Number.isFinite(aTime) ? aTime : 0;
        const normalizedBTime = Number.isFinite(bTime) ? bTime : 0;

        if (normalizedBTime !== normalizedATime) {
          return normalizedBTime - normalizedATime;
        }

        return b.id.localeCompare(a.id);
      }),
    [posts],
  );

  const feedSocialDares = useMemo(
    () =>
      [...darePosts]
        .filter((dare) => dare.state === "ACCEPTED_REAL" && dare.proof?.url)
        .sort(
          (a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt),
        )
        .slice(0, 8),
    [darePosts],
  );

  const feedTruths = useMemo(
    () =>
      [...truthPosts]
        .filter((truth) => truth.state === "APPROVED" && truth.answer?.trim())
        .sort(
          (a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt),
        )
        .slice(0, 8),
    [truthPosts],
  );

  // Derive selectedPost from live store data (not a stale snapshot)
  const selectedPost = useMemo(
    () => sortedPosts.find((p) => p.id === selectedPostId) || null,
    [sortedPosts, selectedPostId],
  );

  useEffect(() => {
    if (!isActive || currentUser.userId === "me") return;

    const postIdsNeedingPreview = sortedPosts
      .filter((post) => {
        if (totalLikes(post) <= 0) return false;
        if (requestedLikePreviewPostIdsRef.current.has(post.id)) return false;
        return !Object.values(getLikesByUser(post)).some(isDisplayableLikeEntry);
      })
      .map((post) => post.id);

    if (postIdsNeedingPreview.length === 0) return;

    let cancelled = false;
    const batchPostIds = postIdsNeedingPreview.slice(0, LIKE_PREVIEW_BATCH_SIZE);

    batchPostIds.forEach((postId) =>
      requestedLikePreviewPostIdsRef.current.add(postId),
    );
    void loadPostLikePreviews(batchPostIds).finally(() => {
      if (cancelled) return;
      if (postIdsNeedingPreview.length > batchPostIds.length) {
        window.setTimeout(
          () => setLikePreviewBatchTick((tick) => tick + 1),
          80,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    currentUser.userId,
    isActive,
    likePreviewBatchTick,
    loadPostLikePreviews,
    sortedPosts,
  ]);

  const storyGroups = useMemo(() => {
    const groups = new Map<
      string,
      { authorId: string; latestAt: number; stories: StoryDTO[] }
    >();

    stories.forEach((story) => {
      const authorId = story.author.id;
      const createdAt = new Date(story.createdAt).getTime();
      const latestAt = Number.isFinite(createdAt) ? createdAt : 0;
      const existing = groups.get(authorId);

      if (existing) {
        existing.stories.push(story);
        existing.latestAt = Math.max(existing.latestAt, latestAt);
      } else {
        groups.set(authorId, {
          authorId,
          latestAt,
          stories: [story],
        });
      }
    });

    return Array.from(groups.values())
      .map((group) => {
        const playbackStories = sortStoriesForPlayback(group.stories);
        const displayStory =
          playbackStories.find((story) => !story.hasViewed) ??
          playbackStories[playbackStories.length - 1];

        return {
          ...group,
          stories: playbackStories,
          displayStory,
          hasViewed: playbackStories.every((story) => story.hasViewed),
        };
      })
      .filter((group) => Boolean(group.displayStory))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [stories]);
  const ghostModesByUserId = useUserGhostModes([
    ...stories.map((story) => story.author.id),
    ...stories
      .map((story) => story.dedicatedTo?.id)
      .filter((id): id is string => Boolean(id)),
    ...sortedPosts.map((post) => post.author.id),
    ...friends.map((friend) => friend.user_id || friend.id),
    ...(selectedPost
      ? Object.values(getLikesByUser(selectedPost)).map((entry) => entry.userId)
      : []),
  ]);

  // Real-time story subscriptions — fire immediately and keep circles live
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      void subscribeToFriendsStories(currentUser.userId);
      void subscribeToUserStories(currentUser.userId);
    }
    return () => {
      unsubscribeFromAllStories();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentUser.userId]);

  // Load friends for share modal
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      friendsService
        .getFriends(currentUser.userId)
        .then(setFriends)
        .catch(console.error);
    }
  }, [isActive, currentUser.userId]);

  // Cleanup expired story docs from Firestore every 5 minutes.
  // The onSnapshot subscription picks up the deletions automatically — no manual reload needed.
  useEffect(() => {
    if (currentUser.userId === "me") return;

    const interval = setInterval(
      () => {
        useStoryStore.getState().cleanupExpiredStories(currentUser.userId);
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [currentUser.userId]);

  // Handle opening comments from alert navigation
  useEffect(() => {
    const openCommentsForPost = sessionStorage.getItem("openCommentsForPost");
    const highlightPostId = sessionStorage.getItem("highlightPostId");

    if (openCommentsForPost && posts.length > 0) {
      const post = posts.find((p) => p.id === openCommentsForPost);
      if (post) {
        setSelectedPostId(post.id);
        setShowCommentsModal(true);
        // Clear the flags after using them
        sessionStorage.removeItem("openCommentsForPost");
        sessionStorage.removeItem("highlightPostId");
      }
    }
  }, [posts]);

  useEffect(() => {
    const highlightPostId = sessionStorage.getItem("highlightPostId");
    const openCommentsForPost = sessionStorage.getItem("openCommentsForPost");

    if (!highlightPostId || openCommentsForPost || posts.length === 0) return;

    const target = document.getElementById(`feed-post-${highlightPostId}`);
    if (!target) return;

    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      sessionStorage.removeItem("highlightPostId");
    }, 120);

    return () => window.clearTimeout(timer);
  }, [posts]);

  // Subscribe to likes/comments only for the post the user is interacting with
  // (instead of all visible posts, which created 40+ unnecessary listeners)
  useEffect(() => {
    if (!selectedPost) return;
    const postId = selectedPost.id;

    if (showLikesModal) {
      subscribeToPostLikes(postId);
      return () => unsubscribeFromPostLikes(postId);
    }
    if (showCommentsModal) {
      subscribeToPostComments(postId);
      return () => unsubscribeFromPostComments(postId);
    }
  }, [selectedPost?.id, showLikesModal, showCommentsModal]);

  // Reset spinner whenever the tab becomes inactive so it never shows on return
  useEffect(() => {
    if (!isActive) {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
      exhaustedLoadAttemptsRef.current = 0;
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    hasScrolledSinceFeedActivatedRef.current = false;
    const markScrolled = () => {
      hasScrolledSinceFeedActivatedRef.current = true;
    };

    window.addEventListener("scroll", markScrolled, { passive: true });
    window.addEventListener("wheel", markScrolled, { passive: true });
    window.addEventListener("touchmove", markScrolled, { passive: true });

    return () => {
      window.removeEventListener("scroll", markScrolled);
      window.removeEventListener("wheel", markScrolled);
      window.removeEventListener("touchmove", markScrolled);
    };
  }, [isActive]);

  useEffect(() => {
    postsCountRef.current = sortedPosts.length;
    if (sortedPosts.length === 0) {
      exhaustedLoadAttemptsRef.current = 0;
      setHasMorePosts(true);
    }
  }, [sortedPosts.length]);

  // ── Infinite Scroll ──
  // Dependency array intentionally excludes isLoadingMore — use a ref instead
  // so state updates never recreate the observer (which re-fires it immediately).
  useEffect(() => {
    if (!isActive || !hasMorePosts) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel || sortedPosts.length === 0) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (
          entries[0].isIntersecting &&
          hasScrolledSinceFeedActivatedRef.current &&
          !isLoadingMoreRef.current
        ) {
          const beforeCount = postsCountRef.current;
          isLoadingMoreRef.current = true;
          setIsLoadingMore(true);
          try {
            await loadMorePosts();
          } finally {
            const afterCount = postsCountRef.current;
            if (afterCount <= beforeCount) {
              exhaustedLoadAttemptsRef.current += 1;
              if (exhaustedLoadAttemptsRef.current >= 2) {
                setHasMorePosts(false);
              }
            } else {
              exhaustedLoadAttemptsRef.current = 0;
            }

            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
          }
        }
      },
      { rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMorePosts, isActive, sortedPosts.length, loadMorePosts]);

  useBodyScrollLock(
    showLikesModal ||
      showCommentsModal ||
      showShareModal ||
      showStoryTypeSheet ||
      showStoryUploadModal ||
      showStoryViewerModal ||
      showCommunityChallengeHub,
  );

  // ── Story handlers ──

  useEffect(() => {
    if (!showShareModal || !user?.id) return;

    let isActive = true;

    const loadFriendsForShare = async () => {
      setLoadingFriends(true);
      try {
        const response = await friendsService.getFriends(user.id);
        if (!isActive) return;
        setFriends(response || []);
      } catch (error) {
        console.error("Failed to load friends for sharing:", error);
        if (isActive) setFriends([]);
      } finally {
        if (isActive) setLoadingFriends(false);
      }
    };

    void loadFriendsForShare();

    return () => {
      isActive = false;
    };
  }, [showShareModal, user?.id]);

  useEffect(() => {
    if (
      !showStoryUploadModal ||
      storyUploadMode !== "dedication" ||
      !user?.id ||
      friends.length > 0
    ) {
      return;
    }

    let isMounted = true;
    setLoadingFriends(true);
    friendsService
      .getFriends(user.id)
      .then((response) => {
        if (isMounted) setFriends(response || []);
      })
      .catch((error) => {
        console.error("Failed to load friends for story dedication:", error);
        if (isMounted) setFriends([]);
      })
      .finally(() => {
        if (isMounted) setLoadingFriends(false);
      });

    return () => {
      isMounted = false;
    };
  }, [showStoryUploadModal, storyUploadMode, user?.id, friends.length]);

  useEffect(() => {
    storyDraftPreviewUrlsRef.current = storyDraftPreviewUrls;
  }, [storyDraftPreviewUrls]);

  const applyStoryMediaTransform = useCallback(() => {
    const element = storyMediaMainRef.current;
    if (!element) return;
    const { x, y, scale, rotation } = storyMediaVisualRef.current;
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotation}deg)`;
  }, []);

  const applyStoryTextTransform = useCallback(() => {
    const element = storyTextLayerRef.current;
    if (!element) return;
    const { x, y, scale, rotation } = storyTextVisualRef.current;
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
    element.style.transform = `translate3d(-50%, -50%, 0) scale(${scale}) rotate(${rotation}deg)`;
  }, []);

  useLayoutEffect(() => {
    storyMediaVisualRef.current = storyMediaTransform;
    applyStoryMediaTransform();
  }, [applyStoryMediaTransform, storyMediaTransform]);

  useLayoutEffect(() => {
    storyTextVisualRef.current = {
      x: storyDraftTextX,
      y: storyDraftTextY,
      scale: storyDraftTextScale,
      rotation: storyDraftTextRotation,
    };
    applyStoryTextTransform();
  }, [
    applyStoryTextTransform,
    storyDraftTextRotation,
    storyDraftTextScale,
    storyDraftTextX,
    storyDraftTextY,
  ]);

  useEffect(() => {
    onStoryComposerOpenChange?.(showStoryUploadModal || showStoryTypeSheet);
    return () => onStoryComposerOpenChange?.(false);
  }, [onStoryComposerOpenChange, showStoryTypeSheet, showStoryUploadModal]);

  useEffect(() => {
    if (!isStoryMusicModalOpen) {
      stopStoryMusicPreview();
    }
  }, [isStoryMusicModalOpen]);

  useEffect(() => {
    return () => {
      storyDraftPreviewUrlsRef.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
      storyPreviewMusicPlayerRef.current?.stop();
      if (storyTypeLongPressTimerRef.current !== null) {
        window.clearTimeout(storyTypeLongPressTimerRef.current);
      }
      if (storyPostedPulseTimeoutRef.current !== null) {
        window.clearTimeout(storyPostedPulseTimeoutRef.current);
      }
    };
  }, []);

  const triggerStoryPostedPulse = () => {
    if (storyPostedPulseTimeoutRef.current !== null) {
      window.clearTimeout(storyPostedPulseTimeoutRef.current);
    }

    setStoryPostedPulse(false);
    window.requestAnimationFrame(() => {
      setStoryPostedPulse(true);
      storyPostedPulseTimeoutRef.current = window.setTimeout(() => {
        setStoryPostedPulse(false);
        storyPostedPulseTimeoutRef.current = null;
      }, 2400);
    });
  };

  const openStoryTypeSheet = () => {
    setShowStoryTypeSheet(true);
  };

  const closeStoryTypeSheet = () => {
    setShowStoryTypeSheet(false);
  };

  const clearStoryTypeLongPressTimer = () => {
    if (storyTypeLongPressTimerRef.current !== null) {
      window.clearTimeout(storyTypeLongPressTimerRef.current);
      storyTypeLongPressTimerRef.current = null;
    }
  };

  const handleYourStoryPressStart = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearStoryTypeLongPressTimer();
    storyTypeLongPressTriggeredRef.current = false;
    storyTypeLongPressTimerRef.current = window.setTimeout(() => {
      storyTypeLongPressTriggeredRef.current = true;
      openStoryTypeSheet();
    }, 420);
  };

  const handleYourStoryPressEnd = () => {
    clearStoryTypeLongPressTimer();
  };

  const handleYourStoryClick = () => {
    if (storyTypeLongPressTriggeredRef.current) {
      storyTypeLongPressTriggeredRef.current = false;
      return;
    }
    if (userStories.length > 0) {
      setViewerStories(sortStoriesForPlayback(userStories));
      setSelectedStoryIndex(0);
      setViewerIsOwner(true);
      setViewerStoryAuthorId(currentUser.userId);
      setShowStoryViewerModal(true);
      onStoryViewerOpenChange?.(true);
      return;
    }
    openStoryTypeSheet();
  };

  const openStoryComposer = (mode?: StoryType) => {
    setShowStoryTypeSheet(false);
    setStoryComposerStage(mode ? "capture" : "audience");
    setStoryUploadMode(mode ?? null);
    setDedicationRecipient(null);
    clearStoryDraft();
    setShowStoryUploadModal(true);
    onStoryComposerOpenChange?.(true);
  };

  const closeStoryComposer = () => {
    if (isUploading) return;
    setShowStoryUploadModal(false);
    onStoryComposerOpenChange?.(false);
    setStoryComposerStage("audience");
    setStoryUploadMode(null);
    setDedicationRecipient(null);
    clearStoryDraft();
  };

  const clearStoryDraft = () => {
    storyDraftPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setStoryDraftFiles([]);
    setStoryDraftPreviewUrls([]);
    setSelectedStoryDraftIndex(0);
    setStoryMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
    setIsStoryMediaDragging(false);
    setStoryDraftText("");
    setStoryDraftTextColor("#ffffff");
    setStoryDraftTextX(50);
    setStoryDraftTextY(50);
    setStoryDraftTextSize(22);
    setStoryDraftTextScale(1);
    setStoryDraftTextRotation(0);
    setStoryDraftTextFont("Bubble");
    setStoryDraftTextBg(true);
    setStoryDraftTextAlign("center");
    setIsStoryTextDragging(false);
    setIsStoryTextEditorOpen(false);
    setStoryTextSelected(false);
    setStoryDeleteActive(false);
    setStoryDeleteArmed(false);
    setStoryDraftFilter("original");
    setStoryDraftMusicId("none");
    setStoryPublishAudience("story");
    setStoryToolbarCollapsed(false);
    setIsStoryMusicModalOpen(false);
    setStoryMusicSearch("");
    setStoryMusicTrim(15);
    setStoryPreviewMusicId(null);
    setIsStoryDrawMode(false);
    setStoryBrush("Pen");
    setStoryBrushSize(7);
    setStoryBrushColor("#ffffff");
    setStoryDrawPaths([]);
    storyFilterTouchStartXRef.current = null;
    storyGalleryTouchStartYRef.current = null;
    storyMediaPointersRef.current.clear();
    storyMediaGestureRef.current = null;
    storyMediaMovedRef.current = false;
    storyMediaVisualRef.current = { x: 0, y: 0, scale: 1, rotation: 0 };
    storyTextPointersRef.current.clear();
    storyTextGestureRef.current = null;
    storyTextDragOffsetRef.current = { x: 0, y: 0 };
    storyTextVisualRef.current = { x: 50, y: 50, scale: 1, rotation: 0 };
    storyDeleteArmedRef.current = false;
    storyTextVerticalSnapActiveRef.current = false;
    storyMediaVerticalSnapActiveRef.current = false;
    storyPreviewMusicPlayerRef.current?.stop();
    storyPreviewMusicPlayerRef.current = null;
    if (storyTextPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyTextPositionFrameRef.current);
      storyTextPositionFrameRef.current = null;
    }
    if (storyMediaPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyMediaPositionFrameRef.current);
      storyMediaPositionFrameRef.current = null;
    }
    storyActiveDrawPathIdRef.current = null;
  };

  const beginStoryCapture = (mode: StoryType) => {
    setStoryUploadMode(mode);
    setStoryComposerStage("capture");
    setStoryGallerySnap(25);
    setStoryTextSelected(false);
  };

  const triggerStoryHaptic = (duration = 8) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  };

  const setStoryFilterByOffset = (offset: number) => {
    const currentIndex = STORY_FILTER_PRESETS.findIndex(
      (filter) => filter.id === storyDraftFilter,
    );
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeIndex + offset + STORY_FILTER_PRESETS.length) %
      STORY_FILTER_PRESETS.length;
    setStoryDraftFilter(STORY_FILTER_PRESETS[nextIndex].id);
  };

  const updateStoryTextPosition = (clientX: number, clientY: number) => {
    const preview = storyDraftPreviewRef.current;
    if (!preview) return;

    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nextX =
      ((clientX - rect.left) / rect.width) * 100 -
      storyTextDragOffsetRef.current.x;
    const nextY =
      ((clientY - rect.top) / rect.height) * 100 -
      storyTextDragOffsetRef.current.y;
    const clampedX = Math.min(180, Math.max(-80, nextX));
    const verticalSnap = smoothSnapToCenter(
      nextY,
      50,
      STORY_TEXT_VERTICAL_SNAP_THRESHOLD,
    );
    const clampedY = Math.min(180, Math.max(-80, verticalSnap.value));
    const inDeleteZone = clampedY > 106;
    if (storyTextPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyTextPositionFrameRef.current);
    }
    storyTextPositionFrameRef.current = window.requestAnimationFrame(() => {
      storyTextVisualRef.current = {
        ...storyTextVisualRef.current,
        x: clampedX,
        y: clampedY,
      };
      applyStoryTextTransform();
      startTransition(() => {
        setStoryDeleteArmed(inDeleteZone);
      });
      storyTextPositionFrameRef.current = null;
    });
    if (verticalSnap.snapped && !storyTextVerticalSnapActiveRef.current) {
      triggerStoryHaptic(4);
    }
    if (inDeleteZone && !storyDeleteArmedRef.current) {
      triggerStoryHaptic(6);
    }
    storyTextVerticalSnapActiveRef.current = verticalSnap.snapped;
    storyDeleteArmedRef.current = inDeleteZone;
  };

  const getStoryPointerPair = () => {
    const points = Array.from(storyTextPointersRef.current.values());
    if (points.length < 2) return null;
    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return {
      distance: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
    };
  };

  const handleStoryTextPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setStoryTextSelected(true);
    setStoryDeleteActive(true);
    setIsStoryTextDragging(true);
    storyTextTapStartRef.current = { x: event.clientX, y: event.clientY };
    storyTextMovedRef.current = false;
    storyTextPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    const pair = getStoryPointerPair();
    const preview = storyDraftPreviewRef.current;
    if (preview && !pair) {
      const rect = preview.getBoundingClientRect();
      storyTextDragOffsetRef.current = {
        x:
          ((event.clientX - rect.left) / rect.width) * 100 -
          storyTextVisualRef.current.x,
        y:
          ((event.clientY - rect.top) / rect.height) * 100 -
          storyTextVisualRef.current.y,
      };
    }
    storyTextGestureRef.current = pair
      ? {
          distance: pair.distance || 1,
          angle: pair.angle,
          scale: storyTextVisualRef.current.scale,
          rotation: storyTextVisualRef.current.rotation,
        }
      : null;
  };

  const handleStoryTextPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryTextDragging) return;
    event.preventDefault();
    event.stopPropagation();
    if (!storyTextPointersRef.current.has(event.pointerId)) return;
    const tapStart = storyTextTapStartRef.current;
    if (
      tapStart &&
      Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 7
    ) {
      storyTextMovedRef.current = true;
    }
    storyTextPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pair = getStoryPointerPair();
    if (pair && storyTextGestureRef.current) {
      const nextScale =
        storyTextGestureRef.current.scale *
        (pair.distance / storyTextGestureRef.current.distance);
      storyTextVisualRef.current = {
        ...storyTextVisualRef.current,
        scale: Math.min(6, Math.max(0.25, nextScale)),
        rotation:
          storyTextGestureRef.current.rotation +
          pair.angle -
          storyTextGestureRef.current.angle,
      };
      applyStoryTextTransform();
      return;
    }
    updateStoryTextPosition(event.clientX, event.clientY);
  };

  const handleStoryTextPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    storyTextPointersRef.current.delete(event.pointerId);
    const remainingPair = getStoryPointerPair();
    storyTextGestureRef.current = remainingPair
      ? {
          distance: remainingPair.distance || 1,
          angle: remainingPair.angle,
          scale: storyTextVisualRef.current.scale,
          rotation: storyTextVisualRef.current.rotation,
        }
      : null;
    if (!remainingPair && storyTextPointersRef.current.size === 1) {
      const remainingPointer = Array.from(
        storyTextPointersRef.current.values(),
      )[0];
      const preview = storyDraftPreviewRef.current;
      if (preview && remainingPointer) {
        const rect = preview.getBoundingClientRect();
        storyTextDragOffsetRef.current = {
          x:
            ((remainingPointer.x - rect.left) / rect.width) * 100 -
            storyTextVisualRef.current.x,
          y:
            ((remainingPointer.y - rect.top) / rect.height) * 100 -
            storyTextVisualRef.current.y,
        };
      }
    }
    if (storyTextPointersRef.current.size === 0) {
      const shouldOpenEditor =
        event.type !== "pointercancel" &&
        !storyTextMovedRef.current &&
        !storyDeleteArmed &&
        storyDraftText.trim();
      if (storyDeleteArmed) {
        setStoryDraftText("");
        setStoryTextSelected(false);
        triggerStoryHaptic(18);
      }
      setStoryDraftTextX(storyTextVisualRef.current.x);
      setStoryDraftTextY(storyTextVisualRef.current.y);
      setStoryDraftTextScale(storyTextVisualRef.current.scale);
      setStoryDraftTextRotation(storyTextVisualRef.current.rotation);
      setIsStoryTextDragging(false);
      setStoryDeleteActive(false);
      setStoryDeleteArmed(false);
      storyTextVerticalSnapActiveRef.current = false;
      storyDeleteArmedRef.current = false;
      storyTextTapStartRef.current = null;
      storyTextMovedRef.current = false;
      if (shouldOpenEditor) {
        window.setTimeout(() => openStoryTextEditor(), 0);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const stopStoryMusicPreview = () => {
    storyPreviewMusicPlayerRef.current?.stop();
    storyPreviewMusicPlayerRef.current = null;
    setStoryPreviewMusicId(null);
  };

  const previewStoryMusic = (musicId: string) => {
    if (musicId === "none") {
      stopStoryMusicPreview();
      setStoryDraftMusicId("none");
      return;
    }

    if (storyPreviewMusicId === musicId) {
      stopStoryMusicPreview();
      return;
    }

    storyPreviewMusicPlayerRef.current?.stop();
    storyPreviewMusicPlayerRef.current = createGeneratedStoryMusicPlayer(
      musicId,
      {
        masterGain: 0.05,
        noteDurationMs: Math.max(160, Math.min(280, storyMusicTrim * 12)),
      },
    );
    setStoryPreviewMusicId(storyPreviewMusicPlayerRef.current ? musicId : null);
    setStoryDraftMusicId(musicId);
    triggerStoryHaptic(10);
  };

  const getStoryCanvasPoint = (clientX: number, clientY: number) => {
    const preview = storyDraftPreviewRef.current;
    if (!preview) return null;
    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const getStoryMediaPointerPair = () => {
    const points = Array.from(storyMediaPointersRef.current.values());
    if (points.length < 2) return null;
    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return {
      distance: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
    };
  };

  const undoStoryEditorStep = () => {
    if (storyDrawPaths.length > 0) {
      setStoryDrawPaths((paths) => paths.slice(0, -1));
      triggerStoryHaptic(8);
      return;
    }
    if (
      storyMediaTransform.x !== 0 ||
      storyMediaTransform.y !== 0 ||
      storyMediaTransform.scale !== 1 ||
      storyMediaTransform.rotation !== 0
    ) {
      setStoryMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
      triggerStoryHaptic(8);
      return;
    }
    if (storyDraftText.trim()) {
      setStoryDraftText("");
      setStoryTextSelected(false);
      triggerStoryHaptic(8);
    }
  };

  const getStoryTextFontClassName = (font: string) => {
    switch (font) {
      case "Bubble":
        return "story-font-bubble";
      case "Deco":
        return "story-font-deco";
      case "Squeeze":
        return "story-font-squeeze";
      case "Typewriter":
        return "story-font-typewriter";
      case "Classic":
        return "story-font-classic";
      default:
        return "story-font-bubble";
    }
  };

  const openStoryTextEditor = useCallback(() => {
    storyTextWasEmptyBeforeEditRef.current = !storyDraftText.trim();
    setIsStoryTextEditorOpen(true);
  }, [storyDraftText]);

  const finishStoryTextEditing = useCallback(() => {
    if (storyDraftText.trim()) {
      if (storyTextWasEmptyBeforeEditRef.current) {
        setStoryDraftTextX(50);
        setStoryDraftTextY(44);
      }
      setStoryTextSelected(true);
    } else {
      setStoryTextSelected(false);
    }
    setIsStoryTextEditorOpen(false);
  }, [storyDraftText]);

  const handleStoryCanvasPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isStoryDrawMode) {
      handleStoryDrawPointerDown(event);
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".story-text-layer,button,input,textarea,.story-panel,.story-bottom-caption,.story-share-row,.story-right-toolbar",
      )
    ) {
      return;
    }

    event.preventDefault();
    setStoryTextSelected(false);
    setIsStoryMediaDragging(true);
    storyMediaMovedRef.current = false;
    storyMediaPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);

    const pair = getStoryMediaPointerPair();
    storyMediaGestureRef.current = pair
      ? {
          distance: pair.distance || 1,
          angle: pair.angle,
          centerX: pair.centerX,
          centerY: pair.centerY,
          startX: event.clientX,
          startY: event.clientY,
          transform: storyMediaVisualRef.current,
        }
      : {
          distance: 1,
          angle: 0,
          centerX: event.clientX,
          centerY: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          transform: storyMediaVisualRef.current,
        };
  };

  const handleStoryCanvasPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isStoryDrawMode) {
      handleStoryDrawPointerMove(event);
      return;
    }
    if (!storyMediaPointersRef.current.has(event.pointerId)) return;

    event.preventDefault();
    storyMediaPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const gesture = storyMediaGestureRef.current;
    if (!gesture) return;

    const pair = getStoryMediaPointerPair();
    if (pair) {
      const nextScale =
        gesture.transform.scale * (pair.distance / gesture.distance);
      const nextRotation =
        gesture.transform.rotation + pair.angle - gesture.angle;
      const nextX = gesture.transform.x + pair.centerX - gesture.centerX;
      const nextY = gesture.transform.y + pair.centerY - gesture.centerY;
      const verticalSnap = smoothSnapToCenter(
        nextY,
        0,
        STORY_MEDIA_VERTICAL_SNAP_THRESHOLD,
      );
      if (
        Math.abs(nextX - gesture.transform.x) > 3 ||
        Math.abs(nextY - gesture.transform.y) > 3
      ) {
        storyMediaMovedRef.current = true;
      }
      if (storyMediaPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(storyMediaPositionFrameRef.current);
      }
      storyMediaPositionFrameRef.current = window.requestAnimationFrame(() => {
        storyMediaVisualRef.current = {
          x: Math.max(-1200, Math.min(1200, nextX)),
          y: Math.max(-1600, Math.min(1600, verticalSnap.value)),
          scale: Math.min(6, Math.max(0.25, nextScale)),
          rotation: nextRotation,
        };
        applyStoryMediaTransform();
        storyMediaPositionFrameRef.current = null;
      });
      if (verticalSnap.snapped && !storyMediaVerticalSnapActiveRef.current) {
        triggerStoryHaptic(4);
      }
      storyMediaVerticalSnapActiveRef.current = verticalSnap.snapped;
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const verticalSnap = smoothSnapToCenter(
      gesture.transform.y + dy,
      0,
      STORY_MEDIA_VERTICAL_SNAP_THRESHOLD,
    );
    if (Math.hypot(dx, dy) > 3) storyMediaMovedRef.current = true;
    if (storyMediaPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyMediaPositionFrameRef.current);
    }
    storyMediaPositionFrameRef.current = window.requestAnimationFrame(() => {
      storyMediaVisualRef.current = {
        ...gesture.transform,
        x: Math.max(-1200, Math.min(1200, gesture.transform.x + dx)),
        y: Math.max(-1600, Math.min(1600, verticalSnap.value)),
      };
      applyStoryMediaTransform();
      storyMediaPositionFrameRef.current = null;
    });
    if (verticalSnap.snapped && !storyMediaVerticalSnapActiveRef.current) {
      triggerStoryHaptic(4);
    }
    storyMediaVerticalSnapActiveRef.current = verticalSnap.snapped;
  };

  const handleStoryCanvasPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isStoryDrawMode) {
      handleStoryDrawPointerUp(event);
      return;
    }
    if (!storyMediaPointersRef.current.has(event.pointerId)) return;

    event.preventDefault();
    storyMediaPointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const pair = getStoryMediaPointerPair();
    if (pair) {
      storyMediaGestureRef.current = {
        distance: pair.distance || 1,
        angle: pair.angle,
        centerX: pair.centerX,
        centerY: pair.centerY,
        startX: pair.centerX,
        startY: pair.centerY,
        transform: storyMediaVisualRef.current,
      };
    } else {
      const remaining = Array.from(storyMediaPointersRef.current.values())[0];
      storyMediaGestureRef.current = remaining
        ? {
            distance: 1,
            angle: 0,
            centerX: remaining.x,
            centerY: remaining.y,
            startX: remaining.x,
            startY: remaining.y,
            transform: storyMediaVisualRef.current,
          }
        : null;
    }

    if (storyMediaPointersRef.current.size === 0) {
      setStoryMediaTransform(storyMediaVisualRef.current);
      setIsStoryMediaDragging(false);
      storyMediaVerticalSnapActiveRef.current = false;
    }
  };

  const handleStoryDrawPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryDrawMode) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getStoryCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storyActiveDrawPathIdRef.current = id;
    setStoryDrawPaths((paths) => [
      ...paths,
      {
        id,
        d: `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        color: storyBrushColor,
        width: storyBrushSize,
        brush: storyBrush,
      },
    ]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStoryDrawPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryDrawMode || !storyActiveDrawPathIdRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getStoryCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const segment = ` L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const activeId = storyActiveDrawPathIdRef.current;
    setStoryDrawPaths((paths) =>
      paths.map((path) =>
        path.id === activeId ? { ...path, d: `${path.d}${segment}` } : path,
      ),
    );
  };

  const handleStoryDrawPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryDrawMode) return;
    event.preventDefault();
    event.stopPropagation();
    storyActiveDrawPathIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleStoryClick = async (index: number) => {
    const storyGroup = storyGroups[index];
    if (!storyGroup) return;

    const firstUnviewedIndex = storyGroup.stories.findIndex(
      (story) => !story.hasViewed,
    );
    const nextSelectedIndex = firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0;
    const nextViewerStories = storyGroup.stories.map((story, storyIndex) =>
      storyIndex === nextSelectedIndex ? { ...story, hasViewed: true } : story,
    );

    setSelectedStoryIndex(nextSelectedIndex);
    setViewerStories(nextViewerStories);
    setViewerIsOwner(false);
    setViewerStoryAuthorId(storyGroup.authorId);
    setShowStoryViewerModal(true);
    onStoryViewerOpenChange?.(true);

    const story = storyGroup.stories[nextSelectedIndex];
    if (story && !story.hasViewed) {
      await markStoryAsViewed(story.id, currentUser.userId);
    }
  };

  const handleStoryUpload = async (files: File[]) => {
    try {
      if (files.length === 0) return;
      if (storyUploadMode === "dedication" && !dedicationRecipient) {
        alert("Pick who this story is for first.");
        return;
      }

      useStoryStore.setState({ isUploading: true, uploadProgress: 0 });
      let createdCount = 0;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const mediaUrl = await storyService.uploadStoryMedia(
          file,
          (percent) => {
            const overallProgress = Math.round(
              ((index + percent / 100) / files.length) * 100,
            );
            useStoryStore.setState({ uploadProgress: overallProgress });
          },
        );
        const mediaType = file.type.startsWith("video/") ? "video" : "image";

        const request: CreateStoryDTO = {
          mediaUrl,
          mediaType,
          storyType: storyUploadMode || "personal",
          dedicatedToUserId:
            storyUploadMode === "dedication"
              ? dedicationRecipient?.user_id || dedicationRecipient?.id
              : null,
          storyText: storyDraftText.trim()
            ? {
                text: storyDraftText.trim().slice(0, 120),
                color: storyDraftTextColor,
                style: "bold",
                xPct: Math.round(storyDraftTextX),
                yPct: Math.round(storyDraftTextY),
                fontSize: Math.round(storyDraftTextSize * storyDraftTextScale),
              }
            : null,
          storyFilter: storyDraftFilter,
          storyMusic:
            storyDraftMusicId === "none"
              ? null
              : {
                  id: storyDraftMusicId,
                  label: getStoryMusicPreset(storyDraftMusicId).label,
                },
        };

        const newStory = await storyService.createStory(
          currentUser.userId,
          request,
        );
        if (newStory) createdCount += 1;
      }

      useStoryStore.setState({ uploadProgress: 100, isUploading: false });
      window.setTimeout(
        () => useStoryStore.setState({ uploadProgress: 0 }),
        1000,
      );

      if (createdCount > 0) {
        await useStoryStore.getState().loadUserStories(currentUser.userId);
        closeStoryComposer();
        triggerStoryPostedPulse();
      }
    } catch (error) {
      console.error("Error uploading story:", error);
      // Show user-friendly error message
      alert(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Reset upload progress
      useStoryStore.setState({ isUploading: false, uploadProgress: 0 });
    }
  };

  const openStoryFilePicker = () => {
    if (isUploading) return;
    if (storyUploadMode === "dedication" && !dedicationRecipient) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0 && !isUploading) {
        storyDraftPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        setStoryDraftFiles(files);
        setStoryDraftPreviewUrls(
          files.map((file) => URL.createObjectURL(file)),
        );
        setSelectedStoryDraftIndex(0);
        setStoryMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
        setStoryComposerStage("editor");
        setStoryTextSelected(false);
      }
    };
    input.click();
  };

  const publishStoryDraft = async () => {
    console.log("🚀 publishStoryDraft called", {
      storyDraftFilesLength: storyDraftFiles.length,
      isUploading,
      storyDraftFiles: storyDraftFiles.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
      })),
    });

    if (storyDraftFiles.length === 0 || isUploading) {
      console.log("❌ publishStoryDraft early return", {
        filesEmpty: storyDraftFiles.length === 0,
        isUploading,
      });
      return;
    }

    try {
      await handleStoryUpload(storyDraftFiles);
      console.log("✅ Story upload completed successfully");
    } catch (error) {
      console.error("❌ Story upload failed:", error);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    await deleteStory(storyId, currentUser.userId);
    // Close viewer if no more stories left
    const remaining = userStories.filter((s) => s.id !== storyId);
    if (remaining.length === 0) {
      setShowStoryViewerModal(false);
      setViewerStoryAuthorId(null);
      onStoryViewerOpenChange?.(false);
    } else {
      // Stay on previous index if possible
      setViewerStories(remaining);
      setSelectedStoryIndex((prev) => Math.min(prev, remaining.length - 1));
    }
  };

  useEffect(() => {
    if (!showStoryViewerModal) return;
    if (viewerIsOwner) {
      setViewerStories(sortStoriesForPlayback(userStories));
      setSelectedStoryIndex((prev) =>
        Math.min(prev, Math.max(userStories.length - 1, 0)),
      );
      return;
    }

    if (!viewerStoryAuthorId) return;

    const nextViewerStories = sortStoriesForPlayback(
      stories.filter((story) => story.author.id === viewerStoryAuthorId),
    );

    if (nextViewerStories.length === 0) {
      setShowStoryViewerModal(false);
      setViewerStoryAuthorId(null);
      onStoryViewerOpenChange?.(false);
      return;
    }

    setViewerStories(nextViewerStories);
    setSelectedStoryIndex((prev) =>
      Math.min(prev, nextViewerStories.length - 1),
    );
  }, [
    showStoryViewerModal,
    viewerIsOwner,
    viewerStoryAuthorId,
    userStories,
    stories,
    onStoryViewerOpenChange,
  ]);

  // ── Story reaction handler ──
  // Uses a deterministic Firestore doc ID so no reads are needed —
  // setDoc just overwrites on double-tap, and deleteDoc removes on toggle-off.
  const handleStoryReact = useCallback(
    async (storyId: string, authorId: string, type: "like" | "hate") => {
      if (!currentUser.userId || authorId === currentUser.userId) return null;

      try {
        const result = await storyReactionService.toggleReaction(
          storyId,
          currentUser.userId,
          type,
        );

        if (!result.success) {
          throw new Error("Failed to save story reaction");
        }

        if (result.currentReaction) {
          await alertService.createAlert({
            userId: authorId,
            type: "STORY_REACTION",
            entityId: storyId,
            actorId: currentUser.userId,
            actorName: currentUser.name,
            actorUsername: currentUser.username,
            actorAvatar: currentUser.avatar,
            message: `${currentUser.name} ${result.currentReaction === "like" ? "liked" : "hated"} your story`,
            metadata: {
              reactionType: result.currentReaction,
            },
          });
        }

        return result.currentReaction;
      } catch (err) {
        console.error("Story reaction failed:", err);
        return null;
      }
    },
    [currentUser],
  );

  // ── Story reply handler ──
  // Gets or creates a DM conversation then sends the reply text.
  const handleStoryReply = useCallback(
    async (storyId: string, authorId: string, text: string) => {
      if (
        !text.trim() ||
        !currentUser.userId ||
        authorId === currentUser.userId
      )
        return;
      try {
        const convId = await getOrCreateConversation(
          currentUser.userId,
          authorId,
        );
        const story = viewerStories.find((item) => item.id === storyId);
        const previewUrl = story ? await createStoryReplyPreviewUrl(story) : "";
        const storyPayload = story
          ? buildSharedStoryPayload(story, text.trim(), previewUrl)
          : null;
        const encodedStoryPayload = storyPayload
          ? encodeSharedStoryPayload(storyPayload)
          : "";
        const safeStoryPayload =
          encodedStoryPayload.length <= STORY_REPLY_ENCODED_PAYLOAD_LIMIT
            ? encodedStoryPayload
            : "";
        const storyReplyPreviewText = `Replied to your story: ${text.trim()}`;

        await sendRealTimeMessage(
          convId,
          safeStoryPayload ? storyReplyPreviewText : text.trim(),
          safeStoryPayload || undefined,
          safeStoryPayload ? "TEXT" : undefined,
        );
      } catch (err) {
        console.error("Story reply failed:", err);
      }
    },
    [currentUser, getOrCreateConversation, sendRealTimeMessage, viewerStories],
  );

  const handleGhostDebugCheck = useCallback(async () => {
    if (!user?.id) return;

    setGhostDebugLoading(true);

    try {
      const backendStatus = await ghostModeService.getGhostModeStatus(user.id);
      setGhostDebugText(
        `UI:${ghostModeIsActive ? "ON" : "OFF"} | backend:${
          backendStatus.isActive ? "ON" : "OFF"
        }${backendStatus.expiresAt ? ` | until ${new Date(backendStatus.expiresAt).toLocaleTimeString()}` : ""}`,
      );
    } catch (error) {
      setGhostDebugText("UI check failed");
    } finally {
      setGhostDebugLoading(false);
    }
  }, [ghostModeIsActive, user?.id]);

  // ── Heart burst spawner ──
  const spawnBurst = useCallback((postId: string, x: number, y: number) => {
    const id = ++burstIdCounter.current;
    const colorIdx = colorCounterRef.current++ % HEART_COLORS.length;
    const burst: HeartBurst = {
      id,
      x: x + (Math.random() - 0.5) * 28,
      y: y + (Math.random() - 0.5) * 18,
      scale: 0.8 + Math.random() * 0.5,
      colorIdx,
    };
    setBursts((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), burst],
    }));
    setTimeout(() => {
      setBursts((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).filter((b) => b.id !== id),
      }));
    }, BURST_LIFETIME + 100);
  }, []);

  const addLike = useCallback(
    (postId: string) => {
      storeAddLike(postId, currentUser.userId);

      // Track like count for animation trigger (every 10 likes)
      setLikeCounts((prev) => {
        const newCount = (prev[postId] || 0) + 1;
        const updated = { ...prev, [postId]: newCount };
        console.log(`Like count for post ${postId}: ${newCount}`);

        // Trigger animation every 10 likes
        if (newCount % 10 === 0) {
          console.log(
            `Triggering animation for post ${postId} at count ${newCount}`,
          );
          setAnimatingPosts((prev) => {
            const newSet = new Set(prev).add(postId);
            console.log(`Animating posts:`, Array.from(newSet));
            return newSet;
          });
          // Remove animation class after animation completes
          setTimeout(() => {
            setAnimatingPosts((prev) => {
              const next = new Set(prev);
              next.delete(postId);
              console.log(`Removing animation for post ${postId}`);
              return next;
            });
          }, 1800); // Animation duration
        }

        return updated;
      });
    },
    [storeAddLike, currentUser.userId],
  );

  const handleMediaTap = useCallback(
    (postId: string, e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const now = Date.now();
      const last = lastTapTimeRef.current[postId] ?? 0;
      const isDoubleTap = now - last < DOUBLE_TAP_DELAY;
      lastTapTimeRef.current[postId] = isDoubleTap ? 0 : now;
      if (!isDoubleTap) return;
      const rect = e.currentTarget.getBoundingClientRect();
      spawnBurst(postId, e.clientX - rect.left, e.clientY - rect.top);
      addLike(postId);
    },
    [spawnBurst, addLike],
  );

  const handleHeartIconClick = useCallback(
    (postId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const mediaEl = document.getElementById(`media-${postId}`);
      spawnBurst(
        postId,
        mediaEl ? mediaEl.clientWidth / 2 : 160,
        mediaEl ? mediaEl.clientHeight / 2 : 160,
      );
      addLike(postId);
    },
    [spawnBurst, addLike],
  );

  const handleSubmitComment = useCallback(
    async (text: string, parentId?: string | null) => {
      if (!text.trim() || !selectedPost) return;
      try {
        await storeAddComment(selectedPost.id, {
          userId: currentUser.userId,
          name: currentUser.name,
          username: currentUser.username,
          avatar: currentUser.avatar,
          text: text.trim(),
          parentId: parentId || null,
        });
      } catch (error) {
        console.error("Failed to post comment:", error);
      }
    },
    [selectedPost, storeAddComment, currentUser],
  );

  const handleSendToDM = useCallback(
    async (friend: Friend) => {
      if (!selectedPost || !user?.id) {
        return;
      }

      const recipientId = friend.user_id || friend.id;
      if (
        !recipientId ||
        sentTo.has(recipientId) ||
        sendingRecipientId === recipientId
      ) {
        return;
      }

      const payload = buildSharedPostPayload({
        ...selectedPost,
        author: resolveAuthor(selectedPost.author),
      });
      if (!payload) {
        return;
      }

      setSendingRecipientId(recipientId);
      try {
        const conversationId = await getOrCreateConversation(
          user.id,
          recipientId,
        );
        await sendRealTimeMessage(
          conversationId,
          SHARED_POST_FALLBACK_TEXT,
          encodeSharedPostPayload(payload),
          "TEXT",
        );
        setSentTo((prev) => new Set(prev).add(recipientId));
      } catch (error) {
        console.error("Failed to share post to DM:", error);
      } finally {
        setSendingRecipientId((current) =>
          current === recipientId ? null : current,
        );
      }
    },
    [
      selectedPost,
      user?.id,
      sentTo,
      sendingRecipientId,
      resolveAuthor,
      getOrCreateConversation,
      sendRealTimeMessage,
    ],
  );

  // Only skeleton-gate when there are genuinely no posts to show.
  // If posts are already in memory (from a previous load or persist cache),
  // render them immediately and let the background subscription refresh silently.
  const isFeedBootstrapping = feedBootstrapping && sortedPosts.length === 0;

  return (
    <div
      className="screen-container"
      style={{
        paddingBottom: "120px",
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)",
      }}
    >
      <style>{`
        @keyframes premiumBorderSweep {
          0% {
            opacity: 0;
            transform: rotate(0deg) scale(0.96);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: rotate(360deg) scale(1.08);
          }
        }
        @keyframes premiumCardGlow {
          0% {
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 0 1px rgba(74, 222, 128, 0.08);
            transform: translateY(0);
          }
          35% {
            box-shadow:
              0 22px 52px rgba(0, 0, 0, 0.4),
              0 0 0 1px rgba(74, 222, 128, 0.22),
              0 0 34px rgba(34, 197, 94, 0.18);
            transform: translateY(-2px);
          }
          100% {
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 0 1px rgba(74, 222, 128, 0.08);
            transform: translateY(0);
          }
        }
        .premium-card-burst {
          animation: premiumCardGlow 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-card-ring {
          position: absolute;
          inset: -1px;
          border-radius: 26px;
          padding: 1px;
          background:
            linear-gradient(130deg,
              rgba(250, 204, 21, 0.12),
              rgba(74, 222, 128, 0.95),
              rgba(16, 185, 129, 0.85),
              rgba(250, 204, 21, 0.14));
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          pointer-events: none;
        }
        .premium-card-burst .premium-card-ring {
          animation: premiumBorderSweep 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-card-glow {
          position: absolute;
          inset: -18px;
          border-radius: 32px;
          background:
            radial-gradient(circle at 20% 20%, rgba(250, 204, 21, 0.1), transparent 34%),
            radial-gradient(circle at 80% 25%, rgba(74, 222, 128, 0.18), transparent 38%),
            radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.12), transparent 42%);
          opacity: 0;
          filter: blur(18px);
          pointer-events: none;
        }
        .premium-card-burst .premium-card-glow {
          animation: premiumBorderSweep 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes ownStoryPostedRing {
          0% {
            opacity: 0;
            transform: translateZ(0) scale(0.9);
          }
          18% {
            opacity: 0.9;
            transform: translateZ(0) scale(1.02);
          }
          100% {
            opacity: 0;
            transform: translateZ(0) scale(1.14);
          }
        }
        .own-story-posted-ring {
          animation: ownStoryPostedRing 1.35s cubic-bezier(0.22, 1, 0.36, 1) both;
          backface-visibility: hidden;
          transform-origin: center;
          will-change: transform, opacity;
        }
      `}</style>
      {/* ── Header ── */}
      <div
        className={`safe-area-top relative overflow-hidden shadow-[0_14px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-transform duration-300 ease-in-out ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background:
            "radial-gradient(ellipse at 28% -42%, rgba(74,222,128,0.11), transparent 66%), radial-gradient(ellipse at 76% -34%, rgba(14,165,233,0.07), transparent 64%), linear-gradient(180deg, rgba(6,8,6,0.94) 0%, rgba(10,15,10,0.93) 54%, rgba(3,4,3,0.92) 100%)",
        }}
      >
        <div className="px-4 pb-3 pt-3">
          <div className="relative flex items-center justify-between">
            <div className="z-10 flex items-center gap-2">
              <button
                onClick={onNavigateToSearch}
                className="flex h-10 w-10 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#4ade80]"
                aria-label="Search"
              >
                <Search size={18} />
              </button>
              <button
                onClick={onNavigateToDares}
                className="flex h-10 w-10 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#4ade80]"
                aria-label="Dares received"
              >
                <Target size={18} />
              </button>
              <button
                onClick={() => setShowCommunityChallengeHub(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#4ade80]/14 bg-[#4ade80]/[0.045] text-[#94a3b8] transition-all duration-200 hover:border-[#4ade80]/30 hover:bg-[#4ade80]/10 hover:text-[#86efac]"
                aria-label="Community dare hub"
              >
                <Users size={18} />
              </button>
            </div>
            <div
              className="absolute left-1/2 -translate-x-1/2"
              onPointerDown={handleDareLogoPointerDown}
              onPointerUp={handleDareLogoPointerUp}
              onPointerCancel={handleDareLogoPointerUp}
              onPointerLeave={handleDareLogoPointerUp}
              onContextMenu={(event) => {
                event.preventDefault();
                openDareCenterPrompt();
              }}
              aria-label="Long press Dare to open Dare Center"
            >
              <GhostModeTimer onDareLongPress={openDareCenterPrompt} />
            </div>
            {/*
            <div className="absolute left-12 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => void handleGhostDebugCheck()}
                className="rounded-full border border-[#4ade80]/30 bg-[#071109]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#86efac] shadow-[0_8px_20px_rgba(0,0,0,0.28)] transition-all duration-200 hover:border-[#4ade80]/55 hover:bg-[#0b1a0d]"
              >
                {ghostDebugLoading ? "Checking..." : "Ghost Check"}
              </button>
            </div>
            */}
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center space-x-3">
              <button
                onClick={() => {
                  if (alertUnreadCount > 0) {
                    markAllAsRead().catch(() => {});
                  }
                  onNavigateToAlerts();
                }}
                className="relative flex h-11 w-11 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#fb7185]"
                aria-label="Notifications"
              >
                <Heart size={18} />
                {alertUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-md">
                    {alertUnreadCount > 99 ? "99+" : alertUnreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={onNavigateToChat}
                className="relative flex h-11 w-11 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#4ade80]"
                aria-label="Messages"
              >
                <MessageSquare size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-[#4ade80] px-1.5 py-0.5 text-[10px] font-bold leading-none text-black shadow-md">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
        {ghostDebugText && (
          <div className="px-4 pb-3">
            <div className="rounded-full border border-[#4ade80]/20 bg-[#08110b]/90 px-3 py-2 text-center text-[11px] font-medium text-[#bbf7d0] shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
              {ghostDebugText}
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable content ── */}
      {showDareCenterPrompt && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[120] flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setShowDareCenterPrompt(false)}
        >
          <div
            className="app-modal-sheet mb-[calc(var(--safe-area-bottom)+86px)] flex h-[min(348px,calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-124px))] max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-124px)] w-full flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[#3a3a3a]" />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 scrollbar-hide">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                    <Sparkles size={13} />
                    Hidden hub
                  </div>
                  <h3 className="text-[24px] font-black leading-tight text-white">
                    Enter Dare Center?
                  </h3>
                  <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-[#94a3b8]">
                    A guided tour of the features that make Dare different, with
                    animated screens and quick ways to understand each flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDareCenterPrompt(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-3">
                {[
                  ["Proof", "real/fake"],
                  ["Ghost", "15 min"],
                  ["Signals", "live alerts"],
                ].map(([top, bottom]) => (
                  <div
                    key={`${top}-${bottom}`}
                    className="rounded-[20px] border border-white/8 bg-white/[0.035] px-3 py-3 text-center"
                  >
                    <p className="text-base font-black text-white">{top}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748b]">
                      {bottom}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(6,8,7,0.72),rgba(6,8,7,0.99))] px-5 pb-4 pt-3">
              <button
                type="button"
                onClick={() => setShowDareCenterPrompt(false)}
                className="min-h-[48px] rounded-full border border-white/8 bg-white/[0.04] px-5 text-sm font-black text-white transition-colors hover:bg-white/[0.07]"
              >
                Stay here
              </button>
              <button
                type="button"
                onClick={handleEnterDareCenter}
                className="min-h-[48px] rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-sm font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] transition-transform active:scale-[0.98]"
              >
                Enter center
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
        }}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
        {/* ── Stories row ── */}
        <div className="px-4 pt-2 pb-1">
          <div className="flex space-x-4 overflow-x-auto px-3 py-2 scrollbar-hide">
            {/* Your Story Circle */}
            <div
              className="shrink-0 flex flex-col items-center cursor-pointer group"
              onPointerDown={handleYourStoryPressStart}
              onPointerUp={handleYourStoryPressEnd}
              onPointerCancel={handleYourStoryPressEnd}
              onPointerLeave={handleYourStoryPressEnd}
              onContextMenu={(event) => {
                event.preventDefault();
                storyTypeLongPressTriggeredRef.current = true;
                openStoryTypeSheet();
              }}
              onClick={handleYourStoryClick}
            >
              <div className="relative">
                {storyPostedPulse && userStories.length > 0 && (
                  <div className="own-story-posted-ring pointer-events-none absolute -inset-[5px] rounded-full ring-2 ring-[#79d99a]/75" />
                )}
                <div className="absolute inset-0 h-[84px] w-[84px] rounded-full opacity-0 blur-sm group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-full h-full rounded-full border-2 border-[#4ade80]/25" />
                </div>
                {userStories.length > 0 ? (
                  // User has active stories — show profile picture avatar with green ring
                  <div className="relative h-[84px] w-[84px] rounded-full bg-gradient-to-br from-[#4ade80] via-[#34d399] to-[#facc15] p-[3px] shadow-[0_18px_40px_rgba(10,14,12,0.45)] transition-all duration-300 group-hover:scale-[1.04]">
                    <div className="w-full h-full rounded-full bg-[#050505] p-[3px]">
                      {currentUser.avatar ? (
                        <img
                          src={currentUser.avatar}
                          alt="Your story"
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center">
                          <span className="text-white text-2xl font-bold">
                            {currentUser.name?.charAt(0) ||
                              currentUser.username?.charAt(0) ||
                              "U"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // No stories — show add button
                  <div className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,#20242c_0%,#121417_55%,#090909_100%)] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] group-hover:border-[#4ade80]/60">
                    <Plus
                      size={28}
                      className="text-[#4ade80] transition-transform duration-300 group-hover:scale-110"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openStoryTypeSheet();
                  }}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-gradient-to-br from-[#4ade80] to-[#22c55e] shadow-md transition-transform duration-300 group-hover:scale-110"
                  aria-label="Create story"
                >
                  <Plus size={12} className="text-black" />
                </button>
              </div>
              <span className="text-sm text-[#94a3b8] mt-3 block w-[84px] truncate text-center font-medium transition-colors duration-300 group-hover:text-white">
                Your Story
              </span>
            </div>

            {/* Shimmer skeleton circles while stories are loading and no cached data */}
            {storiesLoading &&
              stories.length === 0 &&
              [1, 2, 3, 4].map((i) => (
                <div
                  key={`story-skel-${i}`}
                  className="shrink-0 flex flex-col items-center"
                >
                  <div className="h-[84px] w-[84px] animate-pulse rounded-full bg-[#1e1e1e]" />
                  <div className="w-14 h-2.5 bg-[#1e1e1e] rounded-full mt-3 animate-pulse" />
                </div>
              ))}

            {/* Friends' Stories — real-time from Firestore onSnapshot */}
            {storyGroups.map((storyGroup, index) => {
              const story = storyGroup.displayStory;
              const hasViewed = storyGroup.hasViewed;
              if (!story) return null;

              return (
                <div
                  key={storyGroup.authorId}
                  className="shrink-0 flex flex-col items-center group"
                >
                  <button
                    type="button"
                    className="relative h-[84px] w-[84px] cursor-pointer"
                    onClick={() => handleStoryClick(index)}
                  >
                    {!hasViewed && (
                      <div className="absolute inset-0 h-[84px] w-[84px] rounded-full opacity-0 blur-sm group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-full h-full rounded-full border-2 border-[#f59e0b]/35" />
                      </div>
                    )}
                    <div
                      className={`relative h-[84px] w-[84px] rounded-full p-[3px] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] ${
                        hasViewed
                          ? "bg-gradient-to-br from-[#2b2f35] via-[#353941] to-[#44474f]"
                          : story.storyType === "dedication"
                            ? "bg-gradient-to-br from-[#bef264] via-[#f59e0b] to-[#fb7185]"
                            : "bg-gradient-to-br from-[#84cc16] via-[#facc15] to-[#fb7185]"
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-full ${
                          hasViewed ? "bg-[#111315]" : "bg-[#050505]"
                        } p-[3px]`}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden">
                          <Avatar
                            src={story.author.avatar}
                            alt={story.author.displayName}
                            size="2xl"
                            userId={story.author.id}
                            username={story.author.username}
                            forceGhostMode={ghostModesByUserId[story.author.id]}
                            className="!h-full !w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                  {story.storyType === "dedication" && story.dedicatedTo ? (
                    <div className="mt-3 flex w-[84px] items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onNavigateToProfile?.(story.author.id)}
                        className="shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
                        aria-label={`Open ${story.author.displayName}'s profile`}
                      >
                        <Avatar
                          src={story.author.avatar}
                          alt={story.author.displayName}
                          size={17}
                          userId={story.author.id}
                          username={story.author.username}
                          forceGhostMode={ghostModesByUserId[story.author.id]}
                          className="ring-1 ring-white/20"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStoryClick(index)}
                        className="flex h-4 w-3 shrink-0 items-center justify-center text-[#86efac] transition-transform hover:scale-110 active:scale-95"
                        aria-label="Open dedicated story"
                      >
                        <Play size={9} fill="currentColor" strokeWidth={0} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToProfile?.(story.dedicatedTo!.id)
                        }
                        className="shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
                        aria-label={`Open ${story.dedicatedTo.displayName}'s profile`}
                      >
                        <Avatar
                          src={story.dedicatedTo.avatar}
                          alt={story.dedicatedTo.displayName}
                          size={17}
                          userId={story.dedicatedTo.id}
                          username={story.dedicatedTo.username}
                          forceGhostMode={
                            ghostModesByUserId[story.dedicatedTo.id]
                          }
                          className="ring-1 ring-[#4ade80]/70"
                        />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (onNavigateToProfile && story.author.id) {
                          onNavigateToProfile(story.author.id);
                        }
                      }}
                      className={`mt-3 block w-[84px] truncate text-center text-sm font-medium transition-colors duration-300 ${
                        hasViewed
                          ? "text-[#6b7280]"
                          : "text-[#d1d5db] group-hover:text-white"
                      } ${
                        onNavigateToProfile && story.author.id
                          ? "cursor-pointer hover:text-[#4ade80]"
                          : "cursor-default"
                      }`}
                    >
                      {stripAtSymbol(story.author.username)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Posts ── show only the most recent post per user */}
        {isFeedBootstrapping ? (
          <div className="px-2 pb-6 space-y-5">
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </div>
        ) : (
          <div className="px-2 pb-6 space-y-5">
            {sortedPosts.map((post: FeedPost, index) => {
              const liked = iLiked(post, currentUser.userId);
              const likeCount = totalLikes(post);
              const likeSocialProof = buildLikeSocialProof(post);
              const postBursts = bursts[post.id] ?? [];
              const author = resolveAuthor(post.author);
              const showCommunityRail = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                COMMUNITY_RAIL_FIRST_INSERT_AFTER,
                COMMUNITY_RAIL_REPEAT_EVERY,
              );
              const showSocialDaresRail = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                SOCIAL_DARES_RAIL_FIRST_INSERT_AFTER,
                SOCIAL_CONTENT_RAIL_REPEAT_EVERY,
              );
              const showTruthsRail = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                TRUTHS_RAIL_FIRST_INSERT_AFTER,
                SOCIAL_CONTENT_RAIL_REPEAT_EVERY,
              );

              return (
                <Fragment key={post.id}>
                  <div
                    id={`feed-post-${post.id}`}
                    className={`relative overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] shadow-[0_22px_62px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)] ${
                      animatingPosts.has(post.id) ? "premium-card-burst" : ""
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.68),rgba(14,165,233,0.38),rgba(74,222,128,0))]" />
                    <div className="premium-card-glow" />
                    <div className="premium-card-ring" />
                    {/* Post header */}
                    <div className="relative z-10 flex items-center justify-between gap-3 px-3 pt-3 pb-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          src={author.avatar}
                          alt={author.name}
                          size={46}
                          userId={author.id}
                          username={author.username}
                          forceGhostMode={
                            author.id
                              ? ghostModesByUserId[author.id]
                              : undefined
                          }
                          style={{ border: "2px solid rgba(74,222,128,0.22)" }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && author.id) {
                              onNavigateToProfile(author.id);
                            }
                          }}
                          className={`min-w-0 text-left ${
                            onNavigateToProfile && author.id
                              ? "cursor-pointer"
                              : "cursor-default"
                          }`}
                        >
                          <h3 className="truncate text-[16px] font-black leading-tight text-white">
                            {author.name}
                          </h3>
                          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[#94a3b8]">
                            @{author.username}
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Media */}
                    {post.media && post.media.url && (
                      <div className="px-1">
                        <div
                          id={`media-${post.id}`}
                          className="w-full relative cursor-pointer rounded-3xl overflow-hidden"
                          onClick={(e) => handleMediaTap(post.id, e)}
                        >
                          {post.media.type === "image" ? (
                            <img
                              src={post.media.url}
                              alt="Post media"
                              className="w-full object-cover"
                              style={{ height: "500px" }}
                              /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - draggable might block touch */
                              /* DISABLED: draggable={false} */
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.src =
                                  "https://picsum.photos/seed/fallback/800/600.jpg";
                              }}
                            />
                          ) : post.media.type === "video" ? (
                            <div
                              className="w-full bg-[#2a2a2a] flex items-center justify-center rounded-3xl"
                              style={{ height: "500px" }}
                            >
                              <span className="text-[#94a3b8] text-2xl">
                                🎥 Video
                              </span>
                            </div>
                          ) : (
                            <div
                              className="w-full bg-gradient-to-br from-[#4ade80]/10 via-[#22c55e]/10 to-[#16a34a]/10 flex items-center justify-center rounded-3xl"
                              style={{ height: "500px" }}
                            >
                              <div className="text-center">
                                <div className="w-16 h-16 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-2xl flex items-center justify-center mb-3 mx-auto">
                                  <Music size={28} className="text-black" />
                                </div>
                                <p className="text-white font-medium">
                                  Audio File
                                </p>
                                {post.media.duration && (
                                  <p className="text-[#94a3b8] text-sm mt-1">
                                    {post.media.duration}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                          <HeartBurstLayer bursts={postBursts} />
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="relative z-10 px-2 pt-3">
                      <div className="grid grid-cols-3 items-center gap-1 rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] px-3 py-2.5 shadow-[0_12px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <div className="flex min-w-0 items-center justify-center">
                          <button
                            onClick={(e) => handleHeartIconClick(post.id, e)}
                            className="group app-pressable flex min-w-0 items-center justify-center text-white transition-colors hover:text-[#4ade80]"
                            aria-label={liked ? "Unlike post" : "Like post"}
                          >
                            <Heart
                              size={20}
                              fill={liked ? "#ef4444" : "white"}
                              strokeWidth={0}
                              className={`shrink-0 transition-all duration-200 ${
                                liked
                                  ? "scale-110 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                                  : "text-white group-hover:scale-110"
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPostId(post.id);
                              setShowLikesModal(true);
                            }}
                            className="ml-1 truncate text-sm font-bold text-white transition-colors hover:text-[#4ade80]"
                            aria-label="Open likes"
                          >
                            {formatNumber(likeCount)}
                          </button>
                        </div>
                        <div className="flex min-w-0 items-center justify-center">
                          <button
                            onClick={() => {
                              setSentTo(new Set());
                              setSelectedPostId(post.id);
                              setShowCommentsModal(true);
                            }}
                            className="app-pressable flex min-w-0 items-center justify-center gap-2 text-white transition-colors hover:text-[#4ade80]"
                            aria-label="Open comments"
                          >
                            <MessageCircle
                              size={20}
                              fill="white"
                              strokeWidth={0}
                              className="shrink-0"
                            />
                            <span className="truncate text-sm font-bold">
                              {formatNumber(post.comments_count)}
                            </span>
                          </button>
                        </div>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => {
                              setSelectedPostId(post.id);
                              setSentTo(new Set());
                              setShowShareModal(true);
                            }}
                            className="app-pressable flex items-center justify-center text-white transition-colors hover:text-[#4ade80]"
                            aria-label="Share to DM"
                          >
                            <Send size={18} fill="white" strokeWidth={0} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {likeSocialProof && (
                      <div className="relative z-10 px-4 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPostId(post.id);
                            setShowLikesModal(true);
                          }}
                          className="group flex w-full items-center gap-3 rounded-2xl px-1 py-1.5 text-left transition-colors hover:bg-white/[0.025]"
                        >
                          {likeSocialProof.avatars.length > 0 ? (
                            <div className="flex shrink-0 -space-x-2">
                              {likeSocialProof.avatars.map((entry) => (
                                <span
                                  key={entry.userId}
                                  className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[#101713] bg-[#1b241e] text-[11px] font-black text-[#4ade80] shadow-[0_5px_14px_rgba(0,0,0,0.32)]"
                                >
                                  <span>{getLikeInitial(entry)}</span>
                                  {entry.avatar ? (
                                    <img
                                      src={entry.avatar}
                                      alt={getLikeEntryName(entry)}
                                      className="absolute inset-0 h-full w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                      onError={(event) => {
                                        event.currentTarget.style.display =
                                          "none";
                                      }}
                                    />
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/20 bg-[#132018] text-[#4ade80] shadow-[0_5px_14px_rgba(0,0,0,0.25)]">
                              <Heart size={14} fill="currentColor" />
                            </span>
                          )}
                          <p className="min-w-0 truncate text-[13px] font-semibold leading-tight text-[#9bb1a6]">
                            <span className="font-black text-white">
                              {likeSocialProof.lead}
                            </span>{" "}
                            <span>{likeSocialProof.rest}</span>
                          </p>
                        </button>
                      </div>
                    )}

                    {/* Caption */}
                    <div className="relative z-10 px-4 pt-2 pb-5">
                      <p className="text-[15px] font-black leading-relaxed text-white">
                        {post.content}
                      </p>
                      <p className="mt-1.5 text-xs font-bold text-[#64748b]">
                        {formatTimeAgo(post.timestamp)}
                      </p>
                    </div>
                  </div>
                  {showSocialDaresRail && feedSocialDares.length > 0 && (
                    <SocialDaresFeedRail
                      dares={feedSocialDares}
                      onExploreAll={onNavigateToSocialDares}
                      onOpenDare={onNavigateToSocialDares}
                    />
                  )}
                  {showTruthsRail && feedTruths.length > 0 && (
                    <TruthsFeedRail
                      truths={feedTruths}
                      onExploreAll={onNavigateToTruths}
                      onOpenTruth={onNavigateToTruths}
                    />
                  )}
                  {showCommunityRail && (
                    <CommunityDareFeedRail
                      challenges={hydratedCommunityChallenges}
                      joinedChallengeIds={joinedCommunityChallengeIds}
                      onPreview={setSelectedCommunityChallenge}
                      onExploreAll={onNavigateToCommunityDares}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          COMMENTS MODAL
      ══════════════════════════════════════════ */}
      {showCommentsModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowCommentsModal(false)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .modal-slide-up { 
              animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; 
            }
            .comment-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet w-full overflow-hidden rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            style={{
              minHeight: "min(68dvh, 720px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 border-b border-white/8 shrink-0">
              <div className="w-10 h-1 bg-white/18 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Comments</h3>
                <button
                  onClick={() => setShowCommentsModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="app-modal-sheet-content">
              <CommentSection
                comments={selectedPost.comments.map(
                  (c): CommentItem => ({
                    id: c.id,
                    userId: c.userId,
                    name: c.name,
                    username: c.username,
                    avatar: c.avatar,
                    text: c.text,
                    createdAt: c.createdAt,
                    likes: c.likes,
                    parentId: c.parentId || null,
                    likedByCurrentUser: commentLikePersistence.hasLiked(
                      "post",
                      currentUser.userId,
                      c.id,
                    ),
                  }),
                )}
                loading={selectedPost.commentsLoading}
                currentUser={{
                  userId: currentUser.userId,
                  name: currentUser.name,
                  username: currentUser.username,
                  avatar: currentUser.avatar,
                }}
                onSubmitComment={handleSubmitComment}
                onLikeComment={(commentId) =>
                  storeLikeComment(selectedPost.id, commentId)
                }
                onNavigateToProfile={onNavigateToProfile}
                autoFocusInput={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LIKES MODAL
      ══════════════════════════════════════════ */}
      {showLikesModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowLikesModal(false)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom { 
              from { transform: translateY(100%); } 
              to { transform: translateY(0); } 
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            .modal-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet w-full rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            style={{
              minHeight: "min(60dvh, 640px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 shrink-0">
              <div className="w-10 h-1 bg-white/18 rounded-full mx-auto mb-5" />
              <h3 className="text-white font-bold text-lg mb-1">Likes</h3>
              <p className="text-[#64748b] text-sm mb-3">
                {totalLikeTaps(selectedPost)} total likes ·{" "}
                {Object.keys(getLikesByUser(selectedPost)).length}{" "}
                {Object.keys(getLikesByUser(selectedPost)).length === 1
                  ? "person"
                  : "people"}
              </p>
            </div>
            {selectedPost.likesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-[#64748b] text-sm">Loading likes...</div>
              </div>
            ) : Object.keys(getLikesByUser(selectedPost)).length === 0 ? (
              <p className="text-[#64748b] text-center py-8 text-sm">
                No likes yet
              </p>
            ) : (
              <div className="app-modal-sheet-scroll px-5 pb-[calc(var(--safe-area-bottom)+16px)] space-y-2.5">
                {Object.values(getLikesByUser(selectedPost))
                  .sort((a, b) => b.tapCount - a.tapCount)
                  .map((entry, index) => (
                    <div
                      key={entry.userId}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.96),rgba(7,10,8,0.98))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] modal-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={entry.avatar}
                        alt={entry.name}
                        size={52}
                        userId={entry.userId}
                        forceGhostMode={
                          entry.userId
                            ? ghostModesByUserId[entry.userId]
                            : undefined
                        }
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && entry.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className="cursor-pointer text-[14px] font-bold leading-tight text-white transition-colors hover:text-[#4ade80]"
                        >
                          {entry.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && entry.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className={`text-[12px] font-semibold leading-tight text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && entry.userId
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {entry.username}
                        </button>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/8 bg-[#101713] px-3 py-1.5">
                        <Heart
                          size={12}
                          fill="#ef4444"
                          className="text-red-500"
                        />
                        <span className="text-[12px] font-bold text-white">
                          liked {entry.tapCount}{" "}
                          {entry.tapCount === 1 ? "time" : "times"}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Infinite Scroll Sentinel ── */}
      {sortedPosts.length > 0 && hasMorePosts && (
        <>
          <div
            ref={loadMoreRef}
            aria-hidden="true"
            className="h-px w-full pointer-events-none"
          />
          {isLoadingMore && (
            <div className="px-4 pb-6 pt-2">
              <div className="flex items-center justify-center">
                <div className="rounded-full border border-white/8 bg-[#111] px-5 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                  <div className="w-6 h-6 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          SHARE MODAL
      ══════════════════════════════════════════ */}
      {showShareModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowShareModal(false)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom { 
              from { transform: translateY(100%); } 
              to { transform: translateY(0); } 
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            .share-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet w-full rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            style={{
              height: "min(86dvh, 760px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 border-b border-white/8 shrink-0">
              <div className="w-10 h-1 bg-white/18 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Send to…</h3>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {selectedPost.media && (
              <div className="px-6 py-4 shrink-0 border-b border-white/8">
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedPost.media.url}
                    alt="Post"
                    className="w-14 h-14 rounded-xl object-cover"
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {resolveAuthor(selectedPost.author).name}
                    </p>
                    <p className="text-[#94a3b8] text-xs line-clamp-2">
                      {selectedPost.content}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="app-modal-sheet-scroll px-4 py-3 pb-[calc(var(--safe-area-bottom)+12px)] space-y-2">
              {loadingFriends ? (
                <p className="text-[#64748b] text-center py-10 text-sm">
                  Loading friends...
                </p>
              ) : friends.length === 0 ? (
                <p className="text-[#64748b] text-center py-10 text-sm">
                  No friends to share with
                </p>
              ) : (
                friends.map((friend, index) => {
                  const recipientId = friend.user_id || friend.id;
                  const sent = recipientId ? sentTo.has(recipientId) : false;
                  const sending =
                    !!recipientId && sendingRecipientId === recipientId;
                  return (
                    <div
                      key={recipientId || friend.id || index}
                      className="flex items-center space-x-4 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.96),rgba(7,10,8,0.98))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#4ade80]/24 hover:bg-[#101713] share-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={friend.avatar_url || ""}
                        alt={
                          (friend.user_id &&
                            userProfiles[friend.user_id]?.displayName) ||
                          friend.display_name ||
                          friend.username
                        }
                        size="xl"
                        userId={friend.user_id}
                        forceGhostMode={
                          friend.user_id
                            ? ghostModesByUserId[friend.user_id]
                            : undefined
                        }
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && friend.user_id) {
                              onNavigateToProfile(friend.user_id);
                            }
                          }}
                          className="text-white font-semibold text-base cursor-pointer hover:text-[#4ade80] transition-colors"
                        >
                          {(friend.user_id &&
                            userProfiles[friend.user_id]?.displayName) ||
                            friend.display_name ||
                            friend.username}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.user_id) {
                              onNavigateToProfile(friend.user_id);
                            }
                          }}
                          className={`text-sm text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && friend.user_id
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {(friend.user_id &&
                            userProfiles[friend.user_id]?.username) ||
                            friend.username}
                        </button>
                      </div>
                      <button
                        onClick={() => void handleSendToDM(friend)}
                        disabled={!recipientId || sent || sending}
                        className={`min-w-[104px] justify-center px-5 py-2 rounded-full text-base font-semibold transition-all duration-200 flex items-center space-x-2 ${sent ? "bg-[#101713] text-[#64748b] cursor-default" : sending ? "bg-[#d9fbe5] text-[#18532c] cursor-wait" : "bg-[#4ade80] text-black hover:bg-[#22c55e] active:scale-95"} disabled:bg-[#101713] disabled:text-[#64748b] disabled:cursor-default`}
                      >
                        {sent ? (
                          <span>Sent ✓</span>
                        ) : sending ? (
                          <span>Sending...</span>
                        ) : (
                          <>
                            <Send
                              size={18}
                              fill="currentColor"
                              strokeWidth={0}
                            />
                            <span>Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STORY UPLOAD MODAL
      ══════════════════════════════════════════ */}
      {showStoryTypeSheet && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[130] flex items-end bg-black/72 backdrop-blur-sm"
          onClick={closeStoryTypeSheet}
        >
          <div
            className="app-modal-sheet w-full overflow-hidden rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] p-5 shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#3a3a3a]" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                  <Sparkles size={13} />
                  Story setup
                </div>
                <h3 className="text-[26px] font-black leading-tight text-white">
                  Choose your story type
                </h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[#94a3b8]">
                  Pick the story style first, then continue into the story
                  picker flow.
                </p>
              </div>
              <button
                type="button"
                onClick={closeStoryTypeSheet}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openStoryComposer("personal")}
                className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80] shadow-[0_12px_28px_rgba(74,222,128,0.12)]">
                  <UserRound size={20} />
                </div>
                <p className="font-bold text-white">Normal story</p>
                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                  Continue with the regular story flow.
                </p>
              </button>
              <button
                type="button"
                onClick={() => openStoryComposer("dedication")}
                className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#facc15]/35 hover:bg-[#facc15]/8"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#facc15]/20 bg-[#facc15]/10 text-[#facc15] shadow-[0_12px_28px_rgba(250,204,21,0.12)]">
                  <Gift size={20} />
                </div>
                <p className="font-bold text-white">Dedication story</p>
                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                  Choose one person, then keep building the story.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {showStoryUploadModal && (
        <div
          className="story-composer app-story-shell"
          onClick={() => {
            if (storyTextSelected && !isStoryTextDragging) {
              setStoryTextSelected(false);
            }
          }}
        >
          {storyDraftFile && storyDraftPreviewUrl ? (
            <div
              ref={storyDraftPreviewRef}
              className={`story-canvas ${
                isStoryMediaDragging ? "is-media-dragging" : ""
              }`}
              onPointerDown={handleStoryCanvasPointerDown}
              onPointerMove={handleStoryCanvasPointerMove}
              onPointerUp={handleStoryCanvasPointerUp}
              onPointerCancel={handleStoryCanvasPointerUp}
              onTouchStart={(event) => {
                storyFilterTouchStartXRef.current = event.touches[0].clientX;
              }}
              onTouchEnd={(event) => {
                if (isStoryDrawMode) return;
                if (storyMediaMovedRef.current) {
                  storyMediaMovedRef.current = false;
                  storyFilterTouchStartXRef.current = null;
                  return;
                }
                const startX = storyFilterTouchStartXRef.current;
                storyFilterTouchStartXRef.current = null;
                if (startX === null) return;
                const dx = event.changedTouches[0].clientX - startX;
                if (Math.abs(dx) < 52) return;
                setStoryFilterByOffset(dx < 0 ? 1 : -1);
              }}
            >
              {!storyDraftFile.type.startsWith("video/") && (
                <div
                  className="story-media-blur"
                  style={{ backgroundImage: `url(${storyDraftPreviewUrl})` }}
                />
              )}
              <div ref={storyMediaMainRef} className="story-media-main">
                {storyDraftFile.type.startsWith("video/") ? (
                  <video
                    src={storyDraftPreviewUrl}
                    style={{
                      filter: getStoryFilterPreset(storyDraftFilter).cssFilter,
                    }}
                    muted
                    playsInline
                    autoPlay
                    loop
                  />
                ) : (
                  <img
                    src={storyDraftPreviewUrl}
                    alt="Story preview"
                    style={{
                      filter: getStoryFilterPreset(storyDraftFilter).cssFilter,
                    }}
                  />
                )}
              </div>
              <div
                className="pointer-events-none absolute inset-0 z-[12]"
                style={{
                  background: getStoryFilterPreset(storyDraftFilter).overlay,
                }}
              />
              <svg
                className="story-draw-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {storyDrawPaths.map((path) => (
                  <path
                    key={path.id}
                    d={path.d}
                    fill="none"
                    stroke={path.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={
                      path.brush === "Marker"
                        ? path.width * 1.35
                        : path.brush === "Chalk"
                          ? path.width * 0.9
                          : path.width
                    }
                    opacity={path.brush === "Chalk" ? 0.72 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {isStoryDrawMode && <div className="story-draw-hotspot" />}
              <div className="story-overlay-layer">
                {storyDraftText.trim() && (
                  <div
                    ref={storyTextLayerRef}
                    className={`story-text-layer ${
                      storyTextSelected ? "is-selected" : ""
                    }`}
                    style={{
                      left: `${storyDraftTextX}%`,
                      top: `${storyDraftTextY}%`,
                      transform: `translate3d(-50%, -50%, 0) scale(${storyDraftTextScale}) rotate(${storyDraftTextRotation}deg)`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoryTextSelected(true);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      openStoryTextEditor();
                    }}
                    onPointerDown={handleStoryTextPointerDown}
                    onPointerMove={handleStoryTextPointerMove}
                    onPointerUp={handleStoryTextPointerUp}
                    onPointerCancel={handleStoryTextPointerUp}
                  >
                    <span
                      className={`story-text-chip ${getStoryTextFontClassName(
                        storyDraftTextFont,
                      )} ${storyDraftTextBg ? "" : "is-plain"}`}
                      style={{
                        background: storyDraftTextBg
                          ? "rgba(0, 0, 0, 0.32)"
                          : "transparent",
                        color: storyDraftTextColor,
                        fontSize: `${storyDraftTextSize}px`,
                        textAlign: storyDraftTextAlign,
                        textShadow: "0 2px 14px rgba(0,0,0,0.72)",
                      }}
                    >
                      {storyDraftText}
                    </span>
                  </div>
                )}
                {storyDraftMusicId !== "none" && (
                  <div className="story-music-widget">
                    <div
                      className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
                      style={{
                        background:
                          getStoryMusicPreset(storyDraftMusicId).color,
                        color: "#07110a",
                      }}
                    >
                      <Music size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {getStoryMusicPreset(storyDraftMusicId).label}
                      </p>
                      <p className="truncate text-[11px] font-semibold text-white/70">
                        {getStoryMusicPreset(storyDraftMusicId).description}
                      </p>
                      <div className="story-eq mt-1">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute bottom-[142px] left-1/2 z-[52] -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
                {getStoryFilterPreset(storyDraftFilter).label}
              </div>
              <div
                className={`story-delete-zone ${
                  storyDeleteActive ? "is-visible" : ""
                } ${storyDeleteArmed ? "is-armed" : ""}`}
              >
                <Trash2 size={18} />
                <span className="text-sm font-black">Drag here to remove</span>
              </div>
            </div>
          ) : (
            <div
              className="story-camera-surface"
              onTouchStart={(event) => {
                storyGalleryTouchStartYRef.current = event.touches[0].clientY;
              }}
              onTouchEnd={(event) => {
                const startY = storyGalleryTouchStartYRef.current;
                storyGalleryTouchStartYRef.current = null;
                if (startY === null) return;
                const dy = event.changedTouches[0].clientY - startY;
                if (dy < -46) setStoryGallerySnap(60);
                if (dy > 46) setStoryGallerySnap(25);
              }}
            >
              <div className="absolute inset-x-6 top-[18%] rounded-[28px] border border-white/10 bg-white/[0.06] p-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white">
                  <ImagePlus size={25} />
                </div>
                <p className="text-lg font-black text-white">
                  {storyComposerStage === "audience"
                    ? "Create story"
                    : storyUploadMode === "dedication"
                      ? "Dedication story"
                      : "Your story"}
                </p>
                <p className="mt-1 text-sm font-semibold text-white/62">
                  Fullscreen preview with gallery, effects, text, music, and
                  draw.
                </p>
              </div>
              {storyComposerStage === "audience" ? (
                <div className="story-audience-picks">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginStoryCapture("personal");
                    }}
                    className="story-audience-card app-pressable"
                  >
                    <UserRound size={22} className="mb-5 text-[#4ade80]" />
                    <p className="text-base font-black">Personal</p>
                    <p className="mt-1 text-xs font-semibold text-white/58">
                      Your regular story.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginStoryCapture("dedication");
                    }}
                    className="story-audience-card app-pressable"
                  >
                    <Gift size={22} className="mb-5 text-[#facc15]" />
                    <p className="text-base font-black">Dedication</p>
                    <p className="mt-1 text-xs font-semibold text-white/58">
                      Pick one person.
                    </p>
                  </button>
                </div>
              ) : (
                <>
                  <div className="story-camera-bottom">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openStoryFilePicker();
                      }}
                      className="story-shutter app-pressable"
                      disabled={
                        isUploading ||
                        (storyUploadMode === "dedication" &&
                          !dedicationRecipient)
                      }
                      aria-label="Select story media"
                    />
                  </div>
                  <div
                    className="story-gallery-sheet"
                    style={{ height: `${storyGallerySnap}dvh` }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-center px-4 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setStoryGallerySnap((snap) =>
                            snap === 25 ? 60 : snap === 60 ? 100 : 25,
                          )
                        }
                        className="h-5 w-16 rounded-full"
                        aria-label="Resize gallery"
                      >
                        <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/28" />
                      </button>
                    </div>
                    {storyUploadMode === "dedication" && (
                      <div className="px-4 pb-2 pt-1">
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {loadingFriends ? (
                            [1, 2, 3].map((item) => (
                              <div
                                key={`story-friend-loading-${item}`}
                                className="h-12 w-32 shrink-0 animate-pulse rounded-full bg-white/10"
                              />
                            ))
                          ) : friends.length === 0 ? (
                            <div className="rounded-full bg-white/10 px-4 py-3 text-xs font-bold text-white/70">
                              No friends available
                            </div>
                          ) : (
                            friends.map((friend) => {
                              const friendId = friend.user_id || friend.id;
                              const selected =
                                dedicationRecipient &&
                                (dedicationRecipient.user_id ||
                                  dedicationRecipient.id) === friendId;
                              return (
                                <button
                                  key={friendId}
                                  type="button"
                                  onClick={() => setDedicationRecipient(friend)}
                                  className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-2 pr-4 ${
                                    selected
                                      ? "border-[#4ade80]/60 bg-[#4ade80]/18"
                                      : "border-white/10 bg-white/8"
                                  }`}
                                >
                                  <Avatar
                                    src={friend.avatar_url || ""}
                                    alt={friend.display_name || friend.username}
                                    size="sm"
                                    userId={friendId}
                                    username={friend.username}
                                  />
                                  <span className="max-w-24 truncate text-xs font-black text-white">
                                    {friend.display_name || friend.username}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                    <div className="story-gallery-grid">
                      <button
                        type="button"
                        onClick={openStoryFilePicker}
                        disabled={
                          isUploading ||
                          (storyUploadMode === "dedication" &&
                            !dedicationRecipient)
                        }
                        className="story-gallery-tile flex flex-col items-center justify-center gap-2 text-white disabled:opacity-45"
                      >
                        <ImagePlus size={24} />
                        <span className="text-xs font-black">Gallery</span>
                      </button>
                      {storyDraftPreviewUrls.map((url, index) => (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedStoryDraftIndex(index);
                            setStoryComposerStage("editor");
                          }}
                          className="story-gallery-tile"
                          aria-label={`Select story media ${index + 1}`}
                        >
                          {storyDraftFiles[index]?.type.startsWith("video/") ? (
                            <video
                              src={url}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </button>
                      ))}
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
                        <div
                          key={`story-gallery-empty-${item}`}
                          className="story-gallery-tile bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="story-safe-top">
            {isStoryDrawMode ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStoryDrawPaths((paths) => paths.slice(0, -1));
                  }}
                  className="story-glass-button"
                  aria-label="Undo"
                >
                  <Undo2 size={20} />
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    className="story-glass-button opacity-45"
                    aria-label="Redo"
                  >
                    <Redo2 size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsStoryDrawMode(false);
                    }}
                    className="story-glass-button px-4 text-sm font-black"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isUploading) return;
                    if (storyDraftFile) {
                      clearStoryDraft();
                      setStoryComposerStage("capture");
                    } else if (storyComposerStage === "capture") {
                      setShowStoryUploadModal(false);
                      setShowStoryTypeSheet(true);
                      setStoryComposerStage("audience");
                      setStoryUploadMode(null);
                      setDedicationRecipient(null);
                    } else {
                      closeStoryComposer();
                    }
                  }}
                  className="story-glass-button"
                  aria-label="Back"
                >
                  <ChevronLeft size={22} />
                </button>
                <div className="flex gap-2">
                  {storyDraftFile && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        undoStoryEditorStep();
                      }}
                      className="story-glass-button"
                      aria-label="Undo story edit"
                    >
                      <Undo2 size={20} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (storyDraftFile) openStoryFilePicker();
                    }}
                    className="story-glass-button"
                    aria-label="More"
                  >
                    <MoreHorizontal size={22} />
                  </button>
                </div>
              </>
            )}
          </div>

          {storyDraftFile && (
            <>
              <div
                className={`story-right-toolbar ${
                  storyToolbarCollapsed ||
                  isStoryTextEditorOpen ||
                  isStoryDrawMode ||
                  isStoryTextDragging
                    ? "is-collapsed"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openStoryTextEditor();
                  }}
                  aria-label="Add text"
                >
                  <Type size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsStoryMusicModalOpen(true);
                  }}
                  aria-label="Add music"
                >
                  <Music size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsStoryDrawMode(true);
                  }}
                  aria-label="Draw"
                >
                  <Pencil size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStoryFilterByOffset(1);
                  }}
                  aria-label="Effects"
                >
                  <Sparkles size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStoryToolbarCollapsed(true);
                    window.setTimeout(
                      () => setStoryToolbarCollapsed(false),
                      1200,
                    );
                  }}
                  aria-label="Collapse tools"
                >
                  <ChevronDown size={22} />
                </button>
              </div>

              <div className="story-share-panel">
                <div className="story-share-row">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoryPublishAudience("story");
                    }}
                    className={`story-share-pill ${
                      storyPublishAudience === "story" ? "is-active" : ""
                    }`}
                  >
                    Your Story
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoryPublishAudience("close-friends");
                    }}
                    className={`story-share-pill ${
                      storyPublishAudience === "close-friends"
                        ? "is-active"
                        : ""
                    }`}
                  >
                    Close Friends
                  </button>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void publishStoryDraft();
                  }}
                  disabled={isUploading}
                  className="story-post-button"
                >
                  {isUploading ? (
                    <span>{`Posting ${uploadProgress}%`}</span>
                  ) : (
                    <>
                      <span>
                        {storyPublishAudience === "close-friends"
                          ? "Post to Close Friends"
                          : "Post to Your Story"}
                      </span>
                      <ArrowRight size={20} strokeWidth={3} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {isStoryTextEditorOpen && (
            <div
              className="story-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsStoryTextEditorOpen(false)}
                  className="story-glass-button"
                  aria-label="Close text editor"
                >
                  <X size={20} />
                </button>
                <button
                  type="button"
                  onClick={finishStoryTextEditing}
                  className="story-glass-button px-5 text-sm font-black"
                >
                  Done
                </button>
              </div>
              <div className="story-text-editor-stage">
                <div className="story-text-size-rail">
                  <button
                    type="button"
                    onClick={() =>
                      setStoryDraftTextSize((size) =>
                        Math.max(STORY_TEXT_SIZE_MIN, size - 2),
                      )
                    }
                    className="story-glass-button story-size-stepper"
                    aria-label="Decrease story text size"
                  >
                    -
                  </button>
                  <div className="story-text-size-slider-wrap">
                    <input
                      type="range"
                      min={STORY_TEXT_SIZE_MIN}
                      max={STORY_TEXT_SIZE_MAX}
                      value={storyDraftTextSize}
                      onChange={(event) =>
                        setStoryDraftTextSize(Number(event.target.value))
                      }
                      className="story-text-size-slider"
                      aria-label="Story text size"
                    />
                  </div>
                  <span className="story-text-size-badge">
                    {storyDraftTextSize}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStoryDraftTextSize((size) =>
                        Math.min(STORY_TEXT_SIZE_MAX, size + 2),
                      )
                    }
                    className="story-glass-button story-size-stepper"
                    aria-label="Increase story text size"
                  >
                    +
                  </button>
                </div>
                <textarea
                  value={storyDraftText}
                  maxLength={120}
                  onChange={(event) => setStoryDraftText(event.target.value)}
                  autoFocus
                  placeholder="Type"
                  className={`story-textarea ${getStoryTextFontClassName(
                    storyDraftTextFont,
                  )}`}
                  style={{
                    color: storyDraftTextColor,
                    textAlign: storyDraftTextAlign,
                    fontSize: `${storyDraftTextSize}px`,
                    lineHeight: 1.05,
                  }}
                />
              </div>
              <div className="story-tool-row">
                <button
                  type="button"
                  className="story-control-pill"
                  onClick={() =>
                    setStoryDraftTextColor((color) => {
                      const nextIndex =
                        (STORY_TEXT_COLORS.indexOf(color) + 1) %
                        STORY_TEXT_COLORS.length;
                      return STORY_TEXT_COLORS[nextIndex];
                    })
                  }
                >
                  <Palette size={16} className="mr-2 inline" />
                  Color
                </button>
                <button
                  type="button"
                  className={`story-control-pill ${storyDraftTextBg ? "is-active" : ""}`}
                  onClick={() => setStoryDraftTextBg((enabled) => !enabled)}
                >
                  Bg
                </button>
                <button
                  type="button"
                  className="story-control-pill"
                  onClick={() =>
                    setStoryDraftTextAlign((align) =>
                      align === "center"
                        ? "left"
                        : align === "left"
                          ? "right"
                          : "center",
                    )
                  }
                >
                  <AlignCenter size={16} className="mr-2 inline" />
                  Align
                </button>
                <button type="button" className="story-control-pill">
                  <Play size={16} className="mr-2 inline" />
                  Animate
                </button>
              </div>
              <div className="story-font-carousel scrollbar-hide">
                {STORY_TEXT_FONTS.map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => setStoryDraftTextFont(font)}
                    className={`story-control-pill story-font-pill ${getStoryTextFontClassName(
                      font,
                    )} ${storyDraftTextFont === font ? "is-active" : ""}`}
                  >
                    {font}
                  </button>
                ))}
              </div>
              <div className="story-tool-row items-center">
                {STORY_TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setStoryDraftTextColor(color)}
                    className={`h-10 w-10 shrink-0 rounded-full border-2 ${
                      storyDraftTextColor === color
                        ? "border-white"
                        : "border-white/20"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Use ${color}`}
                  />
                ))}
                <span className="rounded-full border border-[#4ade80]/18 bg-white/8 px-3 py-2 text-xs font-black text-[#d7ffe6]">
                  {storyDraftTextSize}px
                </span>
              </div>
            </div>
          )}

          {isStoryMusicModalOpen && (
            <div
              className="story-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    stopStoryMusicPreview();
                    setIsStoryMusicModalOpen(false);
                  }}
                  className="story-glass-button"
                  aria-label="Close music"
                >
                  <X size={20} />
                </button>
                <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/12 px-4">
                  <Search size={17} className="text-white/65" />
                  <input
                    value={storyMusicSearch}
                    onChange={(event) =>
                      setStoryMusicSearch(event.target.value)
                    }
                    placeholder="Search music"
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/50"
                  />
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
                {["Trending", "For You", "Recent"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className="story-control-pill"
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-hide">
                {filteredStoryMusicPresets.map((music) => (
                  <button
                    key={music.id}
                    type="button"
                    onClick={() => previewStoryMusic(music.id)}
                    className={`grid w-full grid-cols-[54px_1fr] gap-3 rounded-[22px] border p-3 text-left ${
                      storyDraftMusicId === music.id
                        ? "border-[#4ade80]/60 bg-[#4ade80]/14"
                        : "border-white/10 bg-white/[0.07]"
                    }`}
                  >
                    <div
                      className="flex h-[54px] w-[54px] items-center justify-center rounded-2xl"
                      style={{ background: music.color, color: "#081108" }}
                    >
                      <Music size={24} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-white">
                            {music.label}
                          </p>
                          <p className="truncate text-xs font-semibold text-white/58">
                            {music.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {storyDraftMusicId === music.id && (
                            <span className="rounded-full bg-[#4ade80]/18 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#d7ffe6]">
                              Selected
                            </span>
                          )}
                          {music.id !== "none" && (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/24 text-white">
                              {storyPreviewMusicId === music.id ? (
                                <PauseCircle size={18} />
                              ) : (
                                <Volume2 size={18} />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex h-6 items-center gap-1">
                        {[8, 14, 9, 18, 11, 20, 12, 16, 10, 15, 7].map(
                          (height, index) => (
                            <span
                              key={`${music.id}-wave-${index}`}
                              className="w-1 rounded-full bg-white/55"
                              style={{ height }}
                            />
                          ),
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredStoryMusicPresets.length === 0 && (
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.07] px-4 py-5 text-center text-sm font-semibold text-white/62">
                    No free tracks match that search.
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.07] p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.14em] text-white/58">
                  <span>Timeline</span>
                  <span>{storyMusicTrim}s</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  value={storyMusicTrim}
                  onChange={(event) =>
                    setStoryMusicTrim(Number(event.target.value))
                  }
                  className="w-full accent-[#4ade80]"
                  aria-label="Music trim"
                />
                <p className="mt-2 text-[11px] font-semibold text-white/50">
                  Tap a track to preview it. Close this sheet when you want to
                  keep the selected one.
                </p>
              </div>
            </div>
          )}

          {isStoryDrawMode && (
            <div
              className="absolute inset-x-0 bottom-0 z-[72] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="rounded-[28px] border border-white/10 bg-black/64 p-3 shadow-[0_-16px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="story-tool-row scrollbar-hide">
                  {STORY_BRUSHES.map((brush) => (
                    <button
                      key={brush}
                      type="button"
                      onClick={() => setStoryBrush(brush)}
                      className={`story-control-pill ${storyBrush === brush ? "is-active" : ""}`}
                    >
                      {brush}
                    </button>
                  ))}
                </div>
                <div className="story-tool-row items-center">
                  {STORY_TEXT_COLORS.map((color) => (
                    <button
                      key={`brush-${color}`}
                      type="button"
                      onClick={() => setStoryBrushColor(color)}
                      className={`h-10 w-10 shrink-0 rounded-full border-2 ${
                        storyBrushColor === color
                          ? "border-white"
                          : "border-white/20"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Use brush ${color}`}
                    />
                  ))}
                  <SlidersHorizontal size={18} className="text-white/70" />
                  <input
                    type="range"
                    min={2}
                    max={18}
                    value={storyBrushSize}
                    onChange={(event) =>
                      setStoryBrushSize(Number(event.target.value))
                    }
                    className="min-w-28 flex-1 accent-[#4ade80]"
                    aria-label="Brush size"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {false && showStoryUploadModal && (
        <div
          className="app-modal-backdrop fixed inset-0 bg-black/75 z-[100] flex items-end backdrop-blur-sm"
          onClick={closeStoryComposer}
        >
          <div
            className="app-modal-sheet max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,22,20,0.98),rgba(8,9,8,0.98))] p-5 shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] scrollbar-hide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-6" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#86efac]">
                  Story
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  {storyUploadMode === "dedication"
                    ? "Dedicate a story"
                    : storyUploadMode === "personal"
                      ? "Personal story"
                      : "Create story"}
                </h3>
              </div>
              {storyUploadMode && !isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    setStoryUploadMode(null);
                    setDedicationRecipient(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                  aria-label="Back"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {isUploading && (
                <div className="rounded-[24px] border border-[#4ade80]/15 bg-[#08110b]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">
                      Uploading{" "}
                      {storyDraftFiles.length > 1 ? "stories" : "story"}
                    </span>
                    <span className="text-[#4ade80] text-sm font-medium">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-[#2a2a2a] rounded-full h-2">
                    <div
                      className="bg-[#4ade80] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {storyDraftFile && storyDraftPreviewUrl && (
                <div className="space-y-4">
                  {storyDraftFiles.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {storyDraftFiles.map((file, index) => (
                        <button
                          key={`${file.name}-${file.lastModified}-${index}`}
                          type="button"
                          onClick={() => setSelectedStoryDraftIndex(index)}
                          className={`relative h-16 w-11 shrink-0 overflow-hidden rounded-xl border transition-all ${
                            selectedStoryDraftIndex === index
                              ? "border-[#4ade80] ring-2 ring-[#4ade80]/25"
                              : "border-white/10"
                          }`}
                          aria-label={`Preview story media ${index + 1}`}
                        >
                          {file.type.startsWith("video/") ? (
                            <video
                              src={storyDraftPreviewUrls[index]}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={storyDraftPreviewUrls[index]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-bold text-white">
                            {index + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    ref={storyDraftPreviewRef}
                    className="relative mx-auto aspect-[9/16] max-h-[54vh] w-full max-w-[300px] overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
                    onTouchStart={(event) => {
                      storyFilterTouchStartXRef.current =
                        event.touches[0].clientX;
                    }}
                    onTouchEnd={(event) => {
                      const startX = storyFilterTouchStartXRef.current;
                      storyFilterTouchStartXRef.current = null;
                      if (startX === null) return;
                      const dx = event.changedTouches[0].clientX - startX;
                      if (Math.abs(dx) < 45) return;
                      setStoryFilterByOffset(dx < 0 ? 1 : -1);
                    }}
                  >
                    {storyDraftFile.type.startsWith("video/") ? (
                      <video
                        src={storyDraftPreviewUrl}
                        className="h-full w-full object-contain object-center"
                        style={{
                          filter:
                            getStoryFilterPreset(storyDraftFilter).cssFilter,
                        }}
                        muted
                        playsInline
                        autoPlay
                        loop
                      />
                    ) : (
                      <img
                        src={storyDraftPreviewUrl}
                        alt="Story preview"
                        className="h-full w-full object-contain object-center"
                        style={{
                          filter:
                            getStoryFilterPreset(storyDraftFilter).cssFilter,
                        }}
                      />
                    )}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          getStoryFilterPreset(storyDraftFilter).overlay,
                      }}
                    />
                    {storyDraftText.trim() && (
                      <div
                        className={`absolute z-20 max-w-[86%] cursor-grab touch-none select-none text-center active:cursor-grabbing ${
                          isStoryTextDragging
                            ? "ring-2 ring-[#4ade80]/60"
                            : "ring-1 ring-white/12"
                        } rounded-2xl`}
                        style={{
                          left: `${storyDraftTextX}%`,
                          top: `${storyDraftTextY}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        onPointerDown={handleStoryTextPointerDown}
                        onPointerMove={handleStoryTextPointerMove}
                        onPointerUp={handleStoryTextPointerUp}
                        onPointerCancel={handleStoryTextPointerUp}
                      >
                        <span
                          className="inline-block max-w-full break-words rounded-2xl bg-black/28 px-3.5 py-2 font-black leading-tight shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                          style={{
                            color: storyDraftTextColor,
                            fontSize: `${storyDraftTextSize}px`,
                            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                          }}
                        >
                          {storyDraftText}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm">
                      {getStoryFilterPreset(storyDraftFilter).label}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-white/[0.035] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[#d1d5db]">
                      <Type size={15} className="text-[#4ade80]" />
                      <span className="text-xs font-bold uppercase tracking-[0.16em]">
                        Text
                      </span>
                    </div>
                    <input
                      value={storyDraftText}
                      maxLength={120}
                      onChange={(event) =>
                        setStoryDraftText(event.target.value)
                      }
                      placeholder="Add text"
                      className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/45"
                    />
                    <div className="mt-3 flex gap-2">
                      {STORY_TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setStoryDraftTextColor(color)}
                          className={`h-7 w-7 rounded-full border-2 transition-transform ${
                            storyDraftTextColor === color
                              ? "scale-110 border-white"
                              : "border-white/15"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Use text color ${color}`}
                        />
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#cbd5e1]">
                          Text size
                        </span>
                        <span className="text-xs font-bold text-[#86efac]">
                          {storyDraftTextSize}px
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setStoryDraftTextSize((size) =>
                              Math.max(16, size - 2),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-lg font-bold text-white"
                          aria-label="Decrease story text size"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={16}
                          max={42}
                          value={storyDraftTextSize}
                          onChange={(event) =>
                            setStoryDraftTextSize(Number(event.target.value))
                          }
                          className="min-w-0 flex-1 accent-[#4ade80]"
                          aria-label="Story text size"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setStoryDraftTextSize((size) =>
                              Math.min(42, size + 2),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-lg font-bold text-white"
                          aria-label="Increase story text size"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-[#64748b]">
                        Drag the text on the preview to place it.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                      <Wand2 size={14} className="text-[#4ade80]" />
                      Swipe preview or tap a filter
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {STORY_FILTER_PRESETS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setStoryDraftFilter(filter.id)}
                          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                            storyDraftFilter === filter.id
                              ? "border-[#4ade80]/55 bg-[#4ade80]/15 text-[#bbf7d0]"
                              : "border-white/8 bg-white/[0.04] text-[#cbd5e1]"
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                      <Music size={14} className="text-[#facc15]" />
                      Generated copyright-free music
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {STORY_MUSIC_PRESETS.map((music) => (
                        <button
                          key={music.id}
                          type="button"
                          onClick={() => setStoryDraftMusicId(music.id)}
                          className={`rounded-[18px] border p-3 text-left transition-all ${
                            storyDraftMusicId === music.id
                              ? "border-[#4ade80]/45 bg-[#4ade80]/10"
                              : "border-white/8 bg-white/[0.035]"
                          }`}
                        >
                          <p className="text-sm font-bold text-white">
                            {music.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                            {music.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!storyUploadMode && !storyDraftFile && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStoryUploadMode("personal")}
                    className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80] shadow-[0_12px_28px_rgba(74,222,128,0.12)]">
                      <UserRound size={20} />
                    </div>
                    <p className="font-bold text-white">Personal</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                      Your regular story.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoryUploadMode("dedication")}
                    className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#facc15]/35 hover:bg-[#facc15]/8"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#facc15]/20 bg-[#facc15]/10 text-[#facc15] shadow-[0_12px_28px_rgba(250,204,21,0.12)]">
                      <Gift size={20} />
                    </div>
                    <p className="font-bold text-white">Dedication</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                      Pick one person.
                    </p>
                  </button>
                </div>
              )}

              {storyUploadMode === "dedication" && !storyDraftFile && (
                <div className="space-y-3">
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                    {loadingFriends ? (
                      [1, 2, 3].map((item) => (
                        <div
                          key={`dedication-friend-skel-${item}`}
                          className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.035] p-3"
                        >
                          <div className="h-11 w-11 animate-pulse rounded-full bg-white/10" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
                            <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/8" />
                          </div>
                        </div>
                      ))
                    ) : friends.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-center text-sm text-[#94a3b8]">
                        No friends available
                      </div>
                    ) : (
                      friends.map((friend) => {
                        const friendId = friend.user_id || friend.id;
                        const selected =
                          dedicationRecipient &&
                          (dedicationRecipient.user_id ||
                            dedicationRecipient.id) === friendId;

                        return (
                          <button
                            key={friendId}
                            type="button"
                            onClick={() => setDedicationRecipient(friend)}
                            className={`flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition-all ${
                              selected
                                ? "border-[#4ade80]/45 bg-[#4ade80]/10 shadow-[0_12px_30px_rgba(74,222,128,0.12)]"
                                : "border-white/8 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.055]"
                            }`}
                          >
                            <Avatar
                              src={friend.avatar_url || ""}
                              alt={friend.display_name || friend.username}
                              size="md"
                              userId={friendId}
                              username={friend.username}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">
                                {friend.display_name || friend.username}
                              </p>
                              <p className="truncate text-xs text-[#94a3b8]">
                                @{stripAtSymbol(friend.username)}
                              </p>
                            </div>
                            {selected && (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4ade80] text-black">
                                <Check size={15} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {storyUploadMode && !storyDraftFile && (
                <button
                  onClick={openStoryFilePicker}
                  disabled={
                    isUploading ||
                    (storyUploadMode === "dedication" && !dedicationRecipient)
                  }
                  className={`flex w-full items-center justify-center space-x-2 rounded-2xl py-4 font-semibold transition-colors ${
                    isUploading ||
                    (storyUploadMode === "dedication" && !dedicationRecipient)
                      ? "cursor-not-allowed bg-[#2a2a2a] text-[#64748b]"
                      : "bg-[#4ade80] text-black hover:bg-[#22c55e]"
                  }`}
                >
                  <ImagePlus size={20} />
                  <span>{isUploading ? "Uploading..." : "Select media"}</span>
                </button>
              )}
              {storyDraftFile && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={openStoryFilePicker}
                    disabled={isUploading}
                    className="rounded-2xl bg-[#2a2a2a] py-4 font-semibold text-white transition-colors hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:text-[#64748b]"
                  >
                    Change media
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishStoryDraft()}
                    disabled={isUploading}
                    className="rounded-2xl bg-[#4ade80] py-4 font-bold text-black transition-colors hover:bg-[#22c55e] disabled:cursor-not-allowed disabled:bg-[#2a2a2a] disabled:text-[#64748b]"
                  >
                    {isUploading
                      ? "Posting..."
                      : storyDraftFiles.length > 1
                        ? `Post ${storyDraftFiles.length} stories`
                        : "Post story"}
                  </button>
                </div>
              )}
              <button
                onClick={closeStoryComposer}
                disabled={isUploading}
                className={`w-full font-semibold py-4 rounded-2xl transition-colors ${isUploading ? "bg-[#1a1a1a] text-[#64748b] cursor-not-allowed" : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"}`}
              >
                {isUploading ? "Please wait..." : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STORY VIEWER
      ══════════════════════════════════════════ */}
      {selectedCommunityChallenge && (
        <CommunityChallengePreviewScreen
          challenge={selectedHydratedCommunityChallenge || selectedCommunityChallenge}
          isJoined={joinedCommunityChallengeIds.has(
            selectedCommunityChallenge.id,
          )}
          onClose={() => setSelectedCommunityChallenge(null)}
          onJoin={() =>
            handleJoinCommunityChallenge(
              selectedHydratedCommunityChallenge || selectedCommunityChallenge,
            )
          }
          onOpenHub={() => {
            setSelectedCommunityChallenge(null);
            setShowCommunityChallengeHub(true);
          }}
        />
      )}

      {showCommunityChallengeHub && (
        <div className="fixed inset-0 z-[10000] bg-[#030403]">
          <ChallengeHubScreen
            isActive
            onBack={() => setShowCommunityChallengeHub(false)}
          />
        </div>
      )}

      {showStoryViewerModal && viewerStories.length > 0 && (
        <StoryViewer
          stories={viewerStories}
          initialIndex={selectedStoryIndex}
          isOwner={viewerIsOwner}
          currentUserId={currentUser.userId}
          onClose={() => {
            setShowStoryViewerModal(false);
            setViewerStoryAuthorId(null);
            onStoryViewerOpenChange?.(false);
          }}
          onDelete={viewerIsOwner ? handleDeleteStory : undefined}
          onNavigateToProfile={onNavigateToProfile}
          onReact={!viewerIsOwner ? handleStoryReact : undefined}
          onReply={!viewerIsOwner ? handleStoryReply : undefined}
        />
      )}
    </div>
  );
}
