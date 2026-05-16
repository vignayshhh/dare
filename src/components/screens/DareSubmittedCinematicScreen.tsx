"use client";

import { Send, Sparkles } from "lucide-react";

interface DareSubmittedCinematicScreenProps {
  recipientLabel?: string;
  isExiting?: boolean;
}

export function DareSubmittedCinematicScreen({
  recipientLabel,
  isExiting = false,
}: DareSubmittedCinematicScreenProps) {
  const subtitle = recipientLabel
    ? `Your proof is now under review for ${recipientLabel}.`
    : "Your proof is now under review.";

  return (
    <div className="screen-container relative h-[100dvh] max-h-[100dvh] items-center justify-center overflow-hidden bg-[#050805]">
      <div
        className="absolute inset-0"
        style={{
          animation: isExiting
            ? "dareSubmittedBackdropOut 0.7s ease forwards"
            : "dareSubmittedBackdropIn 0.4s ease forwards",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.2),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.15),transparent_30%),radial-gradient(circle_at_90%_72%,rgba(20,184,166,0.11),transparent_28%),linear-gradient(180deg,#060806_0%,#08110e_46%,#030403_100%)]" />
        <div className="absolute inset-0 backdrop-blur-xl" />
        <div className="absolute left-1/2 top-[13%] h-72 w-72 -translate-x-1/2 rounded-full bg-[#79d99a]/14 blur-3xl" />
        <div className="absolute bottom-[12%] right-[10%] h-44 w-44 rounded-full bg-[#14b8a6]/8 blur-3xl" />
        <div className="absolute left-[8%] top-[28%] h-36 w-36 rounded-full bg-[#38bdf8]/8 blur-3xl" />
      </div>

      <div
        className="relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center px-8 text-center"
        style={{
          animation: isExiting
            ? "dareSubmittedScreenOut 0.65s ease forwards"
            : "dareSubmittedScreenIn 0.72s cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        <div className="relative mx-auto mb-12 flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
          <div
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_rgba(121,217,154,0.22),_rgba(121,217,154,0.02)_65%,_transparent_72%)]"
            style={{ animation: "dareSubmittedHalo 2.2s ease-in-out infinite" }}
          />
          <div
            className="absolute inset-2 rounded-full border border-[#79d99a]/35"
            style={{ animation: "dareSubmittedRing 2.6s ease-out infinite" }}
          />
          <div
            className="absolute inset-6 rounded-full border border-white/12"
            style={{
              animation: "dareSubmittedRing 2.6s ease-out infinite 0.5s",
            }}
          />

          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-full border border-[#79d99a]/45 bg-[linear-gradient(180deg,rgba(121,217,154,0.24),rgba(20,184,166,0.08))] shadow-[0_0_60px_rgba(121,217,154,0.22)] sm:h-44 sm:w-44"
            style={{
              animation:
                "dareSubmittedIconPop 0.85s cubic-bezier(0.22,1,0.36,1) forwards",
            }}
          >
            <Send
              size={78}
              className="translate-x-1 text-[#a8f0bf] sm:h-20 sm:w-20"
            />
          </div>

          <Sparkles
            size={26}
            className="absolute right-4 top-5 text-[#d7ffe8]"
            style={{
              animation: "dareSubmittedSparkle 1.8s ease-in-out infinite",
            }}
          />
          <Sparkles
            size={20}
            className="absolute bottom-6 left-3 text-[#7dd3fc]"
            style={{
              animation: "dareSubmittedSparkle 1.8s ease-in-out infinite 0.35s",
            }}
          />
        </div>

        <div
          className="max-w-md rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,39,39,0.58),rgba(4,14,16,0.42))] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md"
          style={{ animation: "dareSubmittedFloat 3.2s ease-in-out infinite" }}
        >
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#79d99a]/20 bg-[#79d99a]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#a8f0bf]">
            <Sparkles size={13} />
            Under review
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Dare Submitted
          </h1>
          <p className="mt-4 text-base font-semibold leading-7 text-[#c7d2c9] sm:text-lg">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export default DareSubmittedCinematicScreen;
