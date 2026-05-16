"use client";

import { ArrowLeft, Check, Sparkles } from "lucide-react";
import {
  getCommunityChallengeTitle,
  type CommunityChallenge,
} from "./communityChallengeData";

export function CommunityJoinSuccessScreen({
  challenge,
  onClose,
  onOpenHub,
}: {
  challenge: CommunityChallenge;
  onClose: () => void;
  onOpenHub?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[12000] overflow-hidden bg-[#030403]"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        overscrollBehavior: "contain",
      }}
    >
      <style>{`
        @keyframes communitySuccessBackdrop {
          from { opacity: 0; transform: scale(1.025); filter: blur(6px); }
          to { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @keyframes communitySuccessIn {
          from { opacity: 0; transform: translateY(22px) scale(0.965); filter: blur(12px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes communitySuccessTitleDrop {
          0% { opacity: 0; transform: translateY(-28px) scale(0.94); filter: blur(14px); }
          62% { opacity: 1; transform: translateY(4px) scale(1.015); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes communitySuccessHalo {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.66; }
          50% { transform: rotate(180deg) scale(1.05); opacity: 1; }
        }
        @keyframes communitySuccessOrbPop {
          0% { opacity: 0; transform: translateY(18px) scale(0.68); filter: blur(10px); }
          58% { opacity: 1; transform: translateY(-3px) scale(1.08); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes communitySuccessPulse {
          0% { transform: scale(0.82); opacity: 0; }
          52% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes communitySuccessButtonRise {
          from { opacity: 0; transform: translateY(26px) scale(0.96); filter: blur(10px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes communitySuccessSweep {
          0% { transform: translateX(-125%); }
          38% { transform: translateX(125%); }
          100% { transform: translateX(125%); }
        }
        .community-success-panel {
          animation: communitySuccessIn 0.64s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .community-success-bg {
          animation: communitySuccessBackdrop 0.58s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .community-success-title-card {
          animation: communitySuccessTitleDrop 0.82s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both;
        }
        .community-success-orb {
          animation: communitySuccessOrbPop 0.74s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
        }
        .community-success-orb::before {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: 999px;
          background: conic-gradient(from 140deg, rgba(74,222,128,0), rgba(74,222,128,0.88), rgba(14,165,233,0.58), rgba(74,222,128,0));
          animation: communitySuccessHalo 4.6s ease-in-out infinite;
        }
        .community-success-check {
          animation: communitySuccessPulse 0.62s cubic-bezier(0.16, 1, 0.3, 1) 0.74s both;
        }
        .community-success-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: communitySuccessSweep 3.2s ease-in-out 0.22s infinite;
          pointer-events: none;
        }
        .community-success-headline {
          animation-delay: 0.9s;
        }
        .community-success-copy {
          animation-delay: 1.04s;
        }
        .community-success-button {
          animation: communitySuccessButtonRise 0.72s cubic-bezier(0.16, 1, 0.3, 1) 1.16s both;
        }
      `}</style>
      <div
        className="community-success-bg absolute inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(74,222,128,0.24), transparent 28%), radial-gradient(circle at 18% 18%, rgba(14,165,233,0.11), transparent 24%), linear-gradient(180deg,#060806,#030403)",
          height: "100dvh",
          maxHeight: "100dvh",
          overscrollBehavior: "contain",
        }}
      >
        <div className="absolute inset-0 overflow-hidden px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close join success"
            className="app-pressable absolute left-4 top-[calc(var(--safe-area-top)+12px)] z-20 flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.045] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
          >
            <ArrowLeft size={20} />
          </button>

          <div
            className="mx-auto flex h-full w-full max-w-[430px] flex-col items-center justify-center overflow-hidden text-center"
            style={{
              paddingTop: "calc(var(--safe-area-top) + 56px)",
              paddingBottom: "calc(var(--safe-area-bottom) + 28px)",
            }}
          >
            <div
              className="community-success-title-card community-success-shine relative mx-auto h-[120px] w-full max-w-[330px] shrink-0 overflow-hidden rounded-[24px] border border-white/8 shadow-[0_22px_64px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]"
              style={{ background: challenge.banner }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.24)_36%,rgba(3,4,3,0.9)_100%)]" />
              <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 text-center">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/22 bg-[#4ade80]/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#bbf7d0] backdrop-blur-md">
                  <Sparkles size={13} />
                  Community Dare
                </div>
                <h1 className="max-w-[276px] text-[19px] font-black uppercase leading-[1.08] text-white drop-shadow-[0_12px_30px_rgba(0,0,0,0.56)]">
                  {getCommunityChallengeTitle(challenge)}
                </h1>
              </div>
            </div>

            <div className="community-success-orb relative mb-5 mt-7 flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full p-[3px] shadow-[0_0_90px_rgba(74,222,128,0.18)]">
              <div className="relative z-10 flex h-full w-full items-center justify-center rounded-full border border-[#4ade80]/22 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] text-[#86efac] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-18px_40px_rgba(74,222,128,0.055)]">
                <div className="community-success-check flex h-[66px] w-[66px] items-center justify-center rounded-full bg-[#4ade80] text-[#061006] shadow-[0_18px_46px_rgba(74,222,128,0.28)]">
                  <Check size={36} strokeWidth={3} />
                </div>
              </div>
            </div>
            <div className="community-success-panel community-success-headline text-[36px] font-black uppercase leading-none text-white">
              You're in
            </div>
            <div className="community-success-panel community-success-copy mt-3 max-w-[310px] text-[15px] font-semibold leading-relaxed text-[#94a3b8]">
              Your community dare is ready. Upload daily proof to stay in.
            </div>
            <button
              type="button"
              onClick={onOpenHub ?? onClose}
              className="app-pressable community-success-button mt-7 flex min-h-[58px] w-full max-w-[390px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-[15px] font-black uppercase tracking-[0.05em] text-[#061006] shadow-[0_18px_44px_rgba(74,222,128,0.3)]"
            >
              Open Dares Hub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
