"use client";

import { BadgeCheck, Flame, Home, User, Plus } from "lucide-react";

type Screen = "truth" | "main" | "dares" | "profile" | "feed";

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
    { id: "truth" as Screen, label: "Feed", icon: BadgeCheck },
    { id: "main" as Screen, label: "Dares", icon: Flame },
    { id: "feed" as Screen, label: "Home", icon: Home },
  ];

  return (
    <div
      className="app-bottom-nav-motion fixed bottom-0 left-0 right-0 backdrop-blur-lg z-9999"
      style={{
        position: "fixed",
        bottom: "var(--bottom-nav-bottom-offset)",
        left: "max(var(--safe-area-left), var(--bottom-nav-inline-inset))",
        right: "max(var(--safe-area-right), var(--bottom-nav-inline-inset))",
        zIndex: 9999,
        background:
          "radial-gradient(ellipse at 28% -42%, rgba(74,222,128,0.1), transparent 66%), radial-gradient(ellipse at 76% -34%, rgba(14,165,233,0.06), transparent 64%), linear-gradient(180deg, rgba(6,8,6,0.93) 0%, rgba(10,15,10,0.92) 54%, rgba(3,4,3,0.93) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: "var(--bottom-nav-radius)",
        overflow: "hidden",
        paddingBottom: "var(--bottom-nav-bottom-padding)",
        boxShadow:
          "0 -12px 32px rgba(0, 0, 0, 0.24)",
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
