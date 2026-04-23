import React from "react";

interface Challenge {
  id: string;
  type: "truth" | "dare";
  challenger: {
    name: string;
    avatar: string;
    username: string;
  };
  receiver?: {
    name: string;
    avatar: string;
    username: string;
  };
  question?: string;
  action?: string;
  answer?: string;
  state: "SENT" | "ACCEPTED" | "ANSWERED" | "CHICKEN_OUT" | "PROOF_SUBMITTED";
  createdAt: string;
}

interface ChallengeCardProps {
  challenge: Challenge;
  timeRemaining?: number;
  formatTime: (seconds: number) => string;
  onAccept: (challenge: Challenge) => void;
  onSurrender: (challenge: Challenge) => void;
  onComplete: (challenge: Challenge) => void;
  isHighlighted?: boolean;
}

export default function ChallengeCard({
  challenge,
  timeRemaining,
  formatTime,
  onAccept,
  onSurrender,
  onComplete,
  isHighlighted,
}: ChallengeCardProps) {
  const isCompleted =
    challenge.state === "ANSWERED" || challenge.state === "PROOF_SUBMITTED";
  const isAccepted = challenge.state === "ACCEPTED";
  const isChickenOut = challenge.state === "CHICKEN_OUT";

  return (
    <div
      className={`bg-bg-secondary rounded-2xl p-4 border-2 transition-all duration-300 ${
        isHighlighted ? "border-neon-green shadow-lg" : "border-transparent"
      } ${isCompleted ? "opacity-75" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {challenge.challenger.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-white font-semibold">
              {challenge.challenger.name}
            </p>
            <p className="text-text-secondary text-sm">
              {challenge.type === "truth" ? "Truth" : "Dare"}
            </p>
          </div>
        </div>
        <div className="text-right">
          {timeRemaining !== undefined && timeRemaining > 0 && (
            <p className="text-neon-green font-mono text-sm">
              {formatTime(timeRemaining)}
            </p>
          )}
          <p className="text-text-secondary text-xs">
            {new Date(challenge.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-white text-lg mb-2">
          {challenge.type === "truth" ? challenge.question : challenge.action}
        </p>
      </div>

      <div className="flex space-x-2">
        {isCompleted ? (
          <div className="flex-1 bg-bg-tertiary rounded-xl py-3 px-4 text-center">
            <p className="text-neon-green font-semibold">
              Submitted for review
            </p>
          </div>
        ) : isChickenOut ? (
          <div className="flex-1 bg-red-900/30 rounded-xl py-3 px-4 text-center">
            <p className="text-red-400 font-semibold">Chicken Out</p>
          </div>
        ) : isAccepted ? (
          <>
            <button
              onClick={() => onSurrender(challenge)}
              className="flex-1 bg-red-900/30 hover:bg-red-900/50 rounded-xl py-3 px-4 text-red-400 font-semibold transition-colors"
            >
              Surrender
            </button>
            <button
              onClick={() => onComplete(challenge)}
              className="flex-1 bg-neon-green hover:bg-neon-green/90 rounded-xl py-3 px-4 text-black font-semibold transition-colors"
            >
              Complete
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onSurrender(challenge)}
              className="flex-1 bg-red-900/30 hover:bg-red-900/50 rounded-xl py-3 px-4 text-red-400 font-semibold transition-colors"
            >
              Refuse
            </button>
            <button
              onClick={() => onAccept(challenge)}
              className="flex-1 bg-neon-green hover:bg-neon-green/90 rounded-xl py-3 px-4 text-black font-semibold transition-colors"
            >
              Accept
            </button>
          </>
        )}
      </div>
    </div>
  );
}
