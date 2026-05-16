"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { CommunityChallengePreviewScreen } from "./CommunityChallengePreviewScreen";
import {
  COMMUNITY_CHALLENGES,
  type CommunityChallenge,
} from "./communityChallengeData";
import {
  ChallengeRoomScreen,
  type ChallengeRunIcon,
  type JoinedChallengeRun,
} from "./ChallengeRoomScreen";

type HubTab = "active" | "completed" | "eliminated";

const JOINED_CHALLENGES: JoinedChallengeRun[] = [
  {
    id: "run-no-instagram",
    title: "No Instagram",
    day: 2,
    totalDays: 7,
    survivors: 73,
    accent: "#4ade80",
    icon: "instagram",
    status: "upload_due",
    countdown: "04:11:22",
  },
  {
    id: "run-5am",
    title: "5AM Wake Up",
    day: 4,
    totalDays: 7,
    survivors: 68,
    accent: "#facc15",
    icon: "sun",
    status: "submitted",
  },
  {
    id: "run-cold-shower",
    title: "Cold Shower",
    day: 1,
    totalDays: 7,
    survivors: 91,
    accent: "#38bdf8",
    icon: "droplets",
    status: "upload_today",
  },
  {
    id: "run-study",
    title: "Study 3 Hours",
    day: 3,
    totalDays: 7,
    survivors: 112,
    accent: "#4ade80",
    icon: "book",
    status: "upload_due",
    countdown: "02:45:10",
  },
];

const COMPLETED_CHALLENGES: JoinedChallengeRun[] = [
  {
    id: "run-no-sugar-done",
    title: "No Sugar",
    day: 30,
    totalDays: 30,
    survivors: 204,
    accent: "#4ade80",
    icon: "shield",
    status: "submitted",
  },
  {
    id: "run-walk-done",
    title: "Walk 10K",
    day: 7,
    totalDays: 7,
    survivors: 131,
    accent: "#84cc16",
    icon: "shield",
    status: "submitted",
  },
];

const ELIMINATED_CHALLENGES: JoinedChallengeRun[] = [
  {
    id: "run-sleep-eliminated",
    title: "Sleep Before 11PM",
    day: 3,
    totalDays: 7,
    survivors: 89,
    accent: "#38bdf8",
    icon: "moon",
    status: "upload_due",
    countdown: "Missed",
  },
];

const RECOMMENDED_CHALLENGES: Array<{
  challenge: CommunityChallenge;
  label: string;
  duration: string;
  icon: ChallengeRunIcon;
  joined: string;
  accent: string;
}> = [
  {
    challenge: COMMUNITY_CHALLENGES[1],
    label: "Speak Truth",
    duration: "24 hours",
    icon: "shield",
    joined: "1.1K joined",
    accent: "#38bdf8",
  },
  {
    challenge: COMMUNITY_CHALLENGES[2],
    label: "No Sugar",
    duration: "30 days",
    icon: "shield",
    joined: "2.4K joined",
    accent: "#4ade80",
  },
  {
    challenge: COMMUNITY_CHALLENGES[0],
    label: "Sleep Before",
    duration: "11PM",
    icon: "moon",
    joined: "890 joined",
    accent: "#38bdf8",
  },
  {
    challenge: COMMUNITY_CHALLENGES[2],
    label: "Study Deep",
    duration: "7 days",
    icon: "book",
    joined: "1.3K joined",
    accent: "#facc15",
  },
];

function getRunsForTab(tab: HubTab) {
  if (tab === "completed") return COMPLETED_CHALLENGES;
  if (tab === "eliminated") return ELIMINATED_CHALLENGES;
  return JOINED_CHALLENGES;
}

function HubStyles() {
  return (
    <style>{`
      @keyframes hubFadeUp {
        from { opacity: 0; transform: translateY(14px) scale(0.985); filter: blur(6px); }
        to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes hubSweep {
        0% { transform: translateX(-125%); }
        24% { transform: translateX(125%); }
        100% { transform: translateX(125%); }
      }
      @keyframes hubGlyphPulse {
        0%, 100% { opacity: 0.62; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.06); }
      }
      .challenge-hub-panel {
        animation: hubFadeUp 0.48s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .challenge-hub-shine::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
        animation: hubSweep 6.6s ease-in-out infinite;
        pointer-events: none;
      }
      .challenge-hub-glyph-core {
        animation: hubGlyphPulse 3.8s ease-in-out infinite;
      }
    `}</style>
  );
}

