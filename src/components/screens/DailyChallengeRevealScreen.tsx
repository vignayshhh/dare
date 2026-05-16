"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  alertService,
} from "@/middleware/services/service-factory";
import { messagingService } from "@/middleware/services/messaging.service";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useMessagingStore } from "@/stores/useMessagingStore";
import { Avatar } from "../ui/Avatar";
import type { DailyChallengeDraft } from "./DailyChallengeScreen";

type DailyChallengeStatus = "matched" | "accepted" | "rejected";

type DailyChallengeRevealState = Omit<DailyChallengeDraft, "status"> & {
  status: DailyChallengeStatus;
  question?: string;
  conversationId?: string;
};

const QUESTION_TEMPLATES = [
  "What is something you wish more people understood about you?",
  "What moment from this week has been living in your head?",
  "What is a small thing that instantly makes you feel cared for?",
  "What is one dream you rarely say out loud?",
  "What is something you have changed your mind about recently?",
  "When do you feel most like yourself?",
];

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

export function DailyChallengeRevealScreen({
  isActive = true,
  initialChallenge,
  onBack,
  onOpenConversation,
}: {
  isActive?: boolean;
  initialChallenge?: DailyChallengeDraft | null;
  onBack: () => void;
  onOpenConversation: (
    userId: string,
    username: string,
    conversationId: string,
  ) => void;
}) {
  const { user } = useAuthStore();
  const { loadConversations } = useMessagingStore();
  const [challenge, setChallenge] =
    useState<DailyChallengeRevealState | null>(initialChallenge || null);
  const [selectedQuestion, setSelectedQuestion] = useState(
    QUESTION_TEMPLATES[0],
  );
  const [customQuestion, setCustomQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const matchedFriend = useMemo(() => {
    if (!challenge) return null;

    return {
      id: challenge.matchedFriendId,
      username: challenge.matchedFriendUsername,
      displayName: challenge.matchedFriendName,
      avatarUrl: challenge.matchedFriendAvatar,
    };
  }, [challenge]);

  useEffect(() => {
    if (!isActive || !initialChallenge) return;

    setChallenge(initialChallenge);
    setSelectedQuestion(QUESTION_TEMPLATES[0]);
    setCustomQuestion("");
    setError(null);
  }, [initialChallenge, isActive]);

  useEffect(() => {
    if (!isActive) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isActive]);

  const handleAccept = async () => {
    if (!user?.id || !challenge || !matchedFriend || submitting) return;

    setError(null);
    setSubmitting(true);

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
      onOpenConversation(
        recipientId,
        matchedFriend.displayName || matchedFriend.username,
        conversation.id,
      );
    } catch (acceptError) {
      console.error("Error accepting daily challenge:", acceptError);
      setError("The conversation could not be started. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!user?.id || !challenge || !matchedFriend || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const actorName = user.displayName || user.username || "Someone";
      const actorUsername = user.username || "someone";
      const rejectionMessage = `${actorName} rejected their daily challenge with you`;

      if (challenge.persisted !== false) {
        await updateDoc(doc(db, "dailyChallenges", challenge.id), {
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
        });
      }

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
          localDate: challenge.localDate,
          matchedFriendId: matchedFriend.id,
          matchedFriendUsername: matchedFriend.username,
        },
      });

      if (!alertResponse.success) {
        throw new Error(alertResponse.error || "Daily challenge alert failed");
      }

      setChallenge({ ...challenge, status: "rejected" });
    } catch (rejectError) {
      console.error("Error rejecting daily challenge:", rejectError);
      setError("Could not send the rejection alert. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="screen-container daily-reveal-screen">
      <style>{`
        .daily-reveal-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%),
            radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes revealFadeUp {
          from { opacity: 0; transform: translateY(18px) scale(0.98); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes revealHalo {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.72; }
          50% { transform: rotate(180deg) scale(1.035); opacity: 1; }
        }
        @keyframes revealSweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes revealAvatarSnapIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.9); filter: blur(8px); }
          62% { opacity: 1; transform: translateY(-1px) scale(1.025); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes revealAvatarScan {
          0%, 28% { opacity: 0; transform: translateY(-44px); }
          38% { opacity: 0.82; }
          58%, 100% { opacity: 0; transform: translateY(44px); }
        }
        @keyframes revealBracketLock {
          from { opacity: 0; transform: scale(1.18); }
          to { opacity: 1; transform: scale(1); }
        }
        .reveal-panel {
          animation: revealFadeUp 0.62s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .reveal-cinema-card::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 38px;
          background: conic-gradient(from 140deg, rgba(74,222,128,0), rgba(74,222,128,0.86), rgba(14,165,233,0.56), rgba(74,222,128,0));
          animation: revealHalo 4.8s ease-in-out infinite;
        }
        .reveal-cinema-card::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 36px;
          background: linear-gradient(180deg, rgba(18,24,18,0.98), rgba(7,10,8,0.98));
        }
        .reveal-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: revealSweep 6.8s ease-in-out infinite;
        }
        .reveal-avatar-stage {
          animation: revealAvatarSnapIn 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;
          background:
            linear-gradient(180deg, rgba(20,28,22,0.98), rgba(7,10,8,0.98));
          box-shadow:
            0 24px 64px rgba(0,0,0,0.38),
            inset 0 1px 0 rgba(255,255,255,0.09),
            inset 0 -18px 40px rgba(74,222,128,0.055);
          overflow: hidden;
        }
        .reveal-avatar-stage::before {
          content: "";
          position: absolute;
          left: 18px;
          right: 18px;
          top: 50%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(134,239,172,0.72), rgba(14,165,233,0.52), transparent);
          box-shadow: 0 0 16px rgba(74,222,128,0.18);
          animation: revealAvatarScan 3.8s ease-in-out 0.72s infinite;
          pointer-events: none;
          z-index: 20;
        }
        .reveal-avatar-stage::after {
          content: "";
          position: absolute;
          inset: 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.07);
          box-shadow:
            inset 0 0 0 1px rgba(74,222,128,0.08),
            inset 0 -18px 34px rgba(74,222,128,0.06);
          pointer-events: none;
          z-index: 5;
        }
        .reveal-avatar-bracket {
          position: absolute;
          height: 22px;
          width: 22px;
          border-color: rgba(134,239,172,0.72);
          opacity: 0;
          animation: revealBracketLock 0.46s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
          z-index: 25;
        }
        .reveal-avatar-bracket-tl {
          left: 11px;
          top: 11px;
          border-left-width: 2px;
          border-top-width: 2px;
          border-top-left-radius: 10px;
        }
        .reveal-avatar-bracket-tr {
          right: 11px;
          top: 11px;
          border-right-width: 2px;
          border-top-width: 2px;
          border-top-right-radius: 10px;
        }
        .reveal-avatar-bracket-bl {
          left: 11px;
          bottom: 11px;
          border-left-width: 2px;
          border-bottom-width: 2px;
          border-bottom-left-radius: 10px;
        }
        .reveal-avatar-bracket-br {
          right: 11px;
          bottom: 11px;
          border-right-width: 2px;
          border-bottom-width: 2px;
          border-bottom-right-radius: 10px;
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
                Todays Match
              </h1>
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[#4ade80] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            <Sparkles size={24} />
          </div>
        </div>

        {!challenge || !matchedFriend ? (
          <div className="reveal-panel rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 text-center shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
            <p className="mb-3 text-xl font-black text-white">
              No friend selected yet
            </p>
            <p className="mb-5 text-sm font-semibold leading-relaxed text-[#94a3b8]">
              Start the random match from the Daily Challenge screen first.
            </p>
            <button
              onClick={onBack}
              className="flex min-h-[52px] w-full items-center justify-center rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-5 text-sm font-black text-[#bbf7d0] transition-colors hover:bg-[#4ade80]/14"
            >
              Back to daily challenge
            </button>
          </div>
        ) : (
          <>
            <div className="reveal-panel reveal-cinema-card relative mb-5 overflow-hidden rounded-[38px] p-[2px] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
              <div className="relative z-10 overflow-hidden rounded-[36px] px-5 py-7 text-center">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
                <div className="reveal-avatar-stage relative mx-auto mb-5 flex h-[138px] w-[138px] items-center justify-center rounded-full border border-[#4ade80]/20 bg-[#4ade80]/8">
                  <span className="reveal-avatar-bracket reveal-avatar-bracket-tl" />
                  <span className="reveal-avatar-bracket reveal-avatar-bracket-tr" />
                  <span className="reveal-avatar-bracket reveal-avatar-bracket-bl" />
                  <span className="reveal-avatar-bracket reveal-avatar-bracket-br" />
                  <div className="relative z-10">
                    <Avatar
                      key={`daily-reveal-${matchedFriend.id}-${matchedFriend.avatarUrl || "cached"}`}
                      src={matchedFriend.avatarUrl}
                      alt={matchedFriend.displayName}
                      size={116}
                      userId={matchedFriend.id}
                      username={matchedFriend.username}
                    />
                  </div>
                </div>
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#86efac]">
                  Selected friend
                </p>
                <h2 className="truncate text-[30px] font-black leading-tight text-white">
                  {matchedFriend.displayName}
                </h2>
                <p className="truncate text-sm font-bold text-[#6ee7b7]">
                  @{matchedFriend.username}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}

            {challenge.status === "matched" && (
              <div className="reveal-panel reveal-shine relative mb-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="relative z-10">
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

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="flex min-h-[54px] items-center justify-center gap-2 rounded-full border border-red-500/24 bg-red-500/10 text-sm font-black text-red-200 transition-colors disabled:opacity-60"
                    >
                      <X size={18} />
                      Reject
                    </button>
                    <button
                      onClick={handleAccept}
                      disabled={submitting}
                      className="flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-sm font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] disabled:opacity-60"
                    >
                      <Check size={18} />
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            )}

            {challenge.status === "accepted" && (
              <div className="reveal-panel rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-[#86efac]">
                  <MessageCircle size={18} />
                  <p className="text-sm font-black uppercase tracking-[0.14em]">
                    Conversation started
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-[#d1fae5]">
                  Your daily question is in chat with {matchedFriend.displayName}.
                </p>
              </div>
            )}

            {challenge.status === "rejected" && (
              <div className="reveal-panel rounded-[24px] border border-red-500/20 bg-red-500/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-red-200">
                  <X size={18} />
                  <p className="text-sm font-black uppercase tracking-[0.14em]">
                    Challenge declined
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-red-100/80">
                  {matchedFriend.displayName} has been notified in Sus Activity.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
