"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Crown,
  Flame,
  ImagePlus,
  Loader2,
  Medal,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  Star,
  Trophy,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { challengeRoomService } from "../../middleware/services/challenge-room.service";
import {
  communityChallengeService,
  type CommunityChallengeJoin,
} from "../../middleware/services/community-challenge.service";
import {
  challengeRoomChatService,
  type ChallengeRoomChatMessage,
} from "../../middleware/services/challenge-room-chat.service";
import { ChallengeRoomComments } from "./ChallengeRoomComments";
import {
  buildLocalMediaPreview,
  type LocalMediaPreview,
} from "@/utils/mediaUpload";
import { Avatar } from "../ui/Avatar";

export type ChallengeRunIcon =
  | "instagram"
  | "sun"
  | "droplets"
  | "book"
  | "moon"
  | "shield";

export type JoinedChallengeRun = {
  id: string;
  title: string;
  day: number;
  totalDays: number;
  survivors: number;
  accent: string;
  icon: ChallengeRunIcon;
  status: "upload_due" | "submitted" | "upload_today";
  countdown?: string;
  lifecycleStatus?: "active" | "submitted" | "completed" | "eliminated";
  proofDueAtMs?: number | null;
  eliminatedAtMs?: number | null;
  completedAtMs?: number | null;
  eliminationReason?: string;
};

type RoomPanel = "leaderboard" | "members" | "chat" | "rules" | null;
type ProofVote = "real" | "fake" | null;
type ProofMediaKind = "image" | "video" | "mock";
type MockMediaTone = "screen-time" | "sunrise" | "study";

export type ChallengeProofPost = {
  id: string;
  challengeId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  timePosted: string;
  proofDay: number;
  caption: string;
  realVotes: number;
  fakeVotes: number;
  comments: number;
  media: {
    type: ProofMediaKind;
    url?: string;
    thumbnail?: string;
    tone?: MockMediaTone;
  };
  submittedAtMs: number;
};

const MOCK_ACCENTS = ["#4ade80", "#38bdf8", "#facc15", "#86efac"];

const MOCK_PROOF_SEEDS = [
  {
    id: "arun",
    username: "arun.moves",
    displayName: "Arun",
    caption: "Proof in before the timer. Kept the streak clean.",
    realVotes: 82,
    fakeVotes: 3,
    comments: 12,
    mediaTone: "screen-time" as MockMediaTone,
  },
  {
    id: "sneha",
    username: "sneha.daily",
    displayName: "Sneha",
    caption: "Submitted early today. No excuses window.",
    realVotes: 68,
    fakeVotes: 6,
    comments: 9,
    mediaTone: "sunrise" as MockMediaTone,
  },
  {
    id: "kavin",
    username: "kavin.focus",
    displayName: "Kavin",
    caption: "Day proof locked. Keeping the run alive.",
    realVotes: 75,
    fakeVotes: 4,
    comments: 15,
    mediaTone: "study" as MockMediaTone,
  },
];

function makeMockAvatar(name: string, accent: string) {
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><radialGradient id="g" cx="32%" cy="24%" r="82%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".62"/><stop offset="28%" stop-color="${accent}" stop-opacity=".96"/><stop offset="100%" stop-color="#071008"/></radialGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><circle cx="90" cy="24" r="22" fill="#0ea5e9" opacity=".28"/><text x="60" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#031006">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatTimePosted(timestampMs: number) {
  const diffMs = Math.max(0, Date.now() - timestampMs);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCountdownFromMs(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function getProofDocId(challengeId: string, userId: string, day: number) {
  return `${challengeId}_${userId}_day_${day}`.replace(/[^\w.-]/g, "_");
}

function normalizeProofDoc(id: string, data: any): ChallengeProofPost | null {
  const mediaType = data.media_type === "video" ? "video" : "image";
  const mediaUrl = typeof data.media_url === "string" ? data.media_url : "";
  if (!mediaUrl) return null;

  const submittedAtMs =
    typeof data.client_created_at === "number"
      ? data.client_created_at
      : data.created_at?.toDate?.()?.getTime?.() || Date.now();
  const displayName =
    String(data.submitter_name || data.submitter_username || "Dare User")
      .trim()
      .slice(0, 80) || "Dare User";
  const username =
    String(data.submitter_username || displayName)
      .replace(/^@/, "")
      .trim()
      .slice(0, 40) || "dareuser";

  return {
    id,
    challengeId: String(data.challenge_id || ""),
    userId: String(data.submitter_id || ""),
    username,
    displayName,
    avatarUrl:
      typeof data.submitter_avatar === "string" && data.submitter_avatar
        ? data.submitter_avatar
        : makeMockAvatar(
            displayName,
            MOCK_ACCENTS[id.length % MOCK_ACCENTS.length],
          ),
    timePosted: formatTimePosted(submittedAtMs),
    proofDay: Math.max(1, Number(data.day || 1)),
    caption:
      String(data.caption || "Proof submitted for today's community dare.")
        .trim()
        .slice(0, 180) || "Proof submitted for today's community dare.",
    realVotes: Math.max(0, Number(data.real_votes || 0)),
    fakeVotes: Math.max(0, Number(data.fake_votes || 0)),
    comments: Math.max(0, Number(data.comments || 0)),
    media: {
      type: mediaType,
      url: mediaUrl,
      thumbnail:
        typeof data.thumbnail_url === "string" && data.thumbnail_url
          ? data.thumbnail_url
          : mediaType === "image"
            ? mediaUrl
            : undefined,
    },
    submittedAtMs,
  };
}

function buildMockProofs(challenge: JoinedChallengeRun): ChallengeProofPost[] {
  return MOCK_PROOF_SEEDS.map((seed, index) => {
    const submittedAtMs = Date.now() - (index + 2) * 42 * 60000;
    return {
      id: `mock-${challenge.id}-${seed.id}-day-${challenge.day}`,
      challengeId: challenge.id,
      userId: `mock-${seed.id}`,
      username: seed.username,
      displayName: seed.displayName,
      avatarUrl: makeMockAvatar(seed.displayName, MOCK_ACCENTS[index]),
      timePosted: formatTimePosted(submittedAtMs),
      proofDay: challenge.day,
      caption: seed.caption,
      realVotes: seed.realVotes,
      fakeVotes: seed.fakeVotes,
      comments: seed.comments,
      media: {
        type: "mock",
        tone: seed.mediaTone,
      },
      submittedAtMs,
    };
  });
}

function RoomStyles() {
  return (
    <style>{`
      @keyframes roomFadeUp {
        from { opacity: 0; transform: translateY(16px) scale(0.985); filter: blur(7px); }
        to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes roomSweep {
        0% { transform: translateX(-125%); }
        24% { transform: translateX(125%); }
        100% { transform: translateX(125%); }
      }
      @keyframes roomGlow {
        0%, 100% { opacity: 0.62; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.05); }
      }
      .challenge-room-panel {
        animation: roomFadeUp 0.46s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .challenge-room-shine::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.11), transparent);
        animation: roomSweep 6.8s ease-in-out infinite;
        pointer-events: none;
      }
      .challenge-room-glyph {
        animation: roomGlow 3.9s ease-in-out infinite;
      }
    `}</style>
  );
}

function RoomGlyph({
  icon,
  accent,
  size = "large",
}: {
  icon: ChallengeRunIcon;
  accent: string;
  size?: "large" | "small";
}) {
  const boxClass =
    size === "small" ? "h-11 w-11 rounded-[18px]" : "h-14 w-14 rounded-[22px]";
  const coreClass = size === "small" ? "h-5 w-5" : "h-6 w-6";

  return (
    <div
      className={`relative flex ${boxClass} shrink-0 items-center justify-center overflow-hidden border shadow-[0_16px_38px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)]`}
      style={{
        borderColor: `${accent}34`,
        background: `linear-gradient(180deg, ${accent}19, rgba(255,255,255,0.035))`,
      }}
    >
      <div
        className="absolute inset-2 rounded-[inherit] border border-white/8"
        style={{ boxShadow: `inset 0 0 22px ${accent}14` }}
      />
      {icon === "sun" ? (
        <span
          className={`challenge-room-glyph ${coreClass} rounded-full`}
          style={{ background: accent, boxShadow: `0 0 20px ${accent}88` }}
        />
      ) : icon === "droplets" ? (
        <span
          className={`challenge-room-glyph ${coreClass} rotate-45 rounded-br-full rounded-tl-full rounded-tr-full`}
          style={{
            background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.72))`,
            boxShadow: `0 0 20px ${accent}70`,
          }}
        />
      ) : icon === "book" ? (
        <span className={`challenge-room-glyph ${coreClass} relative`}>
          <span
            className="absolute inset-y-0 left-0 w-[46%] rounded-l-md"
            style={{ background: accent }}
          />
          <span
            className="absolute inset-y-0 right-0 w-[46%] rounded-r-md"
            style={{ background: `${accent}bb` }}
          />
        </span>
      ) : icon === "moon" ? (
        <span
          className={`challenge-room-glyph ${coreClass} rounded-full`}
          style={{
            background: accent,
            boxShadow: `inset -7px 0 0 rgba(3,4,3,0.95), 0 0 20px ${accent}70`,
          }}
        />
      ) : icon === "instagram" ? (
        <span
          className={`challenge-room-glyph ${coreClass} relative rounded-[7px] border-2`}
          style={{ borderColor: accent, boxShadow: `0 0 20px ${accent}62` }}
        >
          <span
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: accent }}
          />
        </span>
      ) : (
        <span
          className={`challenge-room-glyph ${coreClass} rounded-[9px]`}
          style={{
            background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.72))`,
            clipPath:
              "polygon(50% 0%, 90% 18%, 82% 82%, 50% 100%, 18% 82%, 10% 18%)",
            boxShadow: `0 0 20px ${accent}70`,
          }}
        />
      )}
    </div>
  );
}

