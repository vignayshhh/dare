"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  ChevronRight,
  Dumbbell,
  Flame,
  Leaf,
  ShieldCheck,
  Sunrise,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import {
  communityChallengeService,
  type CommunityChallengeJoin,
  type CommunityChallengeSummary,
} from "../../middleware/services/community-challenge.service";
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

const FEED_SCREEN_SURFACE_BACKGROUND =
  "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)";

// Map CommunityChallenge icons to ChallengeRunIcon types
const mapIconToChallengeRun = (
  icon: "flame" | "shield" | "trophy",
): ChallengeRunIcon => {
  switch (icon) {
    case "flame":
      return "sun";
    case "shield":
      return "droplets";
    case "trophy":
      return "instagram";
    default:
      return "sun";
  }
};

// Filter official Dare challenges that user hasn't joined yet
const getRecommendedChallenges = (
  joinedIds: Set<string>,
  challenges: CommunityChallenge[],
) => {
  return challenges.filter(
    (challenge) =>
      challenge.creatorUsername === "dare" &&
      challenge.sponsoredByDare &&
      !joinedIds.has(challenge.id),
  ).map((challenge) => ({
    challenge,
    label: challenge.titleTop,
    duration: challenge.durationLabel,
    icon: mapIconToChallengeRun(challenge.icon),
    joined:
      challenge.joinedCount > 0
        ? `${challenge.joinedCount} joined`
        : "No one joined yet",
    accent: challenge.accent,
  }));
};

