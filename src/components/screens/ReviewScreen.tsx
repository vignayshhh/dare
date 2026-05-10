"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  X,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Eye,
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
    answer?: string;
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
            className="block w-full overflow-hidden rounded-[24px] text-left"
            aria-label="Open proof image fullscreen"
          >
            <img
              src={url}
              alt="Proof submission"
              className="h-64 w-full object-cover"
            />
          </button>
        );

      case "video":
        return (
          <button
            type="button"
            onClick={openFullscreen}
            className="relative block w-full overflow-hidden rounded-[24px] text-left"
            aria-label="Open proof video fullscreen"
          >
            <img
              src={thumbnail || url}
              alt="Video thumbnail"
              className="h-64 w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <div className="ml-1 h-0 w-0 border-y-[8px] border-y-transparent border-l-[12px] border-l-white"></div>
              </div>
            </div>
            <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-white">
              VIDEO
            </div>
          </button>
        );

      case "audio":
        return (
          <button
            type="button"
            onClick={openFullscreen}
            className="w-full rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(23,24,22,0.98),rgba(16,18,16,0.98))] p-6 text-left"
            aria-label="Open proof audio fullscreen"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4ade80]/20">
                <MessageSquare size={20} className="text-[#86efac]" />
              </div>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                  <div className="h-full w-1/3 rounded-full bg-[#4ade80]"></div>
                </div>
                <p className="mt-1 text-xs text-[#9aa79a]">Voice Recording</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4ade80] text-black">
                <div className="h-0 w-0 border-y-[4px] border-y-transparent border-l-[6px] border-l-black"></div>
              </div>
            </div>
          </button>
        );

      default:
        return null;
    }
  };

  const challengePrompt =
    challenge.type === "truth" ? challenge.question : challenge.action;
  const submittedDate =
    typeof challenge.createdAt === "string"
      ? new Date(challenge.createdAt).toLocaleDateString()
      : (challenge.createdAt as any)?.toDate?.()?.toLocaleDateString() ||
        "Recently";

  return (
    <div
      className={`screen-container ${
        challenge.type === "truth"
          ? "bg-[radial-gradient(circle_at_top,#16291d_0%,#0c120d_38%,#070907_100%)]"
          : "bg-[radial-gradient(circle_at_top,#2b2110_0%,#11130e_34%,#080906_100%)]"
      }`}
    >
      <div className="nav-header">
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all hover:bg-white/10"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="text-center">
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
                challenge.type === "truth" ? "text-[#7dd3a7]" : "text-[#fbbf24]"
              }`}
            >
              Challenger Review
            </p>
            <h1 className="text-lg font-bold text-white">Review Submission</h1>
          </div>
          <div className="w-11" />
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-5">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,21,0.98),rgba(12,15,13,0.98))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.45)]">
            <div
              className={`pointer-events-none absolute inset-x-8 top-0 h-px ${
                challenge.type === "truth"
                  ? "bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]"
                  : "bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.42),transparent)]"
              }`}
            />
            <div
              className={`pointer-events-none absolute -right-6 top-0 h-28 w-28 rounded-full blur-3xl ${
                challenge.type === "truth"
                  ? "bg-[#4ade80]/10"
                  : "bg-[#f59e0b]/10"
              }`}
            />

            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar
                    src={
                      cachedReceiver?.avatarUrl || challenge.receiver?.avatar || ""
                    }
                    alt={resolvedReceiverName}
                    size="lg"
                    userId={challenge.receiverId}
                    username={resolvedReceiverUsername}
                  />
                  <div
                    className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border text-black shadow-[0_0_18px_rgba(255,255,255,0.12)] ${
                      challenge.type === "truth"
                        ? "border-[#112117] bg-[#4ade80]"
                        : "border-[#181109] bg-[#f59e0b]"
                    }`}
                  >
                    <Sparkles size={11} />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#91a091]">
                    Submission from
                  </p>
                  <h3 className="font-semibold text-white">
                    {resolvedReceiverName}
                  </h3>
                  <p className="text-sm text-[#91a091]">
                    @{resolvedReceiverUsername}
                  </p>
                </div>
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                  challenge.type === "truth"
                    ? "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]"
                    : "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fbbf24]"
                }`}
              >
                {challenge.type}
              </div>
            </div>

            <div className="mb-4 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(26,31,28,0.98),rgba(18,21,19,0.98))] p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8ea18e]">
                {challenge.type === "truth" ? "You asked" : "You dared them to"}
              </p>
              <p className="text-lg font-semibold leading-relaxed text-white">
                {challengePrompt}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="mb-1 flex items-center gap-2 text-[#dce4dc]">
                  <Clock size={14} />
                  <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                    Submitted
                  </span>
                </div>
                <p className="text-sm text-[#bfcbbf]">{submittedDate}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="mb-1 flex items-center gap-2 text-[#dce4dc]">
                  <Eye size={14} />
                  <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                    Your call
                  </span>
                </div>
                <p className="text-sm text-[#bfcbbf]">
                  Review carefully before publishing or rejecting.
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,20,0.98),rgba(13,15,13,0.98))] p-5 shadow-[0_20px_54px_rgba(0,0,0,0.36)]">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck
                size={18}
                className={
                  challenge.type === "truth" ? "text-[#86efac]" : "text-[#fbbf24]"
                }
              />
              <h3 className="text-lg font-bold text-white">Their submission</h3>
            </div>

            {challenge.type === "truth" && challenge.answer && (
              <div className="mb-4 rounded-[24px] border border-[#4ade80]/14 bg-[linear-gradient(180deg,rgba(24,31,26,0.98),rgba(17,21,18,0.98))] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#86efac]">
                  Answer
                </p>
                <p className="text-base leading-relaxed text-white">
                  {challenge.answer}
                </p>
              </div>
            )}

            {challenge.proof ? (
              <div className="space-y-3">
                {challenge.type === "dare" && (
                  <p className="text-sm text-[#8ea18e]">
                    Tap the proof to view it fullscreen.
                  </p>
                )}
                {renderProofMedia()}
              </div>
            ) : challenge.type === "truth" && !challenge.answer ? (
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm text-[#96a496]">
                No answer or proof is available on this submission yet.
              </div>
            ) : null}
          </div>

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,21,19,0.98),rgba(12,14,12,0.98))] p-5 shadow-[0_20px_54px_rgba(0,0,0,0.36)]">
            <h3 className="mb-4 text-lg font-bold text-white">Your Decision</h3>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setDecision("accept")}
                className={`rounded-[24px] border px-4 py-5 text-left transition-all ${
                  decision === "accept"
                    ? "border-[#4ade80]/35 bg-[#4ade80]/12 shadow-[0_0_28px_rgba(74,222,128,0.14)]"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <CheckCircle
                  size={22}
                  className={
                    decision === "accept" ? "text-[#86efac]" : "text-white"
                  }
                />
                <p className="mt-4 text-base font-bold text-white">Accept</p>
                <p className="mt-1 text-sm text-[#98a698]">
                  Publish this as a valid completion.
                </p>
              </button>

              <button
                onClick={() => setDecision("reject")}
                className={`rounded-[24px] border px-4 py-5 text-left transition-all ${
                  decision === "reject"
                    ? "border-[#ff6b6b]/35 bg-[#ff6b6b]/12 shadow-[0_0_28px_rgba(255,107,107,0.12)]"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <X
                  size={22}
                  className={decision === "reject" ? "text-[#ff8e8e]" : "text-white"}
                />
                <p className="mt-4 text-base font-bold text-white">Reject</p>
                <p className="mt-1 text-sm text-[#98a698]">
                  Send it to validation instead of publishing.
                </p>
              </button>
            </div>
          </div>

          {decision && (
            <div
              className={`rounded-[28px] border p-5 ${
                decision === "accept"
                  ? "border-[#4ade80]/20 bg-[#4ade80]/10"
                  : "border-[#ff6b6b]/20 bg-[#ff6b6b]/10"
              }`}
            >
              {decision === "accept" ? (
                <div className="flex items-start gap-3">
                  <CheckCircle size={20} className="mt-0.5 text-[#86efac]" />
                  <div className="space-y-2">
                    <h4 className="font-semibold text-white">
                      Accepting means
                    </h4>
                    <p className="text-sm text-[#c8d6c8]">
                      This will be published to feed, added to profiles, open to
                      public voting, and count as completed.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <X size={20} className="mt-0.5 text-[#ff8e8e]" />
                  <div className="space-y-2">
                    <h4 className="font-semibold text-white">
                      Rejecting means
                    </h4>
                    <p className="text-sm text-[#d7c3c3]">
                      It moves to friends validation, avoids main feed
                      publishing, and can be overridden by community review.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!decision || isSubmitting}
            className={`w-full rounded-[22px] px-5 py-4 text-base font-bold transition-all ${
              decision === "accept"
                ? "bg-[linear-gradient(135deg,#4ade80_0%,#22c55e_100%)] text-black shadow-[0_16px_32px_rgba(34,197,94,0.22)]"
                : decision === "reject"
                  ? "bg-[linear-gradient(135deg,#ff7a7a_0%,#ff5b5b_100%)] text-white shadow-[0_16px_32px_rgba(255,91,91,0.2)]"
                  : "bg-white/[0.08] text-white"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isSubmitting
              ? "Processing..."
              : `Confirm ${decision?.toUpperCase() || "Decision"}`}
          </button>
        </div>
      </div>

      {fullscreenProof && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[3000] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setFullscreenProof(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenProof(null);
            }}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white"
            aria-label="Close fullscreen proof"
          >
            <X size={22} />
          </button>

          {fullscreenProof.type === "image" && (
            <img
              src={fullscreenProof.url}
              alt="Proof fullscreen"
              className="max-h-[90vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {fullscreenProof.type === "video" && (
            <video
              src={fullscreenProof.url}
              poster={fullscreenProof.thumbnail}
              controls
              autoPlay
              className="max-h-[90vh] max-w-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {fullscreenProof.type === "audio" && (
            <div
              className="w-full max-w-md rounded-xl border border-white/10 bg-[#111] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#4ade80]/20">
                <MessageSquare size={28} className="text-[#86efac]" />
              </div>
              <h3 className="mb-4 text-center text-lg font-bold text-white">
                Voice Recording
              </h3>
              <audio
                src={fullscreenProof.url}
                controls
                autoPlay
                className="w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
