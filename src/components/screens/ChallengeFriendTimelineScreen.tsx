"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Target,
} from "lucide-react";
import { AlertEntity } from "@/backend/domain/entities/Alert";
import { dareService, truthService } from "@/middleware/services/service-factory";
import { Avatar } from "../ui/Avatar";

type TimelineStep = {
  label: string;
  caption: string;
  time?: string | null;
  complete: boolean;
};

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: number }).seconds === "number"
  ) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString();
  }
  return null;
}

function formatTime(value?: string | null) {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDisplayName(
  meta: Record<string, any>,
  prefix: "challenger" | "receiver",
) {
  return (
    meta[`${prefix}Name`] ||
    meta[`${prefix}Username`] ||
    (prefix === "challenger" ? "Challenger" : "Receiver")
  );
}

export function ChallengeFriendTimelineScreen({
  alert,
  onBack,
}: {
  alert: AlertEntity | null;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<any | null>(null);

  const meta = alert?.metadata || {};
  const challengeKind =
    meta.challengeKind === "truth" || alert?.type === "TRUTH_FRIEND_ACTIVITY"
      ? "truth"
      : "dare";
  const isDare = challengeKind === "dare";
  const mockChallenge = useMemo(() => {
    if (!alert?.metadata?.mock) return null;

    return {
      state: alert.metadata.mockState || "SENT",
      description: alert.metadata.prompt,
      question: alert.metadata.prompt,
      createdAt: alert.metadata.mockCreatedAt || alert.createdAt,
      acceptedAt: alert.metadata.mockAcceptedAt,
      proofSubmittedAt: alert.metadata.mockProofSubmittedAt,
      completedAt: alert.metadata.mockCompletedAt,
      answeredAt: alert.metadata.mockAnsweredAt,
      reviewedAt: alert.metadata.mockReviewedAt,
      updatedAt: alert.metadata.mockUpdatedAt || alert.updatedAt,
    };
  }, [alert]);

  useEffect(() => {
    if (!alert?.entityId) return;

    let cancelled = false;
    const loadChallenge = async () => {
      setLoading(true);
      setError(null);
      try {
        if (mockChallenge) {
          setChallenge(mockChallenge);
          return;
        }

        if (isDare) {
          const response = await dareService.getDareById(alert.entityId);
          if (cancelled) return;
          if (!response.success || !response.dare) {
            throw new Error("This dare could not be found.");
          }
          setChallenge(response.dare);
        } else {
          const response = await truthService.getTruthById(alert.entityId);
          if (cancelled) return;
          if (!response.success || !response.truth) {
            throw new Error("This truth could not be found.");
          }
          setChallenge(response.truth);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load the challenge status.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadChallenge();
    return () => {
      cancelled = true;
    };
  }, [alert?.entityId, challengeKind, isDare, mockChallenge]);

  const steps = useMemo<TimelineStep[]>(() => {
    if (!challenge) {
      return [
        { label: "Challenge sent", caption: "Waiting for status", complete: true },
        { label: "Accepted", caption: "Pending", complete: false },
        { label: "Completed", caption: "Pending", complete: false },
      ];
    }

    if (isDare) {
      const state = challenge.state;
      const accepted =
        state !== "SENT" && state !== "CHICKEN_OUT" && !!state;
      const completed =
        state === "ACCEPTED_REAL" ||
        state === "REJECTED_FAKE" ||
        state === "CHICKEN_OUT";

      return [
        {
          label: "Challenge sent",
          caption: "Created by the challenger",
          time: normalizeDate(challenge.createdAt),
          complete: true,
        },
        {
          label: "Accepted",
          caption:
            state === "CHICKEN_OUT"
              ? "Receiver declined"
              : accepted
                ? "Receiver accepted the dare"
                : "Waiting for receiver",
          time: normalizeDate(challenge.acceptedAt),
          complete: accepted,
        },
        {
          label: "Completed",
          caption:
            state === "ACCEPTED_REAL"
              ? "Completed and approved"
              : state === "REJECTED_FAKE"
                ? "Completed but rejected"
                : state === "CHICKEN_OUT"
                  ? "Closed"
                  : state === "FRIENDS_VALIDATION" || state === "PROOF_SUBMITTED"
                    ? "Under review"
                    : "Pending proof",
          time: normalizeDate(challenge.completedAt || challenge.proofSubmittedAt),
          complete: completed,
        },
      ];
    }

    const state = challenge.state;
    const answered =
      state === "ANSWERED" || state === "APPROVED" || state === "REJECTED";
    const completed = state === "APPROVED" || state === "REJECTED";

    return [
      {
        label: "Challenge sent",
        caption: "Truth question delivered",
        time: normalizeDate(challenge.createdAt),
        complete: true,
      },
      {
        label: "Accepted",
        caption: answered ? "Receiver answered the truth" : "Waiting for answer",
        time: normalizeDate(challenge.answeredAt),
        complete: answered,
      },
      {
        label: "Completed",
        caption:
          state === "APPROVED"
            ? "Answer approved"
            : state === "REJECTED"
              ? "Closed"
              : "Waiting for review",
        time: normalizeDate(challenge.reviewedAt || challenge.updatedAt),
        complete: completed,
      },
    ];
  }, [challenge, isDare]);

  const currentStepIndex = Math.max(
    0,
    steps.reduce((latest, step, index) => (step.complete ? index : latest), -1),
  );
  const progressPercent =
    steps.length <= 1 ? 0 : (currentStepIndex / (steps.length - 1)) * 100;
  const challengerName = getDisplayName(meta, "challenger");
  const receiverName = getDisplayName(meta, "receiver");
  const prompt = meta.prompt || challenge?.description || challenge?.question || "";

  return (
    <div className="screen-container challenge-timeline-screen bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.18),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]">
      <style>{`
        .challenge-timeline-screen {
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes missionEnter {
          from { opacity: 0; transform: translateY(18px); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes missionLinkTravel {
          from { background-position: 0 0; }
          to { background-position: 58px 0; }
        }
        @keyframes missionNodePop {
          0% { opacity: 0; transform: scale(0.65); }
          70% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes missionPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.22); }
          50% { box-shadow: 0 0 0 9px rgba(74,222,128,0); }
        }
        @keyframes missionRailFill {
          from { height: 0; }
        }
        .mission-panel {
          animation: missionEnter 0.56s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .mission-link {
          background-image: linear-gradient(90deg, rgba(74,222,128,0.2) 0 30%, transparent 30% 52%, rgba(14,165,233,0.28) 52% 78%, transparent 78%);
          background-size: 58px 2px;
          animation: missionLinkTravel 1.8s linear infinite;
        }
        .mission-node {
          animation: missionNodePop 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .mission-node-active {
          animation: missionNodePop 0.42s cubic-bezier(0.16, 1, 0.3, 1) both, missionPulse 1.7s ease-in-out infinite;
        }
        .mission-rail-fill {
          animation: missionRailFill 1.05s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .mission-board::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 34px;
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent, rgba(255,255,255,0.035), transparent),
            linear-gradient(180deg, rgba(74,222,128,0.04), transparent 42%);
        }
        .mission-step-card {
          animation: missionEnter 0.48s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 12px)",
          paddingBottom: "calc(var(--safe-area-bottom) + 32px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)] transition-colors hover:border-[#4ade80]/30 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[30px] font-black leading-none tracking-tight text-white">
                Friend Status
              </h1>
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[#4ade80] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            {isDare ? <Target size={24} /> : <MessageCircle size={24} />}
          </div>
        </div>

        <div className="mission-panel relative mb-5 overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.96),rgba(7,10,8,0.98))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(14,165,233,0.5),rgba(74,222,128,0))]" />
          <div className="relative z-10">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.22em] text-[#86efac]">
                  {isDare ? "Dare route" : "Truth route"}
                </p>
                <h2 className="truncate text-[27px] font-black leading-tight text-white">
                  {challengerName} to {receiverName}
                </h2>
              </div>
              <div className="rounded-[18px] border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-2 text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                  Step
                </p>
                <p className="text-lg font-black text-white">
                  {currentStepIndex + 1}/{steps.length}
                </p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-[72px_1fr_72px] items-center gap-3">
              <div className="text-center">
                <Avatar
                  src={meta.challengerAvatar || ""}
                  alt={challengerName}
                  size={64}
                  userId={meta.challengerId}
                  username={meta.challengerUsername}
                  disableGhostMode
                />
                <p className="mt-2 truncate text-[11px] font-bold text-[#94a3b8]">
                  @{String(meta.challengerUsername || challengerName).replace(/^@/, "")}
                </p>
              </div>
              <div className="relative flex h-12 items-center">
                <div className="mission-link h-[2px] w-full rounded-full opacity-90" />
                <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#4ade80]/25 bg-[#071007] text-[#86efac] shadow-[0_14px_34px_rgba(0,0,0,0.38)]">
                  {isDare ? <Target size={18} /> : <MessageCircle size={18} />}
                </div>
              </div>
              <div className="text-center">
                <Avatar
                  src={meta.receiverAvatar || ""}
                  alt={receiverName}
                  size={64}
                  userId={meta.receiverId}
                  username={meta.receiverUsername}
                  disableGhostMode
                />
                <p className="mt-2 truncate text-[11px] font-bold text-[#94a3b8]">
                  @{String(meta.receiverUsername || receiverName).replace(/^@/, "")}
                </p>
              </div>
            </div>

            {prompt && (
              <p className="rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-semibold leading-relaxed text-[#d1fae5]">
                {prompt}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mission-panel mb-4 rounded-[22px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        )}

        <div className="mission-panel mission-board relative overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-4 shadow-[0_28px_78px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="relative z-10 mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
                Mission path
              </p>
              <p className="text-lg font-black text-white">
                {loading ? "Syncing status" : steps[currentStepIndex]?.label}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#86efac]">
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ShieldCheck size={13} />
              )}
              Live
            </div>
          </div>

          <div className="relative z-10 pl-12">
            <div className="absolute bottom-6 left-[18px] top-6 w-[3px] rounded-full bg-white/8" />
            <div
              className="mission-rail-fill absolute left-[18px] top-6 w-[3px] rounded-full bg-[linear-gradient(180deg,#4ade80,#22c55e,#0ea5e9)] shadow-[0_0_22px_rgba(74,222,128,0.24)]"
              style={{ height: `calc((100% - 48px) * ${progressPercent / 100})` }}
            />
            <div className="space-y-4">
              {steps.map((step, index) => {
                const active = index === currentStepIndex;
                const complete = step.complete;
                return (
                  <div
                    key={step.label}
                    className="relative"
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div
                      className={`mission-node ${active ? "mission-node-active" : ""} absolute -left-[45px] top-4 flex h-9 w-9 items-center justify-center rounded-full border ${
                        complete
                          ? "border-[#4ade80]/40 bg-[#4ade80]/16 text-[#86efac]"
                          : active
                            ? "border-sky-400/40 bg-sky-400/16 text-sky-200"
                            : "border-white/10 bg-white/[0.04] text-[#64748b]"
                      }`}
                      style={{ animationDelay: `${index * 110}ms` }}
                    >
                      {complete ? <Check size={16} /> : <Clock3 size={16} />}
                    </div>

                    <div
                      className={`mission-step-card relative overflow-hidden rounded-[24px] border p-4 ${
                        complete
                          ? "border-[#4ade80]/22 bg-[#4ade80]/10"
                          : active
                            ? "border-sky-400/22 bg-sky-400/10"
                            : "border-white/8 bg-white/[0.035]"
                      }`}
                      style={{ animationDelay: `${index * 100 + 80}ms` }}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748b]">
                            0{index + 1}
                          </p>
                          <p className="text-[16px] font-black text-white">
                            {step.label}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-[#94a3b8]">
                          {formatTime(step.time)}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold leading-snug text-[#94a3b8]">
                        {step.caption}
                      </p>
                      {active && (
                        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8">
                          <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#4ade80,#0ea5e9)]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
