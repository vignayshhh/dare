"use client";

import { useState, useEffect, memo, useCallback, useRef, useMemo } from "react";
import { Clock, Target, X, CheckCircle, AlertCircle } from "lucide-react";
import "@/styles/design-system.css";
import { TruthAnswerScreen } from "./TruthAnswerScreen";
import { DareCompletionScreen } from "./DareCompletionScreen";
import { DareApprovedCinematicScreen } from "./DareApprovedCinematicScreen";
import { DareSubmittedCinematicScreen } from "./DareSubmittedCinematicScreen";
import { ReviewScreen } from "./ReviewScreen";
import {
  friendsService,
  dareService,
  truthService,
  userService,
} from "@/middleware/services/service-factory";
import { useContentStore } from "@/stores/useContentStore";
import { useProfileDataStore } from "@/stores/profileDataStore";
import { useAlertStore } from "@/stores/useAlertStore";
import { Avatar } from "../ui/Avatar";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useAvatarStore } from "@/stores/avatarStore";
import { resolveUserProfile } from "@/utils/profileResolver";

interface Challenge {
  id: string;
  type: "truth" | "dare";
  challengerId?: string;
  receiverId?: string;
  challenger: {
    name: string;
    avatar: string;
    username: string;
    verified?: boolean;
  };
  receiver?: {
    name: string;
    avatar: string;
    username: string;
    verified?: boolean;
  };
  question?: string;
  answer?: string; // Add answer field for truths
  action?: string;
  poll?: {
    question: string;
    options: string[];
    votes: { [key: string]: number };
    totalVotes: number;
  };
  state: string;
  createdAt: string;
  sortAt: string;
  updatedAt?: string;
  isCompleted?: boolean;
  completedAt?: string;
  proof?: {
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
  };
}

const stripAtSymbol = (username?: string) =>
  (username || "unknown").replace(/^@/, "");

const getCompletedCapsuleClasses =
  "border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]";
const sharedChallengeCardClass =
  "card relative isolate animate-slide-up overflow-hidden rounded-[28px] border border-white/10 bg-[#141414]/95 p-4 mb-4 shadow-[0_18px_44px_rgba(0,0,0,0.62),0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-300 hover:border-[#4ade80]/20 hover:shadow-[0_22px_54px_rgba(0,0,0,0.68),0_0_30px_rgba(74,222,128,0.15)]";
const highlightedChallengeRingClass =
  "ring-2 ring-[#4ade80] ring-offset-2 ring-offset-[#141414]";

const TimerDisplay = memo(
  ({
    time,
    formatTime,
  }: {
    time: number;
    formatTime: (s: number) => string;
  }) => (
    <p className="text-[#4ade80] text-sm font-medium transition-all duration-100">
      Time remaining: {formatTime(time)}
    </p>
  ),
);

