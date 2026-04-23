"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Clock } from "lucide-react";
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
  const [timeRemaining, setTimeRemaining] = useState(15 * 60); // 15 minutes in seconds
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [challenger, setChallenger] = useState<any>(null);

  // Resolve challenger name from profileDataStore
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
          // Auto-submit if time runs out
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

  // Load truth data when component mounts
  useEffect(() => {
    if (truthId) {
      console.log("Loading truth with ID:", truthId);
      getTruth(truthId);
    }
  }, [truthId, getTruth]);

  // Load challenger profile when truth is loaded
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
        onBack(); // Navigate back after successful submission
      } catch (error) {
        console.error("Failed to answer truth:", error);
        setIsSubmitted(false);
      }
    }
  };

  return (
    <div className="screen-container">
      {/* Header */}
      <div className="nav-header">
        <div className="flex items-center justify-between p-4">
          <button onClick={onBack} className="btn-icon btn-ghost">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-white">Answer the Truth</h1>
          <div className="flex items-center space-x-2 text-[#4ade80]">
            <Clock size={16} />
            <span className="font-medium">{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {/* Question Card */}
        <div className="card mb-6">
          {/* Challenger Info */}
          <div className="flex items-center space-x-3 mb-4">
            <Avatar
              src={challengerCached?.avatarUrl || challenger?.avatarUrl || ""}
              alt={resolvedChallengerName}
              size="md"
              userId={currentTruth?.challengerId}
              username={resolvedChallengerUsername}
            />
            <div>
              <h3 className="font-semibold text-white">
                {resolvedChallengerName}
              </h3>
              <p className="text-text-secondary text-sm">
                @{resolvedChallengerUsername}
              </p>
            </div>
          </div>

          {/* Question */}
          <div className="bg-[#2a2a2a] rounded-xl p-4 border-l-4 border-[#4ade80]">
            <p className="text-white font-semibold text-lg leading-relaxed">
              {currentTruth?.question || "No question available"}
            </p>
          </div>
        </div>

        {/* Answer Input */}
        <div className="card">
          <label className="block text-white font-medium mb-3">
            Your Answer
          </label>
          <div className="mb-6">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 text-white placeholder-[#94a3b8] focus:outline-none focus:border-accent-primary resize-none"
              rows={4}
              disabled={isSubmitted || currentTruth?.state !== "SENT"}
            />
          </div>

          <div className="flex space-x-4">
            {currentTruth?.state === "ANSWERED" ? (
              <div className="flex-1 py-3 text-center rounded-xl border border-accent-secondary/30 bg-accent-secondary/20">
                <p className="text-accent-secondary font-semibold text-sm">
                  Already answered
                </p>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={
                  !answer.trim() ||
                  isSubmitted ||
                  currentTruth?.state !== "SENT"
                }
                className="btn btn-primary flex-1 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitted ? "Submitting..." : "Submit Answer"}
              </button>
            )}
          </div>
        </div>

        {/* Warning Text */}
        {!isSubmitted && (
          <div className="mt-4 text-center">
            <p className="text-text-secondary text-sm">
              Once submitted, this cannot be edited
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
