"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  X,
  MessageSquare,
} from "lucide-react";
import "@/styles/design-system.css";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";

interface ReviewScreenProps {
  challenge: {
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
    action?: string;
    answer?: string; // Add answer field for truths
    proof?: {
      type: "image" | "video" | "audio";
      url: string;
      thumbnail?: string;
    };
    createdAt: string;
  };
  onBack: () => void;
  onAccept: (challengeId: string, comment?: string) => Promise<void> | void;
  onReject: (challengeId: string, comment?: string) => Promise<void> | void;
}

export function ReviewScreen({
  challenge,
  onBack,
  onAccept,
  onReject,
}: ReviewScreenProps) {
  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fullscreenProof, setFullscreenProof] = useState<{
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
  } | null>(null);

  // Resolve names from profileDataStore
  const reviewProfiles = useProfileDataStore((s) => s.userProfiles);
  const cachedReceiver = challenge.receiverId
    ? reviewProfiles[challenge.receiverId]
    : null;
  const resolvedReceiverName =
    cachedReceiver?.displayName || challenge.receiver?.name || "Unknown User";
  const resolvedReceiverUsername =
    cachedReceiver?.username || challenge.receiver?.username || "receiver";

  const handleSubmit = async () => {
    if (!decision) return;

    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (decision === "accept") {
      await onAccept(challenge.id);
    } else {
      await onReject(challenge.id);
    }
  };

  const renderProofMedia = () => {
    if (!challenge.proof) return null;

    const { type, url, thumbnail } = challenge.proof;
    const openFullscreen = () => setFullscreenProof({ type, url, thumbnail });

    switch (type) {
      case "image":
        return (
          <button
            type="button"
            onClick={openFullscreen}
            className="block w-full rounded-xl overflow-hidden text-left cursor-pointer"
            aria-label="Open proof image fullscreen"
          >
            <img
              src={url}
              alt="Proof submission"
              className="w-full h-64 object-cover"
            />
          </button>
        );

      case "video":
        return (
          <button
            type="button"
            onClick={openFullscreen}
            className="relative block w-full rounded-xl overflow-hidden text-left cursor-pointer"
            aria-label="Open proof video fullscreen"
          >
            <img
              src={thumbnail || url}
              alt="Video thumbnail"
              className="w-full h-64 object-cover"
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[8px] border-y-transparent ml-1"></div>
              </div>
            </div>
            <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
              VIDEO
            </div>
          </button>
        );

      case "audio":
        return (
          <button
            type="button"
            onClick={openFullscreen}
            className="w-full bg-[#2a2a2a] rounded-xl p-6 border border-border-secondary text-left cursor-pointer"
            aria-label="Open proof audio fullscreen"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-accent-primary/20 rounded-full flex items-center justify-center">
                <MessageSquare size={20} className="text-accent-primary" />
              </div>
              <div className="flex-1">
                <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
                  <div className="bg-accent-primary h-full w-1/3 rounded-full"></div>
                </div>
                <p className="text-text-secondary text-xs mt-1">
                  Voice Recording
                </p>
              </div>
              <div className="btn-icon btn-ghost">
                <div className="w-8 h-8 bg-accent-primary rounded-full flex items-center justify-center">
                  <div className="w-0 h-0 border-l-[6px] border-l-black border-y-[4px] border-y-transparent"></div>
                </div>
              </div>
            </div>
          </button>
        );

      default:
        return null;
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
          <h1 className="text-xl font-bold text-white">Review Submission</h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {/* Challenge Card */}
        <div className="card mb-6">
          {/* Receiver Info */}
          <div className="flex items-center space-x-3 mb-4">
            <Avatar
              src={
                cachedReceiver?.avatarUrl || challenge.receiver?.avatar || ""
              }
              alt={resolvedReceiverName}
              size="lg"
              userId={challenge.receiverId}
              username={resolvedReceiverUsername}
            />
            <div>
              <h3 className="font-semibold text-white">
                {resolvedReceiverName}
              </h3>
              <p className="text-text-secondary text-sm">
                @{resolvedReceiverUsername}
              </p>
            </div>
          </div>

          {/* Challenge Type Badge */}
          <div
            className={`inline-flex px-3 py-1 rounded-full text-xs font-bold mb-4 ${
              challenge.type === "truth"
                ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30"
                : "bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30"
            }`}
          >
            {challenge.type.toUpperCase()}
          </div>

          {/* Challenge Content */}
          <div className="mb-6">
            <p className="text-text-secondary text-sm mb-2">
              {challenge.type === "truth" ? "You asked:" : "You dared them to:"}
            </p>
            <div
              className={`rounded-xl p-4 border-l-4 ${
                challenge.type === "truth"
                  ? "bg-[#2a2a2a] border-[#4ade80]"
                  : "bg-[#2a2a2a] border-[#f59e0b]"
              }`}
            >
              <p className="text-white font-semibold text-lg leading-relaxed">
                {challenge.type === "truth"
                  ? challenge.question
                  : challenge.action}
              </p>
            </div>
          </div>

          {/* Their Answer/Proof */}
          <div className="mb-6">
            <p className="text-text-secondary text-sm mb-3">
              Their submission:
            </p>

            {/* Show answer for truths */}
            {challenge.type === "truth" && challenge.answer && (
              <div className="bg-[#2a2a2a] rounded-xl p-4 border-l-4 border-[#4ade80] mb-4">
                <p className="text-white font-medium text-base leading-relaxed">
                  {challenge.answer}
                </p>
              </div>
            )}

            {/* Show proof media if available */}
            {challenge.type === "truth" && renderProofMedia()}
          </div>

          {/* Timestamp */}
          <div className="flex items-center space-x-2 text-text-secondary text-xs">
            <Clock size={12} />
            <span>
              Submitted{" "}
              {typeof challenge.createdAt === "string"
                ? new Date(challenge.createdAt).toLocaleDateString()
                : (challenge.createdAt as any)
                    ?.toDate?.()
                    ?.toLocaleDateString() || "Recently"}
            </span>
          </div>
        </div>

        {/* Submitted Proof Display */}
        {challenge.proof && challenge.type === "dare" && (
          <div className="card mb-6">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
              <CheckCircle size={20} className="text-[#4ade80]" />
              <span>Submitted Proof</span>
            </h3>
            {renderProofMedia()}
            <p className="text-text-secondary text-xs mt-3 text-center">
              Tap proof to view fullscreen
            </p>
          </div>
        )}

        {/* Decision Section */}
        <div className="card mb-6">
          <h3 className="text-white font-bold text-lg mb-4">Your Decision</h3>

          {/* Decision Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setDecision("accept")}
              className={`btn btn-primary py-4 px-4 font-semibold flex items-center justify-center space-x-2 ${
                decision === "accept" ? "" : ""
              }`}
            >
              <CheckCircle size={20} />
              <span>ACCEPT</span>
            </button>

            <button
              onClick={() => setDecision("reject")}
              className={`btn btn-secondary py-4 px-4 font-semibold flex items-center justify-center space-x-2 ${
                decision === "reject" ? "" : ""
              }`}
            >
              <X size={20} />
              <span>REJECT</span>
            </button>
          </div>
        </div>

        {/* Decision Info */}
        {decision && (
          <div className="card mb-6">
            {decision === "accept" ? (
              <div className="flex items-start space-x-3">
                <CheckCircle size={20} className="text-accent-primary mt-1" />
                <div>
                  <h4 className="text-white font-semibold mb-1">
                    Accepting means:
                  </h4>
                  <ul className="text-text-secondary text-sm space-y-1">
                    <li>• This will be published to Feed</li>
                    <li>• Added to both profiles</li>
                    <li>• Enables REAL/FAKE voting</li>
                    <li>• Counts toward completed dares</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex items-start space-x-3">
                <X size={20} className="text-accent-error mt-1" />
                <div>
                  <h4 className="text-white font-semibold mb-1">
                    Rejecting means:
                  </h4>
                  <ul className="text-text-secondary text-sm space-y-1">
                    <li>• Goes to friends validation feed</li>
                    <li>• Friends can vote to override</li>
                    <li>• Not published to main feed</li>
                    <li>• Final if friends agree</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!decision || isSubmitting}
          className={`btn btn-primary w-full py-4 text-base font-semibold ${
            !decision || isSubmitting ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isSubmitting
            ? "Processing..."
            : `Confirm ${decision?.toUpperCase() || "Decision"}`}
        </button>
      </div>

      {fullscreenProof && (
        <div
          className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setFullscreenProof(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenProof(null);
            }}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center"
            aria-label="Close fullscreen proof"
          >
            <X size={22} />
          </button>

          {fullscreenProof.type === "image" && (
            <img
              src={fullscreenProof.url}
              alt="Proof fullscreen"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {fullscreenProof.type === "video" && (
            <video
              src={fullscreenProof.url}
              poster={fullscreenProof.thumbnail}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {fullscreenProof.type === "audio" && (
            <div
              className="w-full max-w-md bg-[#111] border border-white/10 rounded-xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <MessageSquare size={28} className="text-accent-primary" />
              </div>
              <h3 className="text-white text-lg font-bold text-center mb-4">
                Voice Recording
              </h3>
              <audio src={fullscreenProof.url} controls autoPlay className="w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