function MockProofMedia({ tone }: { tone: MockMediaTone }) {
  if (tone === "screen-time") {
    return (
      <div className="h-full rounded-[24px] bg-[linear-gradient(180deg,#eef2f7,#d7dde8)] p-4 text-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="text-base font-black text-[#2563eb]">Screen Time</div>
        <div className="mt-4 text-xs font-bold text-[#64748b]">
          Daily Average
        </div>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div className="text-[34px] font-black leading-none">0m</div>
          <div className="text-right text-xs font-bold text-[#64748b]">
            down 95% from last week
          </div>
        </div>
        <div className="mt-5 grid h-20 grid-cols-7 items-end gap-2 border-t border-[#cbd5e1] pt-3">
          {[34, 58, 66, 38, 0, 0, 0].map((height, index) => (
            <div key={index} className="flex h-full flex-col justify-end gap-2">
              <div
                className="rounded-t-md bg-[#3b82f6]"
                style={{ height: `${height}%`, opacity: height ? 1 : 0.18 }}
              />
              <div className="text-center text-xs font-black text-[#64748b]">
                {"SMTWTFS"[index]}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tone === "sunrise") {
    return (
      <div className="relative h-full overflow-hidden rounded-[24px] bg-[radial-gradient(circle_at_50%_15%,rgba(250,204,21,0.72),transparent_24%),radial-gradient(circle_at_70%_36%,rgba(74,222,128,0.26),transparent_28%),linear-gradient(180deg,#064e3b,#111827_62%,#020617)]">
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(3,7,18,0.86))]" />
        <div className="absolute bottom-5 left-5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-md">
          Outside proof verified
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-[24px] bg-[radial-gradient(circle_at_22%_22%,rgba(74,222,128,0.28),transparent_22%),radial-gradient(circle_at_80%_18%,rgba(14,165,233,0.22),transparent_24%),linear-gradient(135deg,#111827,#071008)] p-4">
      <div className="grid h-full grid-cols-2 gap-4">
        <div className="rounded-[18px] border border-white/10 bg-white/[0.055] p-4">
          <div className="h-3 w-24 rounded-full bg-[#4ade80]/70" />
          <div className="mt-4 h-3 w-32 rounded-full bg-white/20" />
          <div className="mt-2 h-3 w-20 rounded-full bg-white/14" />
          <div className="mt-8 h-16 rounded-[14px] bg-[#4ade80]/16" />
        </div>
        <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[34px] font-black text-[#4ade80]">3h</div>
          <div className="mt-1 text-xs font-bold text-[#94a3b8]">
            focus session
          </div>
          <div className="mt-8 h-2 rounded-full bg-white/10">
            <div className="h-full w-[92%] rounded-full bg-[#4ade80]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DateSeparator({ date, day }: { date: string; day: number }) {
  return (
    <div className="my-6 flex justify-center">
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(135deg,rgba(74,222,128,0.18),rgba(14,165,233,0.12)) blur-xl" />
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(14,165,233,0.38),rgba(74,222,128,0))] opacity-60" />
        <div className="relative rounded-full border border-[#4ade80]/20 bg-[linear-gradient(135deg,rgba(6,8,6,0.96),rgba(3,4,3,0.98))] px-6 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.42),0_0_24px_rgba(74,222,128,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.64)]" />
            <span className="text-[13px] font-black uppercase tracking-[0.12em] text-[#86efac] drop-shadow-[0_0_8px_rgba(74,222,128,0.32)]">
              {date}
            </span>
            <span className="text-[13px] font-black uppercase tracking-[0.12em] text-white/90">
              - Day {day}
            </span>
            <div className="h-2 w-2 rounded-full bg-[#0ea5e9] shadow-[0_0_12px_rgba(14,165,233,0.64)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProofCard({
  proof,
  vote,
  onVote,
  onMediaTap,
  currentUserId,
  onOpenComments,
}: {
  proof: ChallengeProofPost;
  vote: ProofVote;
  onVote: (vote: ProofVote) => void;
  onMediaTap: () => void;
  currentUserId?: string;
  onOpenComments: (proof: ChallengeProofPost) => void;
}) {
  const realVotes = proof.realVotes;
  const fakeVotes = proof.fakeVotes;
  const isOwn = proof.userId === currentUserId;
  const canVote = Boolean(currentUserId) && proof.media.type !== "mock";

  return (
    <article
      className={`flex w-full gap-2.5 mb-8 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
    >
      {!isOwn && (
        <div className="shrink-0 mt-1">
          <Avatar
            src={proof.avatarUrl}
            alt={proof.displayName}
            fallbackText={proof.displayName.charAt(0)}
            size={46}
            disableGhostMode
            style={{ border: "1.5px solid rgba(74,222,128,0.18)" }}
          />
        </div>
      )}

      <div
        className={`flex max-w-[82%] flex-col gap-1.5 ${isOwn ? "items-end" : "items-start"}`}
      >
        {!isOwn && (
          <div className="flex items-center gap-2 px-2">
            <span className="text-[15px] font-black text-white">
              {proof.displayName}
            </span>
            <span className="text-[11px] font-semibold text-[#64748b]">
              @{proof.username}
            </span>
          </div>
        )}

        <div
          className={`relative overflow-hidden rounded-[24px] border shadow-[0_12px_36px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] ${
            isOwn
              ? "border-[#4ade80]/18 bg-[linear-gradient(180deg,rgba(12,18,14,0.98),rgba(4,7,6,0.99))]"
              : "border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))]"
          }`}
        >
          <button
            type="button"
            onClick={onMediaTap}
            className="relative block w-full overflow-hidden rounded-[24px]"
            style={{ width: "320px", height: "352px" }}
            aria-label="Open proof media fullscreen"
          >
            {proof.media.type === "mock" ? (
              <MockProofMedia tone={proof.media.tone || "study"} />
            ) : proof.media.type === "video" ? (
              <>
                <video
                  src={proof.media.url}
                  poster={proof.media.thumbnail}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/18 bg-black/42 text-white backdrop-blur-md">
                    <Play size={24} fill="currentColor" />
                  </div>
                </div>
              </>
            ) : (
              <img
                src={proof.media.url}
                alt={`${proof.displayName} proof`}
                className="h-full w-full object-cover"
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(3,4,3,0.72))]" />
          </button>

          <div className="p-3">
            {proof.caption && (
              <p className="text-[15px] font-black leading-relaxed text-white">
                {proof.caption}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onVote(vote === "real" ? null : "real")}
                disabled={!canVote}
                className={`app-pressable flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-black uppercase ${
                  vote === "real"
                    ? "border-[#4ade80]/48 bg-[#4ade80]/18 text-[#d7ffe6]"
                    : "border-white/8 bg-white/[0.035] text-[#4ade80]"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <CheckCircle2 size={17} strokeWidth={2.25} />
                {realVotes} real
              </button>
              <button
                type="button"
                onClick={() => onVote(vote === "fake" ? null : "fake")}
                disabled={!canVote}
                className={`app-pressable flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-black uppercase ${
                  vote === "fake"
                    ? "border-red-400/48 bg-red-500/16 text-red-200"
                    : "border-white/8 bg-white/[0.035] text-red-400"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <XCircle size={17} strokeWidth={2.25} />
                {fakeVotes} fake
              </button>
              <button
                type="button"
                onClick={() => onOpenComments(proof)}
                className="app-pressable flex min-h-[42px] min-w-[62px] items-center justify-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-2 text-xs font-black text-[#cbd5e1]"
              >
                <MessageCircle size={17} strokeWidth={2.25} />
                {proof.comments}
              </button>
            </div>

            <div
              className={`mt-2 flex items-center gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <span className="text-[10px] font-semibold text-[#64748b]">
                {proof.timePosted}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ProofComposer({
  selectedPreview,
  caption,
  isBusy,
  submitDisabled,
  error,
  submittedToday,
  onCaptionChange,
  onPickMedia,
  onRemoveMedia,
  onSubmit,
}: {
  selectedPreview: LocalMediaPreview | null;
  caption: string;
  isBusy: boolean;
  submitDisabled: boolean;
  error: string | null;
  submittedToday: boolean;
  onCaptionChange: (value: string) => void;
  onPickMedia: () => void;
  onRemoveMedia: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="challenge-room-panel relative overflow-hidden rounded-[30px] border border-[#4ade80]/16 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(8,11,9,0.99))] p-4 shadow-[0_22px_62px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[#4ade80]/12 blur-3xl" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#86efac]">
              Your proof
            </p>
            <h2 className="mt-1 text-[21px] font-black leading-none text-white">
              Submit today&apos;s media
            </h2>
          </div>
          {submittedToday ? (
            <div className="rounded-full border border-[#4ade80]/22 bg-[#4ade80]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#86efac]">
              Submitted
            </div>
          ) : null}
        </div>

        {selectedPreview ? (
          <div className="mt-4 overflow-hidden rounded-[26px] border border-white/8 bg-[#071008]">
            <div className="relative h-[228px]">
              {selectedPreview.type === "video" ? (
                <video
                  src={selectedPreview.url}
                  poster={selectedPreview.thumbnail}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={selectedPreview.url}
                  alt="Selected proof"
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={onRemoveMedia}
                className="app-pressable absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/42 text-white backdrop-blur-md"
                aria-label="Remove selected proof"
              >
                <X size={19} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>{selectedPreview.type} proof</span>
              <span>{selectedPreview.sizeLabel}</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPickMedia}
            disabled={isBusy}
            className="app-pressable mt-4 flex min-h-[138px] w-full flex-col items-center justify-center rounded-[26px] border border-dashed border-[#4ade80]/26 bg-[#4ade80]/[0.055] px-5 text-center text-[#bbf7d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
          >
            <ImagePlus size={30} strokeWidth={2.1} />
            <span className="mt-3 text-[13px] font-black uppercase tracking-[0.08em]">
              Choose photo or video proof
            </span>
          </button>
        )}

        <textarea
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder="Add a short proof note..."
          maxLength={180}
          className="mt-3 min-h-[72px] w-full resize-none rounded-[22px] border border-white/8 bg-white/[0.045] px-4 py-3 text-[14px] font-semibold leading-relaxed text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/28"
        />

        {error ? (
          <div className="mt-3 rounded-[18px] border border-red-400/18 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="app-pressable mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-sm font-black uppercase tracking-[0.06em] text-[#061006] shadow-[0_16px_34px_rgba(74,222,128,0.22)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isBusy ? (
            <Loader2 size={19} className="animate-spin" />
          ) : (
            <Upload size={19} />
          )}
          {isBusy
            ? "Submitting proof"
            : submittedToday
              ? "Replace proof"
              : "Submit proof"}
        </button>
      </div>
    </section>
  );
}

function OptionsMenu({
  onClose,
  onUpload,
  onOpenPanel,
}: {
  onClose: () => void;
  onUpload: () => void;
  onOpenPanel: (panel: Exclude<RoomPanel, null>) => void;
}) {
  const items: Array<{
    id: "upload" | Exclude<RoomPanel, null>;
    label: string;
    body: string;
    icon: typeof Upload;
  }> = [
    {
      id: "upload",
      label: "Upload proof",
      body: "Choose today's media",
      icon: Upload,
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      body: "Survivors and rank",
      icon: Trophy,
    },
    {
      id: "members",
      label: "View members",
      body: "Alive and eliminated",
      icon: Users,
    },
    {
      id: "chat",
      label: "Group chat",
      body: "Room conversation",
      icon: MessageCircle,
    },
    {
      id: "rules",
      label: "Rules",
      body: "Proof and deadline",
      icon: BookOpen,
    },
  ];

  return (
    <div className="fixed inset-0 z-[2300] bg-black/36 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close options"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="challenge-room-panel absolute right-4 top-[calc(var(--safe-area-top)+66px)] w-[282px] overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,23,19,0.98),rgba(7,10,8,0.99))] p-2 shadow-[0_28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.05)]">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "upload") {
                  onUpload();
                } else {
                  onOpenPanel(item.id);
                }
              }}
              className="app-pressable flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left hover:bg-white/[0.045]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac]">
                <Icon size={20} strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-black uppercase text-white">
                  {item.label}
                </div>
                <div className="mt-0.5 text-xs font-semibold text-[#94a3b8]">
                  {item.body}
                </div>
              </div>
              <ChevronRight size={17} className="text-[#64748b]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoomInfoPanel({
  panel,
  onClose,
  challenge,
}: {
  panel: Exclude<RoomPanel, null>;
  onClose: () => void;
  challenge: JoinedChallengeRun;
}) {
  const copy = {
    leaderboard: {
      title: "Leaderboard",
      icon: Trophy,
      body: `${challenge.survivors} people are still alive in this community dare. Rankings update after proof review and activity settles.`,
      action: "Done",
    },
    members: {
      title: "Members",
      icon: Users,
      body: "See everyone in this run, including the people still alive and the people who were eliminated.",
      action: "Done",
    },
    chat: {
      title: "Group Chat",
      icon: MessageCircle,
      body: "Room chat stays here for reminders, proof reactions, and quick accountability nudges.",
      action: "Done",
    },
    rules: {
      title: "Room Rules",
      icon: BookOpen,
      body: "Upload one clear photo or video proof for the current day before the timer ends. Missing proof means the run can mark you out.",
      action: "Got it",
    },
  }[panel];
  const Icon = copy.icon;

  return (
    <div className="fixed inset-0 z-[2400] flex items-end bg-black/68 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative w-full rounded-t-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,23,19,0.98),rgba(7,10,8,0.99))] p-4 pb-[calc(var(--safe-area-bottom)+18px)] shadow-[0_-24px_80px_rgba(0,0,0,0.55)]">
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-white/18" />
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <Icon size={22} strokeWidth={2.25} />
          </div>
          <div>
            <div className="text-[20px] font-black uppercase text-white">
              {copy.title}
            </div>
            <div className="mt-1 text-xs font-semibold text-[#94a3b8]">
              {challenge.title}
            </div>
          </div>
        </div>
        <p className="text-sm font-semibold leading-relaxed text-[#cbd5e1]">
          {copy.body}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="app-pressable mt-5 flex min-h-[52px] w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-sm font-black uppercase tracking-[0.06em] text-[#061006]"
        >
          {copy.action}
        </button>
      </div>
    </div>
  );
}

function formatChatTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ChallengeRoomGroupChat({
  challenge,
  currentUser,
  onClose,
}: {
  challenge: JoinedChallengeRun;
  currentUser?: {
    id?: string;
    username?: string;
    displayName?: string;
    avatar?: string;
  } | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChallengeRoomChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const trimmedDraft = draft.trim();

  useEffect(() => {
    return challengeRoomChatService.subscribeToMessages(
      challenge.id,
      setMessages,
      (message) => setChatError(message || null),
    );
  }, [challenge.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!trimmedDraft || isSending) return;
    if (!currentUser?.id) {
      setChatError("Please log in before sending a room message.");
      return;
    }

    const nextMessage = trimmedDraft;
    setDraft("");
    setIsSending(true);
    setChatError(null);

    const result = await challengeRoomChatService.sendMessage({
      challengeId: challenge.id,
      senderId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatar,
      content: nextMessage,
    });

    if (!result.success) {
      setDraft(nextMessage);
      setChatError(result.error || "Could not send message. Try again.");
    }
    setIsSending(false);
  };

  return (
    <div className="fixed inset-0 z-[2700] bg-[#030403] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.17),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-white/8 bg-[#030403]/72 px-4 pb-3 pt-[calc(var(--safe-area-top)+10px)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to room"
              className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/22 bg-[#4ade80]/10 text-[#86efac]">
              <Users size={21} strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18px] font-black leading-tight text-white">
                {challenge.title}
              </h2>
              <p className="mt-0.5 truncate text-[12px] font-bold text-[#94a3b8]">
                Group chat - {challenge.survivors} members alive
              </p>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5">
          {chatError ? (
            <div className="mb-4 rounded-[20px] border border-[#facc15]/18 bg-[#facc15]/10 px-4 py-3 text-xs font-bold text-[#fde68a]">
              {chatError}
            </div>
          ) : null}

          {messages.length === 0 ? (
            <div className="flex min-h-[52vh] items-center justify-center">
              <div className="max-w-[320px] rounded-[28px] border border-white/8 bg-white/[0.045] px-5 py-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]">
                  <MessageCircle size={26} />
                </div>
                <h3 className="mt-4 text-[18px] font-black text-white">
                  Start the room chat
                </h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[#94a3b8]">
                  Send reminders, hype the run, or call out proof windows with
                  the people still in this community dare.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((message) => {
                const isOwn = message.senderId === currentUser?.id;

                return (
                  <article
                    key={message.id}
                    className={`flex w-full gap-2.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {!isOwn ? (
                      <Avatar
                        src={message.avatarUrl}
                        alt={message.displayName}
                        fallbackText={message.displayName.charAt(0)}
                        size={36}
                        disableGhostMode
                        style={{ border: "1.5px solid rgba(74,222,128,0.18)" }}
                      />
                    ) : null}
                    <div
                      className={`flex max-w-[78%] flex-col ${isOwn ? "items-end" : "items-start"}`}
                    >
                      {!isOwn ? (
                        <div className="mb-1 flex max-w-full items-center gap-1.5 px-1">
                          <span className="truncate text-[12px] font-black text-[#bbf7d0]">
                            {message.displayName}
                          </span>
                          <span className="text-[10px] font-bold text-[#64748b]">
                            @{message.username}
                          </span>
                        </div>
                      ) : null}
                      <div
                        className={`rounded-[22px] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)] ${
                          isOwn
                            ? "rounded-tr-[8px] border border-[#4ade80]/20 bg-[#12301d] text-white"
                            : "rounded-tl-[8px] border border-white/8 bg-white/[0.06] text-[#f8fafc]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-[14px] font-semibold leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                      <span className="mt-1 px-1 text-[10px] font-semibold text-[#64748b]">
                        {formatChatTime(message.createdAtMs)}
                      </span>
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="shrink-0 border-t border-white/8 bg-[#030403]/86 px-4 pb-[calc(var(--safe-area-bottom)+12px)] pt-3 backdrop-blur-xl"
        >
          <div className="flex items-end gap-2 rounded-[26px] border border-white/8 bg-white/[0.045] p-2 shadow-[0_-10px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 700))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Message the room..."
              rows={1}
              className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] font-semibold leading-relaxed text-white outline-none placeholder:text-[#64748b]"
            />
            <button
              type="submit"
              disabled={!trimmedDraft || isSending}
              aria-label="Send room message"
              className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_12px_28px_rgba(74,222,128,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSending ? (
                <Loader2 size={19} className="animate-spin" />
              ) : (
                <Send size={19} strokeWidth={2.45} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type LeaderboardMember = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  status: string;
};

type LeaderboardEntry = LeaderboardMember & {
  rank: number;
  score: number;
  proofCount: number;
  realVotes: number;
  appreciationComments: number;
  earlyPoints: number;
  earliestUploadMs: number | null;
};

function normalizeLeaderboardMember(data: any): LeaderboardMember | null {
  const userId = String(data?.user_id || "");
  if (!userId) return null;
  const username =
    String(data?.username || "dareuser").replace(/^@/, "").trim().slice(0, 40) ||
    "dareuser";
  const displayName =
    String(data?.display_name || username || "Dare User").trim().slice(0, 80) ||
    "Dare User";

  return {
    userId,
    username,
    displayName,
    avatarUrl: String(data?.avatar_url || ""),
    status: String(data?.status || "active"),
  };
}

function buildLeaderboardEntries(
  members: LeaderboardMember[],
  proofs: ChallengeProofPost[],
  votes: Array<{ proofId: string; vote: "real" | "fake" }>,
  comments: Array<{ proofId: string }>,
): LeaderboardEntry[] {
  const entries = new Map<string, LeaderboardEntry>();
  const proofOwner = new Map<string, string>();
  const realVotesByProof = new Map<string, number>();
  const commentsByProof = new Map<string, number>();
  const proofsByDay = new Map<number, ChallengeProofPost[]>();
  const earlyPointsByProof = new Map<string, number>();

  members.forEach((member) => {
    entries.set(member.userId, {
      ...member,
      rank: 0,
      score: 0,
      proofCount: 0,
      realVotes: 0,
      appreciationComments: 0,
      earlyPoints: 0,
      earliestUploadMs: null,
    });
  });

  proofs.forEach((proof) => {
    proofOwner.set(proof.id, proof.userId);
    if (!entries.has(proof.userId)) {
      entries.set(proof.userId, {
        userId: proof.userId,
        username: proof.username,
        displayName: proof.displayName,
        avatarUrl: proof.avatarUrl,
        status: "active",
        rank: 0,
        score: 0,
        proofCount: 0,
        realVotes: 0,
        appreciationComments: 0,
        earlyPoints: 0,
        earliestUploadMs: null,
      });
    }
    const dayProofs = proofsByDay.get(proof.proofDay) || [];
    dayProofs.push(proof);
    proofsByDay.set(proof.proofDay, dayProofs);
  });

  votes.forEach((vote) => {
    if (vote.vote !== "real") return;
    realVotesByProof.set(vote.proofId, (realVotesByProof.get(vote.proofId) || 0) + 1);
  });

  comments.forEach((comment) => {
    commentsByProof.set(comment.proofId, (commentsByProof.get(comment.proofId) || 0) + 1);
  });

  proofsByDay.forEach((dayProofs) => {
    [...dayProofs]
      .sort((a, b) => a.submittedAtMs - b.submittedAtMs)
      .forEach((proof, index) => {
        earlyPointsByProof.set(proof.id, Math.max(2, 14 - index * 2));
      });
  });

  proofs.forEach((proof) => {
    const entry = entries.get(proof.userId);
    if (!entry) return;
    const realVotes = realVotesByProof.get(proof.id) || 0;
    const appreciationComments = commentsByProof.get(proof.id) || 0;
    const earlyPoints = earlyPointsByProof.get(proof.id) || 0;

    entry.proofCount += 1;
    entry.realVotes += realVotes;
    entry.appreciationComments += appreciationComments;
    entry.earlyPoints += earlyPoints;
    entry.earliestUploadMs =
      entry.earliestUploadMs === null
        ? proof.submittedAtMs
        : Math.min(entry.earliestUploadMs, proof.submittedAtMs);
  });

  return Array.from(entries.values())
    .map((entry) => ({
      ...entry,
      score:
        entry.realVotes * 4 +
        entry.appreciationComments * 3 +
        entry.earlyPoints,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.realVotes !== a.realVotes) return b.realVotes - a.realVotes;
      if (b.appreciationComments !== a.appreciationComments) {
        return b.appreciationComments - a.appreciationComments;
      }
      if (b.earlyPoints !== a.earlyPoints) return b.earlyPoints - a.earlyPoints;
      return (a.earliestUploadMs || Infinity) - (b.earliestUploadMs || Infinity);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function RankBadge({ rank }: { rank: number }) {
  const isTop = rank <= 3;
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
        rank === 1
          ? "border-[#facc15]/36 bg-[#facc15]/16 text-[#fde68a]"
          : rank === 2
            ? "border-[#cbd5e1]/28 bg-white/[0.08] text-[#e2e8f0]"
            : rank === 3
              ? "border-[#fb923c]/28 bg-[#fb923c]/12 text-[#fed7aa]"
              : "border-white/8 bg-white/[0.045] text-[#94a3b8]"
      }`}
    >
      {isTop ? <Medal size={18} strokeWidth={2.4} /> : rank}
    </div>
  );
}

function ChallengeRoomLeaderboard({
  challenge,
  onClose,
}: {
  challenge: JoinedChallengeRun;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<LeaderboardMember[]>([]);
  const [proofs, setProofs] = useState<ChallengeProofPost[]>([]);
  const [votes, setVotes] = useState<Array<{ proofId: string; vote: "real" | "fake" }>>([]);
  const [comments, setComments] = useState<Array<{ proofId: string }>>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const proofIdsKey = useMemo(
    () => proofs.map((proof) => proof.id).join("|"),
    [proofs],
  );

  useEffect(() => {
    const membersQuery = query(
      collection(db, "community_challenge_joins"),
      where("challenge_id", "==", challenge.id),
      limit(200),
    );

    return onSnapshot(
      membersQuery,
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((memberDoc) =>
              normalizeLeaderboardMember(memberDoc.data()),
            )
            .filter((member): member is LeaderboardMember => member !== null),
        );
        setLeaderboardError(null);
      },
      (error) => {
        console.warn("Community leaderboard members unavailable:", error);
        setLeaderboardError("Leaderboard members are unavailable right now.");
      },
    );
  }, [challenge.id]);

  useEffect(() => {
    const proofsQuery = query(
      collection(db, "challenge_room_proofs"),
      where("challenge_id", "==", challenge.id),
      limit(240),
    );

    return onSnapshot(
      proofsQuery,
      (snapshot) => {
        setProofs(
          snapshot.docs
            .map((proofDoc) => normalizeProofDoc(proofDoc.id, proofDoc.data()))
            .filter((proof): proof is ChallengeProofPost => Boolean(proof)),
        );
      },
      (error) => {
        console.warn("Community leaderboard proofs unavailable:", error);
        setLeaderboardError("Leaderboard proof stats are unavailable right now.");
      },
    );
  }, [challenge.id]);

  useEffect(() => {
    const proofIds = proofIdsKey ? proofIdsKey.split("|").filter(Boolean) : [];
    return challengeRoomService.subscribeToProofVotesByProofIds(
      proofIds,
      (proofVotes) => {
        setVotes(
          proofVotes.map((vote) => ({
            proofId: vote.proofId,
            vote: vote.vote,
          })),
        );
      },
    );
  }, [proofIdsKey]);

  useEffect(() => {
    const proofIds = proofIdsKey ? proofIdsKey.split("|").filter(Boolean) : [];
    return challengeRoomService.subscribeToProofCommentsByProofIds(
      proofIds,
      (proofComments) => {
        setComments(proofComments.map((comment) => ({ proofId: comment.proofId })));
      },
    );
  }, [proofIdsKey]);

  const entries = useMemo(
    () => buildLeaderboardEntries(members, proofs, votes, comments),
    [comments, members, proofs, votes],
  );
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const totalScore = entries.reduce((sum, entry) => sum + entry.score, 0);
  const topScore = entries[0]?.score || 0;

  return (
    <div className="fixed inset-0 z-[2700] bg-[#030403] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-14%,rgba(250,204,21,0.18),transparent_30%),radial-gradient(circle_at_14%_20%,rgba(74,222,128,0.16),transparent_30%),radial-gradient(circle_at_90%_24%,rgba(14,165,233,0.12),transparent_30%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="shrink-0 px-4 pb-3 pt-[calc(var(--safe-area-top)+10px)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to room"
              className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#fde68a]">
                Room leaderboard
              </p>
              <h2 className="mt-1 truncate text-[23px] font-black leading-none text-white">
                {challenge.title}
              </h2>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[#facc15]/24 bg-[#facc15]/12 text-[#fde68a]">
              <Crown size={22} strokeWidth={2.35} />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+24px)] pt-2">
          <section className="challenge-room-panel challenge-room-shine relative overflow-hidden rounded-[34px] border border-[#facc15]/16 bg-[radial-gradient(circle_at_50%_-30%,rgba(250,204,21,0.2),transparent_44%),linear-gradient(180deg,rgba(21,23,15,0.96),rgba(7,10,8,0.99))] p-4 shadow-[0_24px_76px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.07)]">
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-[#facc15]" />
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#fde68a]">
                    Live heat
                  </span>
                </div>
                <h3 className="mt-2 text-[34px] font-black leading-none text-white">
                  {topScore}
                </h3>
                <p className="mt-1 text-xs font-bold text-[#94a3b8]">
                  top score right now
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <div className="rounded-[18px] border border-white/8 bg-white/[0.045] px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#64748b]">
                    Ranked
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {entries.length}
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.045] px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#64748b]">
                    Heat
                  </div>
                  <div className="mt-1 text-lg font-black text-[#facc15]">
                    {totalScore}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {leaderboardError ? (
            <div className="mt-4 rounded-[20px] border border-[#facc15]/18 bg-[#facc15]/10 px-4 py-3 text-xs font-bold text-[#fde68a]">
              {leaderboardError}
            </div>
          ) : null}

          {podium.length > 0 ? (
            <section className="mt-5 grid grid-cols-3 items-end gap-2">
              {podium.map((entry, index) => {
                const heightClass =
                  entry.rank === 1 ? "min-h-[172px]" : "min-h-[142px]";
                return (
                  <article
                    key={entry.userId}
                    className={`challenge-room-panel relative overflow-hidden rounded-[28px] border p-3 text-center shadow-[0_18px_54px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06)] ${heightClass} ${
                      entry.rank === 1
                        ? "border-[#facc15]/26 bg-[#facc15]/10"
                        : "border-white/8 bg-white/[0.045]"
                    }`}
                    style={{ order: index === 0 ? 2 : index === 1 ? 1 : 3 }}
                  >
                    <div className="mx-auto mb-2 flex justify-center">
                      <RankBadge rank={entry.rank} />
                    </div>
                    <Avatar
                      src={entry.avatarUrl}
                      alt={entry.displayName}
                      fallbackText={entry.displayName.charAt(0)}
                      size={48}
                      disableGhostMode
                      style={{
                        border:
                          entry.rank === 1
                            ? "2px solid rgba(250,204,21,0.42)"
                            : "2px solid rgba(255,255,255,0.12)",
                      }}
                    />
                    <div className="mt-2 truncate text-[13px] font-black text-white">
                      {entry.displayName}
                    </div>
                    <div className="mt-1 text-[24px] font-black leading-none text-[#facc15]">
                      {entry.score}
                    </div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#94a3b8]">
                      points
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section className="mt-5 flex flex-col gap-3">
              {rest.map((entry) => (
                <article
                  key={entry.userId}
                  className="challenge-room-panel relative overflow-hidden rounded-[26px] border border-white/8 bg-white/[0.045] p-3 shadow-[0_16px_46px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)]"
                >
                <div className="flex items-center gap-3">
                  <RankBadge rank={entry.rank} />
                  <Avatar
                    src={entry.avatarUrl}
                    alt={entry.displayName}
                    fallbackText={entry.displayName.charAt(0)}
                    size={44}
                    disableGhostMode
                    style={{ border: "1.5px solid rgba(74,222,128,0.18)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-black text-white">
                      {entry.displayName}
                    </div>
                    <div className="truncate text-xs font-semibold text-[#64748b]">
                      @{entry.username}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-black leading-none text-white">
                      {entry.score}
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#94a3b8]">
                      pts
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[
                    {
                      label: "Real",
                      value: entry.realVotes,
                      Icon: CheckCircle2,
                      color: "#86efac",
                    },
                    {
                      label: "Love",
                      value: entry.appreciationComments,
                      Icon: MessageCircle,
                      color: "#bae6fd",
                    },
                    {
                      label: "Early",
                      value: entry.earlyPoints,
                      Icon: Star,
                      color: "#fde68a",
                    },
                    {
                      label: "Proofs",
                      value: entry.proofCount,
                      Icon: Upload,
                      color: "#cbd5e1",
                    },
                  ].map(({ label, value, Icon, color }) => {
                    const StatIcon = Icon;
                    return (
                      <div
                        key={label}
                        className="rounded-[16px] border border-white/8 bg-black/16 px-2 py-2"
                      >
                        <div className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#64748b]">
                          <StatIcon size={12} style={{ color }} />
                          {label}
                        </div>
                        <div className="mt-1 text-center text-sm font-black text-white">
                          {value}
                        </div>
                      </div>
                    );
                  })}
                </div>
                </article>
              ))}
            </section>
          ) : null}

          {entries.length === 0 ? (
            <div className="flex min-h-[38vh] items-center justify-center">
              <div className="max-w-[310px] text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#facc15]/18 bg-[#facc15]/10 text-[#fde68a]">
                  <Trophy size={30} />
                </div>
                <h3 className="mt-4 text-[20px] font-black text-white">
                  No rankings yet
                </h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[#94a3b8]">
                  The board lights up after members upload proof and the room
                  starts voting.
                </p>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function ChallengeRoomMembersScreen({
  challenge,
  onClose,
}: {
  challenge: JoinedChallengeRun;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<LeaderboardMember[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);

  useEffect(() => {
    const membersQuery = query(
      collection(db, "community_challenge_joins"),
      where("challenge_id", "==", challenge.id),
      limit(300),
    );

    return onSnapshot(
      membersQuery,
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((memberDoc) =>
              normalizeLeaderboardMember(memberDoc.data()),
            )
            .filter((member): member is LeaderboardMember => member !== null)
            .sort((a, b) => {
              if (a.status === "eliminated" && b.status !== "eliminated") {
                return 1;
              }
              if (a.status !== "eliminated" && b.status === "eliminated") {
                return -1;
              }
              return a.displayName.localeCompare(b.displayName);
            }),
        );
        setMembersError(null);
      },
      (error) => {
        console.warn("Community room members unavailable:", error);
        setMembersError("Members are unavailable right now.");
      },
    );
  }, [challenge.id]);

  const presentMembers = members.filter(
    (member) => member.status !== "eliminated",
  );
  const eliminatedMembers = members.filter(
    (member) => member.status === "eliminated",
  );

  const renderMember = (member: LeaderboardMember, eliminated = false) => (
    <article
      key={member.userId}
      className={`challenge-room-panel relative overflow-hidden rounded-[26px] border p-3 shadow-[0_16px_46px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)] ${
        eliminated
          ? "border-red-300/12 bg-red-500/[0.055]"
          : "border-white/8 bg-white/[0.045]"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar
          src={member.avatarUrl}
          alt={member.displayName}
          fallbackText={member.displayName.charAt(0)}
          size={48}
          disableGhostMode
          style={{
            border: eliminated
              ? "1.5px solid rgba(248,113,113,0.24)"
              : "1.5px solid rgba(74,222,128,0.22)",
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-black text-white">
            {member.displayName}
          </div>
          <div className="truncate text-xs font-semibold text-[#64748b]">
            @{member.username}
          </div>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] ${
            eliminated
              ? "border-red-300/18 bg-red-500/10 text-red-200"
              : "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#bbf7d0]"
          }`}
        >
          {eliminated ? (
            <XCircle size={13} strokeWidth={2.35} />
          ) : (
            <CheckCircle2 size={13} strokeWidth={2.35} />
          )}
          {eliminated ? "Eliminated" : member.status}
        </div>
      </div>
    </article>
  );

  return (
    <div className="fixed inset-0 z-[2700] bg-[#030403] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-14%,rgba(74,222,128,0.18),transparent_32%),radial-gradient(circle_at_14%_20%,rgba(14,165,233,0.12),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(248,113,113,0.1),transparent_28%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="shrink-0 px-4 pb-3 pt-[calc(var(--safe-area-top)+10px)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to room"
              className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                Room members
              </p>
              <h2 className="mt-1 truncate text-[23px] font-black leading-none text-white">
                {challenge.title}
              </h2>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[#4ade80]/22 bg-[#4ade80]/10 text-[#86efac]">
              <Users size={22} strokeWidth={2.35} />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+24px)] pt-2">
          <section className="challenge-room-panel challenge-room-shine relative overflow-hidden rounded-[34px] border border-white/8 bg-[radial-gradient(circle_at_50%_-30%,rgba(74,222,128,0.18),transparent_44%),linear-gradient(180deg,rgba(18,23,19,0.96),rgba(7,10,8,0.99))] p-4 shadow-[0_24px_76px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.07)]">
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-[#86efac]" />
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#bbf7d0]">
                    All challengers
                  </span>
                </div>
                <h3 className="mt-2 text-[34px] font-black leading-none text-white">
                  {members.length}
                </h3>
                <p className="mt-1 text-xs font-bold text-[#94a3b8]">
                  total joined this run
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-right">
                <div className="rounded-[18px] border border-[#4ade80]/14 bg-[#4ade80]/[0.065] px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#86efac]">
                    Present
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {presentMembers.length}
                  </div>
                </div>
                <div className="rounded-[18px] border border-red-300/12 bg-red-500/[0.055] px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-red-200">
                    Out
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {eliminatedMembers.length}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {membersError ? (
            <div className="mt-4 rounded-[20px] border border-[#facc15]/18 bg-[#facc15]/10 px-4 py-3 text-xs font-bold text-[#fde68a]">
              {membersError}
            </div>
          ) : null}

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-[#bbf7d0]">
                Present members
              </h3>
              <span className="rounded-full border border-[#4ade80]/16 bg-[#4ade80]/10 px-3 py-1 text-[10px] font-black text-[#86efac]">
                {presentMembers.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {presentMembers.map((member) => renderMember(member))}
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-red-200">
                Eliminated
              </h3>
              <span className="rounded-full border border-red-300/14 bg-red-500/10 px-3 py-1 text-[10px] font-black text-red-200">
                {eliminatedMembers.length}
              </span>
            </div>
            {eliminatedMembers.length > 0 ? (
              <div className="flex flex-col gap-3">
                {eliminatedMembers.map((member) => renderMember(member, true))}
              </div>
            ) : (
              <div className="rounded-[26px] border border-white/8 bg-white/[0.04] px-4 py-5 text-center text-sm font-semibold text-[#94a3b8]">
                No one has been eliminated from this run yet.
              </div>
            )}
          </section>

          {members.length === 0 && !membersError ? (
            <div className="flex min-h-[34vh] items-center justify-center">
              <div className="max-w-[310px] text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac]">
                  <Users size={30} />
                </div>
                <h3 className="mt-4 text-[20px] font-black text-white">
                  No members yet
                </h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[#94a3b8]">
                  Members will appear here once people join this community dare.
                </p>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function EliminatedCenterCard({
  challenge,
  reason,
  onBack,
}: {
  challenge: JoinedChallengeRun;
  reason: string;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-[62vh] items-center justify-center px-1 py-8">
      <section className="challenge-room-panel challenge-room-shine relative w-full overflow-hidden rounded-[34px] border border-red-300/16 bg-[radial-gradient(circle_at_50%_-12%,rgba(248,113,113,0.22),transparent_36%),linear-gradient(180deg,rgba(24,14,16,0.98),rgba(7,9,8,0.99))] p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.07)]">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(248,113,113,0.75),rgba(74,222,128,0.32),transparent)]" />
        <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-[30px] border border-red-300/20 bg-red-500/10 text-red-200 shadow-[0_18px_48px_rgba(248,113,113,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <XCircle size={38} strokeWidth={2.2} />
        </div>
        <p className="relative z-10 mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-red-200/85">
          Run ended
        </p>
        <h2 className="relative z-10 mt-2 text-[31px] font-black uppercase leading-[0.96] tracking-tight text-white">
          Eliminated
        </h2>
        <p className="relative z-10 mx-auto mt-4 max-w-[330px] text-[15px] font-semibold leading-relaxed text-[#fecaca]">
          {reason || "You missed the 24-hour proof window."}
        </p>
        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.045] px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
              Last day
            </div>
            <div className="mt-1 text-lg font-black text-white">
              Day {challenge.day}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.045] px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
              Window
            </div>
            <div className="mt-1 text-lg font-black text-white">24h</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="app-pressable relative z-10 mt-6 flex min-h-[52px] w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.065] px-5 text-sm font-black uppercase tracking-[0.06em] text-white"
        >
          Back to hub
        </button>
      </section>
    </div>
  );
}

function ProofSubmissionScreen({
  challenge,
  selectedPreview,
  caption,
  isBusy,
  uploadError,
  submittedToday,
  countdown,
  onCaptionChange,
  onPickMedia,
  onRemoveMedia,
  onSubmit,
  onClose,
}: {
  challenge: JoinedChallengeRun;
  selectedPreview: LocalMediaPreview | null;
  caption: string;
  isBusy: boolean;
  uploadError: string | null;
  submittedToday: boolean;
  countdown: string;
  onCaptionChange: (value: string) => void;
  onPickMedia: () => void;
  onRemoveMedia: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const progress = Math.min(100, (challenge.day / challenge.totalDays) * 100);

  return (
    <div className="fixed inset-0 z-[2600] bg-[#030403]">
      <div
        className="screen-container"
        style={{
          background:
            "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%), linear-gradient(180deg,#060806 0%,#0a0f0a 48%,#030403 100%)",
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 px-4 pt-[calc(var(--safe-area-top)+10px)]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="app-pressable flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
              >
                <ArrowLeft size={21} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                  Submit proof
                </p>
                <h1 className="mt-1 truncate text-[23px] font-black leading-none text-white">
                  {challenge.title}
                </h1>
              </div>
            </div>

            <div className="challenge-room-panel challenge-room-shine relative mt-4 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(10,14,10,0.98))] p-4 shadow-[0_20px_58px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(14,165,233,0.4),rgba(74,222,128,0))]" />
              <div className="relative z-10 flex items-start gap-4">
                <RoomGlyph icon={challenge.icon} accent={challenge.accent} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
                        Upload proof in
                      </div>
                      <div className="mt-1 flex items-end gap-2">
                        <span className="text-[30px] font-black leading-none text-[#4ade80] drop-shadow-[0_0_22px_rgba(74,222,128,0.24)]">
                          {countdown}
                        </span>
                        <span className="pb-1 text-xs font-black uppercase text-[#94a3b8]">
                          left
                        </span>
                      </div>
                    </div>
                    <div className="rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#cbd5e1]">
                      Day {challenge.day}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.11em] text-[#64748b]">
                        Progress
                      </div>
                      <div className="mt-1 text-sm font-black text-white">
                        {challenge.day} / {challenge.totalDays} days
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.11em] text-[#64748b]">
                        Alive
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm font-black text-white">
                        <Users size={15} className="text-[#86efac]" />
                        {challenge.survivors}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.055]">
                    <div
                      className="h-full rounded-full shadow-[0_0_18px_rgba(74,222,128,0.28)]"
                      style={{
                        width: `${progress}%`,
                        background: `linear-gradient(90deg, ${challenge.accent}, #4ade80)`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+28px)] pt-4">
            <ProofComposer
              selectedPreview={selectedPreview}
              caption={caption}
              isBusy={isBusy}
              submitDisabled={isBusy}
              error={uploadError}
              submittedToday={submittedToday}
              onCaptionChange={onCaptionChange}
              onPickMedia={onPickMedia}
              onRemoveMedia={onRemoveMedia}
              onSubmit={onSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

function FullscreenProofViewer({
  proof,
  onClose,
}: {
  proof: ChallengeProofPost;
  onClose: () => void;
}) {
  const mediaWrapStyle: CSSProperties =
    proof.media.type === "mock" ? { height: "min(62vh, 560px)" } : {};

  return (
    <div className="fixed inset-0 z-[2500] bg-[#020302] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(74,222,128,0.16),transparent_34%),radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.12),transparent_30%)]" />
      <div className="relative z-10 flex min-h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[calc(var(--safe-area-top)+12px)]">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={proof.avatarUrl}
              alt={proof.displayName}
              size={42}
              fallbackText={proof.displayName.charAt(0)}
              disableGhostMode
              style={{ border: "2px solid rgba(74,222,128,0.24)" }}
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-black">
                {proof.displayName}
              </div>
              <div className="text-xs font-bold text-[#94a3b8]">
                Day {proof.proofDay} proof
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white"
            aria-label="Close fullscreen proof"
          >
            <X size={22} />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center px-3 pb-[calc(var(--safe-area-bottom)+20px)]">
          <div
            className="w-full overflow-hidden rounded-[30px] border border-white/8 bg-black shadow-[0_24px_90px_rgba(0,0,0,0.58)]"
            style={mediaWrapStyle}
          >
            {proof.media.type === "mock" ? (
              <MockProofMedia tone={proof.media.tone || "study"} />
            ) : proof.media.type === "video" ? (
              <video
                src={proof.media.url}
                poster={proof.media.thumbnail}
                controls
                autoPlay
                playsInline
                className="max-h-[78vh] w-full object-contain"
              />
            ) : (
              <img
                src={proof.media.url}
                alt={`${proof.displayName} proof`}
                className="max-h-[78vh] w-full object-contain"
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export function ChallengeRoomScreen({
  challenge,
  onBack,
}: {
  challenge: JoinedChallengeRun;
  onBack: () => void;
}) {
  const { user } = useAuthStore();
  const [activePanel, setActivePanel] = useState<RoomPanel>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showGroupChat, setShowGroupChat] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSubmissionScreen, setShowSubmissionScreen] = useState(false);
  const [proofVotes, setProofVotes] = useState<Record<string, ProofVote>>({});
  const [proofVoteCounts, setProofVoteCounts] = useState<
    Record<string, { real: number; fake: number }>
  >({});
  const [proofCommentCounts, setProofCommentCounts] = useState<
    Record<string, number>
  >({});
  const [votingInProgress, setVotingInProgress] = useState<
    Record<string, boolean>
  >({});
  const [remoteProofs, setRemoteProofs] = useState<ChallengeProofPost[]>([]);
  const [proofLoadError, setProofLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] =
    useState<LocalMediaPreview | null>(null);
  const [caption, setCaption] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [localSubmittedDay, setLocalSubmittedDay] = useState<number | null>(
    null,
  );
  const [showUploadConfirmation, setShowUploadConfirmation] = useState(false);
  const [hideUploadDock, setHideUploadDock] = useState(false);
  const [expandedProof, setExpandedProof] = useState<ChallengeProofPost | null>(
    null,
  );
  const [commentsProof, setCommentsProof] = useState<ChallengeProofPost | null>(
    null,
  );
  const [liveJoin, setLiveJoin] = useState<CommunityChallengeJoin | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedScrollRef = useRef<HTMLElement>(null);
  const objectUrlCleanupRef = useRef<string[]>([]);
  const lastMediaTapRef = useRef<{ id: string; time: number } | null>(null);
  const uploadDockFadeTimerRef = useRef<number | null>(null);
  const uploadDockHideTimerRef = useRef<number | null>(null);
  const isBusy = isPreparingMedia || isSubmittingProof;
  const effectiveChallenge = useMemo<JoinedChallengeRun>(() => {
    if (!liveJoin) return challenge;
    const lifecycleStatus =
      liveJoin.status === "waiting" ? "active" : liveJoin.status;
    return {
      ...challenge,
      day: liveJoin.currentDay,
      totalDays: liveJoin.totalDays,
      lifecycleStatus,
      proofDueAtMs: liveJoin.proofDueAtMs,
      eliminatedAtMs: liveJoin.eliminatedAtMs,
      completedAtMs: liveJoin.completedAtMs,
      eliminationReason: liveJoin.eliminationReason,
      status:
        lifecycleStatus === "submitted" || lifecycleStatus === "completed"
          ? "submitted"
          : "upload_due",
    };
  }, [challenge, liveJoin]);
  const progress = Math.min(
    100,
    (effectiveChallenge.day / effectiveChallenge.totalDays) * 100,
  );
  const remainingMs =
    typeof effectiveChallenge.proofDueAtMs === "number"
      ? effectiveChallenge.proofDueAtMs - nowMs
      : null;
  const countdown =
    remainingMs !== null
      ? formatCountdownFromMs(remainingMs)
      : effectiveChallenge.countdown || "24:00:00";
  const isEliminated =
    effectiveChallenge.lifecycleStatus === "eliminated" ||
    (effectiveChallenge.lifecycleStatus === "active" &&
      remainingMs !== null &&
      remainingMs <= 0);

  useEffect(() => {
    // Hide bottom navigation without causing visual artifacts
    const bottomNav = document.querySelector(".app-bottom-nav") as HTMLElement;
    const bottomNavMotion = document.querySelector(
      ".app-bottom-nav-motion",
    ) as HTMLElement;

    if (bottomNav) {
      bottomNav.style.display = "none";
    }
    if (bottomNavMotion) {
      bottomNavMotion.style.display = "none";
    }

    return () => {
      // Restore bottom navigation
      if (bottomNav) {
        bottomNav.style.display = "";
      }
      if (bottomNavMotion) {
        bottomNavMotion.style.display = "";
      }
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return communityChallengeService.subscribeToChallengeJoin(
      user?.id,
      challenge.id,
      setLiveJoin,
    );
  }, [challenge.id, user?.id]);

  const submittedToday = useMemo(
    () =>
      remoteProofs.some(
        (proof) =>
          proof.userId === user?.id &&
          proof.proofDay === effectiveChallenge.day,
      ),
    [effectiveChallenge.day, remoteProofs, user?.id],
  );
  const proofUploadedForDay =
    submittedToday || localSubmittedDay === effectiveChallenge.day;

  const mockProofs = useMemo(
    () => buildMockProofs(effectiveChallenge),
    [effectiveChallenge],
  );
  const proofs = useMemo(
    () =>
      [...mockProofs, ...remoteProofs].sort(
        (a, b) => a.submittedAtMs - b.submittedAtMs,
      ),
    [mockProofs, remoteProofs],
  );
  const proofTimelineKey = useMemo(
    () => proofs.map((proof) => `${proof.id}:${proof.submittedAtMs}`).join("|"),
    [proofs],
  );
  const liveProofIdsKey = useMemo(
    () => remoteProofs.map((proof) => proof.id).join("|"),
    [remoteProofs],
  );

  useEffect(() => {
    if (!db) return;

    const proofsQuery = query(
      collection(db, "challenge_room_proofs"),
      where("challenge_id", "==", challenge.id),
      limit(24),
    );

    return onSnapshot(
      proofsQuery,
      (snapshot) => {
        setRemoteProofs(
          snapshot.docs
            .map((proofDoc) => normalizeProofDoc(proofDoc.id, proofDoc.data()))
            .filter((proof): proof is ChallengeProofPost => Boolean(proof))
            .sort((a, b) => a.submittedAtMs - b.submittedAtMs),
        );
        setProofLoadError(null);
      },
      (error) => {
        console.warn("Challenge room proofs could not be loaded:", error);
        setProofLoadError("Live proof feed is unavailable right now.");
      },
    );
  }, [challenge.id]);

  useEffect(() => {
    const liveProofIds = liveProofIdsKey
      ? liveProofIdsKey.split("|").filter(Boolean)
      : [];

    return challengeRoomService.subscribeToProofVotesByProofIds(
      liveProofIds,
      (votes) => {
        const nextCounts: Record<string, { real: number; fake: number }> = {};
        const nextUserVotes: Record<string, ProofVote> = {};

        liveProofIds.forEach((proofId) => {
          nextCounts[proofId] = { real: 0, fake: 0 };
        });

        votes.forEach((vote) => {
          if (!nextCounts[vote.proofId]) {
            nextCounts[vote.proofId] = { real: 0, fake: 0 };
          }

          if (vote.vote === "real") {
            nextCounts[vote.proofId].real += 1;
          } else if (vote.vote === "fake") {
            nextCounts[vote.proofId].fake += 1;
          }

          if (user?.id && vote.userId === user.id) {
            nextUserVotes[vote.proofId] = vote.vote;
          }
        });

        setProofVoteCounts(nextCounts);
        setProofVotes(nextUserVotes);
      },
    );
  }, [liveProofIdsKey, user?.id]);

  useEffect(() => {
    const liveProofIds = liveProofIdsKey
      ? liveProofIdsKey.split("|").filter(Boolean)
      : [];

    return challengeRoomService.subscribeToProofCommentsByProofIds(
      liveProofIds,
      (comments) => {
        const nextCounts: Record<string, number> = {};
        liveProofIds.forEach((proofId) => {
          nextCounts[proofId] = 0;
        });
        comments.forEach((comment) => {
          nextCounts[comment.proofId] = (nextCounts[comment.proofId] || 0) + 1;
        });
        setProofCommentCounts(nextCounts);
      },
    );
  }, [liveProofIdsKey]);

  useEffect(() => {
    return () => {
      objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlCleanupRef.current = [];
      if (uploadDockFadeTimerRef.current) {
        window.clearTimeout(uploadDockFadeTimerRef.current);
      }
      if (uploadDockHideTimerRef.current) {
        window.clearTimeout(uploadDockHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scrollEl = feedScrollRef.current;
    if (!scrollEl) return;

    window.requestAnimationFrame(() => {
      scrollEl.scrollTo({
        top: scrollEl.scrollHeight,
        behavior: proofUploadedForDay ? "smooth" : "auto",
      });
    });
  }, [proofTimelineKey, proofUploadedForDay]);

  useEffect(() => {
    if (submittedToday && !showUploadConfirmation) {
      setHideUploadDock(true);
    }
  }, [showUploadConfirmation, submittedToday]);

  useEffect(() => {
    setLocalSubmittedDay(null);
    setShowUploadConfirmation(false);
    setHideUploadDock(false);
  }, [challenge.id, effectiveChallenge.day]);

  const registerPreviewUrls = (preview: LocalMediaPreview) => {
    objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCleanupRef.current = [preview.url];

    if (preview.thumbnail && preview.thumbnail.startsWith("blob:")) {
      objectUrlCleanupRef.current.push(preview.thumbnail);
    }
  };

  const clearSelectedMedia = () => {
    objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCleanupRef.current = [];
    setSelectedFile(null);
    setSelectedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openMediaPicker = () => {
    if (isEliminated) {
      setUploadError("This community dare has ended for you.");
      return;
    }
    setShowOptions(false);
    setShowSubmissionScreen(true);
    window.setTimeout(() => fileInputRef.current?.click(), 220);
  };

  const handleFileInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadError(null);
      setIsPreparingMedia(true);
      const preview = await buildLocalMediaPreview(
        file,
        "challenge-room-proof",
      );
      registerPreviewUrls(preview);
      setSelectedFile(file);
      setSelectedPreview(preview);
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to prepare this proof media.",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsPreparingMedia(false);
    }
  };

  const handleSubmitProof = async () => {
    if (!user?.id) {
      setUploadError("Please log in before submitting proof.");
      return;
    }
    if (!db) {
      setUploadError("Challenge room backend is not configured.");
      return;
    }
    if (isEliminated || (remainingMs !== null && remainingMs <= 0)) {
      setUploadError("The 24-hour proof window has closed.");
      return;
    }
    if (!selectedFile || !selectedPreview) {
      openMediaPicker();
      return;
    }
    if (selectedPreview.type !== "image" && selectedPreview.type !== "video") {
      setUploadError("Only photo and video proof can be submitted here.");
      return;
    }

    try {
      setUploadError(null);
      setIsSubmittingProof(true);

      // Use the challenge room service for media upload
      const uploadResult = await challengeRoomService.uploadProofMedia(
        selectedFile,
        user.id,
        challenge.id,
        effectiveChallenge.day,
      );

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "Failed to upload media");
      }

      const uploadedMedia = {
        url: uploadResult.url,
        thumbnail: uploadResult.thumbnail,
        mediaKind: selectedPreview.type,
      };
      const proofMediaType =
        uploadedMedia.mediaKind === "video" ? "video" : "image";
      const now = Date.now();
      const proofDocRef = doc(
        db,
        "challenge_room_proofs",
        getProofDocId(challenge.id, user.id, effectiveChallenge.day),
      );

      const proofPayload = {
        challenge_id: challenge.id,
        challenge_title: effectiveChallenge.title,
        submitter_id: user.id,
        submitter_username: user.username || "dareuser",
        submitter_name: user.displayName || user.username || "Dare User",
        submitter_avatar: user.avatar || "",
        day: effectiveChallenge.day,
        total_days: effectiveChallenge.totalDays,
        media_url: uploadedMedia.url,
        media_type: proofMediaType,
        thumbnail_url:
          uploadedMedia.thumbnail ||
          (proofMediaType === "image" ? uploadedMedia.url : ""),
        caption:
          caption.trim() ||
          `Submitted day ${effectiveChallenge.day} proof for ${effectiveChallenge.title}.`,
        real_votes: 0,
        fake_votes: 0,
        comments: 0,
        client_created_at: now,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      await setDoc(proofDocRef, proofPayload, { merge: true });

      const optimisticProof = normalizeProofDoc(proofDocRef.id, proofPayload);
      if (optimisticProof) {
        setRemoteProofs((currentProofs) =>
          [
            ...currentProofs.filter((proof) => proof.id !== optimisticProof.id),
            optimisticProof,
          ].sort((a, b) => a.submittedAtMs - b.submittedAtMs),
        );
      }

      setCaption("");
      clearSelectedMedia();
      setShowSubmissionScreen(false);
      setLocalSubmittedDay(effectiveChallenge.day);
      setShowUploadConfirmation(true);
      setHideUploadDock(false);

      if (uploadDockFadeTimerRef.current) {
        window.clearTimeout(uploadDockFadeTimerRef.current);
      }
      if (uploadDockHideTimerRef.current) {
        window.clearTimeout(uploadDockHideTimerRef.current);
      }

      uploadDockFadeTimerRef.current = window.setTimeout(() => {
        setHideUploadDock(true);
      }, 900);
      uploadDockHideTimerRef.current = window.setTimeout(() => {
        setShowUploadConfirmation(false);
      }, 1250);
    } catch (error) {
      console.warn("Challenge room proof submission failed:", error);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Could not submit proof. Please try again.",
      );
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleMediaTap = (proof: ChallengeProofPost) => {
    const now = Date.now();
    const lastTap = lastMediaTapRef.current;
    if (lastTap && lastTap.id === proof.id && now - lastTap.time < 320) {
      setExpandedProof(proof);
      lastMediaTapRef.current = null;
      return;
    }
    lastMediaTapRef.current = { id: proof.id, time: now };
  };

  const getOptimisticVoteCounts = (
    currentCounts: { real: number; fake: number },
    previousVote: ProofVote,
    nextVote: ProofVote,
  ) => {
    const nextCounts = { ...currentCounts };
    if (previousVote === "real") {
      nextCounts.real = Math.max(nextCounts.real - 1, 0);
    } else if (previousVote === "fake") {
      nextCounts.fake = Math.max(nextCounts.fake - 1, 0);
    }

    if (nextVote === "real") {
      nextCounts.real += 1;
    } else if (nextVote === "fake") {
      nextCounts.fake += 1;
    }

    return nextCounts;
  };

  const handleVote = async (
    proofId: string,
    vote: ProofVote,
    challengeId: string,
    currentCounts: { real: number; fake: number },
  ) => {
    if (!user?.id || votingInProgress[proofId]) return;

    setVotingInProgress((prev) => ({ ...prev, [proofId]: true }));
    const previousVote = proofVotes[proofId] ?? null;
    const previousCounts = proofVoteCounts[proofId] ?? currentCounts;
    const nextCounts = getOptimisticVoteCounts(
      previousCounts,
      previousVote,
      vote,
    );

    setProofVotes((prev) => ({ ...prev, [proofId]: vote }));
    setProofVoteCounts((prev) => ({ ...prev, [proofId]: nextCounts }));

    try {
      if (vote === null) {
        const result = await challengeRoomService.removeProofVote(
          proofId,
          user.id,
          challengeId,
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to remove vote");
        }
      } else {
        const result = await challengeRoomService.voteOnProof(
          proofId,
          user.id,
          vote,
          challengeId,
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to vote");
        }
      }
    } catch (error) {
      console.warn("Error voting:", error);
      setProofVotes((prev) => ({ ...prev, [proofId]: previousVote }));
      setProofVoteCounts((prev) => ({ ...prev, [proofId]: previousCounts }));
    } finally {
      setVotingInProgress((prev) => ({ ...prev, [proofId]: false }));
    }
  };

  const handleOpenComments = (proof: ChallengeProofPost) => {
    setCommentsProof(proof);
  };

  return (
    <div className="fixed inset-0 z-[2100] overflow-hidden bg-[#030403]">
      <RoomStyles />
      <div
        className="screen-container relative"
        style={{
          background:
            "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%), linear-gradient(180deg,#060806 0%,#0a0f0a 48%,#030403 100%)",
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <main
            ref={feedScrollRef}
            className={`min-h-0 flex-1 overflow-y-auto px-4 pt-4 transition-[padding-bottom] duration-700 ${
              isEliminated
                ? "pb-[calc(var(--safe-area-bottom)+28px)]"
                : proofUploadedForDay && showUploadConfirmation
                ? "pb-[calc(var(--safe-area-bottom)+104px)]"
                : proofUploadedForDay
                ? "pb-[calc(var(--safe-area-bottom)+28px)]"
                : "pb-[calc(var(--safe-area-bottom)+216px)]"
            }`}
            style={{ overscrollBehaviorY: "contain" }}
          >
            {/* Scrollable header content */}
            <div className="mb-4 pt-[calc(var(--safe-area-top)+10px)]">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className="app-pressable flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
                >
                  <ArrowLeft size={21} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                    Community room
                  </p>
                  <h1 className="mt-1 truncate text-[23px] font-black leading-none text-white">
                    {effectiveChallenge.title}
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOptions(true)}
                  aria-label="Open room options"
                  className="app-pressable flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
                >
                  <MoreHorizontal size={22} />
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileInputChange}
            />

            {proofLoadError ? (
              <div className="mb-4 rounded-[20px] border border-[#facc15]/18 bg-[#facc15]/10 px-4 py-3 text-xs font-bold text-[#fde68a]">
                {proofLoadError}
              </div>
            ) : null}

            {isEliminated ? (
              <EliminatedCenterCard
                challenge={effectiveChallenge}
                reason={
                  effectiveChallenge.eliminationReason ||
                  "You missed the 24-hour proof window."
                }
                onBack={onBack}
              />
            ) : (
              <section className="flex flex-col">
                {proofs.map((proof, index) => {
                  const showDateSeparator =
                    index === 0 || proofs[index - 1].proofDay !== proof.proofDay;
                  const proofDate = new Date(proof.submittedAtMs);
                  const formattedDate = proofDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <div key={proof.id}>
                      {showDateSeparator && (
                        <DateSeparator
                          date={formattedDate}
                          day={proof.proofDay}
                        />
                      )}
                      {(() => {
                        const voteCounts = proofVoteCounts[proof.id];
                        const commentCount = proofCommentCounts[proof.id];
                        const liveProof = {
                          ...proof,
                          realVotes: voteCounts?.real ?? proof.realVotes,
                          fakeVotes: voteCounts?.fake ?? proof.fakeVotes,
                          comments: commentCount ?? proof.comments,
                        };

                        return (
                          <ProofCard
                            proof={liveProof}
                            vote={proofVotes[proof.id] ?? null}
                            onVote={(vote) =>
                              handleVote(proof.id, vote, proof.challengeId, {
                                real: liveProof.realVotes,
                                fake: liveProof.fakeVotes,
                              })
                            }
                            onMediaTap={() => handleMediaTap(proof)}
                            currentUserId={user?.id}
                            onOpenComments={handleOpenComments}
                          />
                        );
                      })()}
                    </div>
                  );
                })}
              </section>
            )}
          </main>

          {!isEliminated && !proofUploadedForDay && (
            <button
              type="button"
              onClick={() => setShowSubmissionScreen(true)}
              className="absolute bottom-[calc(var(--safe-area-bottom)+20px)] right-5 z-[2200] flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] shadow-[0_12px_42px_rgba(74,222,128,0.42),0_4px_12px_rgba(0,0,0,0.38)] transition-transform active:scale-95"
              aria-label="Submit proof"
            >
              <Upload size={26} strokeWidth={2.5} className="text-[#061006]" />
            </button>
          )}

          {/* Fixed Upload Proof Card at Bottom */}
          {!isEliminated && (!proofUploadedForDay || showUploadConfirmation) && (
            <div
              className={`absolute bottom-0 left-0 right-0 z-[2100] border-t border-white/8 bg-[linear-gradient(180deg,rgba(6,8,6,0.98),rgba(3,4,3,0.99))] shadow-[0_-12px_36px_rgba(0,0,0,0.42)] transition-all duration-700 ease-out ${
                hideUploadDock
                  ? "pointer-events-none translate-y-4 opacity-0"
                  : "translate-y-0 opacity-100"
              } ${showUploadConfirmation ? "pointer-events-none" : ""}`}
            >
              <div className="challenge-room-panel relative overflow-hidden p-4">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(14,165,233,0.4),rgba(74,222,128,0))]" />
                {showUploadConfirmation ? (
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]">
                      <CheckCircle2 size={22} strokeWidth={2.4} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
                        Day {effectiveChallenge.day} proof
                      </div>
                      <div className="mt-0.5 text-[22px] font-black leading-none text-[#4ade80]">
                        Uploaded
                      </div>
                    </div>
                    <div className="rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#cbd5e1]">
                      Day {effectiveChallenge.day}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 flex items-start gap-4">
                    <RoomGlyph
                      icon={effectiveChallenge.icon}
                      accent={effectiveChallenge.accent}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
                            Upload proof in
                          </div>
                          <div className="mt-1 flex items-end gap-2">
                            <span className="text-[24px] font-black leading-none text-[#4ade80] drop-shadow-[0_0_22px_rgba(74,222,128,0.24)]">
                              {countdown}
                            </span>
                            <span className="pb-1 text-xs font-black uppercase text-[#94a3b8]">
                              left
                            </span>
                          </div>
                        </div>
                        <div className="rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#cbd5e1]">
                          Day {effectiveChallenge.day}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.11em] text-[#64748b]">
                            Progress
                          </div>
                          <div className="mt-1 text-sm font-black text-white">
                            {effectiveChallenge.day} / {effectiveChallenge.totalDays} days
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.11em] text-[#64748b]">
                            Alive
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-sm font-black text-white">
                            <Users size={15} className="text-[#86efac]" />
                            {effectiveChallenge.survivors}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.055]">
                        <div
                          className="h-full rounded-full shadow-[0_0_18px_rgba(74,222,128,0.28)]"
                          style={{
                            width: `${progress}%`,
                            background: `linear-gradient(90deg, ${effectiveChallenge.accent}, #4ade80)`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
          )}
        </div>
      </div>

      {showOptions ? (
        <OptionsMenu
          onClose={() => setShowOptions(false)}
          onUpload={openMediaPicker}
          onOpenPanel={(panel) => {
            setShowOptions(false);
            if (panel === "leaderboard") {
              setShowLeaderboard(true);
              return;
            }
            if (panel === "members") {
              setShowMembers(true);
              return;
            }
            if (panel === "chat") {
              setShowGroupChat(true);
              return;
            }
            setActivePanel(panel);
          }}
        />
      ) : null}

      {activePanel ? (
        <RoomInfoPanel
          panel={activePanel}
          challenge={effectiveChallenge}
          onClose={() => setActivePanel(null)}
        />
      ) : null}

      {expandedProof ? (
        <FullscreenProofViewer
          proof={expandedProof}
          onClose={() => setExpandedProof(null)}
        />
      ) : null}

      {showSubmissionScreen ? (
        <ProofSubmissionScreen
          challenge={effectiveChallenge}
          selectedPreview={selectedPreview}
          caption={caption}
          isBusy={isBusy}
          uploadError={uploadError}
          submittedToday={submittedToday}
          countdown={countdown}
          onCaptionChange={setCaption}
          onPickMedia={openMediaPicker}
          onRemoveMedia={clearSelectedMedia}
          onSubmit={handleSubmitProof}
          onClose={() => setShowSubmissionScreen(false)}
        />
      ) : null}

      {showGroupChat ? (
        <ChallengeRoomGroupChat
          challenge={effectiveChallenge}
          currentUser={user}
          onClose={() => setShowGroupChat(false)}
        />
      ) : null}

      {showLeaderboard ? (
        <ChallengeRoomLeaderboard
          challenge={effectiveChallenge}
          onClose={() => setShowLeaderboard(false)}
        />
      ) : null}

      {showMembers ? (
        <ChallengeRoomMembersScreen
          challenge={effectiveChallenge}
          onClose={() => setShowMembers(false)}
        />
      ) : null}

      {commentsProof ? (
        <ChallengeRoomComments
          proof={commentsProof}
          currentUserId={user?.id}
          currentUsername={user?.username}
          currentDisplayName={user?.displayName}
          currentAvatarUrl={user?.avatar}
          onClose={() => setCommentsProof(null)}
        />
      ) : null}
    </div>
  );
}
