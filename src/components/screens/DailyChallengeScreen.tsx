"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, Sparkles, Zap } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useMessagingStore } from "@/stores/useMessagingStore";
import { friendsService } from "@/middleware/services/service-factory";

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
  onStartMatch: () => void;
}) {
  const { user } = useAuthStore();
  const { conversations, loadConversations } = useMessagingStore();
  const [now, setNow] = useState(() => Date.now());
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const unlockTime = useMemo(() => getTodayUnlockTime(new Date(now)), [now]);
  const isUnlocked = now >= unlockTime.getTime();
  const canMatchNow = isUnlocked || skipWaitEnabled;
  const countdown = formatCountdown(unlockTime.getTime() - now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isActive || !user?.id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const friendResponse = await friendsService.getFriends(user.id);
        if (cancelled) return;

        const responseFriends = Array.isArray(friendResponse)
          ? friendResponse
          : friendResponse.friends || [];
        const uniqueFriends = new Set(
          responseFriends
            .map(getFriendId)
            .filter((friendId) => friendId && friendId !== user.id),
        );

        setFriendCount(uniqueFriends.size);
        await loadConversations(user.id);
      } catch (error) {
        console.error("Error loading daily challenge hub:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isActive, loadConversations, user?.id]);

  useEffect(() => {
    if (friendCount > 0 || conversations.length === 0 || !user?.id) return;

    const conversationFriendIds = conversations
      .map(
        (conversation: any) =>
          conversation.other_user?.user_id || conversation.other_user?.id || "",
      )
      .filter((friendId) => friendId && friendId !== user.id);

    setFriendCount(new Set(conversationFriendIds).size);
  }, [conversations, friendCount, user?.id]);

  useEffect(() => {
    if (!isActive) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isActive]);

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
        @keyframes dailySweep {
          from { transform: translateX(-120%); }
          to { transform: translateX(120%); }
        }
        @keyframes dailyFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .daily-panel {
          animation: dailyFloatIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
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
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                <Sparkles size={13} />
                Daily Challenge
              </div>
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
                onStartMatch();
              }}
              className="relative z-10 mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-4 text-sm font-black text-[#bbf7d0] transition-colors hover:bg-[#4ade80]/14"
            >
              <Zap size={15} />
              {skipWaitEnabled
                ? "Skip active - enter match room"
                : "Temporary skip wait"}
            </button>
          )}
        </div>

        <div className="daily-panel relative mb-5 overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
          <div className="pointer-events-none absolute left-1/2 top-24 h-40 w-40 -translate-x-1/2 rounded-full bg-[#4ade80]/10 blur-3xl" />

          <div className="relative z-10">
            <div className="mx-auto mb-5 flex h-[210px] max-w-[310px] flex-col items-center justify-center rounded-[34px] border border-[#4ade80]/18 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] px-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] border border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac] shadow-[0_18px_48px_rgba(74,222,128,0.12)]">
                <Sparkles size={34} />
              </div>
              <p className="mb-1 text-xl font-black text-white">
                Today&apos;s match is waiting
              </p>
              <p className="text-sm font-semibold text-[#6ee7b7]">
                {loading ? "syncing friends" : `${friendCount} friends available`}
              </p>
            </div>

            <button
              onClick={onStartMatch}
              disabled={loading || friendCount === 0 || !canMatchNow}
              className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-[16px] font-black text-black shadow-[0_18px_40px_rgba(74,222,128,0.3)] transition-all duration-200 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#161a16] disabled:text-[#64748b] disabled:shadow-none"
            >
              {!canMatchNow ? (
                <>
                  <Clock3 size={18} />
                  Opens in {countdown}
                </>
              ) : friendCount === 0 ? (
                "No friends to match"
              ) : (
                <>
                  Enter match room
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
