"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  alertService,
  friendsService,
} from "@/middleware/services/service-factory";
import { messagingService } from "@/middleware/services/messaging.service";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useMessagingStore } from "@/stores/useMessagingStore";
import { primeResolvedUserProfile } from "@/utils/profileResolver";
import { Avatar } from "../ui/Avatar";

type DailyChallengeStatus = "matched" | "accepted" | "rejected";

type ChallengeFriend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
};

type DailyChallengeDoc = {
  id: string;
  userId: string;
  localDate: string;
  status: DailyChallengeStatus;
  matchedFriendId: string;
  matchedFriendUsername: string;
  matchedFriendName: string;
  matchedFriendAvatar: string;
  question?: string;
  conversationId?: string;
  persisted?: boolean;
};

const DAILY_UNLOCK_HOUR = 20;
const DAILY_UNLOCK_MINUTE = 0;

const QUESTION_TEMPLATES = [
  "What is something you wish more people understood about you?",
  "What moment from this week has been living in your head?",
  "What is a small thing that instantly makes you feel cared for?",
  "What is one dream you rarely say out loud?",
  "What is something you have changed your mind about recently?",
  "When do you feel most like yourself?",
];

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayUnlockTime(now = new Date()): Date {
  const unlock = new Date(now);
  unlock.setHours(DAILY_UNLOCK_HOUR, DAILY_UNLOCK_MINUTE, 0, 0);
  return unlock;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getFriendId(friend: any): string {
  return friend.userId || friend.id || friend.user_id || "";
}

function toChallengeFriend(friend: any): ChallengeFriend {
  const id = getFriendId(friend);
  const username = String(friend.username || "unknown").replace(/^@/, "");
  const displayName =
    friend.displayName ||
    friend.display_name ||
    friend.nickname ||
    friend.name ||
    username ||
    "Friend";

  return {
    id,
    username,
    displayName,
    avatarUrl: friend.avatarUrl || friend.avatar_url || friend.avatar || "",
  };
}

function secureRandomIndex(length: number): number {
  if (length <= 1) return 0;
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function challengeDocId(userId: string, localDate: string): string {
  return `${userId}_${localDate}`;
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code).includes("permission-denied")
  );
}

function getConversationOtherUserId(
  conversation: { user1_id?: string; user2_id?: string },
  currentUserId: string,
  fallbackUserId: string,
): string {
  if (conversation.user1_id === currentUserId && conversation.user2_id) {
    return conversation.user2_id;
  }
  if (conversation.user2_id === currentUserId && conversation.user1_id) {
    return conversation.user1_id;
  }
  return fallbackUserId;
}