function ChallengeGlyph({
  icon,
  accent,
  compact = false,
}: {
  icon: ChallengeRunIcon;
  accent: string;
  compact?: boolean;
}) {
  const size = compact ? "h-12 w-12 rounded-[18px]" : "h-14 w-14 rounded-[22px]";
  const centerClass = compact ? "h-5 w-5" : "h-6 w-6";

  return (
    <div
      className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden border shadow-[0_16px_36px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]`}
      style={{
        borderColor: `${accent}32`,
        background: `linear-gradient(180deg, ${accent}18, rgba(255,255,255,0.035))`,
      }}
    >
      <div
        className="absolute inset-2 rounded-[inherit] border border-white/8"
        style={{ boxShadow: `inset 0 0 20px ${accent}12` }}
      />
      {icon === "sun" ? (
        <span
          className={`challenge-hub-glyph-core ${centerClass} rounded-full`}
          style={{
            background: accent,
            boxShadow: `0 0 20px ${accent}80`,
          }}
        />
      ) : icon === "droplets" ? (
        <span
          className={`challenge-hub-glyph-core ${centerClass} rotate-45 rounded-br-full rounded-tl-full rounded-tr-full`}
          style={{
            background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.7))`,
            boxShadow: `0 0 20px ${accent}68`,
          }}
        />
      ) : icon === "book" ? (
        <span className={`challenge-hub-glyph-core ${centerClass} relative`}>
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
          className={`challenge-hub-glyph-core ${centerClass} rounded-full`}
          style={{
            background: accent,
            boxShadow: `inset -7px 0 0 rgba(3,4,3,0.95), 0 0 20px ${accent}70`,
          }}
        />
      ) : icon === "instagram" ? (
        <span
          className={`challenge-hub-glyph-core ${centerClass} relative rounded-[7px] border-2`}
          style={{
            borderColor: accent,
            boxShadow: `0 0 20px ${accent}62`,
          }}
        >
          <span
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: accent }}
          />
        </span>
      ) : (
        <span
          className={`challenge-hub-glyph-core ${centerClass} rounded-[9px]`}
          style={{
            background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.72))`,
            clipPath: "polygon(50% 0%, 90% 18%, 82% 82%, 50% 100%, 18% 82%, 10% 18%)",
            boxShadow: `0 0 20px ${accent}70`,
          }}
        />
      )}
    </div>
  );
}

function ChallengeRunCard({
  challenge,
  onContinue,
}: {
  challenge: JoinedChallengeRun;
  onContinue: () => void;
}) {
  const isSubmitted = challenge.status === "submitted";
  const isUploadToday = challenge.status === "upload_today";
  const progress = Math.min(100, (challenge.day / challenge.totalDays) * 100);

  return (
    <div className="challenge-hub-panel relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] p-4 shadow-[0_22px_62px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.72),rgba(14,165,233,0.38),rgba(74,222,128,0))]" />
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full blur-3xl"
        style={{ background: `${challenge.accent}14` }}
      />
      <div className="relative z-10 flex items-start gap-3">
        <ChallengeGlyph icon={challenge.icon} accent={challenge.accent} />

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[18px] font-black uppercase leading-tight text-white">
                {challenge.title}
              </div>
              <div className="mt-1 text-[12px] font-black uppercase tracking-[0.12em] text-[#6ee7b7]">
                Day {challenge.day} of {challenge.totalDays}
              </div>
            </div>
            <button
              type="button"
              onClick={onContinue}
              className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#bbf7d0] shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
              aria-label={`Open ${challenge.title}`}
            >
              <ChevronRight size={21} />
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ${
                isSubmitted
                  ? "border-[#4ade80]/22 bg-[#4ade80]/10 text-[#86efac]"
                  : isUploadToday
                    ? "border-[#facc15]/22 bg-[#facc15]/10 text-[#fde68a]"
                    : "border-red-400/22 bg-red-500/10 text-red-200"
              }`}
            >
              {isSubmitted
                ? "Proof submitted"
                : isUploadToday
                  ? "Upload today"
                  : "Upload due"}
            </span>
            {!isSubmitted && challenge.countdown ? (
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#cbd5e1]">
                {challenge.countdown}
              </span>
            ) : null}
            <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#94a3b8]">
              {challenge.survivors} surviving
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-white/[0.055]">
            <div
              className="h-full rounded-full shadow-[0_0_18px_rgba(74,222,128,0.24)]"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${challenge.accent}, #4ade80)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RecommendedChallengeCard({
  item,
  onOpen,
}: {
  item: (typeof RECOMMENDED_CHALLENGES)[number];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="challenge-hub-panel app-pressable relative w-[176px] shrink-0 overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,23,19,0.96),rgba(7,10,8,0.99))] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div
        className="mb-3 h-24 overflow-hidden rounded-[22px] border border-white/8"
        style={{ background: item.challenge.banner }}
      >
        <div className="h-full w-full bg-[linear-gradient(180deg,rgba(0,0,0,0),rgba(3,4,3,0.58))]" />
      </div>
      <div className="flex items-start gap-2">
        <ChallengeGlyph icon={item.icon} accent={item.accent} compact />
        <div className="min-w-0">
          <div className="line-clamp-2 text-[14px] font-black uppercase leading-tight text-white">
            {item.label}
          </div>
          <div className="mt-1 text-xs font-bold uppercase text-[#cbd5e1]">
            {item.duration}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-full border border-[#4ade80]/22 bg-[#4ade80]/10 px-3 py-2 text-center text-[11px] font-black uppercase tracking-[0.08em] text-[#bbf7d0]">
        View dare
      </div>
    </button>
  );
}

