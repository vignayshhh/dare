"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Clock, Lock, ShieldCheck, Sparkles } from "lucide-react";
import "@/styles/design-system.css";
import { useTruthStore } from "@/stores/useTruthStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";

interface TruthAnswerScreenProps {
  truthId: string;
  onBack: () => void;
}

export function TruthAnswerScreen({ truthId, onBack }: TruthAnswerScreenProps) {
  const { user } = useAuthStore();
  const { currentTruth, getTruth, answerTruth } = useTruthStore();
  const [answer, setAnswer] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(15 * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [challenger, setChallenger] = useState<any>(null);

  const truthProfiles = useProfileDataStore((s) => s.userProfiles);
  const challengerCached = currentTruth?.challengerId
    ? truthProfiles[currentTruth.challengerId]
    : null;
  const resolvedChallengerName =
    challengerCached?.displayName ||
    challenger?.displayName ||
    challenger?.username ||
    "User";
  const resolvedChallengerUsername =
    challengerCached?.username || challenger?.username || "unknown";

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!isSubmitted) {
            handleSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmitted]);

  useEffect(() => {
    if (truthId) {
      console.log("Loading truth with ID:", truthId);
      getTruth(truthId);
    }
  }, [truthId, getTruth]);

  useEffect(() => {
    const loadChallenger = async () => {
      if (currentTruth?.challengerId) {
        try {
          console.log(
            "Loading challenger profile for:",
            currentTruth.challengerId,
          );
          const { UserRepository } =
            await import("@/backend/repositories/UserRepository");
          const userRepository = new UserRepository();
          const challengerProfile = await userRepository.getProfileById(
            currentTruth.challengerId,
          );

          if (challengerProfile) {
            console.log("Loaded challenger profile:", challengerProfile);
            setChallenger(challengerProfile);
          }
        } catch (error) {
          console.error("Error loading challenger profile:", error);
        }
      }
    };

    loadChallenger();
  }, [currentTruth?.challengerId]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = async () => {
    if (answer.trim() && !isSubmitted && currentTruth && user) {
      setIsSubmitted(true);
      try {
        await answerTruth(currentTruth.id, user.id, answer.trim());
        onBack();
      } catch (error) {
        console.error("Failed to answer truth:", error);
        setIsSubmitted(false);
      }
    }
  };

  const answerDisabled = isSubmitted || currentTruth?.state !== "SENT";
  const canSubmit =
    Boolean(answer.trim()) && !isSubmitted && currentTruth?.state === "SENT";
  const truthStateLabel =
    currentTruth?.state === "ANSWERED"
      ? "Already answered"
      : currentTruth?.state === "SENT"
        ? "Live now"
        : currentTruth?.state || "Loading";

  return (
    <div className="screen-container bg-[radial-gradient(circle_at_top,#16291d_0%,#0c120d_38%,#070907_100%)]">
      <div className="nav-header">
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all hover:border-[#4ade80]/30 hover:bg-white/10"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7dd3a7]">
              Truth Response
            </p>
            <h1 className="text-lg font-bold text-white">Answer the Truth</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-2 text-[#86efac] shadow-[0_0_24px_rgba(74,222,128,0.12)]">
            <Clock size={16} />
            <span className="text-sm font-semibold">
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-5">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,21,0.98),rgba(12,15,13,0.98))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.45)]">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.45),transparent)]" />
            <div className="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-[#4ade80]/10 blur-3xl" />

            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar
                    src={
                      challengerCached?.avatarUrl || challenger?.avatarUrl || ""
                    }
                    alt={resolvedChallengerName}
                    size="lg"
                    userId={currentTruth?.challengerId}
                    username={resolvedChallengerUsername}
                  />
                  <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[#0d1510] bg-[#4ade80] text-black shadow-[0_0_18px_rgba(74,222,128,0.45)]">
                    <Sparkles size={11} />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7dd3a7]">
                    Asked by
                  </p>
                  <h3 className="font-semibold text-white">
                    {resolvedChallengerName}
                  </h3>
                  <p className="text-sm text-[#91a091]">
                    @{resolvedChallengerUsername}
                  </p>
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d7e1d7]">
                {truthStateLabel}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#4ade80]/14 bg-[linear-gradient(180deg,rgba(26,31,28,0.98),rgba(18,21,19,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-3 flex items-center gap-2 text-[#86efac]">
                <div className="h-1.5 w-10 rounded-full bg-[#4ade80]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Question
                </span>
              </div>
              <p className="text-lg font-semibold leading-relaxed text-white">
                {currentTruth?.question || "No question available"}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,20,0.98),rgba(13,15,13,0.98))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.38)]">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.34),transparent)]" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <label className="block text-lg font-bold text-white">
                  Your Answer
                </label>
                <p className="mt-1 text-sm text-[#8ea18e]">
                  Keep it honest, clear, and ready to be reviewed.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#c8d2c8]">
                {answer.length} chars
              </div>
            </div>

            <div className="mb-5 rounded-[24px] border border-white/8 bg-[#0e120f]/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className="min-h-[180px] w-full resize-none rounded-[20px] border border-transparent bg-[linear-gradient(180deg,rgba(22,27,23,0.98),rgba(16,20,17,0.98))] px-4 py-4 text-white placeholder-[#6f7d6f] outline-none transition-all focus:border-[#4ade80]/30"
                disabled={answerDisabled}
              />
            </div>

            {currentTruth?.state === "ANSWERED" ? (
              <div className="rounded-[22px] border border-[#4ade80]/25 bg-[#4ade80]/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={20} className="mt-0.5 text-[#86efac]" />
                  <div>
                    <p className="font-semibold text-[#86efac]">
                      Already answered
                    </p>
                    <p className="mt-1 text-sm text-[#c5d0c5]">
                      Your response has already been submitted for this truth.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#4ade80_0%,#22c55e_100%)] px-5 py-4 text-base font-bold text-black shadow-[0_16px_32px_rgba(34,197,94,0.22)] transition-all hover:translate-y-[-1px] hover:shadow-[0_20px_40px_rgba(34,197,94,0.26)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitted ? "Submitting..." : "Submit Answer"}
                </button>
                <p className="text-center text-sm text-[#7f8b7f]">
                  Once submitted, this cannot be edited.
                </p>
              </div>
            )}
          </div>

          {currentTruth?.state !== "SENT" &&
            currentTruth?.state !== "ANSWERED" && (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm text-[#9cab9c]">
                This truth is currently in{" "}
                <span className="font-semibold text-white">
                  {currentTruth?.state}
                </span>{" "}
                state, so answering is disabled right now.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
