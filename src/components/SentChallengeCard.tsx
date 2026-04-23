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

interface SentChallengeCardProps {
  challenge: Challenge;
  onReview: (challenge: Challenge) => void;
}

export default function SentChallengeCard({ challenge, onReview }: SentChallengeCardProps) {
  const isCompleted = challenge.state === "ANSWERED" || challenge.state === "PROOF_SUBMITTED";
  const isPending = challenge.state === "SENT";

  return (
    <div
      className={`bg-bg-secondary rounded-2xl p-4 border-2 transition-all duration-300 border-transparent ${
        isCompleted ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {challenge.challenger.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-white font-semibold">{challenge.challenger.name}</p>
            <p className="text-text-secondary text-sm">
              {challenge.type === "truth" ? "Truth" : "Dare"} to {challenge.receiver?.name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-text-secondary text-xs">
            {new Date(challenge.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-white text-lg mb-2">
          {challenge.type === "truth" ? challenge.question : challenge.action}
        </p>
        {challenge.answer && (
          <p className="text-text-secondary text-sm italic">
            Answer: {challenge.answer}
          </p>
        )}
      </div>

      <div className="flex space-x-2">
        {isCompleted ? (
          <div className="flex-1 bg-bg-tertiary rounded-xl py-3 px-4 text-center">
            <p className="text-neon-green font-semibold">Completed</p>
          </div>
        ) : isPending ? (
          <div className="flex-1 bg-bg-tertiary rounded-xl py-3 px-4 text-center">
            <p className="text-yellow-400 font-semibold">Pending Response</p>
          </div>
        ) : (
          <button
            onClick={() => onReview(challenge)}
            className="flex-1 bg-neon-green hover:bg-neon-green/90 rounded-xl py-3 px-4 text-black font-semibold transition-colors"
          >
            Review
          </button>
        )}
      </div>
    </div>
  );
}
