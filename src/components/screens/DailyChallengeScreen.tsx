"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  RefreshCw,
  Zap,
} from "lucide-react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useMessagingStore } from "@/stores/useMessagingStore";
import { useAvatarStore } from "@/stores/avatarStore";
import { useProfileDataStore } from "@/stores/profileDataStore";
import { friendsService } from "@/middleware/services/service-factory";
import { primeResolvedUserProfile } from "@/utils/profileResolver";
import { Avatar } from "../ui/Avatar";

type ChallengeFriend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
};

export type DailyChallengeDraft = {
  id: string;
  userId: string;
  localDate: string;
  status: "matched";
  matchedFriendId: string;
  matchedFriendUsername: string;
  matchedFriendName: string;
  matchedFriendAvatar: string;
  persisted?: boolean;
};

const DAILY_UNLOCK_HOUR = 20;
const DAILY_UNLOCK_MINUTE = 0;

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

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function toChallengeFriend(friend: any): ChallengeFriend {
  const id = getFriendId(friend);
  const cachedProfile = id
    ? useProfileDataStore.getState().userProfiles[id]
    : null;
  const cachedAvatar = id ? useAvatarStore.getState().userAvatars[id] : "";
  const username = String(
    cachedProfile?.username || friend.username || "unknown",
  ).replace(/^@/, "");
  const displayName =
    cachedProfile?.displayName ||
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
    avatarUrl:
      cachedAvatar ||
      cachedProfile?.avatarUrl ||
      friend.avatarUrl ||
      friend.avatar_url ||
      friend.avatar ||
      "",
  };
}

function getConversationFriends(
  conversations: any[],
  currentUserId: string,
): ChallengeFriend[] {
  return conversations
    .map((conversation: any) =>
      toChallengeFriend({
        id:
          conversation.other_user?.user_id ||
          conversation.other_user?.id ||
          "",
        username: conversation.other_user?.username,
        displayName:
          conversation.other_user?.display_name ||
          conversation.other_user?.displayName,
        avatarUrl:
          conversation.other_user?.avatar_url ||
          conversation.other_user?.avatarUrl ||
          conversation.other_user?.avatar,
      }),
    )
    .filter((friend) => friend.id && friend.id !== currentUserId);
}

