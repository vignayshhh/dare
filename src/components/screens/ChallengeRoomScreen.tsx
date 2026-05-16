"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Play,
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
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  buildLocalMediaPreview,
  type LocalMediaPreview,
  uploadOptimizedMedia,
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
};

type RoomPanel = "leaderboard" | "chat" | "rules" | null;
type ProofVote = "real" | "fake" | null;
type ProofMediaKind = "image" | "video" | "mock";
type MockMediaTone = "screen-time" | "sunrise" | "study";

type ChallengeProofPost = {
  id: string;
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
    userId: String(data.submitter_id || ""),
    username,
    displayName,
    avatarUrl:
      typeof data.submitter_avatar === "string" && data.submitter_avatar
        ? data.submitter_avatar
        : makeMockAvatar(displayName, MOCK_ACCENTS[id.length % MOCK_ACCENTS.length]),
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

function ProofMediaFrame({
  proof,
  onTap,
}: {
  proof: ChallengeProofPost;
  onTap: () => void;
}) {
  const isVideo = proof.media.type === "video";

  return (
    <button
      type="button"
      onClick={onTap}
      onDoubleClick={onTap}
      className="relative mt-3 block h-[246px] w-full overflow-hidden rounded-[26px] border border-white/8 bg-[#071008] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
      aria-label="Open proof media fullscreen"
    >
      {proof.media.type === "mock" ? (
        <MockProofMedia tone={proof.media.tone || "study"} />
      ) : isVideo ? (
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
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/12 bg-black/34 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-white/82 backdrop-blur-md">
        Double tap
      </div>
    </button>
  );
}

function ProofCard({
  proof,
  vote,
  onVote,
  onMediaTap,
}: {
  proof: ChallengeProofPost;
  vote: ProofVote;
  onVote: (vote: ProofVote) => void;
  onMediaTap: () => void;
}) {
  const realVotes = proof.realVotes + (vote === "real" ? 1 : 0);
  const fakeVotes = proof.fakeVotes + (vote === "fake" ? 1 : 0);

  return (
    <article className="challenge-room-panel relative overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] p-3 shadow-[0_22px_62px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.68),rgba(14,165,233,0.38),rgba(74,222,128,0))]" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={proof.avatarUrl}
              alt={proof.displayName}
              fallbackText={proof.displayName.charAt(0)}
              size={42}
              disableGhostMode
              style={{ border: "2px solid rgba(74,222,128,0.22)" }}
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-black text-white">
                {proof.displayName}
              </div>
              <div className="truncate text-xs font-semibold text-[#94a3b8]">
                @{proof.username} · {proof.timePosted}
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-[#4ade80]/22 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#86efac]">
            Day {proof.proofDay} proof
          </div>
        </div>

        <ProofMediaFrame proof={proof} onTap={onMediaTap} />

        <p className="mt-3 text-[15px] font-black leading-relaxed text-white">
          {proof.caption}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onVote(vote === "real" ? null : "real")}
            className={`app-pressable flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-black uppercase ${
              vote === "real"
                ? "border-[#4ade80]/48 bg-[#4ade80]/18 text-[#d7ffe6]"
                : "border-white/8 bg-white/[0.035] text-[#4ade80]"
            }`}
          >
            <CheckCircle2 size={17} strokeWidth={2.25} />
            {realVotes} real
          </button>
          <button
            type="button"
            onClick={() => onVote(vote === "fake" ? null : "fake")}
            className={`app-pressable flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-black uppercase ${
              vote === "fake"
                ? "border-red-400/48 bg-red-500/16 text-red-200"
                : "border-white/8 bg-white/[0.035] text-red-400"
            }`}
          >
            <XCircle size={17} strokeWidth={2.25} />
            {fakeVotes} fake
          </button>
          <button
            type="button"
            className="app-pressable flex min-h-[42px] min-w-[62px] items-center justify-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-2 text-xs font-black text-[#cbd5e1]"
          >
            <MessageCircle size={17} strokeWidth={2.25} />
            {proof.comments}
          </button>
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
              Submit today's media
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
          {isBusy ? <Loader2 size={19} className="animate-spin" /> : <Upload size={19} />}
          {isBusy ? "Submitting proof" : submittedToday ? "Replace proof" : "Submit proof"}
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

function FullscreenProofViewer({
  proof,
  onClose,
}: {
  proof: ChallengeProofPost;
  onClose: () => void;
}) {
  const mediaWrapStyle: CSSProperties =
    proof.media.type === "mock"
      ? { height: "min(62vh, 560px)" }
      : {};

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
  const [proofVotes, setProofVotes] = useState<Record<string, ProofVote>>({});
  const [remoteProofs, setRemoteProofs] = useState<ChallengeProofPost[]>([]);
  const [proofLoadError, setProofLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] =
    useState<LocalMediaPreview | null>(null);
  const [caption, setCaption] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [expandedProof, setExpandedProof] =
    useState<ChallengeProofPost | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlCleanupRef = useRef<string[]>([]);
  const lastMediaTapRef = useRef<{ id: string; time: number } | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const progress = Math.min(100, (challenge.day / challenge.totalDays) * 100);
  const countdown = challenge.countdown || "04:11:22";
  const isBusy = isPreparingMedia || isSubmittingProof;

  useEffect(() => {
    const navElements = Array.from(
      document.querySelectorAll<HTMLElement>(".app-bottom-nav-motion"),
    );
    const previousDisplays = navElements.map((element) => element.style.display);

    navElements.forEach((element) => {
      element.style.display = "none";
    });

    return () => {
      navElements.forEach((element, index) => {
        element.style.display = previousDisplays[index] ?? "";
      });
    };
  }, []);

  const submittedToday = useMemo(
    () =>
      remoteProofs.some(
        (proof) => proof.userId === user?.id && proof.proofDay === challenge.day,
      ),
    [challenge.day, remoteProofs, user?.id],
  );

  const mockProofs = useMemo(() => buildMockProofs(challenge), [challenge]);
  const proofs = useMemo(
    () => [...remoteProofs, ...mockProofs],
    [mockProofs, remoteProofs],
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
            .sort((a, b) => b.submittedAtMs - a.submittedAtMs),
        );
        setProofLoadError(null);
      },
      (error) => {
        console.error("Challenge room proofs could not be loaded:", error);
        setProofLoadError("Live proof feed is unavailable right now.");
      },
    );
  }, [challenge.id]);

  useEffect(() => {
    return () => {
      objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlCleanupRef.current = [];
    };
  }, []);

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
    setShowOptions(false);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const preview = await buildLocalMediaPreview(file, "challenge-room-proof");
      registerPreviewUrls(preview);
      setSelectedFile(file);
      setSelectedPreview(preview);
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

      const uploadedMedia = await uploadOptimizedMedia({
        source: selectedFile,
        userId: user.id,
        context: "challenge-room-proof",
        fileName: selectedFile.name,
        mediaKind: selectedPreview.type,
      });
      const proofMediaType =
        uploadedMedia.mediaKind === "video" ? "video" : "image";
      const now = Date.now();
      const proofDocRef = doc(
        db,
        "challenge_room_proofs",
        getProofDocId(challenge.id, user.id, challenge.day),
      );

      await setDoc(
        proofDocRef,
        {
          challenge_id: challenge.id,
          challenge_title: challenge.title,
          submitter_id: user.id,
          submitter_username: user.username || "dareuser",
          submitter_name: user.displayName || user.username || "Dare User",
          submitter_avatar: user.avatar || "",
          day: challenge.day,
          total_days: challenge.totalDays,
          media_url: uploadedMedia.url,
          media_type: proofMediaType,
          thumbnail_url:
            proofMediaType === "image" ? uploadedMedia.url : "",
          caption:
            caption.trim() ||
            `Submitted day ${challenge.day} proof for ${challenge.title}.`,
          real_votes: 0,
          fake_votes: 0,
          comments: 0,
          client_created_at: now,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );

      setCaption("");
      clearSelectedMedia();
    } catch (error) {
      console.error("Challenge room proof submission failed:", error);
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

  return (
    <div className="fixed inset-0 z-[2100] bg-[#030403]">
      <RoomStyles />
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
                  {challenge.title}
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
            <div ref={composerRef}>
              <ProofComposer
                selectedPreview={selectedPreview}
                caption={caption}
                isBusy={isBusy}
                submitDisabled={isBusy}
                error={uploadError}
                submittedToday={submittedToday}
                onCaptionChange={setCaption}
                onPickMedia={openMediaPicker}
                onRemoveMedia={clearSelectedMedia}
                onSubmit={handleSubmitProof}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <div className="mb-3 mt-6 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#86efac]">
                  Proof feed
                </p>
                <h2 className="mt-1 text-[22px] font-black leading-none text-white">
                  Today's submissions
                </h2>
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#94a3b8]">
                Day {challenge.day}
              </div>
            </div>

            {proofLoadError ? (
              <div className="mb-4 rounded-[20px] border border-[#facc15]/18 bg-[#facc15]/10 px-4 py-3 text-xs font-bold text-[#fde68a]">
                {proofLoadError}
              </div>
            ) : null}

            <section className="flex flex-col gap-4">
              {proofs.map((proof) => (
                <ProofCard
                  key={proof.id}
                  proof={proof}
                  vote={proofVotes[proof.id] ?? null}
                  onVote={(vote) =>
                    setProofVotes((current) => ({
                      ...current,
                      [proof.id]: vote,
                    }))
                  }
                  onMediaTap={() => handleMediaTap(proof)}
                />
              ))}
            </section>
          </main>
        </div>
      </div>

      {showOptions ? (
        <OptionsMenu
          onClose={() => setShowOptions(false)}
          onUpload={openMediaPicker}
          onOpenPanel={(panel) => {
            setShowOptions(false);
            setActivePanel(panel);
          }}
        />
      ) : null}

      {activePanel ? (
        <RoomInfoPanel
          panel={activePanel}
          challenge={challenge}
          onClose={() => setActivePanel(null)}
        />
      ) : null}

      {expandedProof ? (
        <FullscreenProofViewer
          proof={expandedProof}
          onClose={() => setExpandedProof(null)}
        />
      ) : null}
    </div>
  );
}
