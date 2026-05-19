"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  FileCheck2,
  Image as ImageIcon,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import {
  getCommunityChallengeTitle,
  type CommunityChallenge,
} from "./communityChallengeData";
import { CommunityJoinSuccessScreen } from "./CommunityJoinSuccessScreen";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SIGNUP_WINDOW_MS = 48 * HOUR_MS;

function parseDurationDays(durationLabel: string) {
  const match = durationLabel.match(/(\d+)/);
  return Math.max(1, Number(match?.[1] || 1));
}

function parseCountdownMs(countdown: string) {
  const [hours = "0", minutes = "0", seconds = "0"] = countdown.split(":");
  return (
    Math.max(0, Number(hours) || 0) * HOUR_MS +
    Math.max(0, Number(minutes) || 0) * 60 * 1000 +
    Math.max(0, Number(seconds) || 0) * 1000
  );
}

function getCountdownParts(totalMs: number) {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function CommunityChallengePreviewStyles() {
  return (
    <style>{`
      @keyframes communityPreviewFadeUp {
        from { opacity: 0; transform: translateY(16px) scale(0.985); filter: blur(8px); }
        to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes communityPreviewSweep {
        0% { transform: translateX(-125%); }
        24% { transform: translateX(125%); }
        100% { transform: translateX(125%); }
      }
      .community-preview-panel {
        animation: communityPreviewFadeUp 0.54s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .community-preview-shine::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.105), transparent);
        animation: communityPreviewSweep 6.5s ease-in-out infinite;
        pointer-events: none;
      }
    `}</style>
  );
}

export function CommunityChallengePreviewScreen({
  challenge,
  isJoined,
  onClose,
  onJoin,
  onOpenHub,
}: {
  challenge: CommunityChallenge;
  isJoined: boolean;
  onClose: () => void;
  onJoin: () => void;
  onOpenHub?: () => void;
}) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [fallbackDeadlineMs, setFallbackDeadlineMs] = useState(
    () =>
      Date.now() +
      (challenge.batchStatus === "started"
        ? parseCountdownMs(challenge.countdown)
        : SIGNUP_WINDOW_MS),
  );
  const challengeTitle = getCommunityChallengeTitle(challenge);
  const displayedJoinedCount = Math.max(
    challenge.joinedCount,
    isJoined ? 1 : 0,
  );
  const minRequiredMembers = challenge.minRequiredMembers ?? 3;
  const membersNeeded = Math.max(0, minRequiredMembers - displayedJoinedCount);
  const hasBatchStarted = challenge.batchStatus === "started";
  const canJoinBatch = !isJoined && !hasBatchStarted;
  const primaryButtonLabel = hasBatchStarted
    ? isJoined
      ? "Joined Community Dare"
      : "Dare Started - Wait for Next Batch"
    : isJoined
      ? membersNeeded > 0
        ? `Waiting for ${membersNeeded} more`
        : "Starting soon"
      : "Join Current Batch";
  const registrationDeadlineMs =
    !hasBatchStarted && displayedJoinedCount > 0
      ? challenge.registrationEndsAtMs || null
      : null;
  const challengeDeadlineMs =
    hasBatchStarted && challenge.batchStartedAtMs
      ? challenge.batchStartedAtMs + parseDurationDays(challenge.durationLabel) * DAY_MS
      : null;
  const countdownTargetMs =
    registrationDeadlineMs || challengeDeadlineMs || fallbackDeadlineMs;
  const countdownMs =
    displayedJoinedCount === 0 && !hasBatchStarted
      ? SIGNUP_WINDOW_MS
      : countdownTargetMs - nowMs;
  const countdownParts = getCountdownParts(countdownMs);
  const timerTitle =
    displayedJoinedCount === 0 && !hasBatchStarted
      ? "Signup opens with first join"
      : hasBatchStarted
        ? "Challenge ends in"
        : "Batch closes in";
  const timerCaption =
    displayedJoinedCount === 0 && !hasBatchStarted
      ? "The 48-hour signup timer starts when one person joins."
      : !hasBatchStarted && countdownMs <= 0
        ? "This waiting batch expired and will reset if it did not reach 3 members."
        : hasBatchStarted
          ? "This active batch is already running."
          : `${membersNeeded} more ${membersNeeded === 1 ? "member" : "members"} needed before the timer ends.`;

  useEffect(() => {
    setFallbackDeadlineMs(
      Date.now() +
        (challenge.batchStatus === "started"
          ? parseCountdownMs(challenge.countdown)
          : SIGNUP_WINDOW_MS),
    );
  }, [challenge.batchStatus, challenge.countdown, challenge.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

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

  const handleJoin = () => {
    onJoin();
    setShowSuccess(true);
  };

  const handlePrimaryAction = () => {
    if (hasBatchStarted && isJoined) {
      onOpenHub?.();
      return;
    }

    if (!canJoinBatch) return;

    handleJoin();
  };

  const handleShare = async () => {
    const shareText = `Join "${challengeTitle}" on DARE.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: challengeTitle,
          text: shareText,
        });
        return;
      }

      await navigator.clipboard?.writeText(shareText);
    } catch (error) {
      console.warn("Challenge share was cancelled or unavailable:", error);
    }
  };

  if (showSuccess) {
    return (
      <CommunityJoinSuccessScreen
        challenge={challenge}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[12000] bg-[#030403]">
      <CommunityChallengePreviewStyles />
      <div
        className="screen-container"
        style={{
          background:
            "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 20%, rgba(14,165,233,0.1), transparent 28%), linear-gradient(180deg,#060806,#030403)",
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[calc(var(--safe-area-top)+12px)]">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="app-pressable flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/8 bg-black/35 text-[#cbd5e1] shadow-[0_18px_44px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
            >
              <ArrowLeft size={21} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share challenge"
              className="app-pressable flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/8 bg-black/35 text-[#cbd5e1] shadow-[0_18px_44px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
            >
              <Share2 size={21} />
            </button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto pb-[28px]"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorY: "contain",
            }}
          >
            <div
              className="relative min-h-[38vh] overflow-hidden px-5 pb-7 pt-[calc(var(--safe-area-top)+92px)]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{
                  background: challenge.banner,
                  backgroundPosition: challenge.imagePosition || "center",
                }}
              />
              {challenge.imageUrl && (
                <img
                  src={challenge.imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: challenge.imagePosition || "center" }}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.22)_38%,rgba(3,4,3,0.94)_100%)]" />
              <div className="relative z-[1] mt-[11vh]">
                <div className="max-w-[360px] rounded-[30px] border border-white/12 bg-black/34 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#86efac] drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)]">
                    Community Dare
                  </p>
                  <h1 className="text-[31px] font-black uppercase leading-[1.05] tracking-[0.01em] text-white drop-shadow-[0_12px_30px_rgba(0,0,0,0.58)]">
                    {challengeTitle}
                  </h1>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-sm font-black text-white/90 shadow-[0_12px_28px_rgba(0,0,0,0.32)] backdrop-blur-md">
                    <Users size={16} className="text-[#86efac]" />
                    {displayedJoinedCount > 0
                      ? `${displayedJoinedCount}/${minRequiredMembers} joined`
                      : "No one joined yet"}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 pt-4">
              <div className="mx-auto max-w-[430px]">
              <section className="community-preview-panel relative z-10 rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar
                    src={challenge.creatorAvatar || ""}
                    alt={challenge.creatorName}
                    fallbackText={challenge.creatorName.charAt(0)}
                    size={46}
                    style={{
                      border: "2px solid rgba(74,222,128,0.28)",
                      boxShadow: "0 14px 34px rgba(0,0,0,0.32)",
                    }}
                    disableGhostMode
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-black text-white">
                      {challenge.creatorName}
                    </p>
                    <p className="truncate text-xs font-bold text-[#86efac]">
                      {challenge.sponsoredByDare
                        ? "Sponsored by Dare"
                        : `@${challenge.creatorUsername}`}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]">
                    <Sparkles size={20} />
                  </div>
                </div>

                <p className="text-[15px] font-semibold leading-relaxed text-[#d1fae5]">
                  {challenge.description}
                </p>

                <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac]">
                      <Users size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-black uppercase tracking-[0.14em] text-[#bbf7d0]">
                        Batch rules
                      </p>
                      <p className="mt-1 text-[13px] font-semibold leading-snug text-[#d1fae5]">
                        Needs {minRequiredMembers} members to start. The 48-hour
                        signup timer begins when the first person joins.
                      </p>
                      <p className="mt-2 text-[12px] font-black text-white/88">
                        {hasBatchStarted
                          ? "This batch has already started. New entry opens in the next batch."
                          : displayedJoinedCount > 0
                            ? `${membersNeeded} more ${membersNeeded === 1 ? "member" : "members"} needed.`
                            : "Timer is waiting for the first member."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="overflow-hidden rounded-[22px] border border-[#4ade80]/18 bg-[linear-gradient(135deg,rgba(74,222,128,0.14),rgba(255,255,255,0.045)_56%,rgba(7,10,8,0.58))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                      Still surviving
                    </p>
                    <p className="mt-2 text-[32px] font-black leading-none text-[#4ade80] drop-shadow-[0_0_20px_rgba(74,222,128,0.18)]">
                      {challenge.survivors}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-[22px] border border-red-400/16 bg-[linear-gradient(135deg,rgba(248,113,113,0.13),rgba(255,255,255,0.04)_56%,rgba(7,10,8,0.58))] p-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-300">
                      Eliminated
                    </p>
                    <p className="mt-2 text-[32px] font-black leading-none text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.14)]">
                      {challenge.eliminated}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    [CalendarDays, "Started", challenge.startedAt],
                    [Clock3, "Duration", challenge.durationLabel],
                    [ImageIcon, "Proof", challenge.proofLabel],
                    [
                      ShieldCheck,
                      "Status",
                      hasBatchStarted
                        ? isJoined
                          ? "Started"
                          : "Next batch"
                        : isJoined
                          ? "Waiting room"
                          : "Open to join",
                    ],
                  ].map(([Icon, label, value]) => {
                    const DetailIcon = Icon as typeof CalendarDays;
                    return (
                      <div
                        key={String(label)}
                        className="rounded-[22px] border border-white/8 bg-white/[0.035] p-3"
                      >
                        <DetailIcon
                          size={16}
                          className="mb-2 text-[#86efac]"
                        />
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b]">
                          {String(label)}
                        </p>
                        <p className="mt-1 text-[13px] font-black leading-snug text-white">
                          {String(value)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.035] p-3">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                    <FileCheck2 size={15} className="text-[#86efac]" />
                    Accepted files
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {challenge.proofFiles.map((file) => (
                      <span
                        key={file}
                        className="rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-1.5 text-xs font-bold text-[#bbf7d0]"
                      >
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="community-preview-panel community-preview-shine relative mt-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,23,19,0.9),rgba(7,10,8,0.98))] p-5 text-center shadow-[0_20px_58px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="relative z-10 mb-3 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[#cbd5e1]">
                  <Clock3 size={18} className="text-[#94a3b8]" />
                  {timerTitle}
                </div>
                <div className="relative z-10 grid grid-cols-3 gap-3">
                  {[
                    ["hours", countdownParts.hours],
                    ["mins", countdownParts.minutes],
                    ["secs", countdownParts.seconds],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[42px] font-black leading-none text-[#4ade80] drop-shadow-[0_0_22px_rgba(74,222,128,0.22)]">
                        {value}
                      </div>
                      <div className="mt-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#64748b]">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="relative z-10 mx-auto mt-4 max-w-[300px] text-[12px] font-semibold leading-snug text-[#94a3b8]">
                  {timerCaption}
                </p>
              </section>
              <button
                type="button"
                onClick={handlePrimaryAction}
                className={`community-preview-panel mt-5 mb-[calc(var(--safe-area-bottom)+24px)] flex min-h-[62px] w-full items-center justify-center rounded-full px-5 text-[16px] font-black uppercase tracking-[0.06em] transition-transform active:scale-[0.98] ${
                  hasBatchStarted && !isJoined
                    ? "cursor-default border border-amber-300/22 bg-amber-300/10 text-amber-100 shadow-none"
                    : isJoined
                    ? "border border-[#4ade80]/25 bg-[#4ade80]/12 text-[#d7ffe6] shadow-none"
                    : "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_20px_48px_rgba(74,222,128,0.32)]"
                }`}
                disabled={hasBatchStarted && !isJoined}
              >
                {primaryButtonLabel}
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