function formatHubCountdown(proofDueAtMs: number | null) {
  if (!proofDueAtMs) return "24:00:00";
  const totalSeconds = Math.max(0, Math.floor((proofDueAtMs - Date.now()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function getRunStatus(join: CommunityChallengeJoin): JoinedChallengeRun["status"] {
  if (join.status === "submitted" || join.status === "completed") {
    return "submitted";
  }
  if (join.proofDueAtMs && join.proofDueAtMs - Date.now() > 6 * 60 * 60 * 1000) {
    return "upload_today";
  }
  return "upload_due";
}

function toJoinedRun(
  join: CommunityChallengeJoin,
  challenge: CommunityChallenge,
  summary?: CommunityChallengeSummary,
): JoinedChallengeRun {
  const derivedLifecycleStatus =
    join.status === "active" &&
    join.proofDueAtMs !== null &&
    join.proofDueAtMs <= Date.now()
      ? "eliminated"
      : join.status === "waiting"
        ? "active"
        : join.status;
  return {
    id: challenge.id,
    title: `${challenge.titleTop} ${challenge.titleAccent}`.trim(),
    day: join.currentDay,
    totalDays: join.totalDays,
    survivors: summary?.activeCount ?? challenge.survivors,
    accent: challenge.accent,
    icon: mapIconToChallengeRun(challenge.icon),
    status: getRunStatus(join),
    countdown:
      derivedLifecycleStatus === "eliminated"
        ? "Missed"
        : derivedLifecycleStatus === "completed"
          ? "Complete"
          : formatHubCountdown(join.proofDueAtMs),
    lifecycleStatus: derivedLifecycleStatus,
    proofDueAtMs: join.proofDueAtMs,
    eliminatedAtMs: join.eliminatedAtMs,
    completedAtMs: join.completedAtMs,
    eliminationReason: join.eliminationReason,
  };
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
  challenge,
  accent,
  compact = false,
}: {
  challenge: Pick<JoinedChallengeRun, "id" | "title" | "icon">;
  accent: string;
  compact?: boolean;
}) {
  const size = compact
    ? "h-12 w-12 rounded-[18px]"
    : "h-14 w-14 rounded-[22px]";
  const iconSize = compact ? 21 : 24;

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
      <div
        className="challenge-hub-glyph-core relative z-10 flex items-center justify-center rounded-[16px]"
        style={{
          width: compact ? 34 : 38,
          height: compact ? 34 : 38,
          color: accent,
          background: `linear-gradient(180deg, ${accent}18, rgba(255,255,255,0.035))`,
          boxShadow: `0 0 24px ${accent}24, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {renderJoinedChallengeIcon(challenge, iconSize)}
      </div>
    </div>
  );
}

function renderJoinedChallengeIcon(
  challenge: Pick<JoinedChallengeRun, "id" | "title" | "icon">,
  size: number,
) {
  const key = `${challenge.id} ${challenge.title}`.toLowerCase();
  const iconProps = { size, strokeWidth: 2.35 };

  if (key.includes("read") || key.includes("page") || key.includes("book")) {
    return <BookOpen {...iconProps} />;
  }
  if (
    key.includes("push") ||
    key.includes("workout") ||
    key.includes("exercise")
  ) {
    return <Dumbbell {...iconProps} />;
  }
  if (key.includes("wake") || key.includes("morning") || key.includes("8 am")) {
    return <Sunrise {...iconProps} />;
  }
  if (key.includes("nature") || key.includes("plant") || key.includes("tree")) {
    return <Leaf {...iconProps} />;
  }
  if (
    key.includes("photo") ||
    key.includes("unfiltered") ||
    key.includes("camera")
  ) {
    return <Camera {...iconProps} />;
  }

  if (challenge.icon === "shield") return <ShieldCheck {...iconProps} />;
  if (challenge.icon === "instagram") return <Camera {...iconProps} />;
  if (challenge.icon === "sun") return <Sunrise {...iconProps} />;
  if (challenge.icon === "book") return <BookOpen {...iconProps} />;
  if (challenge.icon === "droplets") return <Leaf {...iconProps} />;
  if (challenge.icon === "moon") return <Sunrise {...iconProps} />;

  return <Flame {...iconProps} />;
}

function ChallengeRunCard({
  challenge,
  onContinue,
}: {
  challenge: JoinedChallengeRun;
  onContinue: () => void;
}) {
  const isSubmitted = challenge.status === "submitted";
  const isEliminated = challenge.lifecycleStatus === "eliminated";
  const progress = Math.min(100, (challenge.day / challenge.totalDays) * 100);

  return (
    <div
      className={`challenge-hub-panel relative overflow-hidden rounded-[26px] border p-3.5 shadow-[0_20px_54px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] ${
        isEliminated ? "border-red-300/14" : "border-white/8"
      }`}
      style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.72),rgba(14,165,233,0.38),rgba(74,222,128,0))]" />
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full blur-3xl"
        style={{ background: `${challenge.accent}14` }}
      />
      <div className="relative z-10 flex items-start gap-3">
        <ChallengeGlyph challenge={challenge} accent={challenge.accent} />

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <div className="truncate text-[17px] font-black uppercase leading-tight text-white">
                {challenge.title}
              </div>
              <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#6ee7b7]">
                Day {challenge.day} of {challenge.totalDays}
              </div>
            </div>
            <button
              type="button"
              onClick={onContinue}
              className="app-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#bbf7d0] shadow-[0_10px_22px_rgba(0,0,0,0.22)]"
              aria-label={`Open ${challenge.title}`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <span
              className={`rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ${
                isEliminated
                  ? "border-red-300/22 bg-red-500/10 text-red-200"
                  : isSubmitted
                  ? "border-[#4ade80]/22 bg-[#4ade80]/10 text-[#86efac]"
                  : "border-red-400/22 bg-red-500/10 text-red-200"
              }`}
            >
              {isEliminated
                ? "Eliminated"
                : isSubmitted
                ? "Proof submitted"
                : challenge.countdown || "30 mins"}
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#94a3b8]">
              {isEliminated
                ? "Moved to eliminated"
                : `${Math.max(0, challenge.totalDays - challenge.day + 1)} days left`}
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
  item: ReturnType<typeof getRecommendedChallenges>[0];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="challenge-hub-panel app-pressable relative w-[140px] shrink-0 overflow-hidden rounded-[20px] border border-white/8 p-2 text-left shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
    >
      <div
        className="mb-2 h-16 overflow-hidden rounded-[16px] border border-white/8"
        style={{
          backgroundImage: `url(${item.challenge.imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: item.challenge.imagePosition || "center",
        }}
      >
        <div className="h-full w-full bg-[linear-gradient(180deg,rgba(0,0,0,0),rgba(3,4,3,0.58))]" />
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[12.5px] font-black uppercase leading-tight text-white">
            {item.label}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase text-[#94a3b8]">
            {item.duration}
          </div>
        </div>
      </div>
      <div className="mt-2 rounded-full border border-[#4ade80]/18 bg-[#4ade80]/8 px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.08em] text-[#bbf7d0]">
        Preview
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
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<HubTab>("active");
  const [selectedRoomChallenge, setSelectedRoomChallenge] =
    useState<JoinedChallengeRun | null>(null);
  const [selectedRecommendedChallenge, setSelectedRecommendedChallenge] =
    useState<CommunityChallenge | null>(null);
  const [communityChallengeSummaries, setCommunityChallengeSummaries] =
    useState<Record<string, CommunityChallengeSummary>>({});
  const [joinedChallenges, setJoinedChallenges] = useState<
    CommunityChallengeJoin[]
  >([]);
  const [registeredChallengeIds, setRegisteredChallengeIds] = useState<
    Set<string>
  >(() => new Set());

  useEffect(() => {
    return communityChallengeService.subscribeToSummaries(
      COMMUNITY_CHALLENGES.map((challenge) => challenge.id),
      setCommunityChallengeSummaries,
    );
  }, []);

  useEffect(() => {
    return communityChallengeService.subscribeToJoinedChallenges(
      user?.id,
      setJoinedChallenges,
    );
  }, [user?.id]);

  useEffect(() => {
    return communityChallengeService.subscribeToJoinedChallengeIds(
      user?.id,
      setRegisteredChallengeIds,
    );
  }, [user?.id]);

  const hydratedCommunityChallenges = useMemo(
    () =>
      communityChallengeService.hydrateChallenges(
        COMMUNITY_CHALLENGES,
        communityChallengeSummaries,
      ),
    [communityChallengeSummaries],
  );

  const runs = useMemo(() => {
    const challengeById = new Map(
      hydratedCommunityChallenges.map((challenge) => [challenge.id, challenge]),
    );
    return joinedChallenges
      .filter((join) => join.officialDare)
      .map((join) => {
        const challenge = challengeById.get(join.challengeId);
        if (!challenge) return null;
        return toJoinedRun(
          join,
          challenge,
          communityChallengeSummaries[join.challengeId],
        );
      })
      .filter((run): run is JoinedChallengeRun => Boolean(run))
      .filter((run) => {
        if (activeTab === "completed") {
          return run.lifecycleStatus === "completed";
        }
        if (activeTab === "eliminated") {
          return run.lifecycleStatus === "eliminated";
        }
        return (
          run.lifecycleStatus !== "completed" &&
          run.lifecycleStatus !== "eliminated"
        );
      });
  }, [
    activeTab,
    communityChallengeSummaries,
    hydratedCommunityChallenges,
    joinedChallenges,
  ]);

  const handleJoinRecommended = async (challenge: CommunityChallenge) => {
    if (!user?.id) return;
    await communityChallengeService.joinChallenge(challenge, {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      avatar: user.avatar || "",
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
          paddingTop: "calc(var(--safe-area-top) + 20px)",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 22px)",
          scrollPaddingTop: "calc(var(--safe-area-top) + 20px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mx-auto flex min-h-[calc(100dvh-var(--safe-area-top)-var(--bottom-nav-total-height)-42px)] max-w-[448px] flex-col">
          {onBack ? (
            <div className="relative mb-4 flex min-h-[46px] items-center justify-center">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to community dares"
                className="app-pressable absolute left-0 flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_14px_34px_rgba(0,0,0,0.3)]"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0 px-14 text-center">
                <h1 className="truncate text-[23px] font-black leading-none tracking-tight text-white">
                  Community Dare Hub
                </h1>
              </div>
            </div>
          ) : null}

          <div className="mb-4 grid grid-cols-3 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.9),rgba(10,14,10,0.96))] p-1 shadow-[0_14px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)]">
            {[
              ["active", "Active"],
              ["completed", "Completed"],
              ["eliminated", "Eliminated"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab as HubTab)}
                className={`rounded-[16px] px-2 py-2.5 text-[11px] font-black transition-all ${
                  activeTab === tab
                    ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_24px_rgba(74,222,128,0.22)]"
                    : "text-[#94a3b8] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                Your dares
              </p>
              <h2 className="mt-1 text-[21px] font-black leading-none text-white">
                Current community runs
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {runs.length > 0 ? (
              runs.map((challenge) => (
                <ChallengeRunCard
                  key={challenge.id}
                  challenge={challenge}
                  onContinue={() => setSelectedRoomChallenge(challenge)}
                />
              ))
            ) : (
              <div className="challenge-hub-panel rounded-[26px] border border-white/8 bg-white/[0.035] px-5 py-7 text-center shadow-[0_16px_42px_rgba(0,0,0,0.26)]">
                <div className="text-[13px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                  {activeTab === "active"
                    ? "No active community dares"
                    : activeTab === "completed"
                      ? "No completed dares yet"
                      : "No eliminated dares"}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-10">
            <div className="challenge-hub-panel relative mb-3 overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-black uppercase tracking-[0.2em] text-[#86efac]">
                    Recommended for you
                  </p>
                  <h2 className="mt-1 text-[16px] font-black leading-tight text-white/92">
                    Start another community run
                  </h2>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border border-[#4ade80]/18 bg-[#4ade80]/9 text-[14px] font-black text-[#86efac]">
                  D
                </div>
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between px-0.5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b]">
                Pick a run
              </p>
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] font-black text-[#64748b]"
              >
                See all
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-hide">
              {getRecommendedChallenges(
                registeredChallengeIds,
                hydratedCommunityChallenges,
              ).map((item) => (
                <RecommendedChallengeCard
                  key={`${item.label}-${item.duration}`}
                  item={item}
                  onOpen={() => setSelectedRecommendedChallenge(item.challenge)}
                />
              ))}
            </div>
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
          isJoined={registeredChallengeIds.has(selectedRecommendedChallenge.id)}
          onClose={() => setSelectedRecommendedChallenge(null)}
          onJoin={() => handleJoinRecommended(selectedRecommendedChallenge)}
          onOpenHub={() => setSelectedRecommendedChallenge(null)}
        />
      )}
    </div>
  );
}