export function DailyChallengeMatchScreen({
  isActive = true,
  skipWaitEnabled = false,
  onSkipWait,
  onBack,
  onOpenConversation,
}: {
  isActive?: boolean;
  skipWaitEnabled?: boolean;
  onSkipWait: () => void;
  onBack: () => void;
  onOpenConversation: (
    userId: string,
    username: string,
    conversationId: string,
  ) => void;
}) {
  const { user } = useAuthStore();
  const { conversations, loadConversations } = useMessagingStore();
  const [now, setNow] = useState(() => Date.now());
  const [friends, setFriends] = useState<ChallengeFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<DailyChallengeDoc | null>(null);
  const [sessionCompletedChallengeId, setSessionCompletedChallengeId] =
    useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState(QUESTION_TEMPLATES[0]);
  const [customQuestion, setCustomQuestion] = useState("");
  const [activeRollIndex, setActiveRollIndex] = useState(0);
  const rollTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const localDate = useMemo(() => getLocalDateKey(new Date(now)), [now]);
  const unlockTime = useMemo(() => getTodayUnlockTime(new Date(now)), [now]);
  const isUnlocked = now >= unlockTime.getTime();
  const canMatchNow = isUnlocked || skipWaitEnabled;
  const countdown = formatCountdown(unlockTime.getTime() - now);
  const visibleChallenge =
    skipWaitEnabled &&
    !isUnlocked &&
    !!challenge &&
    challenge.status !== "matched" &&
    challenge.id !== sessionCompletedChallengeId
      ? null
      : challenge;
  const matchedFriend = useMemo(() => {
    if (!visibleChallenge) return null;
    return (
      friends.find((friend) => friend.id === visibleChallenge.matchedFriendId) || {
        id: visibleChallenge.matchedFriendId,
        username: visibleChallenge.matchedFriendUsername,
        displayName: visibleChallenge.matchedFriendName,
        avatarUrl: visibleChallenge.matchedFriendAvatar,
      }
    );
  }, [friends, visibleChallenge]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !user?.id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const friendResponse = await friendsService.getFriends(user.id);

        if (cancelled) return;

        const responseFriends = Array.isArray(friendResponse)
          ? friendResponse
          : friendResponse.friends || [];
        const loadedFriends = responseFriends
          .map(toChallengeFriend)
          .filter((friend) => friend.id && friend.id !== user.id);
        setFriends(loadedFriends);

        loadedFriends.forEach((friend) => {
          primeResolvedUserProfile(friend.id, {
            username: friend.username,
            displayName: friend.displayName,
            display_name: friend.displayName,
            avatarUrl: friend.avatarUrl,
            avatar_url: friend.avatarUrl,
            avatar: friend.avatarUrl,
            nickname: friend.displayName,
          });
        });

        await loadConversations(user.id);

        try {
          const challengeSnap = await getDoc(
            doc(db, "dailyChallenges", challengeDocId(user.id, localDate)),
          );

          if (cancelled) return;

          if (challengeSnap.exists()) {
            const data = challengeSnap.data() as Omit<DailyChallengeDoc, "id">;
            if (skipWaitEnabled && data.status !== "matched") {
              setChallenge(null);
              setSelectedQuestion(QUESTION_TEMPLATES[0]);
              setCustomQuestion("");
              return;
            }

            setChallenge({ id: challengeSnap.id, ...data });
            if (data.question) setSelectedQuestion(data.question);
          } else {
            setChallenge(null);
            setSelectedQuestion(QUESTION_TEMPLATES[0]);
          }
        } catch (challengeError) {
          console.warn("Daily challenge state unavailable:", challengeError);
          if (!cancelled) {
            setChallenge(null);
            setSelectedQuestion(QUESTION_TEMPLATES[0]);
          }
        }
      } catch (loadError) {
        console.error("Error loading daily challenge:", loadError);
        if (!cancelled) {
          setError("Daily challenge could not load. Pull back in a moment.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (rollTimerRef.current) {
        window.clearInterval(rollTimerRef.current);
        rollTimerRef.current = null;
      }
    };
  }, [isActive, loadConversations, localDate, skipWaitEnabled, user?.id]);

  useEffect(() => {
    if (friends.length > 0 || conversations.length === 0 || !user?.id) return;

    const conversationFriends = conversations
      .map((conversation: any) =>
        toChallengeFriend({
          id:
            conversation.other_user?.user_id ||
            conversation.other_user?.id ||
            "",
          username: conversation.other_user?.username,
          displayName: conversation.other_user?.display_name,
          avatarUrl: conversation.other_user?.avatar_url,
        }),
      )
      .filter((friend) => friend.id && friend.id !== user.id);

    const deduped = Array.from(
      new Map(conversationFriends.map((friend) => [friend.id, friend])).values(),
    );

    if (deduped.length > 0) {
      setFriends(deduped);
    }
  }, [conversations, friends.length, user?.id]);

  const clearChallengeForFreshAttempt = useCallback(() => {
    setChallenge(null);
    setSessionCompletedChallengeId(null);
    setSelectedQuestion(QUESTION_TEMPLATES[0]);
    setCustomQuestion("");
  }, []);

  const startRollAnimation = useCallback(() => {
    if (rollTimerRef.current) window.clearInterval(rollTimerRef.current);
    rollTimerRef.current = window.setInterval(() => {
      setActiveRollIndex((index) =>
        friends.length ? (index + 1) % friends.length : 0,
      );
    }, 92);
  }, [friends.length]);

  const stopRollAnimation = useCallback(() => {
    if (rollTimerRef.current) {
      window.clearInterval(rollTimerRef.current);
      rollTimerRef.current = null;
    }
  }, []);

  const handleMatch = useCallback(async (forceUnlock = false) => {
    if (!user?.id || matching || (!forceUnlock && !canMatchNow)) {
      return;
    }

    const previousChallenge = challenge;
    if (friends.length === 0) {
      if (forceUnlock) {
        clearChallengeForFreshAttempt();
        setError("Friends are still syncing. Matching will start in a moment.");
      }
      return;
    }

    setMatching(true);
    setError(null);
    clearChallengeForFreshAttempt();
    startRollAnimation();

    const candidateFriends =
      previousChallenge?.matchedFriendId && friends.length > 1
        ? friends.filter((friend) => friend.id !== previousChallenge.matchedFriendId)
        : friends;
    const chosen = candidateFriends[secureRandomIndex(candidateFriends.length)];
    const minimumSpin = new Promise((resolve) => window.setTimeout(resolve, 1900));

    try {
      const docId = challengeDocId(user.id, localDate);
      const challengeData: Omit<DailyChallengeDoc, "id"> = {
        userId: user.id,
        localDate,
        status: "matched",
        matchedFriendId: chosen.id,
        matchedFriendUsername: chosen.username,
        matchedFriendName: chosen.displayName,
        matchedFriendAvatar: chosen.avatarUrl,
      };

      let persisted = true;
      const persistPromise = setDoc(doc(db, "dailyChallenges", docId), {
        ...challengeData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((writeError) => {
          if (!isPermissionError(writeError)) {
            throw writeError;
          }

          persisted = false;
          console.warn(
            "Daily challenge match will continue without Firestore state:",
            writeError,
          );
        });

      await Promise.all([minimumSpin, persistPromise]);

      stopRollAnimation();
      setActiveRollIndex(friends.findIndex((friend) => friend.id === chosen.id));
      setChallenge({ id: docId, ...challengeData, persisted });
    } catch (matchError) {
      console.error("Error creating daily challenge:", matchError);
      stopRollAnimation();
      setError("Could not lock in a match. Try once more.");
    } finally {
      setMatching(false);
    }
  }, [
    canMatchNow,
    challenge,
    clearChallengeForFreshAttempt,
    friends,
    localDate,
    matching,
    startRollAnimation,
    stopRollAnimation,
    user?.id,
  ]);

  const handleSkipWait = () => {
    onSkipWait();
    setError(null);
    if (challenge?.status && challenge.status !== "matched") {
      clearChallengeForFreshAttempt();
    }
  };

  const handleAccept = async () => {
    if (!user?.id || !challenge || !matchedFriend) return;

    setError(null);
    setMatching(true);

    try {
      const conversation = await messagingService.getOrCreateConversation(
        user.id,
        matchedFriend.id,
      );
      const recipientId = getConversationOtherUserId(
        conversation,
        user.id,
        matchedFriend.id,
      );
      const senderName = user.displayName || user.username || "Someone";
      const questionToSend = customQuestion.trim() || selectedQuestion;
      const firstMessage = `${senderName} asked you a question as part of their daily challenge.\n\n${questionToSend}`;

      await messagingService.sendMessageWithDelivery(
        conversation.id,
        user.id,
        firstMessage,
        undefined,
        "TEXT",
        recipientId,
      );

      if (challenge.persisted !== false) {
        await updateDoc(doc(db, "dailyChallenges", challenge.id), {
          status: "accepted",
          question: questionToSend,
          conversationId: conversation.id,
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((updateError) => {
          if (!isPermissionError(updateError)) {
            throw updateError;
          }
          console.warn(
            "Daily challenge accept state was not persisted:",
            updateError,
          );
        });
      }

      await loadConversations(user.id);
      setChallenge({
        ...challenge,
        status: "accepted",
        question: questionToSend,
        conversationId: conversation.id,
      });
      setSessionCompletedChallengeId(challenge.id);
      onOpenConversation(
        recipientId,
        matchedFriend.displayName || matchedFriend.username,
        conversation.id,
      );
    } catch (acceptError) {
      console.error("Error accepting daily challenge:", acceptError);
      setError("The conversation could not be started. Please try again.");
    } finally {
      setMatching(false);
    }
  };

  const handleReject = async () => {
    if (!user?.id || !challenge || !matchedFriend) return;

    setError(null);
    setMatching(true);

    try {
      const actorName = user.displayName || user.username || "Someone";
      const actorUsername = user.username || "someone";
      const rejectionMessage = `${actorName} rejected their daily challenge with you`;

      const stateUpdate =
        challenge.persisted !== false
          ? updateDoc(doc(db, "dailyChallenges", challenge.id), {
              status: "rejected",
              rejectedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }).catch((updateError) => {
              if (!isPermissionError(updateError)) {
                throw updateError;
              }
              console.warn(
                "Daily challenge reject state was not persisted:",
                updateError,
              );
            })
          : Promise.resolve();

      await stateUpdate;
      setChallenge({ ...challenge, status: "rejected" });
      setSessionCompletedChallengeId(challenge.id);

      const alertResponse = await alertService.createAlert({
        userId: matchedFriend.id,
        type: "SUS_CLOSE_FRIEND_ACTIVITY",
        entityId: challenge.id,
        actorId: user.id,
        message: rejectionMessage,
        actorName,
        actorUsername,
        actorAvatar: user.avatar || "",
        metadata: {
          challengeType: "daily_friend_match",
          susActivityType: "daily_challenge_rejected",
          localDate,
          matchedFriendId: matchedFriend.id,
          matchedFriendUsername: matchedFriend.username,
        },
      });

      if (!alertResponse.success) {
        throw new Error(alertResponse.error || "Daily challenge alert failed");
      }
    } catch (rejectError) {
      console.error("Error rejecting daily challenge:", rejectError);
      setError("Could not send the rejection alert. Try again.");
    } finally {
      setMatching(false);
    }
  };

  const rollFriend =
    friends[activeRollIndex] || matchedFriend || {
      id: "empty",
      displayName: "Daily Match",
      username: "daily",
      avatarUrl: "",
    };

  return (
    <div className="screen-container daily-challenge-screen">
      <style>{`
        .daily-challenge-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%),
            radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes dailyPulse {
          0%, 100% { transform: scale(1); opacity: 0.72; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes dailySweep {
          from { transform: translateX(-120%); }
          to { transform: translateX(120%); }
        }
        @keyframes dailyFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dailySpinGlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .daily-panel {
          animation: dailyFloatIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .daily-match-ring::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 36px;
          background: conic-gradient(from 180deg, rgba(74,222,128,0), rgba(74,222,128,0.9), rgba(14,165,233,0.65), rgba(74,222,128,0));
          animation: dailySpinGlow 2.4s linear infinite;
          opacity: ${matching ? 1 : 0.52};
        }
        .daily-match-ring::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 34px;
          background: linear-gradient(180deg, rgba(18,24,18,0.98), rgba(7,10,8,0.98));
        }
        .daily-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: dailySweep 2.8s ease-in-out infinite;
        }
      `}</style>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 12px)",
          paddingBottom: "calc(var(--safe-area-bottom) + 32px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
              <Sparkles size={13} />
              Daily Challenge
            </div>
            <h1 className="text-[32px] font-black leading-none tracking-tight text-white">
              Match Room
            </h1>
          </div>
          <button
            onClick={onBack}
            className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
          >
            <ArrowLeft size={22} />
          </button>
        </div>

        <div className="daily-panel daily-shine relative mb-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
                Opens daily
              </p>
              <p className="text-2xl font-black text-white">
                8:00 PM
              </p>
            </div>
            <div className="rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/10 px-4 py-3 text-right">
              <div className="mb-1 flex items-center justify-end gap-1.5 text-[#86efac]">
                <Clock3 size={14} />
                <span className="text-[11px] font-black uppercase tracking-[0.14em]">
                  {canMatchNow ? "Live" : "Wait"}
                </span>
              </div>
              <p className="text-lg font-black text-white">
                {canMatchNow ? "Ready" : countdown}
              </p>
            </div>
          </div>
          {!isUnlocked && (
            <button
              onClick={handleSkipWait}
              disabled={matching}
              className="relative z-10 mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-4 text-sm font-black text-[#bbf7d0] transition-colors hover:bg-[#4ade80]/14"
            >
              <Zap size={15} />
              {skipWaitEnabled ? "Skip active - match button enabled" : "Temporary skip wait"}
            </button>
          )}
        </div>

        <div className="daily-panel relative mb-5 overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
          <div className="pointer-events-none absolute left-1/2 top-24 h-40 w-40 -translate-x-1/2 rounded-full bg-[#4ade80]/10 blur-3xl" />

          <div className="relative z-10">
            <div className="daily-match-ring relative mx-auto mb-5 h-[210px] max-w-[310px] rounded-[36px] p-[2px]">
              <div className="relative z-10 flex h-full flex-col items-center justify-center rounded-[34px] px-5 text-center">
                <div
                  className="mb-4"
                  style={{
                    transform: matching ? "scale(1.04)" : "scale(1)",
                    transition: "transform 0.24s ease",
                  }}
                >
                  <Avatar
                    src={rollFriend.avatarUrl}
                    alt={rollFriend.displayName}
                    size={92}
                    userId={rollFriend.id}
                    username={rollFriend.username}
                  />
                </div>
                <p className="mb-1 max-w-full truncate text-xl font-black text-white">
                  {loading
                    ? "Loading friends"
                    : matching
                      ? rollFriend.displayName
                      : matchedFriend
                        ? matchedFriend.displayName
                        : "Find today's friend"}
                </p>
                <p className="max-w-full truncate text-sm font-semibold text-[#6ee7b7]">
                  {loading
                    ? "syncing"
                    : matching
                      ? "choosing"
                      : matchedFriend
                        ? `@${matchedFriend.username}`
                        : `${friends.length} friends available`}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}

            {!visibleChallenge && (
              <button
                onClick={() => void handleMatch()}
                disabled={loading || matching || friends.length === 0 || !canMatchNow}
                className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-[16px] font-black text-black shadow-[0_18px_40px_rgba(74,222,128,0.3)] transition-all duration-200 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#161a16] disabled:text-[#64748b] disabled:shadow-none"
              >
                {matching ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Matching
                  </>
                ) : !canMatchNow ? (
                  <>
                    <Clock3 size={18} />
                    Opens in {countdown}
                  </>
                ) : friends.length === 0 ? (
                  "No friends to match"
                ) : (
                  <>
                    Match randomly
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            )}

            {visibleChallenge?.status === "matched" && matchedFriend && (
              <div className="space-y-4">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                      Pick a first question
                    </p>
                    <div className="flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-2.5 py-1 text-[11px] font-bold text-[#86efac]">
                      <ShieldCheck size={12} />
                      One message
                    </div>
                  </div>
                  <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                    {QUESTION_TEMPLATES.map((question) => (
                      <button
                        key={question}
                        onClick={() => setSelectedQuestion(question)}
                        className={`snap-start rounded-[22px] border px-4 py-3 text-left text-sm font-semibold leading-snug transition-all ${
                          selectedQuestion === question
                            ? "min-w-[250px] border-[#4ade80]/45 bg-[#4ade80]/12 text-white shadow-[0_12px_30px_rgba(74,222,128,0.16)]"
                            : "min-w-[230px] border-white/8 bg-white/[0.04] text-[#94a3b8]"
                        }`}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 rounded-[24px] border border-white/8 bg-white/[0.04] p-3">
                    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#64748b]">
                      Or write your own
                    </p>
                    <textarea
                      value={customQuestion}
                      onChange={(event) => setCustomQuestion(event.target.value)}
                      placeholder="Ask something personal..."
                      rows={3}
                      maxLength={500}
                      className="min-h-[92px] w-full resize-none rounded-[18px] border border-white/8 bg-[#070907] px-4 py-3 text-[15px] font-semibold leading-relaxed text-white outline-none placeholder:text-[#3d463f] focus:border-[#4ade80]/35"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleReject}
                    disabled={matching}
                    className="flex min-h-[54px] items-center justify-center gap-2 rounded-full border border-red-500/24 bg-red-500/10 text-sm font-black text-red-200 transition-colors disabled:opacity-60"
                  >
                    <X size={18} />
                    Reject
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={matching}
                    className="flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-sm font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] disabled:opacity-60"
                  >
                    <Check size={18} />
                    Accept
                  </button>
                </div>
              </div>
            )}

            {visibleChallenge?.status === "accepted" && (
              <div className="rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-[#86efac]">
                  <MessageCircle size={18} />
                  <p className="text-sm font-black uppercase tracking-[0.14em]">
                    Conversation started
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-[#d1fae5]">
                  Your daily question is in chat with {matchedFriend?.displayName || "your friend"}.
                </p>
              </div>
            )}

            {visibleChallenge?.status === "rejected" && (
              <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-red-200">
                  <X size={18} />
                  <p className="text-sm font-black uppercase tracking-[0.14em]">
                    Challenge declined
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-red-100/80">
                  {matchedFriend?.displayName || "Your match"} has been notified.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            ["One", "friend"],
            ["One", "choice"],
            ["One", "chat"],
          ].map(([top, bottom]) => (
            <div
              key={`${top}-${bottom}`}
              className="rounded-[22px] border border-white/8 bg-white/[0.035] px-3 py-4 text-center"
            >
              <p className="text-lg font-black text-white">{top}</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748b]">
                {bottom}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
