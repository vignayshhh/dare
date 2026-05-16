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

function getCountdownParts(countdown: string) {
  const [hours = "00", minutes = "00", seconds = "00"] = countdown.split(":");
  return { hours, minutes, seconds };
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
  const countdownParts = getCountdownParts(challenge.countdown);
  const challengeTitle = getCommunityChallengeTitle(challenge);
  const displayedJoinedCount = challenge.joinedCount + (isJoined ? 1 : 0);

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
        onOpenHub={onOpenHub}
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
                      ? `${displayedJoinedCount} joined`
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

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    [CalendarDays, "Started", challenge.startedAt],
                    [Clock3, "Duration", challenge.durationLabel],
                    [ImageIcon, "Proof", challenge.proofLabel],
                    [
                      ShieldCheck,
                      "Status",
                      isJoined ? "You joined" : "Open to join",
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
                  Ends in
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
              </section>
              <button
                type="button"
                onClick={isJoined ? undefined : handleJoin}
                disabled={isJoined}
                className="community-preview-panel mt-5 mb-[calc(var(--safe-area-bottom)+24px)] flex min-h-[62px] w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-[16px] font-black uppercase tracking-[0.06em] text-[#061006] shadow-[0_20px_48px_rgba(74,222,128,0.32)] transition-transform active:scale-[0.98] disabled:border disabled:border-[#4ade80]/25 disabled:bg-none disabled:bg-[#4ade80]/12 disabled:text-[#d7ffe6] disabled:shadow-none"
              >
                {isJoined ? "Joined Community Dare" : "Join Community Dare"}
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
