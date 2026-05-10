"use client";

import { Home, Target, User, Plus, Grid3X3 } from "lucide-react";

type Screen = "main" | "dares" | "profile" | "feed";

interface BottomNavigationProps {
  currentScreen: Screen;
  onScreenChange: (screen: Screen) => void;
  onCreateClick: () => void;
}

export function BottomNavigation({
  currentScreen,
  onScreenChange,
  onCreateClick,
}: BottomNavigationProps) {
  const navItems = [
    { id: "dares" as Screen, label: "Dares", icon: Target },
    { id: "feed" as Screen, label: "Home", icon: Home },
    { id: "main" as Screen, label: "Feed", icon: Grid3X3 },
  ];

  return (
    <div
      className="app-bottom-nav-motion fixed bottom-0 left-0 right-0 safe-area-x bg-[#0a0f0a]/95 backdrop-blur-lg border-t border-[#2a2a2a] z-9999"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "rgba(10, 15, 10, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(42, 42, 42, 1)",
        paddingBottom: "var(--safe-area-bottom)",
      }}
    >
      <div
        className="flex items-center justify-around py-2"
        style={{ minHeight: "var(--bottom-nav-content-height)" }}
      >
        {/* Left Navigation Items */}
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onScreenChange(item.id)}
              className={`app-pressable flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${
                isActive ? "text-[#4ade80]" : "text-[#94a3b8] hover:text-white"
              }`}
            >
              <Icon size={24} className="mb-1" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}

        {/* Center Plus Icon */}
        <button
          onClick={onCreateClick}
          className="app-pressable flex flex-col items-center justify-center p-3 rounded-full bg-[#4ade80] text-black hover:bg-[#22c55e] transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          <Plus size={28} />
        </button>

        {/* Right Navigation Items */}
        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onScreenChange(item.id)}
              className={`app-pressable flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${
                isActive ? "text-[#4ade80]" : "text-[#94a3b8] hover:text-white"
              }`}
            >
              <Icon size={24} className="mb-1" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}

        {/* Profile - Rightmost */}
        <button
          onClick={() => onScreenChange("profile")}
          className={`app-pressable flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${
            currentScreen === "profile"
              ? "text-[#4ade80]"
              : "text-[#94a3b8] hover:text-white"
          }`}
        >
          <User size={24} className="mb-1" />
          <span className="text-xs font-medium">Profile</span>
        </button>
      </div>
    </div>
  );
}