function mergeChallengeFriends(
  ...friendLists: ChallengeFriend[][]
): ChallengeFriend[] {
  const friendsById = new Map<string, ChallengeFriend>();

  friendLists.flat().forEach((friend) => {
    if (!friend.id) return;

    const existing = friendsById.get(friend.id);
    friendsById.set(friend.id, {
      id: friend.id,
      username:
        friend.username !== "unknown"
          ? friend.username
          : existing?.username || friend.username,
      displayName:
        friend.displayName !== "Friend"
          ? friend.displayName
          : existing?.displayName || friend.displayName,
      avatarUrl: friend.avatarUrl || existing?.avatarUrl || "",
    });
  });

  return Array.from(friendsById.values());
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

export function DailyChallengeScreen({
  isActive = true,
  skipWaitEnabled = false,
  onBack,
  onSkipWait,
  onStartMatch,
}: {
  isActive?: boolean;
  skipWaitEnabled?: boolean;
  onBack: () => void;
  onSkipWait: () => void;
  onStartMatch: (challenge: DailyChallengeDraft) => void;
}) {
  const { user } = useAuthStore();
  const { conversations, loadConversations } = useMessagingStore();
  const [now, setNow] = useState(() => Date.now());
  const [friends, setFriends] = useState<ChallengeFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRollIndex, setActiveRollIndex] = useState(0);
  const [cinematicExit, setCinematicExit] = useState(false);
  const rollTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const localDate = useMemo(() => getLocalDateKey(new Date(now)), [now]);
  const unlockTime = useMemo(() => getTodayUnlockTime(new Date(now)), [now]);
  const isUnlocked = now >= unlockTime.getTime();
  const canMatchNow = isUnlocked || skipWaitEnabled;
  const countdown = formatCountdown(unlockTime.getTime() - now);
  const friendCount = friends.length;
  const rollFriend =
    friends[
      friends.length
        ? ((activeRollIndex % friends.length) + friends.length) % friends.length
        : 0
    ] || {
      id: "empty",
      displayName: "Daily Match",
      username: "daily",
      avatarUrl: "",
    };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isActive || !user?.id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const cachedFriends = getConversationFriends(
          useMessagingStore.getState().conversations,
          user.id,
        );
        if (cachedFriends.length > 0) {
          setFriends((currentFriends) =>
            mergeChallengeFriends(currentFriends, cachedFriends),
          );
          setLoading(false);
        }

        void loadConversations(user.id);

        const friendResponse = await friendsService.getFriends(user.id);
        if (cancelled) return;

        const responseFriends = Array.isArray(friendResponse)
          ? friendResponse
          : friendResponse.friends || [];
        const loadedFriends = responseFriends
          .map(toChallengeFriend)
          .filter((friend) => friend.id && friend.id !== user.id);

        setFriends((currentFriends) =>
          mergeChallengeFriends(currentFriends, loadedFriends),
        );
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
      } catch (error) {
        console.error("Error loading daily challenge hub:", error);
        if (!cancelled) {
          setError("Friends could not sync. Try again in a moment.");
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
  }, [isActive, loadConversations, user?.id]);

  useEffect(() => {
    if (conversations.length === 0 || !user?.id) return;

    const conversationFriends = getConversationFriends(conversations, user.id);
    if (conversationFriends.length > 0) {
      setFriends((currentFriends) =>
        mergeChallengeFriends(currentFriends, conversationFriends),
      );
      setLoading(false);
    }
  }, [conversations, user?.id]);

  useEffect(() => {
    if (!isActive) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isActive]);

  const startRollAnimation = () => {
    if (rollTimerRef.current) window.clearInterval(rollTimerRef.current);
    setActiveRollIndex(friends.length > 0 ? secureRandomIndex(friends.length) : 0);
    rollTimerRef.current = window.setInterval(() => {
      setActiveRollIndex((index) =>
        friends.length ? (index + 1) % friends.length : 0,
      );
    }, 92);
  };

  const stopRollAnimation = () => {
    if (rollTimerRef.current) {
      window.clearInterval(rollTimerRef.current);
      rollTimerRef.current = null;
    }
  };

  const handleMatch = async () => {
    if (
      !user?.id ||
      matching ||
      cinematicExit ||
      friends.length === 0 ||
      !canMatchNow
    ) {
      return;
    }

    setMatching(true);
    setError(null);
    setCinematicExit(false);
    startRollAnimation();

    const chosen = friends[secureRandomIndex(friends.length)];
    const minimumSpin = new Promise((resolve) => window.setTimeout(resolve, 1900));

    try {
      const docId = challengeDocId(user.id, localDate);
      const challengeData: Omit<DailyChallengeDraft, "id" | "persisted"> = {
        userId: user.id,
        localDate,
        status: "matched",
        matchedFriendId: chosen.id,
        matchedFriendUsername: chosen.username,
        matchedFriendName: chosen.displayName,
        matchedFriendAvatar: chosen.avatarUrl,
      };
      let persisted = true;

      await Promise.all([
        minimumSpin,
        setDoc(
          doc(db, "dailyChallenges", docId),
          {
            ...challengeData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        ).catch((writeError) => {
          if (!isPermissionError(writeError)) {
            throw writeError;
          }

          persisted = false;
          console.warn(
            "Daily challenge match will continue without Firestore state:",
            writeError,
          );
        }),
      ]);

      stopRollAnimation();
      setActiveRollIndex(
        Math.max(
          0,
          friends.findIndex((friend) => friend.id === chosen.id),
        ),
      );
      setCinematicExit(true);
      window.setTimeout(() => {
        onStartMatch({ id: docId, ...challengeData, persisted });
        setMatching(false);
        setCinematicExit(false);
      }, 520);
    } catch (matchError) {
      console.error("Error creating daily challenge match:", matchError);
      stopRollAnimation();
      setError("Could not lock in today's friend. Try again.");
      setMatching(false);
    }
  };

  return (
    <div
      className={`screen-container daily-challenge-screen ${
        cinematicExit ? "daily-screen-cinematic-exit" : ""
      }`}
    >
      <style>{`
        .daily-challenge-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%),
            radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes dailySweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes dailyFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dailySpinGlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes dailyCinematicExit {
          0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          100% { opacity: 0; transform: translateY(-10px) scale(1.035); filter: blur(8px); }
        }
        .daily-panel {
          animation: dailyFloatIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .daily-screen-cinematic-exit {
          animation: dailyCinematicExit 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: none;
          transform-origin: center;
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
          animation: dailySweep 6.6s ease-in-out infinite;
        }
      `}</style>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 12px)",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
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
              <h1 className="text-[32px] font-black leading-none tracking-tight text-white">
                Match Hour
              </h1>
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[#4ade80] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            <Zap size={24} />
          </div>
        </div>

        <div className="daily-panel daily-shine relative mb-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
                Opens daily
              </p>
              <p className="text-2xl font-black text-white">8:00 PM</p>
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
              onClick={() => {
                onSkipWait();
              }}
              className="relative z-10 mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-4 text-sm font-black text-[#bbf7d0] transition-colors hover:bg-[#4ade80]/14"
            >
              <Zap size={15} />
              {skipWaitEnabled
                ? "Skip active - match button enabled"
                : "Temporary skip wait"}
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
                    key={`daily-hub-roll-${rollFriend.id}-${rollFriend.avatarUrl || "cached"}`}
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
                      : "Find today's friend"}
                </p>
                <p className="max-w-full truncate text-sm font-semibold text-[#6ee7b7]">
                  {loading
                    ? "syncing"
                    : matching
                      ? "choosing"
                      : `${friendCount} friends available`}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleMatch}
              disabled={
                loading ||
                matching ||
                cinematicExit ||
                friendCount === 0 ||
                !canMatchNow
              }
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
              ) : friendCount === 0 ? (
                "No friends to match"
              ) : (
                <>
                  Match randomly
                  <ArrowRight size={18} />
                </>
              )}
            </button>
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
