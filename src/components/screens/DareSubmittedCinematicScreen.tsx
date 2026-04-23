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
    <div className="screen-container relative items-center justify-center overflow-hidden bg-[#050805]">
      <div
        className="absolute inset-0"
        style={{
          animation: isExiting
            ? "dareSubmittedBackdropOut 0.7s ease forwards"
            : "dareSubmittedBackdropIn 0.4s ease forwards",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,255,136,0.18),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(255,255,255,0.08),_transparent_26%),linear-gradient(180deg,_rgba(4,6,4,0.94),_rgba(5,8,5,0.99))]" />
        <div className="absolute inset-0 backdrop-blur-xl" />
        <div className="absolute left-1/2 top-[14%] h-80 w-80 -translate-x-1/2 rounded-full bg-[#00ff88]/14 blur-3xl" />
        <div className="absolute bottom-[12%] right-[10%] h-44 w-44 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute left-[8%] top-[28%] h-36 w-36 rounded-full bg-[#00ff88]/8 blur-3xl" />
      </div>

      <div
        className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-8 text-center"
        style={{
          animation: isExiting
            ? "dareSubmittedScreenOut 0.65s ease forwards"
            : "dareSubmittedScreenIn 0.72s cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        <div className="relative mx-auto mb-12 flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
          <div
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_rgba(0,255,136,0.22),_rgba(0,255,136,0.02)_65%,_transparent_72%)]"
            style={{ animation: "dareSubmittedHalo 2.2s ease-in-out infinite" }}
          />
          <div
            className="absolute inset-2 rounded-full border border-[#00ff88]/35"
            style={{ animation: "dareSubmittedRing 2.6s ease-out infinite" }}
          />
          <div
            className="absolute inset-6 rounded-full border border-white/12"
            style={{
              animation: "dareSubmittedRing 2.6s ease-out infinite 0.5s",
            }}
          />

          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-full border border-[#00ff88]/45 bg-[linear-gradient(180deg,rgba(0,255,136,0.28),rgba(0,255,136,0.08))] shadow-[0_0_60px_rgba(0,255,136,0.24)] sm:h-44 sm:w-44"
            style={{
              animation:
                "dareSubmittedIconPop 0.85s cubic-bezier(0.22,1,0.36,1) forwards",
            }}
          >
            <Send
              size={78}
              className="translate-x-1 text-[#8bffbf] sm:h-20 sm:w-20"
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
            className="absolute bottom-6 left-3 text-[#9fffc7]"
            style={{
              animation: "dareSubmittedSparkle 1.8s ease-in-out infinite 0.35s",
            }}
          />
        </div>

        <div
          className="max-w-md"
          style={{ animation: "dareSubmittedFloat 3.2s ease-in-out infinite" }}
        >
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Dare Submitted
          </h1>
          <p className="mt-5 text-base leading-7 text-[#c7d2c9] sm:text-lg">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export default DareSubmittedCinematicScreen;