const ChallengeCard = memo(
  ({
    challenge,
    timeRemaining,
    formatTime,
    onAccept,
    onSurrender,
    onComplete,
    isHighlighted,
  }: {
    challenge: Challenge;
    timeRemaining: number | undefined;
    formatTime: (s: number) => string;
    onAccept: (c: Challenge) => void;
    onSurrender: (c: Challenge) => void;
    onComplete: (c: Challenge) => void;
    isHighlighted?: boolean;
  }) => {
    const isChickenOut = challenge.state === "CHICKEN_OUT";
    const isTimedOut = challenge.state === "ACCEPTED" && timeRemaining === 0;
    const isExpired =
      challenge.state === "ACCEPTED" &&
      (isTimedOut ||
        localStorage.getItem(`dare_expired_${challenge.id}`) === "true");
    const isCompleted = challenge.state === "ACCEPTED_REAL";
    const isMarkedFake = challenge.state === "REJECTED_FAKE";
    const isAnswered =
      challenge.type === "truth" &&
      (challenge.state === "APPROVED" || challenge.state === "REJECTED");
    const isWaitingForApproval =
      challenge.state === "ANSWERED" ||
      challenge.state === "PROOF_SUBMITTED" ||
      challenge.state === "FRIENDS_VALIDATION";

    return (
      <div
        className={`${sharedChallengeCardClass} ${isHighlighted ? highlightedChallengeRingClass : ""}`}
      >
        <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.04),transparent_70%)] opacity-60" />

        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Avatar
                src={challenge.challenger.avatar}
                alt={challenge.challenger.name}
                size="md"
                userId={challenge.challengerId}
                username={challenge.challenger.username}
                disableGhostMode
              />
              {challenge.challenger.verified && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent-primary rounded-full flex items-center justify-center shadow-sm">
                  <CheckCircle size={10} className="text-black" />
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 inline-flex rounded-full border border-white/7 bg-white/[0.04] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7dd3a7] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                Challenger
              </div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-[15px] leading-tight tracking-tight">
                  From: @{challenge.challenger.username || "unknown"}
                </h3>
                {challenge.challenger.verified && (
                  <CheckCircle size={14} className="text-accent-primary" />
                )}
              </div>
            </div>
          </div>

          <div
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
              challenge.type === "truth"
                ? "border border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]"
                : "border border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#fbbf24]"
            }`}
          >
            {challenge.type.toUpperCase()}
          </div>
        </div>

        <div className="mb-3.5">
          {challenge.type === "truth" ? (
            <>
              <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                Wants to know the truth about:
              </p>
              <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-2.5 h-1 w-14 rounded-full bg-[#4ade80]/80" />
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  {challenge.question}
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                Dared you to:
              </p>
              <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-2.5 h-1 w-14 rounded-full bg-[#f59e0b]/80" />
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  {challenge.action}
                </p>
              </div>
            </>
          )}
        </div>

        {challenge.type === "truth" && challenge.poll && (
          <div className="mb-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-white font-medium text-xs">
                {challenge.poll.question}
              </h4>
              <span className="text-[#7f8b7f] text-xs">
                {challenge.poll.totalVotes} votes
              </span>
            </div>
            <div className="space-y-2">
              {challenge.poll.options.map((option, index) => {
                const votes = challenge.poll!.votes[option] || 0;
                const percentage =
                  challenge.poll!.totalVotes > 0
                    ? Math.round((votes / challenge.poll!.totalVotes) * 100)
                    : 0;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs">{option}</span>
                      <span className="text-[#7f8b7f] text-xs">
                        {votes} votes
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/8">
                      <div
                        className="h-1.5 rounded-full bg-linear-to-r from-[#4ade80] to-[#22c55e]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons / Status Messages */}
        <div className="flex space-x-2.5">
          {isChickenOut ? (
            // Refused — fade in shame message, no buttons
            <div
              className="flex-1 rounded-2xl border border-red-500/20 bg-red-500/10 py-2 text-center"
              style={{ animation: "fadeIn 0.5s ease" }}
            >
              <p className="text-red-400 font-semibold text-xs">
                You backed away like a loser
              </p>
            </div>
          ) : isExpired ? (
            // Dare expired
            <div
              className="flex-1 rounded-2xl border border-red-500/20 bg-red-500/10 py-2 text-center"
              style={{ animation: "fadeIn 0.5s ease" }}
            >
              <p className="text-red-400 font-semibold text-xs">Dare expired</p>
            </div>
          ) : isTimedOut ? (
            // Timer ran out while accepted
            <div
              className="flex-1 rounded-2xl border border-gray-500/20 bg-gray-500/10 py-2 text-center"
              style={{ animation: "fadeIn 0.5s ease" }}
            >
              <p className="text-gray-400 font-semibold text-xs">
                Time up! You lost professionally
              </p>
            </div>
          ) : isCompleted || isAnswered ? (
            <div
              className={`flex-1 rounded-2xl py-2 text-center ${getCompletedCapsuleClasses}`}
              style={{ animation: "fadeIn 0.5s ease" }}
            >
              <p className="text-[#4ade80] font-semibold text-xs">
                {challenge.type === "truth"
                  ? "Truth completed"
                  : "Dare completed"}
              </p>
            </div>
          ) : isMarkedFake ? (
            <div
              className="flex-1 rounded-2xl border border-red-500/20 bg-red-500/10 py-2 text-center"
              style={{ animation: "fadeIn 0.5s ease" }}
            >
              <p className="text-red-400 font-semibold text-xs">
                Dare rejected
              </p>
            </div>
          ) : challenge.state === "ACCEPTED" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete(challenge);
              }}
              className="btn btn-primary flex-1 py-2 text-sm"
            >
              Complete Now
            </button>
          ) : isWaitingForApproval ? (
            <div
              className="flex-1 rounded-2xl border border-accent-secondary/20 bg-accent-secondary/15 py-2 text-center"
              style={{ animation: "fadeIn 0.5s ease" }}
            >
              <p className="text-accent-secondary font-semibold text-xs">
                Waiting for approval
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(challenge);
                }}
                className="btn btn-primary flex-1 py-2 text-sm"
              >
                Accept
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSurrender(challenge);
                }}
                className="btn btn-secondary flex-1 py-2 text-sm"
              >
                Refuse
              </button>
            </>
          )}
        </div>

        {/* Timer — only show when accepted and time remaining > 0 and not expired */}
        {challenge.state === "ACCEPTED" &&
          timeRemaining !== undefined &&
          timeRemaining > 0 &&
          !isExpired && (
            <div className="mt-2.5 rounded-2xl border border-white/7 bg-white/[0.035] px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <TimerDisplay time={timeRemaining} formatTime={formatTime} />
            </div>
          )}
      </div>
    );
  },
);

const SentChallengeCard = memo(
  ({
    challenge,
    onReview,
    isHighlighted,
  }: {
    challenge: Challenge;
    onReview: (c: Challenge) => void;
    isHighlighted?: boolean;
  }) => {
    const isAwaitingApproval =
      (challenge.type === "dare" &&
        (challenge.state === "PROOF_SUBMITTED" ||
          challenge.state === "FRIENDS_VALIDATION")) ||
      (challenge.type === "truth" && challenge.state === "ANSWERED");
    const isAwaitingCompletion =
      challenge.type === "dare" &&
      (challenge.state === "SENT" || challenge.state === "ACCEPTED");
    const isCompleted =
      (challenge.type === "dare" && challenge.state === "ACCEPTED_REAL") ||
      (challenge.type === "truth" &&
        (challenge.state === "APPROVED" || challenge.state === "REJECTED"));
    const isSurrendered =
      challenge.type === "dare" && challenge.state === "CHICKEN_OUT";
    const isMarkedFake =
      challenge.type === "dare" && challenge.state === "REJECTED_FAKE";

    return (
      <div
        className={`${sharedChallengeCardClass} ${
          isHighlighted ? highlightedChallengeRingClass : ""
        }`}
      >
        <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.04),transparent_70%)] opacity-60" />

        <div className="mb-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Avatar
                src={challenge.receiver?.avatar || "/default-avatar.png"}
                alt={challenge.receiver?.name || "Unknown"}
                size="md"
                userId={challenge.receiverId}
                username={challenge.receiver?.username}
                disableGhostMode
              />
              {challenge.receiver?.verified && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent-primary rounded-full flex items-center justify-center shadow-sm">
                  <CheckCircle size={10} className="text-black" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-[15px] leading-tight tracking-tight">
                  To: @{challenge.receiver?.username || "unknown"}
                </h3>
              </div>
              <p className="mt-1 text-[11px] text-[#8ea18e]">
                {challenge.type === "truth"
                  ? "Truth you sent"
                  : "Dare you sent"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                challenge.state === "SENT"
                  ? "bg-blue-500/20 text-blue-300"
                  : challenge.state === "ACCEPTED_REAL"
                    ? "bg-green-500/20 text-green-300"
                    : challenge.state === "REJECTED_FAKE"
                      ? "bg-red-500/20 text-red-300"
                      : challenge.state === "ANSWERED" ||
                          challenge.state === "PROOF_SUBMITTED" ||
                          challenge.state === "FRIENDS_VALIDATION"
                        ? "bg-green-500/20 text-green-300"
                        : "bg-gray-500/20 text-gray-300"
              }`}
            >
              {challenge.state}
            </span>
          </div>
        </div>

        <div className="mb-3.5">
          {challenge.type === "truth" ? (
            <>
              <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                You asked:
              </p>
              <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-2.5 h-1 w-14 rounded-full bg-[#4ade80]/80" />
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  {challenge.question}
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                You dared them to:
              </p>
              <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-2.5 h-1 w-14 rounded-full bg-[#f59e0b]/80" />
                <p className="text-[15px] font-semibold leading-relaxed text-white">
                  {challenge.action}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mb-3.5">
          <div
            className={`flex-1 rounded-2xl py-2 text-center ${
              isCompleted
                ? getCompletedCapsuleClasses
                : isSurrendered
                  ? "border border-red-500/20 bg-red-500/10"
                  : "border border-accent-secondary/20 bg-accent-secondary/15"
            }`}
            style={{ animation: "fadeIn 0.5s ease" }}
          >
            <p
              className={
                isCompleted
                  ? "text-[#4ade80] font-semibold text-xs"
                  : isSurrendered
                    ? "text-red-400 font-semibold text-xs"
                    : "text-accent-secondary font-semibold text-xs"
              }
            >
              {isCompleted
                ? challenge.type === "truth"
                  ? "Truth completed"
                  : "Dare completed"
                : isSurrendered
                  ? `${stripAtSymbol(challenge.receiver?.username)} surrendered`
                  : isMarkedFake
                    ? "Dare rejected"
                    : isAwaitingApproval
                      ? challenge.type === "truth"
                        ? "They answered — tap to review"
                        : "Waiting for your approval"
                      : isAwaitingCompletion
                        ? "Waiting for them to complete it"
                        : challenge.type === "truth" &&
                            challenge.state === "SENT"
                          ? "Waiting for them to answer"
                          : "Waiting for your approval"}
            </p>
          </div>
        </div>

        {isAwaitingApproval && (
          <div className="flex space-x-2.5">
            <button
              onClick={() => onReview(challenge)}
              className="btn btn-primary flex-1 py-2 text-sm"
            >
              Review
            </button>
          </div>
        )}
      </div>
    );
  },
);

// In production mode, challenges come from backend
// Start with empty arrays - will be populated by real data
const initialChallenges: Challenge[] = [];
const initialSentChallenges: Challenge[] = [];

function mapDareProofToChallengeProof(
  proofMediaType?: string | null,
  proofMediaUrl?: string | null,
) {
  if (!proofMediaUrl) return undefined;

  return {
    type:
      proofMediaType === "VIDEO"
        ? ("video" as const)
        : proofMediaType === "AUDIO" ||
            (proofMediaType === "TEXT" &&
              proofMediaUrl.startsWith("data:audio"))
          ? ("audio" as const)
          : ("image" as const),
    url: proofMediaUrl,
    thumbnail: proofMediaType === "VIDEO" ? proofMediaUrl : undefined,
  };
}

function mapProofTypeToDareMediaType(type: "image" | "video" | "audio") {
  if (type === "video") return "VIDEO" as const;
  if (type === "image") return "PHOTO" as const;
  return "TEXT" as const;
}

function parseChallengeTime(value?: string | null): number {
  if (!value) return 0;
  // Handle Firestore Timestamp objects accidentally passed through
  if (typeof value === "object" && "toMillis" in (value as any)) {
    return (value as any).toMillis();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getChallengeSortTime(challenge: Challenge): number {
  return parseChallengeTime(
    challenge.sortAt ||
      challenge.completedAt ||
      challenge.updatedAt ||
      challenge.createdAt,
  );
}

function getChallengeCreatedTime(challenge: Challenge): number {
  return parseChallengeTime(challenge.createdAt);
}

function sortChallengesByLatestActivity(challenges: Challenge[]): Challenge[] {
  return [...challenges].sort((a, b) => {
    // Primary: sortAt (tracks latest activity — proof, completion, sending, etc.)
    const sortDiff = getChallengeSortTime(b) - getChallengeSortTime(a);
    if (sortDiff !== 0) return sortDiff;
    // Fallback: createdAt
    return getChallengeCreatedTime(b) - getChallengeCreatedTime(a);
  });
}

function sortChallengesByNewestCreated(challenges: Challenge[]): Challenge[] {
  return [...challenges].sort((a, b) => {
    const createdDiff = getChallengeCreatedTime(b) - getChallengeCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return getChallengeSortTime(b) - getChallengeSortTime(a);
  });
}

function getSortAtValue(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value) return value;
  }
  return new Date(0).toISOString();
}

type ResolvedUserProfile = {
  displayName: string;
  username: string;
  avatarUrl: string;
};

type DaresNavigationRequest = {
  tab?: "received" | "sent";
  highlightDareId?: string;
  highlightTruthId?: string;
  nonce: number;
};

export function DaresReceivedScreen({
  navigationRequest,
}: {
  navigationRequest?: DaresNavigationRequest | null;
}) {
  const approvalCinematicTimeoutsRef = useRef<number[]>([]);
  const submissionCinematicTimeoutsRef = useRef<number[]>([]);
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");
  const [showAcceptPrompt, setShowAcceptPrompt] = useState<Challenge | null>(
    null,
  );
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [sentChallenges, setSentChallenges] = useState<Challenge[]>(
    initialSentChallenges,
  );
  const [currentScreen, setCurrentScreen] = useState<
    "dares" | "truth" | "dare" | "review" | "approval" | "submitted"
  >("dares");
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(
    null,
  );
  const [isApprovalCinematicExiting, setIsApprovalCinematicExiting] =
    useState(false);
  const [isSubmissionCinematicExiting, setIsSubmissionCinematicExiting] =
    useState(false);
  const [acceptedTimers, setAcceptedTimers] = useState<{
    [key: string]: number;
  }>({});

  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setAcceptedTimers((prev) => {
        const next: { [key: string]: number } = {};
        let hasActive = false;

        for (const id in prev) {
          // Check if dare is expired in localStorage
          const expiredKey = `dare_expired_${id}`;
          if (localStorage.getItem(expiredKey) === "true") {
            next[id] = 0;
            continue;
          }

          // Get timer from localStorage for sync
          const timerKey = `dare_timer_${id}`;
          const savedTime = localStorage.getItem(timerKey);
          const localStorageTime = savedTime ? parseInt(savedTime, 10) : null;

          // Use localStorage time if available and different from local state
          const currentTime =
            localStorageTime !== null && localStorageTime !== prev[id]
              ? localStorageTime
              : prev[id];

          const newTime = currentTime > 0 ? currentTime - 1 : 0;
          next[id] = newTime;

          if (newTime > 0) {
            hasActive = true;
            // Update localStorage
            localStorage.setItem(timerKey, newTime.toString());
          } else {
            // Mark as expired in localStorage
            localStorage.setItem(expiredKey, "true");
            localStorage.removeItem(timerKey);
          }
        }

        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      approvalCinematicTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      submissionCinematicTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
    };
  }, []);

  // Load truth data from backend
  const { user } = useAuthStore();
  const { addDarePost, addTruthPost } = useContentStore();
  const { userProfiles, setUserProfile } = useProfileDataStore();
  const { setUserAvatar } = useAvatarStore();
  const alerts = useAlertStore((s) => s.alerts);
  const subscribeToAlerts = useAlertStore((s) => s.subscribeToAlerts);

  const profileCache = useRef<Map<string, ResolvedUserProfile>>(new Map());

  const getUserProfileCached = useCallback(
    async (userId: string): Promise<ResolvedUserProfile> => {
      if (profileCache.current.has(userId)) {
        return profileCache.current.get(userId)!;
      }
      if (userProfiles[userId]) {
        const profile: ResolvedUserProfile = {
          displayName: userProfiles[userId].displayName,
          username: userProfiles[userId].username,
          avatarUrl: userProfiles[userId].avatarUrl || "/default-avatar.png",
        };
        if (userProfiles[userId].avatarUrl) {
          setUserAvatar(userId, userProfiles[userId].avatarUrl!);
        }
        profileCache.current.set(userId, profile);
        return profile;
      }
      try {
        const profile = await resolveUserProfile(userId);
        if (profile) {
          setUserProfile(
            userId,
            profile.displayName || profile.username || "Unknown",
            profile.username || "unknown",
            profile.avatarUrl || "/default-avatar.png",
          );
          if (profile.avatarUrl) {
            setUserAvatar(userId, profile.avatarUrl);
          }
          const profileData: ResolvedUserProfile = {
            displayName: profile.displayName || profile.username || "Unknown",
            username: profile.username || "unknown",
            avatarUrl: profile.avatarUrl || "/default-avatar.png",
          };
          profileCache.current.set(userId, profileData);
          return profileData;
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
      const defaultProfile: ResolvedUserProfile = {
        displayName: "Someone",
        username: "someone",
        avatarUrl: "/default-avatar.png",
      };
      profileCache.current.set(userId, defaultProfile);
      return defaultProfile;
    },
    [userProfiles, setUserProfile, setUserAvatar],
  );
  const [shouldRefresh, setShouldRefresh] = useState(0);
  const [highlightedTruthId, setHighlightedTruthId] = useState<string | null>(
    null,
  );
  const [highlightedDareId, setHighlightedDareId] = useState<string | null>(
    null,
  );
  const handledCompletedAlertIds = useRef<Set<string>>(new Set());
  const handledNavigationNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigationRequest) return;
    if (handledNavigationNonceRef.current === navigationRequest.nonce) return;
    handledNavigationNonceRef.current = navigationRequest.nonce;

    if (navigationRequest.tab) {
      setActiveTab(navigationRequest.tab);
    }

    if (navigationRequest.highlightDareId) {
      setHighlightedDareId(navigationRequest.highlightDareId);
    }

    if (navigationRequest.highlightTruthId) {
      setHighlightedTruthId(navigationRequest.highlightTruthId);
    }
  }, [navigationRequest]);

  useEffect(() => {
    const storedTab = sessionStorage.getItem("openDaresTab");
    const storedDareId = sessionStorage.getItem("highlightDareId");
    const storedTruthId = sessionStorage.getItem("highlightTruthId");

    if (storedTab === "received" || storedTab === "sent") {
      setActiveTab(storedTab);
      sessionStorage.removeItem("openDaresTab");
    }

    if (storedDareId) {
      setHighlightedDareId(storedDareId);
      sessionStorage.removeItem("highlightDareId");
    }

    if (storedTruthId) {
      setHighlightedTruthId(storedTruthId);
      sessionStorage.removeItem("highlightTruthId");
    }
  }, [navigationRequest?.nonce]);

  const mergeSentChallenges = useCallback(
    (prev: Challenge[], liveSentDares: Challenge[]) => {
      const truthChallenges = prev.filter(
        (challenge) => challenge.type === "truth",
      );
      const mergedById = new Map<string, Challenge>();

      prev
        .filter((challenge) => challenge.type === "dare")
        .forEach((challenge) => {
          mergedById.set(challenge.id, challenge);
        });

      liveSentDares.forEach((challenge) => {
        const existing = mergedById.get(challenge.id);
        mergedById.set(challenge.id, {
          ...existing,
          ...challenge,
          challenger: challenge.challenger,
          receiver: challenge.receiver,
          proof: challenge.proof || existing?.proof,
          sortAt: challenge.sortAt || existing?.sortAt || challenge.createdAt,
        });
      });

      return sortChallengesByLatestActivity([
        ...truthChallenges,
        ...Array.from(mergedById.values()),
      ]);
    },
    [],
  );

  const mergeReceivedChallenges = useCallback(
    (prev: Challenge[], liveReceivedDares: Challenge[]) => {
      const truthChallenges = prev.filter(
        (challenge) => challenge.type !== "dare",
      );
      const dareById = new Map<string, Challenge>();

      prev
        .filter((challenge) => challenge.type === "dare")
        .forEach((challenge) => {
          dareById.set(challenge.id, challenge);
        });

      liveReceivedDares.forEach((challenge) => {
        const existing = dareById.get(challenge.id);
        dareById.set(challenge.id, {
          ...existing,
          ...challenge,
          challenger: challenge.challenger,
          proof: challenge.proof || existing?.proof,
          sortAt: challenge.sortAt || existing?.sortAt || challenge.createdAt,
        });
      });

      return sortChallengesByLatestActivity([
        ...truthChallenges,
        ...Array.from(dareById.values()),
      ]);
    },
    [],
  );

  const getCurrentUserChallengeProfile =
    useCallback((): ResolvedUserProfile => {
      return {
        displayName: user?.displayName || user?.username || "You",
        username: user?.username || "you",
        avatarUrl: user?.avatar || "/default-avatar.png",
      };
    }, [user?.avatar, user?.displayName, user?.username]);

  const resolveLiveProfileForUser = useCallback(
    (
      targetUserId?: string,
      fallback?: { name?: string; username?: string; avatar?: string },
    ) => {
      if (!targetUserId) {
        return {
          name: fallback?.name || "Someone",
          username: fallback?.username || "someone",
          avatar: fallback?.avatar || "/default-avatar.png",
        };
      }

      if (targetUserId === user?.id) {
        const current = getCurrentUserChallengeProfile();
        return {
          name: current.displayName,
          username: current.username,
          avatar: current.avatarUrl,
        };
      }

      const cached = userProfiles[targetUserId];
      if (cached) {
        return {
          name: cached.displayName || fallback?.name || "Someone",
          username: cached.username || fallback?.username || "someone",
          avatar: cached.avatarUrl || fallback?.avatar || "/default-avatar.png",
        };
      }

      return {
        name: fallback?.name || "Someone",
        username: fallback?.username || "someone",
        avatar: fallback?.avatar || "/default-avatar.png",
      };
    },
    [getCurrentUserChallengeProfile, user?.id, userProfiles],
  );

  const mapReceivedTruthToChallenge = useCallback(
    async (truth: any): Promise<Challenge> => {
      const challengerProfile = truth.challengerId
        ? await getUserProfileCached(truth.challengerId)
        : {
            displayName: "Someone",
            username: "someone",
            avatarUrl: "/default-avatar.png",
          };

      return {
        id: truth.id,
        type: "truth" as const,
        challengerId: truth.challengerId,
        receiverId: truth.receiverId,
        challenger: {
          name: challengerProfile.displayName,
          avatar: challengerProfile.avatarUrl,
          username: challengerProfile.username,
        },
        question: truth.question,
        answer: truth.answer,
        state: truth.state as any,
        createdAt: truth.createdAt,
        sortAt: getSortAtValue(
          truth.reviewedAt,
          truth.answeredAt,
          truth.updatedAt,
          truth.createdAt,
        ),
        updatedAt:
          truth.reviewedAt ||
          truth.answeredAt ||
          truth.updatedAt ||
          truth.createdAt,
        completedAt: truth.reviewedAt || truth.answeredAt || undefined,
      };
    },
    [getUserProfileCached],
  );

  const mapSentTruthToChallenge = useCallback(
    async (truth: any): Promise<Challenge> => {
      const receiverProfile = await getUserProfileCached(truth.receiverId);
      const currentUserProfile = getCurrentUserChallengeProfile();

      return {
        id: truth.id,
        type: "truth" as const,
        challengerId: truth.challengerId,
        receiverId: truth.receiverId,
        challenger: {
          name: currentUserProfile.displayName,
          avatar: currentUserProfile.avatarUrl,
          username: currentUserProfile.username,
        },
        receiver: {
          name: receiverProfile.displayName,
          avatar: receiverProfile.avatarUrl,
          username: receiverProfile.username,
        },
        question: truth.question,
        answer: truth.answer,
        state: truth.state as any,
        createdAt: truth.createdAt,
        sortAt: getSortAtValue(
          truth.reviewedAt,
          truth.answeredAt,
          truth.updatedAt,
          truth.createdAt,
        ),
        updatedAt:
          truth.reviewedAt ||
          truth.answeredAt ||
          truth.updatedAt ||
          truth.createdAt,
        completedAt: truth.reviewedAt || truth.answeredAt || undefined,
      };
    },
    [getCurrentUserChallengeProfile, getUserProfileCached],
  );

  const mapSentDareToChallenge = useCallback(
    async (dare: any): Promise<Challenge> => {
      const receiverProfile = await getUserProfileCached(dare.receiverId);
      const currentUserProfile = getCurrentUserChallengeProfile();

      return {
        id: dare.id,
        type: "dare" as const,
        challengerId: dare.challengerId,
        receiverId: dare.receiverId,
        challenger: {
          name: currentUserProfile.displayName,
          avatar: currentUserProfile.avatarUrl,
          username: currentUserProfile.username,
        },
        receiver: {
          name: receiverProfile.displayName,
          avatar: receiverProfile.avatarUrl,
          username: receiverProfile.username,
        },
        action: dare.description,
        state: dare.state as any,
        createdAt: dare.createdAt,
        sortAt: getSortAtValue(
          dare.completedAt,
          dare.proofSubmittedAt,
          dare.updatedAt,
          dare.createdAt,
        ),
        updatedAt: dare.proofSubmittedAt || dare.updatedAt || dare.createdAt,
        completedAt: dare.completedAt || undefined,
        proof: mapDareProofToChallengeProof(
          dare.proofMediaType,
          dare.proofMediaUrl,
        ),
      };
    },
    [getCurrentUserChallengeProfile, getUserProfileCached],
  );

  const mapReceivedDareToChallenge = useCallback(
    async (dare: any): Promise<Challenge> => {
      const challengerProfile = await getUserProfileCached(dare.challengerId);

      return {
        id: dare.id,
        type: "dare" as const,
        challengerId: dare.challengerId,
        receiverId: dare.receiverId,
        challenger: {
          name: challengerProfile.displayName,
          avatar: challengerProfile.avatarUrl,
          username: challengerProfile.username,
        },
        action: dare.description,
        state: dare.state as any,
        createdAt: dare.createdAt,
        sortAt: getSortAtValue(
          dare.completedAt,
          dare.proofSubmittedAt,
          dare.updatedAt,
          dare.createdAt,
        ),
        updatedAt: dare.proofSubmittedAt || dare.updatedAt || dare.createdAt,
        completedAt: dare.completedAt || undefined,
        proof: mapDareProofToChallengeProof(
          dare.proofMediaType,
          dare.proofMediaUrl,
        ),
      };
    },
    [getUserProfileCached],
  );

  const refreshSentDares = useCallback(async () => {
    if (!user?.id) return;

    try {
      const sentDaresResponse = await dareService.getSentDares(user.id);
      if (!sentDaresResponse.success || !sentDaresResponse.dares) return;

      const liveSentDares = await Promise.all(
        sentDaresResponse.dares.map((dare) => mapSentDareToChallenge(dare)),
      );

      setSentChallenges((prev) => mergeSentChallenges(prev, liveSentDares));
    } catch (error) {
      console.error("Error refreshing sent dares:", error);
    }
  }, [mapSentDareToChallenge, mergeSentChallenges, user?.id]);

  // Keep rendered cards in sync with real-time profile/avatar updates.
  // Re-sort after mapping so truths and dares always interleave by latest activity,
  // regardless of which type profile data resolved first.
  useEffect(() => {
    setChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((challenge) => {
          const challenger = resolveLiveProfileForUser(challenge.challengerId, {
            name: challenge.challenger.name,
            username: challenge.challenger.username,
            avatar: challenge.challenger.avatar,
          });

          const receiver = challenge.receiver
            ? resolveLiveProfileForUser(challenge.receiverId, {
                name: challenge.receiver.name,
                username: challenge.receiver.username,
                avatar: challenge.receiver.avatar,
              })
            : null;

          return {
            ...challenge,
            challenger: {
              ...challenge.challenger,
              name: challenger.name,
              username: challenger.username,
              avatar: challenger.avatar,
            },
            ...(receiver
              ? {
                  receiver: {
                    ...challenge.receiver!,
                    name: receiver.name,
                    username: receiver.username,
                    avatar: receiver.avatar,
                  },
                }
              : {}),
            sortAt:
              challenge.sortAt || challenge.updatedAt || challenge.createdAt,
          };
        }),
      ),
    );

    setSentChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((challenge) => {
          const challenger = resolveLiveProfileForUser(challenge.challengerId, {
            name: challenge.challenger.name,
            username: challenge.challenger.username,
            avatar: challenge.challenger.avatar,
          });

          const receiver = challenge.receiver
            ? resolveLiveProfileForUser(challenge.receiverId, {
                name: challenge.receiver.name,
                username: challenge.receiver.username,
                avatar: challenge.receiver.avatar,
              })
            : null;

          return {
            ...challenge,
            challenger: {
              ...challenge.challenger,
              name: challenger.name,
              username: challenger.username,
              avatar: challenger.avatar,
            },
            ...(receiver
              ? {
                  receiver: {
                    ...challenge.receiver!,
                    name: receiver.name,
                    username: receiver.username,
                    avatar: receiver.avatar,
                  },
                }
              : {}),
            sortAt:
              challenge.sortAt || challenge.updatedAt || challenge.createdAt,
          };
        }),
      ),
    );
  }, [resolveLiveProfileForUser]);

  useEffect(() => {
    if (!user?.id) return;

    const loadTruths = async () => {
      try {
        console.log("Loading truths and dares for user:", user.id);

        // Check for highlighted truth ID from sessionStorage
        const storedHighlightId = sessionStorage.getItem("highlightTruthId");
        if (storedHighlightId) {
          console.log("🎯 Found highlighted truth ID:", storedHighlightId);
          setHighlightedTruthId(storedHighlightId);
          // Clear it after using
          sessionStorage.removeItem("highlightTruthId");
        }

        // Load received truths
        const receivedResponse = await truthService.getUserTruths(
          user.id,
          "received",
        );
        console.log("Received truths response:", receivedResponse);

        let receivedTruthChallenges: Challenge[] = [];

        if (receivedResponse.success && receivedResponse.truths) {
          receivedTruthChallenges = await Promise.all(
            receivedResponse.truths.map((truth) =>
              mapReceivedTruthToChallenge(truth),
            ),
          );
        }

        // Load received dares
        const receivedDaresResponse = await dareService.getReceivedDares(
          user.id,
        );
        console.log("Received dares response:", receivedDaresResponse);

        let receivedDareChallenges: Challenge[] = [];

        if (receivedDaresResponse.success && receivedDaresResponse.dares) {
          receivedDareChallenges = await Promise.all(
            receivedDaresResponse.dares.map((dare) =>
              mapReceivedDareToChallenge(dare),
            ),
          );
        }

        const sortedReceivedChallenges = sortChallengesByLatestActivity([
          ...receivedTruthChallenges,
          ...receivedDareChallenges,
        ]);
        console.log(
          "All received challenges (truths + dares):",
          sortedReceivedChallenges,
        );
        setChallenges(sortedReceivedChallenges);

        // Load sent truths and dares together so the Sent tab is complete on
        // first render, even before realtime listeners deliver snapshots.
        const [sentResponse, sentDaresResponse] = await Promise.all([
          truthService.getUserTruths(user.id, "sent"),
          dareService.getSentDares(user.id),
        ]);
        console.log("Sent truths response:", sentResponse);
        console.log("Sent dares response:", sentDaresResponse);
        console.log("🔍 SENT TRUTHS DEBUG:", {
          userId: user.id,
          type: "sent",
          success: sentResponse.success,
          truthsCount: sentResponse.truths?.length,
          truths: sentResponse.truths?.map((t) => ({
            id: t.id,
            challengerId: t.challengerId,
            receiverId: t.receiverId,
            question: t.question,
            state: t.state,
          })),
        });

        let allSentChallenges: Challenge[] = [];

        if (sentResponse.success && sentResponse.truths) {
          const sentTruthChallenges: Challenge[] = await Promise.all(
            sentResponse.truths.map((truth) => mapSentTruthToChallenge(truth)),
          );

          allSentChallenges = [...allSentChallenges, ...sentTruthChallenges];
        } else {
          console.log("No sent truths found or error:", sentResponse.error);
        }

        if (sentDaresResponse.success && sentDaresResponse.dares) {
          const sentDareChallenges: Challenge[] = await Promise.all(
            sentDaresResponse.dares.map((dare) => mapSentDareToChallenge(dare)),
          );

          allSentChallenges = [...allSentChallenges, ...sentDareChallenges];
        } else {
          console.log("No sent dares found or error:", sentDaresResponse.error);
        }

        const sortedSentChallenges =
          sortChallengesByLatestActivity(allSentChallenges);
        console.log("Loaded sent challenges:", sortedSentChallenges);
        setSentChallenges(sortedSentChallenges);
      } catch (error) {
        console.error("Error loading truths:", error);
      }
    };

    loadTruths();
  }, [
    mapReceivedTruthToChallenge,
    mapReceivedDareToChallenge,
    mapSentTruthToChallenge,
    mapSentDareToChallenge,
    shouldRefresh,
    user?.id,
  ]); // Add shouldRefresh as dependency

  useEffect(() => {
    if (!user?.id) return;

    let isActive = true;
    const unsubscribe = dareService.subscribeToUserDares(
      user.id,
      "sent",
      (dares) => {
        void (async () => {
          const liveSentDares = await Promise.all(
            dares.map((dare) => mapSentDareToChallenge(dare)),
          );

          if (!isActive) return;

          setSentChallenges((prev) => mergeSentChallenges(prev, liveSentDares));
        })();
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [mapSentDareToChallenge, mergeSentChallenges, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let isActive = true;
    const unsubscribe = dareService.subscribeToUserDares(
      user.id,
      "received",
      (dares) => {
        void (async () => {
          const liveReceivedDares = await Promise.all(
            dares.map((dare) => mapReceivedDareToChallenge(dare)),
          );

          if (!isActive) return;

          setChallenges((prev) =>
            mergeReceivedChallenges(prev, liveReceivedDares),
          );
        })();
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [mapReceivedDareToChallenge, mergeReceivedChallenges, user?.id]);

  // Real-time listener for received truths
  useEffect(() => {
    if (!user?.id) return;

    let isActive = true;
    const unsubscribe = truthService.subscribeToUserTruths(
      user.id,
      "received",
      async (truths) => {
        const mapped = await Promise.all(
          truths.map((t) => mapReceivedTruthToChallenge(t)),
        );
        if (!isActive) return;
        setChallenges((prev) => {
          const dares = prev.filter((c) => c.type === "dare");
          return sortChallengesByLatestActivity([...dares, ...mapped]);
        });
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [mapReceivedTruthToChallenge, user?.id]);

  // Real-time listener for sent truths
  useEffect(() => {
    if (!user?.id) return;

    let isActive = true;
    const unsubscribe = truthService.subscribeToUserTruths(
      user.id,
      "sent",
      async (truths) => {
        const mapped = await Promise.all(
          truths.map((t) => mapSentTruthToChallenge(t)),
        );
        if (!isActive) return;
        setSentChallenges((prev) => {
          const dares = prev.filter((c) => c.type === "dare");
          return sortChallengesByLatestActivity([...dares, ...mapped]);
        });
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [mapSentTruthToChallenge, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    return subscribeToAlerts(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || alerts.length === 0) return;

    const pendingCompletedAlerts = alerts.filter(
      (alert) =>
        alert.userId === user.id &&
        alert.type === "DARE_COMPLETED" &&
        !!alert.entityId &&
        !handledCompletedAlertIds.current.has(alert.id),
    );

    if (pendingCompletedAlerts.length === 0) return;

    void (async () => {
      for (const alert of pendingCompletedAlerts) {
        handledCompletedAlertIds.current.add(alert.id);

        try {
          const dareResponse = await dareService.getDareById(alert.entityId);
          if (!dareResponse.success || !dareResponse.dare) continue;

          const liveChallenge = await mapSentDareToChallenge(dareResponse.dare);

          setSentChallenges((prev) =>
            mergeSentChallenges(prev, [liveChallenge]),
          );
        } catch (error) {
          console.error("Error syncing sent dare from alert:", error);
          handledCompletedAlertIds.current.delete(alert.id);
        }
      }
    })();
  }, [alerts, mapSentDareToChallenge, mergeSentChallenges, user?.id]);

  // Function to trigger refresh when coming back from TruthAnswerScreen
  const refreshTruths = useCallback(() => {
    console.log("Refreshing truths...");
    setShouldRefresh((prev) => prev + 1);
  }, []);

  const handleAccept = useCallback(
    async (challenge: Challenge) => {
      if (challenge.type === "truth") {
        try {
          // Navigate to truth answer screen directly
          setActiveChallenge(challenge);
          setCurrentScreen("truth");
        } catch (error) {
          console.error("Error accepting truth:", error);
        }
      } else {
        // For dares, persist ACCEPTED state first so completion screen validation passes.
        if (!user?.id) {
          console.error("Cannot accept dare: missing current user");
          return;
        }
        try {
          const acceptResponse = await dareService.acceptDare(
            challenge.id,
            user.id,
          );
          if (!acceptResponse?.success) {
            console.error("Failed to accept dare:", acceptResponse?.error);
            return;
          }

          setChallenges((prev) =>
            sortChallengesByLatestActivity(
              prev.map((c) =>
                c.id === challenge.id
                  ? {
                      ...c,
                      state: "ACCEPTED" as const,
                      updatedAt: new Date().toISOString(),
                      sortAt: new Date().toISOString(),
                    }
                  : c,
              ),
            ),
          );
          setAcceptedTimers((prev) => ({ ...prev, [challenge.id]: 900 }));
          setShowAcceptPrompt(challenge);
        } catch (error) {
          console.error("Error accepting dare:", error);
        }
      }
    },
    [user?.id],
  );

  // ✅ Fixed: ReviewScreen's onAccept now correctly points to this function
  const handleAcceptReview = useCallback(
    async (challengeId: string, comment?: string) => {
      try {
        const challenge = sentChallenges.find((c) => c.id === challengeId);
        if (!challenge || !user?.id) return;

        if (challenge.type === "truth") {
          // Directly approve the truth so Firestore state becomes APPROVED
          const approveResponse = await truthService.approveTruth(
            challengeId,
            user.id,
          );

          if (!approveResponse.success || !approveResponse.truth) {
            throw new Error(approveResponse.error || "Failed to approve truth");
          }

          const approvedTruth = approveResponse.truth;
          const [challengerProfile, receiverProfile] = await Promise.all([
            getUserProfileCached(approvedTruth.challengerId),
            getUserProfileCached(approvedTruth.receiverId),
          ]);

          // Push a complete card to the main truth feed immediately. The same
          // backend entity will also arrive through realtime refresh for the receiver.
          addTruthPost({
            id: approvedTruth.id,
            challengerId: approvedTruth.challengerId,
            receiverId: approvedTruth.receiverId,
            challenger: {
              nickname: challengerProfile.displayName,
              avatar: challengerProfile.avatarUrl,
              verified: false,
            },
            receiver: {
              nickname: receiverProfile.displayName,
              avatar: receiverProfile.avatarUrl,
              verified: false,
            },
            question: approvedTruth.question,
            answer: approvedTruth.answer || "",
            state: approvedTruth.state,
            createdAt: approvedTruth.createdAt,
          });

          // Immediately update card to APPROVED locally
          setSentChallenges((prev) =>
            sortChallengesByLatestActivity(
              prev.map((c) =>
                c.id === challengeId
                  ? {
                      ...c,
                      answer: approvedTruth.answer || c.answer,
                      state: approvedTruth.state,
                      updatedAt:
                        approvedTruth.reviewedAt ||
                        approvedTruth.updatedAt ||
                        new Date().toISOString(),
                      sortAt:
                        approvedTruth.reviewedAt ||
                        approvedTruth.updatedAt ||
                        new Date().toISOString(),
                    }
                  : c,
              ),
            ),
          );

          // Also update received challenges for the same truth
          setChallenges((prev) =>
            sortChallengesByLatestActivity(
              prev.map((c) =>
                c.id === challengeId
                  ? {
                      ...c,
                      answer: approvedTruth.answer || c.answer,
                      state: approvedTruth.state,
                      updatedAt:
                        approvedTruth.reviewedAt ||
                        approvedTruth.updatedAt ||
                        new Date().toISOString(),
                      sortAt:
                        approvedTruth.reviewedAt ||
                        approvedTruth.updatedAt ||
                        new Date().toISOString(),
                    }
                  : c,
              ),
            ),
          );
        } else if (challenge.type === "dare") {
          await dareService.challengerReviewDare(
            challengeId,
            user.id,
            "ACCEPT",
          );

          // Immediately update dare card to ACCEPTED_REAL locally
          setSentChallenges((prev) =>
            sortChallengesByLatestActivity(
              prev.map((c) =>
                c.id === challengeId
                  ? {
                      ...c,
                      state: "ACCEPTED_REAL" as const,
                      updatedAt: new Date().toISOString(),
                      sortAt: new Date().toISOString(),
                    }
                  : c,
              ),
            ),
          );

          if (
            challenge.proof &&
            (challenge.proof.type === "image" ||
              challenge.proof.type === "video")
          ) {
            addDarePost({
              id: challenge.id,
              challengerId: challenge.challengerId,
              receiverId: challenge.receiverId,
              challenger: {
                nickname: challenge.challenger.name,
                avatar: challenge.challenger.avatar,
                verified: challenge.challenger.verified,
              },
              receiver: {
                nickname: challenge.receiver?.name || "Unknown",
                avatar: challenge.receiver?.avatar || "/default-avatar.png",
                verified: challenge.receiver?.verified,
              },
              description: challenge.action || "",
              proof: {
                type: challenge.proof.type,
                url: challenge.proof.url,
                thumbnail: challenge.proof.thumbnail,
              },
              state: "ACCEPTED_REAL",
              createdAt: new Date().toISOString(),
            });
          }

          approvalCinematicTimeoutsRef.current.forEach((timeoutId) =>
            window.clearTimeout(timeoutId),
          );
          approvalCinematicTimeoutsRef.current = [];

          setIsApprovalCinematicExiting(false);
          setActiveChallenge(challenge);
          setCurrentScreen("approval");

          approvalCinematicTimeoutsRef.current.push(
            window.setTimeout(() => {
              setIsApprovalCinematicExiting(true);
            }, 3600),
          );

          approvalCinematicTimeoutsRef.current.push(
            window.setTimeout(() => {
              setCurrentScreen("dares");
              setActiveChallenge(null);
              setIsApprovalCinematicExiting(false);
              approvalCinematicTimeoutsRef.current = [];
            }, 4400),
          );

          return;
        }
      } catch (error) {
        console.error("❌ Error accepting challenge:", error);
      }

      // Navigate back — do NOT filter out the card, let it show Answered ✓
      setCurrentScreen("dares");
      setActiveChallenge(null);
    },
    [addDarePost, addTruthPost, getUserProfileCached, sentChallenges, user],
  );

  const handleReject = useCallback((challengeId: string, comment?: string) => {
    setSentChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    setCurrentScreen("dares");
    setActiveChallenge(null);
  }, []);

  const handleSurrender = useCallback(async (challenge: Challenge) => {
    // Increment dares refused count on challenger's profile
    if (challenge.challengerId) {
      try {
        await userService.incrementDaresRefused(challenge.challengerId);
      } catch (error) {
        console.error("Failed to increment dares refused count:", error);
      }
    }

    setChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((c) =>
          c.id === challenge.id
            ? {
                ...c,
                state: "CHICKEN_OUT" as const,
                updatedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                sortAt: new Date().toISOString(),
              }
            : c,
        ),
      ),
    );
  }, []);

  const handleComplete = useCallback((challenge: Challenge) => {
    setActiveChallenge(challenge);
    setCurrentScreen(challenge.type === "truth" ? "truth" : "dare");

    // Initialize timer in localStorage when opening completion screen
    if (challenge.type === "dare") {
      const timerKey = `dare_timer_${challenge.id}`;
      const expiredKey = `dare_expired_${challenge.id}`;

      // Clear expired flag if it exists
      localStorage.removeItem(expiredKey);

      // Initialize timer if not already set
      if (!localStorage.getItem(timerKey)) {
        localStorage.setItem(timerKey, (15 * 60).toString()); // 15 minutes
      }

      console.log("Opening dare completion for:", challenge.id);
    }
  }, []);

  const handleReview = useCallback((challenge: Challenge) => {
    setActiveChallenge(challenge);
    setCurrentScreen("review");
  }, []);

  const handleBackToDares = useCallback(() => {
    console.log("Coming back to dares, refreshing truths and dares...");
    refreshTruths(); // Refresh truths to get updated state
    setCurrentScreen("dares");
    setActiveChallenge(null);

    // Clear expired flags for completed dares
    if (activeChallenge?.type === "dare") {
      const expiredKey = `dare_expired_${activeChallenge.id}`;
      localStorage.removeItem(expiredKey);
    }
  }, [refreshTruths, activeChallenge]);

  const handleDareSubmit = (_proof: {
    type: "image" | "video" | "audio";
    url: string;
  }) => {
    console.log("🔥 [NUCLEAR] Most powerful fix - complete UI reset");

    if (activeChallenge) {
      console.log("🔥 [NUCLEAR] Target challenge:", activeChallenge.id);

      // NUCLEAR OPTION 1: Direct state mutation (bypass React)
      challenges.forEach((c, index) => {
        if (c.id === activeChallenge.id) {
          console.log(
            "🔥 [NUCLEAR] Direct mutation of challenge at index",
            index,
          );
          // Force mutate the object directly
          (c as any).state = "PROOF_SUBMITTED";
        }
      });

      // NUCLEAR OPTION 2: Force complete state reset
      console.log("🔥 [NUCLEAR] Resetting all state");
      const nuclearChallenges = challenges.map((c) => {
        if (c.id === activeChallenge.id) {
          return {
            ...c,
            state: "PROOF_SUBMITTED" as const,
            updatedAt: new Date().toISOString(),
            sortAt: new Date().toISOString(),
          };
        }
        return c;
      });

      // NUCLEAR OPTION 3: Set state multiple times to force re-render
      setChallenges([]); // Clear first
      setTimeout(() => {
        setChallenges(nuclearChallenges); // Then set new data
        console.log("🔥 [NUCLEAR] State reset complete");
      }, 10);

      // NUCLEAR OPTION 4: Update sent challenges too
      const nuclearSentChallenges = sentChallenges.map((c) => {
        if (c.id === activeChallenge.id) {
          return {
            ...c,
            state: "PROOF_SUBMITTED" as const,
            updatedAt: new Date().toISOString(),
            sortAt: new Date().toISOString(),
          };
        }
        return c;
      });
      setSentChallenges(sortChallengesByLatestActivity(nuclearSentChallenges));

      // NUCLEAR OPTION 5: Force navigation and refresh
      setCurrentScreen("dares"); // Go to dares state first
      setActiveChallenge(null);

      setTimeout(() => {
        setCurrentScreen("dares"); // Then back to dares
        console.log("🔥 [NUCLEAR] Navigation reset complete");
      }, 100);

      // NUCLEAR OPTION 6: Force multiple refreshes
      setTimeout(() => refreshTruths(), 150);
      setTimeout(() => refreshTruths(), 300);
      setTimeout(() => refreshTruths(), 500);

      console.log("🔥 [NUCLEAR] All nuclear options deployed");
    }
  };

  const receivedChallengesForDisplay = useMemo(
    () => sortChallengesByLatestActivity(challenges),
    [challenges],
  );

  const sentChallengesForDisplay = useMemo(
    () => sortChallengesByLatestActivity(sentChallenges),
    [sentChallenges],
  );

  const handleDareSubmittedCinematic = async (proof: {
    type: "image" | "video" | "audio";
    url: string;
  }) => {
    if (!activeChallenge) return;
    if (!user?.id) {
      throw new Error("Cannot submit proof without a signed-in user");
    }

    const submitResponse = await dareService.submitProof(
      activeChallenge.id,
      user.id,
      proof.url,
      mapProofTypeToDareMediaType(proof.type),
    );

    if (!submitResponse.success || !submitResponse.dare) {
      throw new Error(submitResponse.error || "Failed to submit proof");
    }

    const now = new Date().toISOString();
    const submittedDare = submitResponse.dare;
    const submittedProof =
      mapDareProofToChallengeProof(
        submittedDare.proofMediaType,
        submittedDare.proofMediaUrl,
      ) || proof;
    const submittedAt = submittedDare.proofSubmittedAt || now;

    setChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((c) =>
          c.id === activeChallenge.id
            ? {
                ...c,
                state: submittedDare.state,
                updatedAt: submittedAt,
                sortAt: submittedAt,
                proof: submittedProof,
              }
            : c,
        ),
      ),
    );

    setSentChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((c) =>
          c.id === activeChallenge.id
            ? {
                ...c,
                state: submittedDare.state,
                updatedAt: submittedAt,
                sortAt: submittedAt,
                proof: submittedProof,
              }
            : c,
        ),
      ),
    );

    submissionCinematicTimeoutsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    submissionCinematicTimeoutsRef.current = [];

    setIsSubmissionCinematicExiting(false);
    setCurrentScreen("submitted");

    submissionCinematicTimeoutsRef.current.push(
      window.setTimeout(() => {
        setIsSubmissionCinematicExiting(true);
      }, 3600),
    );

    submissionCinematicTimeoutsRef.current.push(
      window.setTimeout(() => {
        setCurrentScreen("dares");
        setActiveChallenge(null);
        setIsSubmissionCinematicExiting(false);
        submissionCinematicTimeoutsRef.current = [];
        refreshTruths();
      }, 4400),
    );
  };

  if (currentScreen === "truth" && activeChallenge) {
    return (
      <TruthAnswerScreen
        truthId={activeChallenge.id}
        onBack={handleBackToDares}
      />
    );
  }

  if (currentScreen === "dare" && activeChallenge) {
    return (
      <DareCompletionScreen
        challenge={{
          id: activeChallenge.id,
          challengerId: activeChallenge.challengerId,
          challenger: activeChallenge.challenger,
          action: activeChallenge.action!,
        }}
        onBack={handleBackToDares}
        onSubmit={handleDareSubmittedCinematic}
        skipValidation={true}
        initialTimeRemaining={acceptedTimers[activeChallenge.id] || 15 * 60}
      />
    );
  }

  if (currentScreen === "review" && activeChallenge) {
    return (
      <ReviewScreen
        challenge={activeChallenge}
        onBack={handleBackToDares}
        onAccept={handleAcceptReview}
        onReject={handleReject}
      />
    );
  }

  if (currentScreen === "approval" && activeChallenge?.type === "dare") {
    return (
      <DareApprovedCinematicScreen
        receiverName={activeChallenge.receiver?.name}
        receiverUsername={activeChallenge.receiver?.username}
        isExiting={isApprovalCinematicExiting}
      />
    );
  }

  if (currentScreen === "submitted" && activeChallenge?.type === "dare") {
    return (
      <DareSubmittedCinematicScreen
        recipientLabel={stripAtSymbol(activeChallenge.challenger.username)}
        isExiting={isSubmissionCinematicExiting}
      />
    );
  }

  return (
    <div className="screen-container flex flex-col bg-[radial-gradient(circle_at_top,#162016_0%,#0b100b_36%,#070a07_100%)]">
      <style>
        {`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}
      </style>
      <div className="nav-header">
        <div className="px-4 pt-5 pb-5">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4ade80] to-[#22c55e] drop-shadow-[0_0_12px_rgba(74,222,128,0.4)]">
                Dares
              </span>
              <span className="text-white"> & </span>
              <span className="text-white">Truths</span>
            </h1>
            <div className="flex rounded-full border border-white/12 bg-[#141414]/90 p-1.5 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              <button
                onClick={() => setActiveTab("received")}
                className={`px-5.5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeTab === "received"
                    ? "text-black shadow-md"
                    : "text-[#8ea18e] hover:text-white"
                }`}
                style={{
                  backgroundColor:
                    activeTab === "received" ? "#00ff88" : "transparent",
                }}
              >
                Received
              </button>
              <button
                onClick={() => setActiveTab("sent")}
                className={`px-5.5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                  activeTab === "sent"
                    ? "text-black shadow-md"
                    : "text-[#8ea18e] hover:text-white"
                }`}
                style={{
                  backgroundColor:
                    activeTab === "sent" ? "#00ff88" : "transparent",
                }}
              >
                Sent
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4"
        style={{
          paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
        }}
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {activeTab === "received"
            ? receivedChallengesForDisplay.map((challenge) => (
                <ChallengeCard
                  key={`${challenge.type}-${challenge.id}`}
                  challenge={challenge}
                  timeRemaining={acceptedTimers[challenge.id]}
                  formatTime={formatTime}
                  onAccept={handleAccept}
                  onSurrender={handleSurrender}
                  onComplete={handleComplete}
                  isHighlighted={
                    challenge.id === highlightedTruthId ||
                    challenge.id === highlightedDareId
                  }
                />
              ))
            : sentChallengesForDisplay.map((challenge) => (
                <SentChallengeCard
                  key={`${challenge.type}-${challenge.id}`}
                  challenge={challenge}
                  onReview={handleReview}
                  isHighlighted={
                    challenge.id === highlightedTruthId ||
                    challenge.id === highlightedDareId
                  }
                />
              ))}
        </div>
      </div>

      {showAcceptPrompt && (
        <div
          className="app-modal-backdrop fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowAcceptPrompt(null)}
        >
          <div
            className="app-modal-dialog w-full max-w-sm overflow-y-auto rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,28,24,0.98),rgba(16,19,16,0.98))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10">
                <Target size={22} className="text-[#86efac]" />
              </div>
              <h3 className="text-white font-bold text-lg mb-2 leading-tight">
                You&apos;ve accepted this {showAcceptPrompt.type.toUpperCase()}
              </h3>
              <p className="text-sm leading-relaxed text-[#8ea18e]">
                {showAcceptPrompt.type === "truth"
                  ? "Answer the truth question honestly"
                  : "Complete the dare and submit proof"}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  setShowAcceptPrompt(null);
                  // For dares, validate state before navigating to prevent error page flash
                  if (showAcceptPrompt.type === "dare") {
                    try {
                      const dareResponse = await dareService.getDareById(
                        showAcceptPrompt.id,
                      );
                      if (
                        dareResponse.success &&
                        dareResponse.dare?.state === "ACCEPTED"
                      ) {
                        setActiveChallenge(showAcceptPrompt);
                        setCurrentScreen("dare");
                      } else {
                        console.error(
                          "Dare not in ACCEPTED state, cannot navigate to completion screen",
                        );
                        // Stay on the main screen
                        return;
                      }
                    } catch (error) {
                      console.error("Error validating dare state:", error);
                      return;
                    }
                  } else {
                    // For truths, navigate directly
                    setActiveChallenge(showAcceptPrompt);
                    setCurrentScreen("truth");
                  }
                }}
                className="btn btn-primary w-full py-3.5 text-base font-semibold"
              >
                Start Now
              </button>
              <button
                onClick={() => setShowAcceptPrompt(null)}
                className="btn btn-secondary w-full py-3.5 text-base font-semibold"
              >
                Do it Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DaresReceivedScreen;