export function ChallengeHubScreen({
  isActive = true,
  onBack,
}: {
  isActive?: boolean;
  onBack?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<HubTab>("active");
  const [selectedRoomChallenge, setSelectedRoomChallenge] =
    useState<JoinedChallengeRun | null>(null);
  const [selectedRecommendedChallenge, setSelectedRecommendedChallenge] =
    useState<CommunityChallenge | null>(null);
  const [joinedChallengeIds, setJoinedChallengeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const runs = useMemo(() => getRunsForTab(activeTab), [activeTab]);

  const handleJoinRecommended = (challengeId: string) => {
    setJoinedChallengeIds((current) => {
      if (current.has(challengeId)) return current;
      const next = new Set(current);
      next.add(challengeId);
      return next;
    });
  };

  return (
    <div
      className="screen-container challenge-hub-screen"
      style={{
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.17), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%), linear-gradient(180deg,#060806 0%,#0a0f0a 48%,#030403 100%)",
      }}
      aria-hidden={!isActive}
    >
      <HubStyles />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 28px)",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 28px)",
          scrollPaddingTop: "calc(var(--safe-area-top) + 28px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mx-auto max-w-[460px]">
          {onBack ? (
            <div className="relative mb-5 flex items-center justify-center">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to community dares"
                className="app-pressable absolute left-0 flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
              >
                <ArrowLeft size={21} />
              </button>
              <div className="min-w-0 px-14 text-center">
                <h1 className="truncate text-[25px] font-black leading-none tracking-tight text-white">
                  Community Dare Hub
                </h1>
              </div>
            </div>
          ) : null}

          <div className="mb-3 grid grid-cols-3 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.9),rgba(10,14,10,0.96))] p-1 shadow-[0_16px_44px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.045)]">
            {[
              ["active", "Active"],
              ["completed", "Completed"],
              ["eliminated", "Eliminated"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab as HubTab)}
                className={`rounded-[18px] px-2 py-2.5 text-[11px] font-black transition-all ${
                  activeTab === tab
                    ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_24px_rgba(74,222,128,0.22)]"
                    : "text-[#94a3b8] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-3 mt-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                Your dares
              </p>
              <h2 className="mt-1 text-[22px] font-black leading-none text-white">
                Current community runs
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {runs.map((challenge) => (
              <ChallengeRunCard
                key={challenge.id}
                challenge={challenge}
                onContinue={() => setSelectedRoomChallenge(challenge)}
              />
            ))}
          </div>

          <div className="challenge-hub-panel challenge-hub-shine relative mb-4 mt-7 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-4 shadow-[0_22px_62px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                  Recommended for you
                </p>
                <h2 className="mt-1 text-[22px] font-black leading-tight text-white">
                  Premium community dares to start next
                </h2>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-[#4ade80]/20 bg-[#4ade80]/10 text-[20px] font-black text-[#86efac]">
                D
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
              Pick a run
            </p>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-black text-[#94a3b8]"
            >
              See all
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {RECOMMENDED_CHALLENGES.map((item) => (
              <RecommendedChallengeCard
                key={`${item.label}-${item.duration}`}
                item={item}
                onOpen={() => setSelectedRecommendedChallenge(item.challenge)}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedRoomChallenge && (
        <ChallengeRoomScreen
          challenge={selectedRoomChallenge}
          onBack={() => setSelectedRoomChallenge(null)}
        />
      )}

      {selectedRecommendedChallenge && (
        <CommunityChallengePreviewScreen
          challenge={selectedRecommendedChallenge}
          isJoined={joinedChallengeIds.has(selectedRecommendedChallenge.id)}
          onClose={() => setSelectedRecommendedChallenge(null)}
          onJoin={() => handleJoinRecommended(selectedRecommendedChallenge.id)}
          onOpenHub={() => setSelectedRecommendedChallenge(null)}
        />
      )}
    </div>
  );
}
