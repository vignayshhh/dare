"use client";

import { Flame, ShieldCheck, Trophy } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import type { CommunityChallenge } from "./communityChallengeData";

export function getCommunityChallengeIcon(challenge: CommunityChallenge) {
  if (challenge.icon === "shield") return <ShieldCheck size={17} />;
  if (challenge.icon === "trophy") return <Trophy size={17} />;
  return <Flame size={17} />;
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
  isJoined,
  onPreview,
  onJoin,
}: {
  challenge: CommunityChallenge;
  isJoined: boolean;
  onPreview: () => void;
  onJoin: () => void;
}) {
  return (
    <>
      <CommunityChallengeVisualStyles />
      <article
        className="community-challenge-card group relative w-full overflow-hidden rounded-[34px] border border-white/8 p-[2px] text-left shadow-[0_28px_80px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.06)]"
        style={{
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.12), rgba(74,222,128,0.18) 34%, rgba(255,255,255,0.05) 68%, rgba(14,165,233,0.16))",
        }}
      >
        <div className="community-challenge-sweep pointer-events-none absolute inset-0 z-[3]" />
        <div className="relative overflow-hidden rounded-[32px] bg-[#050806]">
          <div className="pointer-events-none absolute inset-x-8 top-0 z-[2] h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
          <div
            className="relative min-h-[318px] overflow-hidden px-4 pb-3.5 pt-4"
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
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/42 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/88 shadow-[0_16px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                <span className="text-[#86efac]">{getCommunityChallengeIcon(challenge)}</span>
                Community run
              </div>
              <div className="rounded-full border border-[#4ade80]/24 bg-[#4ade80]/14 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#bbf7d0] shadow-[0_16px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                Open now
              </div>
            </div>

            <div className="absolute inset-x-3 bottom-3 z-[1] overflow-hidden rounded-[24px] border border-white/12 bg-black/48 p-3 text-center shadow-[0_22px_58px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.7),rgba(14,165,233,0.42),transparent)]" />
              <div className="relative z-[1]">
                {challenge.friendNames.length > 0 && (
                  <div className="mb-3 flex justify-center -space-x-3">
                    {challenge.friendNames.map((name, index) => (
                      <Avatar
                        key={name}
                        alt={name}
                        fallbackText={name.charAt(0).toUpperCase()}
                        size={38}
                        style={{
                          border: "2px solid rgba(6,10,7,0.92)",
                          boxShadow:
                            index === 1
                              ? "0 0 0 2px rgba(74,222,128,0.34)"
                              : "0 10px 24px rgba(0,0,0,0.34)",
                        }}
                      />
                    ))}
                  </div>
                )}
                <div className="text-[22px] font-black uppercase leading-none text-[#4ade80] drop-shadow-[0_0_18px_rgba(74,222,128,0.24)]">
                  {challenge.joinedCount > 0
                    ? `${challenge.joinedCount} joined`
                    : "No one joined yet"}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-[11px] font-extrabold text-white/86">
                    {challenge.typeLabel}
                  </span>
                  <span className="rounded-full border border-[#4ade80]/18 bg-[#4ade80]/12 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-[#bbf7d0]">
                    Dare official
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative bg-[linear-gradient(180deg,rgba(9,14,11,0.99),rgba(4,7,5,1))] px-4 pb-4 pt-3.5">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(74,222,128,0.32),rgba(14,165,233,0.22),rgba(255,255,255,0))]" />
            <div className="rounded-[23px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] px-4 py-3">
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
            </div>

            <div className="mt-2.5 grid grid-cols-2 overflow-hidden rounded-[21px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]">
              <div className="px-4 py-3">
                <div className="flex items-end gap-2">
                  <span className="text-[27px] font-black leading-none text-[#4ade80]">
                    {challenge.survivors}
                  </span>
                  <span className="pb-1 text-xs font-black uppercase leading-tight text-[#86efac]">
                    still
                    <br />
                    surviving
                  </span>
                </div>
              </div>
              <div className="border-l border-white/8 px-4 py-3">
                <div className="flex items-end justify-end gap-2">
                  <span className="text-[27px] font-black leading-none text-red-400">
                    {challenge.eliminated}
                  </span>
                  <span className="pb-1 text-xs font-black uppercase leading-tight text-red-300">
                    eliminated
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPreview();
              }}
              className={`mt-3.5 flex min-h-[52px] w-full items-center justify-center rounded-full px-5 text-[14px] font-black uppercase tracking-[0.04em] transition-all ${
                isJoined
                  ? "border border-[#4ade80]/30 bg-[#4ade80]/12 text-[#d7ffe6]"
                  : "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_18px_40px_rgba(74,222,128,0.28)]"
              }`}
            >
              View Challenge
            </button>
          </div>
        </div>
      </article>
    </>
  );
}
