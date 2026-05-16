"use client";

import { useGhostModeStore } from "@/stores/useGhostModeStore";

export function GhostModeTimer({
  onDareLongPress,
}: {
  onDareLongPress?: () => void;
}) {
  const { isActive, formattedTime } = useGhostModeStore();

  return (
    <div
      className="relative flex min-w-[88px] items-center justify-center sm:min-w-[148px]"
      onContextMenu={(event) => {
        if (!onDareLongPress) return;
        event.preventDefault();
        onDareLongPress();
      }}
    >
      <style>{`
        @keyframes dareHeaderDotBlink {
          0%, 100% {
            opacity: 0.82;
            transform: translateY(-5px) scale(0.98);
            box-shadow: 0 0 5px rgba(74,222,128,0.26);
          }
          50% {
            opacity: 0.96;
            transform: translateY(-5px) scale(1.03);
            box-shadow:
              0 0 6px rgba(74,222,128,0.38),
              0 0 10px rgba(74,222,128,0.18);
          }
        }
      `}</style>
      <h1
        className="absolute inset-0 -translate-y-1.5 text-center text-[28px] font-black tracking-[0.03em] text-white"
        style={{
          textShadow: "0 0 10px rgba(74, 222, 128, 0.22)",
          transition: "opacity 0.25s ease-in-out",
          opacity: isActive ? 0 : 1,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <span>DARE</span>
        <span
          style={{
            display: "inline-block",
            marginLeft: "3px",
            verticalAlign: "sub",
            transform: "translateY(-5px)",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#4ade80",
            animation: "dareHeaderDotBlink 2.6s ease-in-out infinite",
          }}
        />
      </h1>
      <div
        className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#141414]/95 px-3 py-1.5 backdrop-blur-sm shadow-[0_8px_24px_rgba(74,222,128,0.15)]"
        style={{
          transition: "opacity 0.25s ease-in-out",
          opacity: isActive ? 1 : 0,
        }}
      >
        <span className="h-2 w-2 rounded-full bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.9)] animate-pulse" />
        <span className="text-[11px] font-bold leading-none text-white tracking-wide">
          {formattedTime}
        </span>
      </div>
    </div>
  );
}
