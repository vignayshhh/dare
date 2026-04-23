"use client";

import { useGhostModeStore } from "@/stores/useGhostModeStore";

export function GhostModeTimer() {
  const { isActive, formattedTime } = useGhostModeStore();

  return (
    <div className="relative">
      <h1
        className="text-3xl font-bold text-white absolute inset-0"
        style={{
          textShadow: "0 0 8px rgba(74, 222, 128, 0.3)",
          marginLeft: "-8px",
          transition: "opacity 0.3s ease-in-out",
          opacity: isActive ? 0 : 1,
        }}
      >
        DARE
      </h1>
      <h1
        className="text-3xl font-bold text-white"
        style={{
          textShadow: "0 0 8px rgba(74, 222, 128, 0.3)",
          marginLeft: "-8px",
          transition: "opacity 0.3s ease-in-out",
          opacity: isActive ? 1 : 0,
        }}
      >
        {formattedTime}
      </h1>
    </div>
  );
}
