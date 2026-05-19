"use client";

import { Flame, ShieldCheck, Trophy } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import type {
  CommunityChallenge,
  CommunityJoinPreviewUser,
} from "./communityChallengeData";

const FEED_SCREEN_SURFACE_BACKGROUND =
  "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)";

export function getCommunityChallengeIcon(challenge: CommunityChallenge) {
  if (challenge.icon === "shield") return <ShieldCheck size={17} />;
  if (challenge.icon === "trophy") return <Trophy size={17} />;
  return <Flame size={17} />;
}

function getJoinPreview(
  challenge: CommunityChallenge,
): CommunityJoinPreviewUser[] {
  if (challenge.joinPreview?.length) return challenge.joinPreview.slice(0, 3);
  return challenge.friendNames.slice(0, 3).map((name) => ({
    id: name,
    username: name.toLowerCase().replace(/\s+/g, ""),
    displayName: name,
  }));
}

function getJoinPreviewText(challenge: CommunityChallenge) {
  const previewUsers = getJoinPreview(challenge);
  if (previewUsers.length === 0 || challenge.joinedCount <= 0) {
    return "No one joined yet";
  }

  const names = previewUsers.map((user) => user.username || user.displayName);
  const otherCount = Math.max(
    challenge.extraFriends,
    challenge.joinedCount - previewUsers.length,
    0,
  );
  const visibleNames =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return otherCount > 0
    ? `${visibleNames} and ${otherCount} others joined this dare recently`
    : `${visibleNames} joined this dare recently`;
}

function CommunityChallengeVisualStyles() {
  return (
    <style>{`
      @keyframes communityChallengeSweep {
        0% { transform: translateX(-125%); }
        22% { transform: translateX(125%); }
        100% { transform: translateX(125%); }
      }
      .community-challenge-sweep {
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.11), transparent);
        animation: communityChallengeSweep 6.4s ease-in-out infinite;
      }
      .community-crowd-lights {
        background:
          radial-gradient(circle at 14% 88%, rgba(255,255,255,0.22), transparent 8%),
          radial-gradient(circle at 27% 76%, rgba(74,222,128,0.24), transparent 10%),
          radial-gradient(circle at 43% 92%, rgba(255,255,255,0.16), transparent 9%),
          radial-gradient(circle at 58% 78%, rgba(14,165,233,0.2), transparent 10%),
          radial-gradient(circle at 72% 92%, rgba(255,255,255,0.16), transparent 9%),
          radial-gradient(circle at 88% 76%, rgba(74,222,128,0.2), transparent 10%);
      }
      .community-challenge-card {
        animation: communityChallengeFloat 0.48s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes communityChallengeFloat {
        from { opacity: 0; transform: translateY(14px) scale(0.985); filter: blur(6px); }
        to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
    `}</style>
  );
}

export function CommunityChallengeCard({
  challenge,
  onPreview,
}: {
  challenge: CommunityChallenge;
  onPreview: () => void;
}) {
  const joinPreview = getJoinPreview(challenge);
  const joinPreviewText = getJoinPreviewText(challenge);

  return (
    <>
      <CommunityChallengeVisualStyles />
      <article
        role="button"
        tabIndex={0}
        onClick={onPreview}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPreview();
          }
        }}
        aria-label={`Preview ${challenge.titleTop} ${challenge.titleAccent}`}
        className="community-challenge-card group relative w-full cursor-pointer overflow-hidden rounded-[34px] border border-white/8 p-[2px] text-left shadow-[0_28px_80px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none transition-transform active:scale-[0.992] focus-visible:ring-2 focus-visible:ring-[#4ade80]/60"
        style={{
          background: FEED_SCREEN_SURFACE_BACKGROUND,
        }}
      >
        <div className="community-challenge-sweep pointer-events-none absolute inset-0 z-[3]" />
        <div
          className="relative overflow-hidden rounded-[32px]"
          style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 z-[2] h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
          <div
            className="relative min-h-[386px] overflow-hidden px-4 pb-4 pt-4"
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
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.18)_34%,rgba(0,0,0,0.52)_64%,rgba(0,0,0,0.9)_100%)]" />
            <div className="community-crowd-lights pointer-events-none absolute inset-x-5 bottom-0 h-28 opacity-80" />
            <div className="relative z-[1] flex items-start justify-between gap-3">
              <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/12 bg-black/42 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/88 shadow-[0_16px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                <ShieldCheck size={13} className="shrink-0 text-[#86efac]" />
                <span className="truncate">Created by Dare Official</span>
              </div>
              <div className="rounded-full border border-[#4ade80]/24 bg-[#4ade80]/14 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#bbf7d0] shadow-[0_16px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                Open now
              </div>
            </div>

            <div
              className="absolute inset-x-3 bottom-3 z-[1] overflow-hidden rounded-[24px] border border-white/12 bg-[linear-gradient(135deg,rgba(8,12,10,0.52),rgba(255,255,255,0.075)_48%,rgba(8,12,10,0.36))] p-3 text-center shadow-[0_22px_58px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.09)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.7),rgba(14,165,233,0.42),transparent)]" />
              <div className="relative z-[1]">
                <div className="mx-auto max-w-[310px] rounded-[18px] border border-white/12 bg-white/[0.075] px-3.5 py-3 text-[14px] font-black leading-snug text-[#d7ffe6] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
                  {joinPreviewText}
                </div>
              </div>
            </div>
          </div>

          <div
            className="relative px-4 pb-5 pt-4"
            style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
          >
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(74,222,128,0.32),rgba(14,165,233,0.22),rgba(255,255,255,0))]" />
            <div
              className="rounded-[23px] border border-white/8 px-4 py-3"
              style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
            >
              <div className="min-w-0">
                <div className="text-[22px] font-black uppercase leading-tight text-white">
                  {challenge.titleTop}
                </div>
                <div
                  className="text-[22px] font-black uppercase leading-tight"
                  style={{ color: challenge.accent }}
                >
                  {challenge.titleAccent}
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreview();
                }}
                className="mt-3 flex min-h-[46px] w-full items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.028))] px-4 text-center text-[12px] font-black uppercase tracking-[0.08em] text-white/88 shadow-[0_14px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all active:scale-[0.98] group-hover:border-[#4ade80]/24 group-hover:text-[#d7ffe6]"
              >
                View dare description
              </button>
            </div>

          </div>
        </div>
      </article>
    </>
  );
}
