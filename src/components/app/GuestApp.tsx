"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  AtSign,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Eye,
  Flame,
  Heart,
  Lock,
  MessageCircle,
  MessageSquare,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Target,
  User,
  Users,
  X,
  BellRing,
} from "lucide-react";
import "@/styles/design-system.css";

// Screen size breakpoints
const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
};

// Hook to detect screen size
function useScreenSize() {
  const [screenSize, setScreenSize] = useState<"mobile" | "tablet" | "desktop">(
    "mobile",
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS.desktop) {
        setScreenSize("desktop");
      } else if (width >= BREAKPOINTS.tablet) {
        setScreenSize("tablet");
      } else {
        setScreenSize("mobile");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Return default during SSR to avoid hydration mismatch
  return mounted ? screenSize : "mobile";
}

// Desktop Navigation Component
function DesktopNavigation({
  currentScreen,
  onNavigate,
}: {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <div className="hidden md:flex items-center justify-between px-8 py-4 bg-black border-b border-white/10">
      <div className="flex items-center gap-8">
        <h1 className="text-2xl font-bold text-white lg:text-3xl">DARE</h1>
        <nav className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onNavigate("feed")}
            className={`text-sm font-medium transition-colors ${
              currentScreen === "feed"
                ? "text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => onNavigate("chat-list")}
            className={`text-sm font-medium transition-colors ${
              currentScreen === "chat-list" || currentScreen === "chat"
                ? "text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            Messages
          </button>
          <button
            type="button"
            onClick={() => onNavigate("alerts")}
            className={`text-sm font-medium transition-colors ${
              currentScreen === "alerts"
                ? "text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            Alerts
          </button>
          <button
            type="button"
            onClick={() => onNavigate("profile")}
            className={`text-sm font-medium transition-colors ${
              currentScreen === "profile"
                ? "text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            Profile
          </button>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search
            size={20}
            className="text-white/60 absolute left-3 top-1/2 -translate-y-1/2"
          />
          <input
            type="text"
            placeholder="Search"
            className="bg-white/10 border border-white/20 rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 w-64"
          />
        </div>
      </div>
    </div>
  );
}

import { BottomNavigation } from "../navigation/BottomNavigation";
import { GuestMainScreen } from "./GuestMainScreen";
import { usePwaScreenHistory } from "../../hooks/usePwaScreenHistory";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  guestUser,
  guestUsers,
  guestStories,
  guestFeedPosts,
  guestTruthCards,
  guestDareCards,
  guestConversations,
  guestAlerts,
  guestSusAlerts,
  guestActivity,
  type GuestUserProfile,
  type GuestConversation,
  type GuestActivity,
} from "../../mock/guestModeData";

// ---------------------------------------------------------------------------
// Heart Burst Animation Types & Constants
// ---------------------------------------------------------------------------

interface HeartBurst {
  id: number;
  x: number;
  y: number;
  scale: number;
  colorIdx: number;
}

const DOUBLE_TAP_DELAY = 320;
const BURST_LIFETIME = 950;
const HEART_SIZES = [52, 68, 44, 60, 56];
const HEART_COLORS = [
  "#ff3b6b",
  "#ff6b9d",
  "#ff4d6d",
  "#ff758c",
  "#ff8fa3",
  "#f43f5e",
];

// Mood block theme helper
function getMoodTheme(mood: string) {
  if (mood === "angry") {
    return {
      accent: "#ff6b5f",
      accentSoft: "rgba(255,107,95,0.24)",
      accentGlow: "rgba(255,107,95,0.42)",
      panel:
        "linear-gradient(180deg, rgba(58,18,18,0.96) 0%, rgba(18,10,10,0.98) 100%)",
      label: "Heat Rising",
    };
  }
  if (mood === "crying") {
    return {
      accent: "#69b7ff",
      accentSoft: "rgba(105,183,255,0.24)",
      accentGlow: "rgba(105,183,255,0.4)",
      panel:
        "linear-gradient(180deg, rgba(16,35,58,0.96) 0%, rgba(9,16,28,0.98) 100%)",
      label: "Soft Silence",
    };
  }
  if (mood === "irritated") {
    return {
      accent: "#ffb347",
      accentSoft: "rgba(255,179,71,0.24)",
      accentGlow: "rgba(255,179,71,0.4)",
      panel:
        "linear-gradient(180deg, rgba(56,34,10,0.96) 0%, rgba(22,15,9,0.98) 100%)",
      label: "Tension High",
    };
  }
  if (mood === "depressed") {
    return {
      accent: "#9aa4b8",
      accentSoft: "rgba(154,164,184,0.22)",
      accentGlow: "rgba(154,164,184,0.34)",
      panel:
        "linear-gradient(180deg, rgba(24,28,38,0.96) 0%, rgba(12,14,18,0.98) 100%)",
      label: "Low Tide",
    };
  }
  return {
    accent: "#3df57f",
    accentSoft: "rgba(61,245,127,0.18)",
    accentGlow: "rgba(61,245,127,0.3)",
    panel:
      "linear-gradient(180deg, rgba(22,30,26,0.96) 0%, rgba(12,16,14,0.98) 100%)",
    label: "Mood Active",
  };
}

function MoodBlockTimer({ endTime }: { endTime: number }) {
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, Math.floor((endTime - Date.now()) / 1000)),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  return (
    <>{`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`}</>
  );
}

function MoodBlockModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (mood: "angry" | "crying" | "irritated" | "depressed") => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  const moods: Array<{
    key: "angry" | "crying" | "irritated" | "depressed";
    emoji: string;
    label: string;
  }> = [
    { key: "angry", emoji: "😠", label: "Angry" },
    { key: "crying", emoji: "😢", label: "Crying" },
    { key: "irritated", emoji: "😤", label: "Irritated" },
    { key: "depressed", emoji: "😔", label: "Depressed" },
  ];

  return (
    <div className="app-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="app-modal-dialog relative bg-[#111] rounded-3xl p-6 w-full max-w-sm border border-white/10 shadow-2xl"
        style={{
          animation: visible ? "modalSlideUp 0.3s ease-out" : "none",
        }}
      >
        <style>{`
          @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white text-lg font-semibold">Select Mood</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {moods.map((mood) => (
            <button
              key={mood.key}
              type="button"
              onClick={() => onSelect(mood.key)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#1a1a1a] border border-white/10 hover:border-white/20 hover:bg-[#222] transition-all"
            >
              <span className="text-4xl">{mood.emoji}</span>
              <span className="text-white text-sm font-medium">
                {mood.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryModal({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <div className="app-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="app-modal-dialog relative bg-[#111] rounded-3xl p-6 w-full max-w-sm border border-white/10 shadow-2xl"
        style={{
          animation: visible ? "modalSlideUp 0.3s ease-out" : "none",
        }}
      >
        <style>{`
          @keyframes modalSlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white text-lg font-semibold">Create Story</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="aspect-[9/16] bg-[#1a1a1a] rounded-2xl flex items-center justify-center border-2 border-dashed border-white/20">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#4ade80]/20 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={32} className="text-[#4ade80]" />
              </div>
              <p className="text-white/60 text-sm">Tap to add media</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              alert("Story posted (dummy action)");
              onClose();
            }}
            className="w-full py-3 bg-[#4ade80] text-black font-semibold rounded-xl hover:bg-[#22c55e] transition-colors"
          >
            Post Story
          </button>
        </div>
      </div>
    </div>
  );
}

function GuestStoryViewerModal({
  stories,
  initialIndex,
  onClose,
  onNavigateToProfile,
}: {
  stories: Array<{
    id: string;
    userId: string;
    name: string;
    username: string;
    avatarUrl: string;
    imageUrl: string;
    label: string;
    createdAt: string;
  }>;
  initialIndex: number;
  onClose: () => void;
  onNavigateToProfile: (userId: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, stories.length - 1)),
  );
  const [progress, setProgress] = useState(0);
  const activeStory = stories[currentIndex];

  useEffect(() => {
    setProgress(0);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const nextProgress = Math.min(
        ((Date.now() - startedAt) / 5000) * 100,
        100,
      );
      setProgress(nextProgress);
    }, 32);
    const timeout = window.setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex((value) => value + 1);
      } else {
        onClose();
      }
    }, 5000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [currentIndex, onClose, stories.length]);

  if (!activeStory) return null;

  return (
    <div className="app-story-shell fixed inset-0 z-[120] bg-black">
      <div className="absolute inset-0">
        <img
          src={activeStory.imageUrl}
          alt={activeStory.label}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
      </div>

      <div className="relative flex h-full flex-col">
        <div className="px-3 pt-3">
          <div className="mb-4 flex gap-1.5">
            {stories.map((story, index) => (
              <div
                key={story.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/20"
              >
                <div
                  className="h-full rounded-full bg-white transition-all duration-100"
                  style={{
                    width:
                      index < currentIndex
                        ? "100%"
                        : index === currentIndex
                          ? `${progress}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onNavigateToProfile(activeStory.userId)}
              className="flex min-w-0 items-center gap-3 text-left"
            >
              <GuestAvatar
                imageUrl={activeStory.avatarUrl}
                name={activeStory.name}
                size={40}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {activeStory.name}
                </p>
                <p className="truncate text-xs text-white/70">
                  @{activeStory.username} ·{" "}
                  {formatTimeAgo(activeStory.createdAt)}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/12 p-2 text-white backdrop-blur"
              aria-label="Close story viewer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1" />

        <div className="px-4 pb-[calc(28px+var(--safe-area-bottom))]">
          <div className="rounded-[30px] border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-white">
                {activeStory.label}
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85">
                <Heart size={13} className="text-[#ff5d87]" />
                <span>Preview reactions</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/10 p-3 text-white"
              >
                <Heart size={18} />
              </button>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/10 p-3 text-white"
              >
                <MessageCircle size={18} />
              </button>
              <div className="flex-1 rounded-full border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/60">
                Reply in guest preview
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          className="absolute inset-y-0 left-0 w-1/3"
          aria-label="Previous story"
        />
        <button
          type="button"
          onClick={() => {
            if (currentIndex < stories.length - 1) {
              setCurrentIndex((value) => value + 1);
            } else {
              onClose();
            }
          }}
          className="absolute inset-y-0 right-0 w-2/3"
          aria-label="Next story"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeartBurstLayer Component
// ---------------------------------------------------------------------------

function HeartBurstLayer({ bursts }: { bursts: HeartBurst[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden z-10">
      <style>{`
        @keyframes hbGlow {
          0% { opacity: 0.8; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        @keyframes hbRing {
          0% { opacity: 1; transform: scale(0.8); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        @keyframes hbFloat {
          0% { opacity: 1; transform: translateY(0) scale(0); }
          20% { opacity: 1; transform: translateY(-10px) scale(1); }
          100% { opacity: 0; transform: translateY(-100px) scale(1); }
        }
      `}</style>
      {bursts.map((burst) => {
        const size = HEART_SIZES[burst.id % HEART_SIZES.length];
        const color = HEART_COLORS[burst.colorIdx % HEART_COLORS.length];
        return (
          <div
            key={burst.id}
            style={{
              position: "absolute",
              left: burst.x - size / 2,
              top: burst.y - size / 2,
              width: size,
              height: size,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -size * 0.6,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}60 0%, transparent 68%)`,
                animation: `hbGlow ${BURST_LIFETIME}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: `2px solid ${color}80`,
                animation: `hbRing ${BURST_LIFETIME * 0.75}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                animation: `hbFloat ${BURST_LIFETIME}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                transformOrigin: "center bottom",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill={color}
                width={size}
                height={size}
                style={{
                  filter: `drop-shadow(0 0 ${size * 0.18}px ${color}dd) drop-shadow(0 2px 6px #0008)`,
                  transform: `scale(${burst.scale})`,
                  transformOrigin: "center",
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Screen =
  | "feed"
  | "main"
  | "dares"
  | "truths"
  | "profile"
  | "chat-list"
  | "chat"
  | "alerts"
  | "user-search"
  | "user-profile"
  | "activity"
  | "create";

type GuestHistorySnapshot = {
  alertsActiveTab: "social" | "sus";
  chatListSearchQuery: string;
  daresActiveTab: "received" | "sent";
  profileActiveTab: "posts" | "truths" | "dares";
  searchText: string;
  selectedConversationId: string;
  selectedUserId: string;
};

const currentGuestProfile =
  guestUsers.find((user) => user.id === guestUser.id) ?? guestUsers[0];

function ActionPickerModal({
  onClose,
  onSelectAction,
}: {
  onClose: () => void;
  onSelectAction: (action: "truth" | "dare" | "feed") => void;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
    return () => setMounted(false);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleActionSelect = (action: "truth" | "dare" | "feed") => {
    setVisible(false);
    setTimeout(() => {
      onSelectAction(action);
    }, 200);
  };

  if (!mounted) return null;

  const actions = [
    {
      id: "truth" as const,
      title: "Ask a Truth",
      description: "Put someone on the spot",
      icon: MessageSquare,
      color: "text-blue-400",
    },
    {
      id: "dare" as const,
      title: "Give a Dare",
      description: "Challenge someone publicly",
      icon: Lock,
      color: "text-red-400",
    },
    {
      id: "feed" as const,
      title: "Post to Feed",
      description: "Share something with friends",
      icon: Send,
      color: "text-green-400",
    },
  ];

  return (
    <div className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .modal-backdrop { animation: ${visible ? "fadeIn 0.3s ease-out" : "fadeOut 0.3s ease-in"} forwards; }
        .modal-content { animation: ${visible ? "slideUp 0.35s cubic-bezier(0.32,0.72,0,1)" : "slideDown 0.3s cubic-bezier(0.32,0.72,0,1)"} forwards; }
        .action-card { 
          opacity: 0; 
          transform: translateY(20px); 
          animation: ${visible ? "slideUp 0.4s ease-out forwards" : ""}; 
        }
        .action-card:nth-child(1) { animation-delay: 0.1s; }
        .action-card:nth-child(2) { animation-delay: 0.15s; }
        .action-card:nth-child(3) { animation-delay: 0.2s; }
      `}</style>

      <div
        className="modal-backdrop absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={handleClose}
      />

      <div className="app-modal-dialog modal-content relative w-full max-w-md mx-4">
        <button
          onClick={handleClose}
          className="absolute -top-12 right-0 text-white/60 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h1 className="text-2xl font-bold text-white text-center mb-8 lg:text-3xl">
          What do you want to do
        </h1>

        <div className="space-y-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleActionSelect(action.id)}
                className={`action-card w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 hover:border-[#4ade80]/50 transition-all duration-200 group hover:shadow-lg`}
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-[#2a2a2a] flex items-center justify-center ${action.color} group-hover:bg-[#4ade80]/20 transition-colors`}
                  >
                    <Icon size={24} />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-white font-semibold text-lg mb-1">
                      {action.title}
                    </h3>
                    <p className="text-[#94a3b8] text-sm">
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreateInteractionModal({
  onClose,
  mode,
}: {
  onClose: () => void;
  mode: "truth" | "dare";
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [content, setContent] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
    return () => setMounted(false);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSubmit = () => {
    setVisible(false);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  if (!mounted) return null;

  const isTruth = mode === "truth";
  const title = isTruth ? "Ask a Truth" : "Give a Dare";
  const placeholder = isTruth
    ? "Ask your truth question…"
    : "Describe the dare action…";

  return (
    <div className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .modal-backdrop { animation: ${visible ? "fadeIn 0.3s ease-out" : "fadeOut 0.3s ease-in"} forwards; }
        .modal-content { animation: ${visible ? "slideUp 0.35s cubic-bezier(0.32,0.72,0,1)" : "slideDown 0.3s cubic-bezier(0.32,0.72,0,1)"} forwards; }
      `}</style>

      <div
        className="modal-backdrop absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={handleClose}
      />

      <div className="app-modal-dialog modal-content relative w-full max-w-md mx-4">
        <button
          onClick={handleClose}
          className="absolute -top-12 right-0 text-white/60 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h1 className="text-2xl font-bold text-white text-center mb-8 lg:text-3xl">
          {title}
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-semibold mb-2">
              Tag User(s)
            </label>
            <div className="flex items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
              <AtSign size={20} className="text-[#94a3b8] mr-3" />
              <input
                type="text"
                placeholder="username"
                className="flex-1 bg-transparent text-white placeholder-[#94a3b8] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">
              {isTruth ? "Question" : "Dare Description"}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 text-white placeholder-[#94a3b8] focus:outline-none resize-none"
              rows={4}
            />
          </div>

          <button
            onClick={handleSubmit}
            className="btn btn-primary w-full py-3 rounded-xl font-semibold"
          >
            {isTruth ? "Send Truth" : "Send Dare"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentModal({
  onClose,
  postId,
}: {
  onClose: () => void;
  postId: string;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
    return () => setMounted(false);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSubmit = () => {
    setVisible(false);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const selectedPost = guestFeedPosts.find((p) => p.id === postId);
  const author = selectedPost ? getProfile(selectedPost.authorId) : null;
  const mockComments = guestUsers
    .filter((user) => user.id !== selectedPost?.authorId)
    .slice(0, 3)
    .map((user, index) => ({
      id: `${postId}-comment-${index}`,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      text:
        index === 0
          ? "This mock post still feels very close to the real feed design."
          : index === 1
            ? "Love the spacing here. The card width reads much cleaner now."
            : "Guest mode preview only, but this already looks polished.",
      createdAt:
        guestFeedPosts[index % guestFeedPosts.length]?.createdAt ??
        selectedPost?.createdAt ??
        new Date().toISOString(),
      likes: 3 + index * 2,
    }));

  if (!mounted) return null;

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        animation: "backdropFadeIn 0.25s ease-out forwards",
      }}
      onClick={handleClose}
    >
      <style>{`
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpFromBottom {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
        .comment-fade-in { animation: fadeIn 0.2s ease-out forwards; }
      `}</style>
      <div
        className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col overflow-hidden"
        style={{
          maxHeight: "98vh",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-4 pb-3 border-b border-[#2a2a2a] shrink-0">
          <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-lg">Comments</h3>
            <button
              onClick={handleClose}
              className="text-[#64748b] hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-6">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {selectedPost && author && (
              <div className="flex space-x-3 p-3 bg-[#1a1a1a] rounded-2xl comment-fade-in">
                <GuestAvatar
                  imageUrl={author.avatarUrl}
                  name={author.name}
                  size={44}
                />
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">
                    {author.name}
                  </p>
                  <p className="text-[#94a3b8] text-sm">
                    {selectedPost.caption}
                  </p>
                  <p className="text-[#64748b] text-xs mt-1">
                    {formatTimeAgo(selectedPost.createdAt)}
                  </p>
                </div>
              </div>
            )}
            {mockComments.map((item) => (
              <div
                key={item.id}
                className="flex space-x-3 rounded-2xl bg-[#151515] p-3 comment-fade-in"
              >
                <GuestAvatar
                  imageUrl={item.avatarUrl}
                  name={item.name}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-[#64748b]">
                      @{item.username}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#d9dde3]">
                    {item.text}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[#64748b]">
                    <span>{formatTimeAgo(item.createdAt)}</span>
                    <span>{item.likes} likes</span>
                    <span>Reply</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pt-3 border-t border-[#2a2a2a] shrink-0">
            <div className="flex items-center space-x-3">
              <GuestAvatar
                imageUrl={currentGuestProfile.avatarUrl}
                name={currentGuestProfile.name}
                size={36}
              />
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-2.5 text-white placeholder-[#64748b] focus:outline-none focus:border-[#4ade80]"
              />
              <button
                onClick={handleSubmit}
                disabled={!comment.trim()}
                className="text-[#4ade80] font-semibold text-sm disabled:text-[#64748b] disabled:cursor-not-allowed"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareModal({
  onClose,
  postId,
}: {
  onClose: () => void;
  postId: string;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
    return () => setMounted(false);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSend = (userId: string) => {
    setSentTo((prev) => new Set(prev).add(userId));
  };

  const selectedPost = guestFeedPosts.find((p) => p.id === postId);
  const author = selectedPost ? getProfile(selectedPost.authorId) : null;

  if (!mounted) return null;

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        animation: "backdropFadeIn 0.25s ease-out forwards",
      }}
      onClick={handleClose}
    >
      <style>{`
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpFromBottom {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
        .share-fade-in { animation: fadeIn 0.2s ease-out forwards; }
      `}</style>
      <div
        className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col"
        style={{
          maxHeight: "98vh",
          minHeight: "60vh",
          touchAction: "pan-y",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-4 pb-3 border-b border-[#2a2a2a] shrink-0">
          <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-lg">Send to…</h3>
            <button
              onClick={handleClose}
              className="text-[#64748b] hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {selectedPost && (
          <div className="px-6 py-4 shrink-0 border-b border-[#2a2a2a]">
            <div className="flex items-center space-x-3">
              <img
                src={selectedPost.imageUrl}
                alt="Post"
                className="w-14 h-14 rounded-xl object-cover"
              />
              <div>
                <p className="text-white text-sm font-semibold">
                  {author?.name}
                </p>
                <p className="text-[#94a3b8] text-xs line-clamp-2">
                  {selectedPost.caption}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {guestUsers
            .filter((u) => u.id !== guestUser.id)
            .map((friend, index) => {
              const sent = sentTo.has(friend.id);
              return (
                <div
                  key={friend.id}
                  className="flex items-center space-x-4 py-3 px-3 rounded-2xl hover:bg-[#1e1e1e] transition-colors bg-[#1a1a1a] share-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <GuestAvatar
                    imageUrl={friend.avatarUrl}
                    name={friend.name}
                    size={64}
                  />
                  <div className="flex-1">
                    <p className="text-white font-semibold text-base">
                      {friend.name}
                    </p>
                    <p className="text-sm text-[#94a3b8]">{friend.username}</p>
                  </div>
                  <button
                    onClick={() => handleSend(friend.id)}
                    disabled={sent}
                    className={`px-5 py-2 rounded-full text-base font-semibold transition-all duration-200 flex items-center space-x-2 ${sent ? "bg-[#2a2a2a] text-[#64748b] cursor-default" : "bg-[#4ade80] text-black hover:bg-[#22c55e] active:scale-95"} disabled:bg-[#2a2a2a] disabled:text-[#64748b] disabled:cursor-default`}
                  >
                    {sent ? (
                      <span>Sent ✓</span>
                    ) : (
                      <>
                        <Send size={18} fill="currentColor" strokeWidth={0} />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function GuestAvatar({
  seed,
  imageUrl,
  name,
  size = 44,
}: {
  seed?: string;
  imageUrl?: string;
  name: string;
  size?: number;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        title={name}
        className="rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.18)] object-cover"
        style={{
          width: size,
          height: size,
        }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(135deg, rgba(74,222,128,1) 0%, rgba(15,118,110,1) 100%)",
      }}
      aria-label={name}
      title={name}
    >
      {seed}
    </div>
  );
}

function getProfile(userId: string): GuestUserProfile {
  return guestUsers.find((user) => user.id === userId) ?? guestUsers[0];
}

type GuestMainView = "truth" | "dares";
type GuestMainTruthVoteChoice = "truth" | "lie";
type GuestMainDareVoteChoice = "real" | "fake";

const guestMainProofImages = guestFeedPosts.map((post) => post.imageUrl);

function getGuestMainProofImage(index: number): string {
  return guestMainProofImages[index % guestMainProofImages.length];
}

function getGuestMainTruthPosts() {
  return [...guestTruthCards]
    .filter((card) => Boolean(card.answer?.trim()))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((card) => {
      const challenger = getProfile(card.challengerId);
      const receiver = getProfile(card.receiverId);
      return {
        id: card.id,
        challengerId: card.challengerId,
        receiverId: card.receiverId,
        challenger: {
          nickname: challenger.name,
          avatar: challenger.avatarUrl,
        },
        receiver: {
          nickname: receiver.name,
          avatar: receiver.avatarUrl,
        },
        question: card.question,
        state: "APPROVED" as const,
        createdAt: card.createdAt,
        answer: card.answer,
        poll: {
          question: "What do you think?",
          options: ["Truth", "Lie"],
          votes: {
            Truth: card.truthVotes,
            Lie: card.lieVotes,
          },
          totalVotes: card.truthVotes + card.lieVotes,
        },
      };
    });
}

function getGuestMainDarePosts() {
  return [...guestDareCards]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((card, index) => {
      const challenger = getProfile(card.challengerId);
      const receiver = getProfile(card.receiverId);
      const proofUrl = getGuestMainProofImage(index);
      return {
        id: card.id,
        challengerId: card.challengerId,
        receiverId: card.receiverId,
        challenger: {
          nickname: challenger.name,
          avatar: challenger.avatarUrl,
        },
        receiver: {
          nickname: receiver.name,
          avatar: receiver.avatarUrl,
        },
        description: card.description,
        proof: {
          type: "image" as const,
          url: proofUrl,
          thumbnail: proofUrl,
        },
        state: "FRIENDS_VALIDATION" as const,
        createdAt: card.createdAt,
        votes: {
          real: card.realVotes ?? 0,
          fake: card.fakeVotes ?? 0,
          total: (card.realVotes ?? 0) + (card.fakeVotes ?? 0),
        },
      };
    });
}

function GlassButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  action,
  icon,
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-white text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function GuestApp({ onExitGuestMode }: { onExitGuestMode: () => void }) {
  const screenSize = useScreenSize();
  const isDesktop = screenSize === "desktop";
  const [currentScreen, setCurrentScreen] = useState<Screen>("feed");
  const [mainActiveTab, setMainActiveTab] = useState<"truths" | "dares">(
    "dares",
  );
  const [selectedUserId, setSelectedUserId] = useState<string>("user-rhea");
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>("conv-1");
  const [searchText, setSearchText] = useState("");
  const [profileActiveTab, setProfileActiveTab] = useState<
    "posts" | "truths" | "dares"
  >("posts");
  const [alertsActiveTab, setAlertsActiveTab] = useState<"social" | "sus">(
    "social",
  );
  const [daresActiveTab, setDaresActiveTab] = useState<"received" | "sent">(
    "received",
  );
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [showCreateInteraction, setShowCreateInteraction] = useState(false);
  const [createMode, setCreateMode] = useState<"truth" | "dare">("truth");
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [bursts, setBursts] = useState<Record<string, HeartBurst[]>>({});
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [chatListSearchQuery, setChatListSearchQuery] = useState("");
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [chatFriendTyping, setChatFriendTyping] = useState(false);
  const [moodBlockModalOpen, setMoodBlockModalOpen] = useState(false);
  const [currentMoodBlock, setCurrentMoodBlock] = useState<{
    mood: "angry" | "crying" | "irritated" | "depressed";
    initiatedBy: string;
    initiatedByName: string;
    startTime: number;
    endTime: number;
  } | null>(null);
  const [progressBarWidth, setProgressBarWidth] = useState(100);
  const [chatFrozen, setChatFrozen] = useState(false);
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [guestMainActiveView, setGuestMainActiveView] =
    useState<GuestMainView>("dares");
  const [guestMainActiveReelIndex, setGuestMainActiveReelIndex] = useState(0);
  const [guestMainCurrentTruthIndex, setGuestMainCurrentTruthIndex] =
    useState(0);
  const [guestMainIsTransitioning, setGuestMainIsTransitioning] =
    useState(false);
  const [guestMainIsTruthDragging, setGuestMainIsTruthDragging] =
    useState(false);
  const [guestMainFullscreenMedia, setGuestMainFullscreenMedia] = useState<{
    url: string;
    type: "image" | "video";
    thumbnail?: string;
  } | null>(null);
  const [guestMainDareVotes, setGuestMainDareVotes] = useState<
    Record<string, { choice: GuestMainDareVoteChoice; confirmed: boolean }>
  >({});
  const [guestMainTruthVotes, setGuestMainTruthVotes] = useState<
    Record<string, { choice: GuestMainTruthVoteChoice; confirmed: boolean }>
  >({});
  const guestMainReelContainerRef = useRef<HTMLDivElement>(null);
  const guestMainTruthDeckRef = useRef<HTMLDivElement>(null);
  const guestMainTouchStart = useRef<number | null>(null);
  const guestMainTouchEnd = useRef<number | null>(null);
  const guestMainTouchStartY = useRef<number | null>(null);
  const guestMainTouchEndY = useRef<number | null>(null);
  const guestMainTruthTouchStartY = useRef<number | null>(null);
  const guestMainTruthTouchStartX = useRef<number | null>(null);
  const guestMainTruthScrollableRef = useRef<HTMLElement | null>(null);
  const guestMainTruthScrollTopAtStart = useRef(0);
  const guestMainTruthScrollHeightAtStart = useRef(0);
  const guestMainTruthClientHeightAtStart = useRef(0);
  const guestMainTruthDragY = useRef(0);
  const guestMainTruthLastTouchY = useRef(0);
  const guestMainTruthLastTouchAt = useRef(0);
  const guestMainTruthVelocityY = useRef(0);
  const guestMainTruthDragFrame = useRef<number | null>(null);
  const guestMainTruthCanDragDeck = useRef(false);
  const goBackInGuestApp = usePwaScreenHistory<Screen, GuestHistorySnapshot>(
    currentScreen,
    setCurrentScreen,
    {
      snapshot: {
        alertsActiveTab,
        chatListSearchQuery,
        daresActiveTab,
        profileActiveTab,
        searchText,
        selectedConversationId,
        selectedUserId,
      },
      restoreSnapshot: (snapshot) => {
        setAlertsActiveTab(snapshot.alertsActiveTab);
        setChatListSearchQuery(snapshot.chatListSearchQuery);
        setDaresActiveTab(snapshot.daresActiveTab);
        setProfileActiveTab(snapshot.profileActiveTab);
        setSearchText(snapshot.searchText);
        setSelectedConversationId(snapshot.selectedConversationId);
        setSelectedUserId(snapshot.selectedUserId);
      },
    },
  );

  // Progress bar update for mood block
  useEffect(() => {
    if (!currentMoodBlock) {
      setProgressBarWidth(100);
      return;
    }

    const updateProgress = () => {
      const elapsed = Date.now() - currentMoodBlock.startTime;
      const total = currentMoodBlock.endTime - currentMoodBlock.startTime;
      const remaining = Math.max(0, total - elapsed);
      setProgressBarWidth(
        Math.max(0, Math.min(100, (remaining / total) * 100)),
      );
    };
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [currentMoodBlock]);

  // Real-time mock UI updates - simulate typing indicator randomly
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setChatFriendTyping(true);
        setTimeout(
          () => setChatFriendTyping(false),
          2000 + Math.random() * 3000,
        );
      }
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const guestMainTruthPosts = getGuestMainTruthPosts();
  const guestMainDarePosts = getGuestMainDarePosts();
  const guestMainEffectiveTruthIndex = Math.min(
    guestMainCurrentTruthIndex,
    Math.max(guestMainTruthPosts.length - 1, 0),
  );
  const guestMainVisibleTruthPosts = guestMainTruthPosts
    .map((post, index) => ({ post, index }))
    .filter(({ index }) => Math.abs(index - guestMainEffectiveTruthIndex) <= 1);

  const setGuestMainTruthDeckDrag = useCallback((dragY: number) => {
    guestMainTruthDragY.current = dragY;
    if (guestMainTruthDragFrame.current !== null) return;

    guestMainTruthDragFrame.current = window.requestAnimationFrame(() => {
      guestMainTruthDragFrame.current = null;
      guestMainTruthDeckRef.current?.style.setProperty(
        "--truth-drag-y",
        `${guestMainTruthDragY.current}px`,
      );
    });
  }, []);

  useEffect(() => {
    if (guestMainActiveView !== "dares") return;

    const container = guestMainReelContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const viewportHeight = container.clientHeight || window.innerHeight || 1;
      const nextIndex = Math.round(container.scrollTop / viewportHeight);
      setGuestMainActiveReelIndex(
        Math.max(0, Math.min(nextIndex, guestMainDarePosts.length - 1)),
      );
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [guestMainActiveView, guestMainDarePosts.length]);

  const lastTapTimeRef = useRef<Record<string, number>>({});
  const burstIdCounter = useRef(0);
  const colorCounterRef = useRef(0);

  // ── Heart burst spawner ──
  const spawnBurst = useCallback((postId: string, x: number, y: number) => {
    const id = ++burstIdCounter.current;
    const colorIdx = colorCounterRef.current++ % HEART_COLORS.length;
    const burst: HeartBurst = {
      id,
      x: x + (Math.random() - 0.5) * 28,
      y: y + (Math.random() - 0.5) * 18,
      scale: 0.8 + Math.random() * 0.5,
      colorIdx,
    };
    setBursts((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), burst],
    }));
    setTimeout(() => {
      setBursts((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).filter((b) => b.id !== id),
      }));
    }, BURST_LIFETIME + 100);
  }, []);

  const addLike = useCallback((postId: string) => {
    setLikedPosts((prev) => new Set(prev).add(postId));
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: (prev[postId] || 0) + 1,
    }));
  }, []);

  const handleMediaTap = useCallback(
    (postId: string, e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const now = Date.now();
      const last = lastTapTimeRef.current[postId] ?? 0;
      const isDoubleTap = now - last < DOUBLE_TAP_DELAY;
      lastTapTimeRef.current[postId] = isDoubleTap ? 0 : now;
      if (!isDoubleTap) return;
      const rect = e.currentTarget.getBoundingClientRect();
      spawnBurst(postId, e.clientX - rect.left, e.clientY - rect.top);
      addLike(postId);
    },
    [spawnBurst, addLike],
  );

  const handleHeartIconClick = useCallback(
    (postId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const mediaEl = document.getElementById(`media-${postId}`);
      spawnBurst(
        postId,
        mediaEl ? mediaEl.clientWidth / 2 : 160,
        mediaEl ? mediaEl.clientHeight / 2 : 160,
      );
      addLike(postId);
    },
    [spawnBurst, addLike],
  );

  const selectedProfile = getProfile(selectedUserId);
  const guestStorySlides = guestStories.map((story, index) => {
    const profile = getProfile(story.userId);
    const imageSource =
      guestFeedPosts[index % guestFeedPosts.length]?.imageUrl ??
      currentGuestProfile.avatarUrl;

    return {
      id: story.id,
      userId: story.userId,
      name: profile.name,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      imageUrl: imageSource,
      label: story.label,
      createdAt:
        guestFeedPosts[index % guestFeedPosts.length]?.createdAt ??
        new Date().toISOString(),
    };
  });
  const selectedConversation =
    guestConversations.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? guestConversations[0];

  const filteredUsers = guestUsers.filter((user) => {
    if (user.id === guestUser.id) return false;
    const term = searchText.trim().toLowerCase();
    if (!term) return true;
    return (
      user.name.toLowerCase().includes(term) ||
      user.username.toLowerCase().includes(term)
    );
  });

  const openProfile = (userId: string) => {
    setSelectedUserId(userId);
    setCurrentScreen("user-profile");
  };

  const openConversation = (conversation: GuestConversation) => {
    setSelectedConversationId(conversation.id);
    setCurrentScreen("chat");
  };

  const openStoryViewer = (index: number) => {
    setStoryViewerIndex(index);
    setStoryViewerOpen(true);
  };

  const renderTopBar = (title: string, backTo?: Screen) => (
    <div className="safe-area-top sticky top-0 z-20 border-b border-white/10 bg-[#0a0f0a]/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {backTo ? (
            <button
              type="button"
              onClick={() => goBackInGuestApp(backTo)}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white"
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <div>
            <h1 className="text-white text-lg font-semibold">{title}</h1>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFeed = () => (
    <div
      className="screen-container"
      style={{
        paddingBottom: "calc(120px + var(--safe-area-bottom))",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes premiumBorderPulse {
          0% {
            border-color: rgba(74, 222, 128, 0.3);
            box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5), 0 0 30px rgba(74, 222, 128, 0.3);
            transform: scale(1);
          }
          50% {
            border-color: rgba(74, 222, 128, 1);
            box-shadow: 0 0 0 8px rgba(74, 222, 128, 0.8), 0 0 50px rgba(74, 222, 128, 0.6);
            transform: scale(1.02);
          }
          100% {
            border-color: rgba(74, 222, 128, 0.3);
            box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5), 0 0 30px rgba(74, 222, 128, 0.3);
            transform: scale(1);
          }
        }
        .premium-border-animation {
          animation: premiumBorderPulse 1.5s ease-in-out;
        }
      `}</style>
      {isDesktop ? (
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <div className="w-64 shrink-0 border-r border-white/10 bg-[#0a0f0a]/95 p-6">
            <div className="mb-8">
              <h2 className="text-[#4ade80] text-xl font-bold mb-2">DARE</h2>
              <p className="text-white/60 text-sm">Guest Mode</p>
            </div>
            <nav className="space-y-2">
              <button
                type="button"
                onClick={() => setCurrentScreen("feed")}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  currentScreen === "feed"
                    ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Feed
              </button>
              <button
                type="button"
                onClick={() => setCurrentScreen("dares")}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  currentScreen === "dares"
                    ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Dares & Truths
              </button>
              <button
                type="button"
                onClick={() => setCurrentScreen("chat-list")}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  currentScreen === "chat-list"
                    ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Messages
              </button>
              <button
                type="button"
                onClick={() => setCurrentScreen("alerts")}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  currentScreen === "alerts"
                    ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Alerts
              </button>
              <button
                type="button"
                onClick={() => setCurrentScreen("profile")}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  currentScreen === "profile"
                    ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/30"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Profile
              </button>
            </nav>
            <div className="mt-auto pt-8">
              <GlassButton onClick={onExitGuestMode}>
                Exit Guest Mode
              </GlassButton>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 max-w-5xl mx-auto p-8">
            {/* ── Tab Navigation ── */}
            <div className="bg-[#111] border-b border-white/10 px-4 pt-4 mb-6 rounded-2xl">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setMainActiveTab("truths")}
                  className={`nav-tab ${mainActiveTab === "truths" ? "active" : ""}`}
                >
                  TRUTHS
                </button>
                <button
                  type="button"
                  onClick={() => setMainActiveTab("dares")}
                  className={`nav-tab ${mainActiveTab === "dares" ? "active" : ""}`}
                >
                  DARES
                </button>
              </div>
            </div>

            {/* ── Content Area ── */}
            <div className="p-4">
              {mainActiveTab === "truths" ? (
                <div className="grid grid-cols-2 gap-4">
                  {guestTruthCards.map((item, index) => {
                    const challenger = getProfile(item.challengerId);
                    return (
                      <div
                        key={item.id}
                        className="bg-[#111] rounded-2xl p-5 border border-white/10"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <p className="text-white text-base leading-relaxed">
                          {item.question}
                        </p>
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-[#64748b] text-sm">
                            {challenger.name}
                          </span>
                          <div className="flex space-x-2">
                            <button
                              type="button"
                              className="truth-btn px-4 py-2 rounded-full bg-[#4ade80]/10 text-[#4ade80] font-bold text-sm border border-[#4ade80]/30 hover:bg-[#4ade80]/20 transition-all"
                            >
                              Truth
                            </button>
                            <button
                              type="button"
                              className="lie-btn px-4 py-2 rounded-full bg-white/5 text-white font-bold text-sm border border-white/10 hover:bg-white/10 transition-all"
                            >
                              Lie
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {guestDareCards.map((item, index) => {
                    const challenger = getProfile(item.challengerId);
                    return (
                      <div
                        key={item.id}
                        className="bg-[#111] rounded-2xl p-5 border border-white/10"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <p className="text-white text-base leading-relaxed">
                          {item.description}
                        </p>
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-[#64748b] text-sm">
                            {challenger.name}
                          </span>
                          <button
                            type="button"
                            className="expand-btn px-4 py-2 rounded-full bg-[#4ade80] text-black font-bold text-sm hover:bg-[#22c55e] transition-all"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Header ── */}
          <div
            className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(3,6,4,0.96)_0%,rgba(0,0,0,0.94)_100%)] shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-in-out translate-y-0"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8 hover:text-white z-10"
                  aria-label="Search"
                >
                  <Search size={18} />
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
                  <span className="text-lg font-bold tracking-[0.2em] text-white">
                    DARE
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setCurrentScreen("alerts")}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#fb7185]/30 hover:bg-[#fb7185]/8 hover:text-white"
                    aria-label="Notifications"
                  >
                    <Heart size={18} />
                    <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-md">
                      3
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentScreen("chat-list")}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-[#94a3b8] transition-all duration-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8 hover:text-white"
                    aria-label="Messages"
                  >
                    <MessageSquare size={18} />
                    <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-[#4ade80] px-1.5 py-0.5 text-[10px] font-bold leading-none text-black shadow-md">
                      2
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Scrollable content ── */}
          <div className="flex-1 overflow-y-auto pb-8">
            {/* ── Stories row ── */}
            <div className={`${isDesktop ? "py-6" : "px-4 pt-3 pb-6"}`}>
              <div className="flex items-start gap-4 overflow-x-auto overflow-y-visible scrollbar-hide pb-1">
                {/* Your Story Circle */}
                <div
                  className="group flex w-20 shrink-0 flex-col items-center"
                  onClick={() => setStoryModalOpen(true)}
                >
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 w-20 h-20 rounded-full opacity-0 blur-sm group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-full h-full rounded-full border-2 border-[#4ade80]/25" />
                    </div>
                    {/* No stories — show add button */}
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,#20242c_0%,#121417_55%,#090909_100%)] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] group-hover:border-[#4ade80]/60">
                      <Plus
                        size={28}
                        className="text-[#4ade80] transition-transform duration-300 group-hover:scale-110"
                      />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-full flex items-center justify-center border-2 border-black shadow-md group-hover:scale-110 transition-transform duration-300">
                      <Plus size={12} className="text-black" />
                    </div>
                  </div>
                  <span className="relative z-10 mt-3 block w-full text-center text-sm font-medium leading-tight text-[#94a3b8] transition-colors duration-300 group-hover:text-white">
                    Your Story
                  </span>
                </div>

                {/* Friends' Stories */}
                {guestStories.map((story, index) => {
                  const profile = getProfile(story.userId);
                  return (
                    <div
                      key={story.id}
                      className="group flex w-20 shrink-0 flex-col items-center animate-slide-up"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <button
                        type="button"
                        onClick={() => openStoryViewer(index)}
                        className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-transparent p-0"
                      >
                        {!story.hasViewed && (
                          <div className="absolute inset-0 w-20 h-20 rounded-full opacity-0 blur-sm group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-full h-full rounded-full border-2 border-[#4ade80]/35" />
                          </div>
                        )}
                        <div
                          className={`relative w-20 h-20 rounded-full p-[3px] transition-all duration-300 group-hover:scale-[1.04] shadow-[0_18px_40px_rgba(0,0,0,0.45)] ${
                            story.hasViewed
                              ? "bg-gradient-to-br from-[#2b2f35] via-[#353941] to-[#44474f]"
                              : "bg-gradient-to-br from-[#facc15] via-[#fb7185] to-[#4ade80]"
                          }`}
                        >
                          <div
                            className={`w-full h-full rounded-full ${
                              story.hasViewed ? "bg-[#111315]" : "bg-[#050505]"
                            } p-[3px]`}
                          >
                            <div className="w-full h-full rounded-full overflow-hidden">
                              <GuestAvatar
                                imageUrl={profile.avatarUrl}
                                name={profile.name}
                                size={64}
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openProfile(story.userId)}
                        className={`relative z-10 mt-3 block w-full truncate bg-transparent text-center text-sm font-medium leading-tight transition-colors ${
                          story.hasViewed
                            ? "text-[#6b7280]"
                            : "text-[#d1d5db] group-hover:text-white"
                        }`}
                      >
                        @{profile.username}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Feed Posts ── */}
            <div className={`${isDesktop ? "space-y-6" : "px-2 space-y-5"}`}>
              {guestFeedPosts.map((post, index) => {
                const profile = getProfile(post.authorId);
                const isLiked = likedPosts.has(post.id);
                const postBursts = bursts[post.id] || [];
                return (
                  <div
                    key={post.id}
                    id={`feed-post-${post.id}`}
                    className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(21,21,21,0.98),rgba(14,14,14,0.98))] shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    {/* Post header */}
                    <div className="flex items-center space-x-3 px-4 pt-4 pb-3">
                      <GuestAvatar
                        imageUrl={profile.avatarUrl}
                        name={profile.name}
                      />
                      <button
                        type="button"
                        onClick={() => openProfile(profile.id)}
                        className="relative cursor-pointer btn-ghost"
                      >
                        <h3 className="font-bold text-white text-base leading-tight">
                          {profile.name}
                        </h3>
                        <p className="text-[#4ade80] text-sm font-medium tracking-wide">
                          @{profile.username}
                        </p>
                      </button>
                    </div>

                    {/* Media */}
                    <div className="px-2">
                      <div
                        id={`media-${post.id}`}
                        className="relative w-full cursor-pointer overflow-hidden rounded-[26px]"
                        onClick={(e) => handleMediaTap(post.id, e)}
                      >
                        <img
                          src={post.imageUrl}
                          alt={post.mediaLabel}
                          className="h-[520px] w-full rounded-[26px] object-cover"
                        />
                        <HeartBurstLayer bursts={postBursts} />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="px-3 pt-4">
                      <div className="flex items-center rounded-full bg-[#1c1c1c] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <button
                          onClick={(e) => handleHeartIconClick(post.id, e)}
                          className="group flex items-center space-x-2"
                        >
                          <Heart
                            size={20}
                            fill={isLiked ? "#ef4444" : "white"}
                            strokeWidth={0}
                            className={`transition-all duration-200 ${
                              isLiked
                                ? "text-red-500 scale-110 drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                                : "text-white group-hover:scale-110"
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPostId(post.id);
                            setShowLikesModal(true);
                          }}
                          className="text-white font-bold text-sm ml-1 hover:text-[#4ade80] transition-colors"
                        >
                          {post.likes}
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => {
                            setSelectedPostId(post.id);
                            setShowCommentModal(true);
                          }}
                          className="flex items-center space-x-2 text-white hover:text-[#4ade80] transition-colors"
                        >
                          <MessageCircle
                            size={20}
                            fill="white"
                            strokeWidth={0}
                          />
                        </button>
                        <span className="text-white font-bold text-sm ml-1">
                          {post.comments || 0}
                        </span>
                        <div className="flex-1" />
                        <button
                          onClick={() => {
                            setSelectedPostId(post.id);
                            setShowShareModal(true);
                          }}
                          className="text-white hover:text-[#4ade80] transition-colors"
                          aria-label="Share to DM"
                        >
                          <Send size={18} fill="white" strokeWidth={0} />
                        </button>
                      </div>
                    </div>

                    {/* Caption */}
                    <div className="px-4 pt-4 pb-6">
                      <p className="text-[15px] leading-7 text-white">
                        {post.caption}
                      </p>
                      <p className="mt-3 text-xs text-[#64748b]">
                        {formatTimeAgo(post.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderMain = () => (
    <div
      className="screen-container"
      style={{
        paddingBottom: "120px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
        @keyframes truthFade { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes btnPulseTruth { 0%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 15%{box-shadow:0 0 22px 6px rgba(74,222,128,0.4);opacity:1} 35%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} }
        @keyframes btnPulseLie { 0%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 55%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 70%{box-shadow:0 0 22px 6px rgba(255,255,255,0.18);opacity:1} 88%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} }
        .nav-tab {
          flex: 1;
          padding: 12px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.5);
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }
        .nav-tab.active {
          color: #4ade80;
        }
        .nav-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 3px;
          background: #4ade80;
          border-radius: 2px;
        }
        .truth-btn {
          animation: btnPulseTruth 2.4s ease-in-out infinite;
        }
        .lie-btn {
          animation: btnPulseLie 2.4s ease-in-out infinite;
        }
        .expand-btn {
          animation: expandBtn 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        .truth-fade {
          animation: truthFade 1.5s ease-in-out;
        }
      `}</style>

      {/* ── Tab Navigation ── */}
      <div className="bg-[#111] border-b border-white/10 px-4 pt-4">
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => setMainActiveTab("truths")}
            className={`nav-tab ${mainActiveTab === "truths" ? "active" : ""}`}
          >
            TRUTHS
          </button>
          <button
            type="button"
            onClick={() => setMainActiveTab("dares")}
            className={`nav-tab ${mainActiveTab === "dares" ? "active" : ""}`}
          >
            DARES
          </button>
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="p-4">
        {mainActiveTab === "truths" ? (
          <div className="space-y-4">
            {guestTruthCards.map((item, index) => {
              const challenger = getProfile(item.challengerId);
              return (
                <div
                  key={item.id}
                  className="bg-[#111] rounded-2xl p-5 border border-white/10"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <p className="text-white text-base leading-relaxed">
                    {item.question}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[#64748b] text-sm">
                      {challenger.name}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        className="truth-btn px-4 py-2 rounded-full bg-[#4ade80]/10 text-[#4ade80] font-bold text-sm border border-[#4ade80]/30 hover:bg-[#4ade80]/20 transition-all"
                      >
                        Truth
                      </button>
                      <button
                        type="button"
                        className="lie-btn px-4 py-2 rounded-full bg-white/5 text-white font-bold text-sm border border-white/10 hover:bg-white/10 transition-all"
                      >
                        Lie
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {guestDareCards.map((item, index) => {
              const challenger = getProfile(item.challengerId);
              return (
                <div
                  key={item.id}
                  className="bg-[#111] rounded-2xl p-5 border border-white/10"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <p className="text-white text-base leading-relaxed">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[#64748b] text-sm">
                      {challenger.name}
                    </span>
                    <button
                      type="button"
                      className="expand-btn px-4 py-2 rounded-full bg-[#4ade80] text-black font-bold text-sm hover:bg-[#22c55e] transition-all"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderDares = () => {
    const received = guestDareCards.filter(
      (dare) => dare.receiverId === guestUser.id,
    );
    const sent = guestDareCards.filter(
      (dare) => dare.challengerId === guestUser.id,
    );
    const receivedTruths = guestTruthCards.filter(
      (truth) => truth.receiverId === guestUser.id,
    );
    const sentTruths = guestTruthCards.filter(
      (truth) => truth.challengerId === guestUser.id,
    );

    return (
      <div
        className="screen-container flex flex-col bg-[radial-gradient(circle_at_top,#162016_0%,#0b100b_36%,#070a07_100%)]"
        style={{
          paddingBottom: "120px",
          boxSizing: "border-box",
        }}
      >
        <style>
          {`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}
        </style>
        <div className="nav-header">
          <div className="px-4 pt-5 pb-5">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4ade80] to-[#22c55e] drop-shadow-[0_0_12px_rgba(74,222,128,0.4)]">
                  Dares
                </span>
                <span className="text-white"> & </span>
                <span className="text-white">Truths</span>
              </h1>
              <div className="flex rounded-full border border-white/12 bg-[#141414]/90 p-1.5 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                <button
                  onClick={() => setDaresActiveTab("received")}
                  className={`px-5.5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                    daresActiveTab === "received"
                      ? "text-black shadow-md"
                      : "text-[#8ea18e] hover:text-white"
                  }`}
                  style={{
                    backgroundColor:
                      daresActiveTab === "received" ? "#00ff88" : "transparent",
                  }}
                >
                  Received
                </button>
                <button
                  onClick={() => setDaresActiveTab("sent")}
                  className={`px-5.5 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                    daresActiveTab === "sent"
                      ? "text-black shadow-md"
                      : "text-[#8ea18e] hover:text-white"
                  }`}
                  style={{
                    backgroundColor:
                      daresActiveTab === "sent" ? "#00ff88" : "transparent",
                  }}
                >
                  Sent
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4 pb-8">
          <div className="mx-auto max-w-2xl space-y-4">
            {daresActiveTab === "received" ? (
              <>
                {received.map((dare) => {
                  const challenger = getProfile(dare.challengerId);
                  return (
                    <div
                      key={dare.id}
                      className="card rounded-[24px] border border-white/7 bg-[linear-gradient(180deg,rgba(24,28,24,0.98),rgba(16,18,16,0.98))] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                    >
                      <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.04),transparent_70%)] opacity-60" />

                      <div className="mb-3.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <GuestAvatar
                              imageUrl={challenger.avatarUrl}
                              name={challenger.name}
                              size={48}
                            />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-bold text-white text-[15px] leading-tight tracking-tight">
                                From: @{challenger.username}
                              </h3>
                            </div>
                            <p className="mt-1 text-[11px] text-[#8ea18e]">
                              Dare you received
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-blue-500/20 text-blue-300">
                            {dare.state.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>

                      <div className="mb-3.5">
                        <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                          They dared you to:
                        </p>
                        <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <div className="mb-2.5 h-1 w-14 rounded-full bg-[#f59e0b]/80" />
                          <p className="text-[15px] font-semibold leading-relaxed text-white">
                            {dare.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex space-x-2.5">
                        <div className="flex-1 rounded-2xl border border-accent-secondary/20 bg-accent-secondary/15 py-2 text-center">
                          <p className="text-accent-secondary font-semibold text-xs">
                            Waiting for your approval
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {receivedTruths.map((truth, index) => {
                  const challenger = getProfile(truth.challengerId);
                  return (
                    <div
                      key={truth.id}
                      className="card rounded-[24px] border border-white/7 bg-[linear-gradient(180deg,rgba(24,28,24,0.98),rgba(16,18,16,0.98))] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-slide-up"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.04),transparent_70%)] opacity-60" />

                      <div className="mb-3.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <GuestAvatar
                              imageUrl={challenger.avatarUrl}
                              name={challenger.name}
                              size={48}
                            />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-bold text-white text-[15px] leading-tight tracking-tight">
                                From: @{challenger.username}
                              </h3>
                            </div>
                            <p className="mt-1 text-[11px] text-[#8ea18e]">
                              Truth you received
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-green-500/20 text-green-300">
                            {truth.state.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>

                      <div className="mb-3.5">
                        <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                          They asked you:
                        </p>
                        <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <div className="mb-2.5 h-1 w-14 rounded-full bg-[#4ade80]/80" />
                          <p className="text-[15px] font-semibold leading-relaxed text-white">
                            {truth.question}
                          </p>
                        </div>
                      </div>

                      <div className="flex space-x-2.5">
                        <div className="flex-1 rounded-2xl border border-accent-secondary/20 bg-accent-secondary/15 py-2 text-center">
                          <p className="text-accent-secondary font-semibold text-xs">
                            Waiting for your answer
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {sent.map((dare, i) => {
                  const receiver = getProfile(dare.receiverId);
                  return (
                    <div
                      key={dare.id}
                      className="card rounded-[24px] border border-white/7 bg-[linear-gradient(180deg,rgba(24,28,24,0.98),rgba(16,18,16,0.98))] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-slide-up"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.04),transparent_70%)] opacity-60" />

                      <div className="mb-3.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <GuestAvatar
                              imageUrl={receiver.avatarUrl}
                              name={receiver.name}
                              size={48}
                            />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-bold text-white text-[15px] leading-tight tracking-tight">
                                To: @{receiver.username}
                              </h3>
                            </div>
                            <p className="mt-1 text-[11px] text-[#8ea18e]">
                              Dare you sent
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-green-500/20 text-green-300">
                            {dare.state.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>

                      <div className="mb-3.5">
                        <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                          You dared them to:
                        </p>
                        <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <div className="mb-2.5 h-1 w-14 rounded-full bg-[#f59e0b]/80" />
                          <p className="text-[15px] font-semibold leading-relaxed text-white">
                            {dare.description}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3.5">
                        <div className="flex-1 rounded-2xl border border-accent-secondary/20 bg-accent-secondary/15 py-2 text-center">
                          <p className="text-accent-secondary font-semibold text-xs">
                            Waiting for them to complete it
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sentTruths.map((truth, index) => {
                  const receiver = getProfile(truth.receiverId);
                  return (
                    <div
                      key={truth.id}
                      className="card rounded-[24px] border border-white/7 bg-[linear-gradient(180deg,rgba(24,28,24,0.98),rgba(16,18,16,0.98))] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-slide-up"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.42),transparent)]" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.04),transparent_70%)] opacity-60" />

                      <div className="mb-3.5 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <GuestAvatar
                              imageUrl={receiver.avatarUrl}
                              name={receiver.name}
                              size={48}
                            />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-bold text-white text-[15px] leading-tight tracking-tight">
                                To: @{receiver.username}
                              </h3>
                            </div>
                            <p className="mt-1 text-[11px] text-[#8ea18e]">
                              Truth you sent
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-green-500/20 text-green-300">
                            {truth.state.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>

                      <div className="mb-3.5">
                        <p className="mb-2 text-[13px] leading-relaxed text-[#8ea18e]">
                          You asked them:
                        </p>
                        <div className="rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(28,28,28,0.98),rgba(22,22,22,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <div className="mb-2.5 h-1 w-14 rounded-full bg-[#4ade80]/80" />
                          <p className="text-[15px] font-semibold leading-relaxed text-white">
                            {truth.question}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3.5">
                        <div className="flex-1 rounded-2xl border border-accent-secondary/20 bg-accent-secondary/15 py-2 text-center">
                          <p className="text-accent-secondary font-semibold text-xs">
                            Waiting for them to answer
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderProfile = () => {
    const userPosts = guestFeedPosts.filter(
      (post) => post.authorId === guestUser.id,
    );
    const userTruths = guestTruthCards.filter(
      (truth) =>
        truth.challengerId === guestUser.id ||
        truth.receiverId === guestUser.id,
    );
    const userDares = guestDareCards.filter(
      (dare) =>
        dare.challengerId === guestUser.id || dare.receiverId === guestUser.id,
    );

    return (
      <div
        className="screen-container flex flex-col bg-[radial-gradient(circle_at_top,#162016_0%,#0b100b_36%,#070a07_100%)] max-w-7xl mx-auto lg:px-8"
        style={{
          paddingBottom: "120px",
          boxSizing: "border-box",
        }}
      >
        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-0 lg:py-6">
          <div className="mx-auto max-w-2xl lg:max-w-4xl">
            {/* Header with avatar */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "20px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "88px",
                  height: "88px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className="lg:w-24 lg:h-24"
              >
                <GuestAvatar
                  imageUrl={currentGuestProfile.avatarUrl}
                  name={currentGuestProfile.name}
                  size={88}
                />
              </div>

              {/* Name + username + bio */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: "4px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      border: "1px solid rgba(74,222,128,0.18)",
                      background: "rgba(74,222,128,0.1)",
                      color: "#86efac",
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                    }}
                  >
                    Profile
                  </div>
                  <GlassButton onClick={onExitGuestMode}>
                    Back to sign in
                  </GlassButton>
                </div>
                <h2
                  style={{
                    color: "#fff",
                    fontSize: "28px",
                    fontWeight: 800,
                    lineHeight: 1.1,
                    margin: "0 0 4px",
                  }}
                >
                  {currentGuestProfile.name}
                </h2>
                <p
                  style={{
                    color: "rgba(74,222,128,0.7)",
                    fontSize: "15px",
                    margin: "0 0 10px",
                  }}
                >
                  @{currentGuestProfile.username}
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.68)",
                    fontSize: "14px",
                    lineHeight: 1.55,
                    margin: 0,
                    maxWidth: "560px",
                  }}
                >
                  {currentGuestProfile.bio}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
                marginBottom: "0px",
              }}
            >
              {[
                {
                  label: "Circle",
                  sublabel: "Friends",
                  value: guestUsers.length - 1,
                  onClick: undefined,
                  accent: "#4ade80",
                },
                {
                  label: "Dares",
                  sublabel: "Completed",
                  value: userDares.filter((d) => d.state === "ACCEPTED_REAL")
                    .length,
                  onClick: undefined,
                  accent: "#22c55e",
                },
                {
                  label: "Dares",
                  sublabel: "Pending",
                  value: userDares.filter(
                    (d) => d.state === "SENT" || d.state === "PROOF_SUBMITTED",
                  ).length,
                  onClick: undefined,
                  accent: "#f59e0b",
                },
              ].map(({ label, sublabel, value, onClick, accent }) => (
                <div
                  key={`${label}-${sublabel}`}
                  onClick={onClick}
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(24,29,24,0.98), rgba(17,20,17,0.98))",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "24px",
                    padding: "16px 12px 14px",
                    textAlign: "center",
                    cursor: onClick ? "pointer" : "default",
                    transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                    boxShadow:
                      "0 14px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    style={{
                      width: "30px",
                      height: "4px",
                      borderRadius: "999px",
                      background: accent,
                      margin: "0 auto 12px",
                      boxShadow: `0 0 14px ${accent}55`,
                    }}
                  />
                  <p
                    style={{
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "24px",
                      margin: "0 0 6px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {value}
                  </p>
                  <p
                    style={{
                      color: "#fff",
                      fontSize: "12px",
                      margin: "0 0 2px",
                      letterSpacing: "0.04em",
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </p>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.42)",
                      fontSize: "10px",
                      margin: 0,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    {sublabel}
                  </p>
                </div>
              ))}
            </div>

            {/* Tab Bar */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                background:
                  "linear-gradient(180deg, rgba(24,29,24,0.98), rgba(17,21,17,0.98))",
                borderRadius: "999px",
                padding: "5px",
                marginTop: "30px",
                marginBottom: "20px",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow:
                  "0 16px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              {(["posts", "truths", "dares"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setProfileActiveTab(tab)}
                  style={{
                    padding: "12px 8px",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 800,
                    textTransform: "capitalize",
                    transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                    background:
                      profileActiveTab === tab
                        ? "linear-gradient(135deg, #4ade80, #22c55e)"
                        : "transparent",
                    color:
                      profileActiveTab === tab
                        ? "#000"
                        : "rgba(255,255,255,0.4)",
                    boxShadow:
                      profileActiveTab === tab
                        ? "0 4px 24px rgba(74,222,128,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                        : "none",
                    letterSpacing: "0.02em",
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {profileActiveTab === "posts" && (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "28px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background:
                    "linear-gradient(180deg, rgba(18,20,18,0.98), rgba(10,12,10,0.98))",
                  boxShadow:
                    "0 20px 56px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <p
                      style={{
                        color: "#fff",
                        fontSize: "15px",
                        fontWeight: 800,
                        margin: "0 0 4px",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Post Grid
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.42)",
                        fontSize: "12px",
                        margin: 0,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {userPosts.length} published moments
                    </p>
                  </div>
                </div>
                {userPosts.length === 0 ? (
                  <div
                    style={{
                      minHeight: "220px",
                      borderRadius: "22px",
                      border: "1px dashed rgba(255,255,255,0.12)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: "28px",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          color: "#fff",
                          fontSize: "15px",
                          fontWeight: 700,
                          margin: "0 0 6px",
                        }}
                      >
                        No posts yet
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.42)",
                          fontSize: "13px",
                          margin: 0,
                        }}
                      >
                        Your photo and video moments will appear here in a clean
                        grid.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="profile-posts-grid">
                    {userPosts.slice(0, 4).map((post) => (
                      <div
                        key={post.id}
                        style={{
                          width: "100%",
                          aspectRatio: "1/1",
                          borderRadius: "16px",
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.08)",
                          cursor: "pointer",
                          position: "relative",
                          transition: "all 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
                          backdropFilter: "blur(10px)",
                          background: "rgba(20,20,20,0.95)",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                          WebkitTapHighlightColor: "transparent",
                          touchAction: "manipulation",
                          zIndex: 1,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            background: post.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "12px",
                            textAlign: "center",
                            borderRadius: "16px",
                          }}
                        >
                          <p
                            style={{
                              color: "rgba(255,255,255,0.6)",
                              fontSize: "11px",
                              lineHeight: "1.4",
                              margin: 0,
                            }}
                          >
                            {post.caption.slice(0, 40)}
                            {post.caption.length > 40 ? "..." : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {profileActiveTab === "truths" && (
              <div style={{ padding: "10px 16px 24px" }}>
                {userTruths.length === 0 ? (
                  <div style={{ padding: "64px 24px", textAlign: "center" }}>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "15px",
                        fontWeight: 600,
                        margin: "0 0 4px",
                      }}
                    >
                      No truths yet
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.2)",
                        fontSize: "13px",
                        margin: 0,
                      }}
                    >
                      Truths you take part in will appear here
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "22px",
                    }}
                  >
                    {userTruths.map((truth) => {
                      const badge =
                        truth.state === "APPROVED"
                          ? { label: "Approved", color: "#4ade80" }
                          : truth.state === "ANSWERED"
                            ? { label: "Answered", color: "#22c55e" }
                            : truth.state === "UNDER_REVIEW"
                              ? { label: "Under Review", color: "#fbbf24" }
                              : {
                                  label: "Pending",
                                  color: "rgba(255,255,255,0.4)",
                                };
                      const challenger = getProfile(truth.challengerId);
                      const receiver = getProfile(truth.receiverId);
                      return (
                        <div
                          key={truth.id}
                          style={{
                            width: "100%",
                            background:
                              "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderLeft: `3px solid ${badge.color}`,
                            borderRadius: "20px",
                            padding: "24px 28px",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "18px",
                            boxShadow:
                              "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.28)",
                          }}
                        >
                          <div
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              background: badge.color,
                              boxShadow: `0 0 14px ${badge.color}90`,
                              flexShrink: 0,
                              marginTop: "7px",
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                margin: 0,
                                fontSize: "14px",
                                fontWeight: 600,
                                lineHeight: 1.3,
                                color: "rgba(255,255,255,0.55)",
                                letterSpacing: "-0.005em",
                              }}
                            >
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.9)",
                                  fontSize: "14px",
                                  fontWeight: 600,
                                }}
                              >
                                {challenger.name}
                              </span>
                              <span
                                style={{
                                  margin: "0 6px",
                                  color: "rgba(255,255,255,0.35)",
                                  fontWeight: 500,
                                }}
                              >
                                asked
                              </span>
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.9)",
                                  fontSize: "14px",
                                  fontWeight: 600,
                                }}
                              >
                                {receiver.name}
                              </span>
                            </div>
                            {truth.question && (
                              <p
                                style={{
                                  margin: "8px 0 0",
                                  fontSize: "19px",
                                  fontWeight: 700,
                                  lineHeight: 1.35,
                                  letterSpacing: "-0.02em",
                                  color: "#fff",
                                }}
                              >
                                {truth.question}
                              </p>
                            )}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                marginTop: "13px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: badge.color,
                                  letterSpacing: "0.1em",
                                  textTransform: "uppercase",
                                  padding: "5px 12px",
                                  borderRadius: "99px",
                                  background: `${badge.color}18`,
                                  border: `1px solid ${badge.color}40`,
                                }}
                              >
                                {badge.label}
                              </span>
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.4)",
                                  fontSize: "13px",
                                  fontWeight: 500,
                                }}
                              >
                                {formatTimeAgo(truth.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {profileActiveTab === "dares" && (
              <div style={{ padding: "10px 16px 24px" }}>
                {userDares.length === 0 ? (
                  <div style={{ padding: "64px 24px", textAlign: "center" }}>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "15px",
                        fontWeight: 600,
                        margin: "0 0 4px",
                      }}
                    >
                      No dares yet
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.2)",
                        fontSize: "13px",
                        margin: 0,
                      }}
                    >
                      Dares you take part in will appear here
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "22px",
                    }}
                  >
                    {userDares.map((dare) => {
                      const badge =
                        dare.state === "ACCEPTED_REAL"
                          ? { label: "Completed", color: "#4ade80" }
                          : dare.state === "FRIENDS_VALIDATION"
                            ? { label: "Under Review", color: "#fbbf24" }
                            : dare.state === "PROOF_SUBMITTED"
                              ? { label: "Proof Submitted", color: "#60a5fa" }
                              : {
                                  label: "Pending",
                                  color: "rgba(255,255,255,0.4)",
                                };
                      const challenger = getProfile(dare.challengerId);
                      const receiver = getProfile(dare.receiverId);
                      return (
                        <div
                          key={dare.id}
                          style={{
                            width: "100%",
                            background:
                              "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderLeft: `3px solid ${badge.color}`,
                            borderRadius: "20px",
                            padding: "24px 28px",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "18px",
                            boxShadow:
                              "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.28)",
                          }}
                        >
                          <div
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              background: badge.color,
                              boxShadow: `0 0 14px ${badge.color}90`,
                              flexShrink: 0,
                              marginTop: "7px",
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                margin: 0,
                                fontSize: "14px",
                                fontWeight: 600,
                                lineHeight: 1.3,
                                color: "rgba(255,255,255,0.55)",
                                letterSpacing: "-0.005em",
                              }}
                            >
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.9)",
                                  fontSize: "14px",
                                  fontWeight: 600,
                                }}
                              >
                                {challenger.name}
                              </span>
                              <span
                                style={{
                                  margin: "0 6px",
                                  color: "rgba(255,255,255,0.35)",
                                  fontWeight: 500,
                                }}
                              >
                                dared
                              </span>
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.9)",
                                  fontSize: "14px",
                                  fontWeight: 600,
                                }}
                              >
                                {receiver.name}
                              </span>
                            </div>
                            {dare.description && (
                              <p
                                style={{
                                  margin: "8px 0 0",
                                  fontSize: "19px",
                                  fontWeight: 700,
                                  lineHeight: 1.35,
                                  letterSpacing: "-0.02em",
                                  color: "#fff",
                                }}
                              >
                                {dare.description}
                              </p>
                            )}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                marginTop: "13px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: badge.color,
                                  letterSpacing: "0.1em",
                                  textTransform: "uppercase",
                                  padding: "5px 12px",
                                  borderRadius: "99px",
                                  background: `${badge.color}18`,
                                  border: `1px solid ${badge.color}40`,
                                }}
                              >
                                {badge.label}
                              </span>
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.4)",
                                  fontSize: "13px",
                                  fontWeight: 500,
                                }}
                              >
                                {formatTimeAgo(dare.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderChatList = () => {
    const filteredConversations = guestConversations.filter((conversation) => {
      const profile = getProfile(conversation.userId);
      return profile.name
        .toLowerCase()
        .includes(chatListSearchQuery.toLowerCase());
    });

    const formatConversationTime = (timestamp: unknown): string => {
      if (!timestamp) return "";
      let date: Date | null = null;
      if (timestamp instanceof Date) {
        date = timestamp;
      } else if (
        typeof timestamp === "string" ||
        typeof timestamp === "number"
      ) {
        date = new Date(timestamp);
      }
      if (!date || Number.isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    return (
      <div
        style={{
          fontFamily:
            "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
          height: "100dvh",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 16px)",
        }}
        className="flex flex-col bg-black max-w-7xl mx-auto lg:px-8"
      >
        <div className="safe-area-top px-4 pt-6 pb-0 lg:px-0">
          <div className="bg-gradient-to-br from-[#1a2a1a] to-[#111811] rounded-full px-6 py-4 shadow-[0_8px_32px_rgba(74,222,128,0.18),0_2px_8px_rgba(0,0,0,0.7),0_0_0_1px_rgba(74,222,128,0.07)]">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-extrabold text-white tracking-tight lg:text-4xl">
                Messages
              </h1>
              <button
                onClick={() => setShowFriendsModal(true)}
                className="btn btn-icon bg-[#22c55e] shadow-[0_4px_16px_rgba(34,197,94,0.45)]"
              >
                <Plus size={22} color="#000" strokeWidth={3} />
              </button>
            </div>
          </div>

          <div className="mt-5 bg-[#161616] rounded-2xl px-4 h-13 flex items-center border border-[#222]">
            <Search size={18} className="text-[#555] flex-shrink-0" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={chatListSearchQuery}
              onChange={(e) => setChatListSearchQuery(e.target.value)}
              className="input bg-transparent border-none outline-none text-white text-base ml-2.5 w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-2 lg:px-0 lg:pt-6">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <MessageCircle size={48} className="text-[#64748b] mb-4" />
              <p className="text-[#94a3b8] mb-2">No conversations yet</p>
              <p className="text-[#64748b] text-sm">
                Start a new chat to get messaging!
              </p>
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const profile = getProfile(conversation.userId);
              const unreadCount = conversation.unreadCount ?? 0;
              const isRead = unreadCount === 0;
              const isOnline = Math.random() > 0.5;
              const isTyping = false;
              const latestMessageContent =
                conversation.preview || "No messages yet";
              const latestMessageTime = formatConversationTime(
                conversation.updatedAt,
              );

              return (
                <div
                  key={conversation.id}
                  onClick={() => openConversation(conversation)}
                  className="bg-[#111] rounded-2xl p-3 flex items-center cursor-pointer mb-0.5 border border-[#1e1e1e] transition-all duration-150 hover:bg-[#181818] lg:p-4 lg:mb-1 lg:max-w-3xl lg:mx-auto"
                >
                  <div className="relative flex-shrink-0 lg:w-16 lg:h-16">
                    <GuestAvatar
                      imageUrl={profile.avatarUrl}
                      name={profile.name}
                      size={52}
                    />
                    <div
                      className={`absolute right-0.5 bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#111] ${
                        isOnline
                          ? "bg-[#22c55e] shadow-[0_0_0_2px_rgba(34,197,94,0.18)]"
                          : "bg-[#2a2a2a]"
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0 ml-3">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`${
                          isRead
                            ? "text-[#aaa] font-medium"
                            : "text-white font-bold"
                        } text-base truncate max-w-40`}
                      >
                        {profile.name}
                      </span>
                      <span
                        className="text-[#555] text-xs flex-shrink-0 ml-2"
                        style={{
                          visibility:
                            isTyping || !latestMessageTime
                              ? "hidden"
                              : "visible",
                        }}
                      >
                        {latestMessageTime}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p
                        className={`${
                          isTyping
                            ? "text-[#4ade80]"
                            : isRead
                              ? "text-[#444]"
                              : "text-[#888]"
                        } text-sm truncate flex-1 ${isRead ? "italic" : ""} ${isTyping ? "font-semibold" : ""}`}
                      >
                        {isTyping ? "typing..." : latestMessageContent}
                      </p>

                      <div className="flex items-center gap-1.5 ml-2">
                        {isTyping && (
                          <div className="flex gap-0.5 items-center">
                            {[0, 0.1, 0.2].map((delay, i) => (
                              <div
                                key={i}
                                className="w-1 h-1 bg-[#4ade80] rounded-full animate-bounce"
                                style={{ animationDelay: `${delay}s` }}
                              />
                            ))}
                          </div>
                        )}
                        {!isTyping && unreadCount > 0 && (
                          <span className="bg-[#22c55e] text-black text-xs font-bold min-w-[20px] h-5 rounded-[10px] flex items-center justify-center px-1.5">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                        {!isTyping && unreadCount === 0 && (
                          <svg
                            width="20"
                            height="14"
                            viewBox="0 0 20 14"
                            fill="none"
                          >
                            <path
                              d="M1 7L5.5 11.5L14 3"
                              stroke="#22c55e"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M7 7L11.5 11.5L20 3"
                              stroke="#22c55e"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <style>{`
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
        `}</style>

        {/* Friends Modal */}
        {showFriendsModal && (
          <>
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.85)",
                backdropFilter: "blur(20px)",
                zIndex: 200,
              }}
              onClick={() => setShowFriendsModal(false)}
            />
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "#111",
                borderRadius: "24px",
                width: "90%",
                maxWidth: "400px",
                maxHeight: "70vh",
                zIndex: 201,
                border: "1px solid #222",
                boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
              }}
              className="lg:max-w-2xl lg:max-h-[80vh]"
            >
              <div
                style={{
                  padding: "20px",
                  borderBottom: "1px solid #222",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#fff",
                  }}
                >
                  Start Chat
                </h2>
                <button
                  onClick={() => setShowFriendsModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#888",
                    cursor: "pointer",
                    fontSize: "24px",
                  }}
                >
                  ×
                </button>
              </div>
              <div
                style={{
                  padding: "20px",
                  overflowY: "auto",
                }}
                className="lg:px-8"
              >
                {guestUsers.map((friend) => (
                  <div
                    key={friend.id}
                    onClick={() => {
                      openConversation({
                        id: `conv-${friend.id}`,
                        userId: friend.id,
                        messages: [],
                        preview: "",
                        updatedAt: new Date().toISOString(),
                        unreadCount: 0,
                      });
                      setShowFriendsModal(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px",
                      borderRadius: "12px",
                      cursor: "pointer",
                      background: "rgba(255,255,255,0.03)",
                      marginBottom: "8px",
                      transition: "background 0.2s",
                    }}
                    className="lg:p-4 lg:mb-2 lg:gap-4"
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.06)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.03)")
                    }
                  >
                    <div style={{ flexShrink: 0 }}>
                      <GuestAvatar
                        imageUrl={friend.avatarUrl}
                        name={friend.name}
                        size={44}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 15,
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {friend.name}
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: 13,
                          margin: "2px 0 0",
                        }}
                      >
                        @{friend.username}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderChat = () => {
    const conversation = selectedConversation;
    const profile = getProfile(conversation.userId);
    const isOnline = Math.random() > 0.5;
    const activeMoodTheme = getMoodTheme(currentMoodBlock?.mood ?? "");

    const messages = conversation.messages.map((msg) => ({
      ...msg,
      isOwn: msg.senderId === guestUser.id,
    }));

    const handleMoodBlockSelect = (
      mood: "angry" | "crying" | "irritated" | "depressed",
    ) => {
      const now = Date.now();
      const endTime = now + 10 * 60 * 1000; // 10 minutes
      setCurrentMoodBlock({
        mood,
        initiatedBy: guestUser.id,
        initiatedByName: guestUser.displayName || "You",
        startTime: now,
        endTime,
      });
      setMoodBlockModalOpen(false);
      setProgressBarWidth(100);
    };

    return (
      <div
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
          color: "#fff",
          overflow: "hidden",
          height: "100dvh",
        }}
        className="flex flex-col bg-black"
      >
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes capsuleIn {
            from { opacity: 0; transform: translateX(12px) scale(0.92); }
            to { opacity: 1; transform: translateX(0) scale(1); }
          }
        `}</style>

        {/* Header */}
        <div className="safe-area-top flex-shrink-0 bg-black pt-2.5 pb-1.5 px-2.5 rounded-b-[18px]">
          <div className="p-1">
            <div className="flex items-center justify-between bg-[#131313] rounded-full px-4 py-2.5 shadow-[0_12px_40px_rgba(80,80,80,0.25),0_4px_16px_rgba(60,60,60,0.2),0_1px_0_rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentScreen("chat-list")}
                  className="text-[#666] text-[26px] cursor-pointer leading-none pr-0.5"
                >
                  {"<"}
                </button>
                <div className="relative">
                  <GuestAvatar
                    imageUrl={profile.avatarUrl}
                    name={profile.name}
                    size={44}
                  />
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-[2.5px] border-[#131313] transition-all duration-350 ${
                      isOnline
                        ? "bg-[#3df57f] shadow-[0_0_6px_rgba(61,245,127,0.6)]"
                        : "bg-[#333]"
                    }`}
                  />
                </div>
                <div className="flex flex-col">
                  <div className="text-[15px] font-semibold text-white">
                    {profile.name}
                  </div>
                  <div
                    className={`text-[11px] font-bold tracking-[0.09em] mt-0.5 transition-colors duration-300 ${
                      chatFriendTyping
                        ? "text-[#3df57f]"
                        : isOnline
                          ? "text-[#3df57f]"
                          : "text-[#444]"
                    }`}
                  >
                    {chatFriendTyping
                      ? "TYPING..."
                      : isOnline
                        ? "ACTIVE NOW"
                        : "OFFLINE"}
                  </div>
                </div>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setChatMenuOpen((o) => !o)}
                  className="w-11 h-11 rounded-full border-none bg-[#1e1e1e] text-white text-[18px] cursor-pointer flex items-center justify-center"
                >
                  •••
                </button>
                {chatMenuOpen && (
                  <>
                    <div
                      className="app-modal-backdrop fixed inset-0 z-50"
                      onClick={() => setChatMenuOpen(false)}
                    />
                    <div className="absolute top-14 right-0 z-[51] flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setChatMenuOpen(false);
                          setMoodBlockModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-full bg-[#121212]/97 backdrop-blur-xl text-white text-[14px] font-semibold cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.7)] whitespace-nowrap"
                        style={{ animation: "capsuleIn 0.18s 0s ease both" }}
                      >
                        <span className="text-[16px]">😠</span>
                        Mood Block
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChatMenuOpen(false);
                          setChatFrozen(!chatFrozen);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-full bg-[#121212]/97 backdrop-blur-xl text-white text-[14px] font-semibold cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.7)] whitespace-nowrap"
                        style={{ animation: "capsuleIn 0.18s 0.04s ease both" }}
                      >
                        <span className="text-[16px]">🧊</span>
                        {chatFrozen ? "Unfreeze chat" : "Freeze chat"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatMenuOpen(false)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-full bg-[#121212]/97 backdrop-blur-xl text-white text-[14px] font-semibold cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.7)] whitespace-nowrap"
                        style={{ animation: "capsuleIn 0.18s 0.08s ease both" }}
                      >
                        <span className="text-[16px]">💬</span>
                        Clear chat
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatMenuOpen(false)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-full bg-[#121212]/97 backdrop-blur-xl text-white text-[14px] font-semibold cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.7)] whitespace-nowrap"
                        style={{ animation: "capsuleIn 0.18s 0.12s ease both" }}
                      >
                        <span className="text-[16px]">🫥</span>
                        Mute notifications
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {chatFriendTyping && (
            <div className="flex justify-start">
              <div className="bg-[#222] rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  msg.isOwn ? "bg-[#3df57f] text-black" : "bg-[#222] text-white"
                }`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 py-3 bg-[#111]">
          <div className="flex items-center gap-2 bg-[#222] rounded-full px-4 py-2">
            <button
              type="button"
              className="text-white/60 hover:text-white transition-colors"
            >
              <AtSign size={18} />
            </button>
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Type a message... @ to mention"
              className="flex-1 bg-transparent text-white outline-none text-sm"
              disabled={chatFrozen || !!currentMoodBlock}
            />
            <button
              type="button"
              onClick={() => {
                if (chatMessage.trim()) {
                  setChatMessage("");
                }
              }}
              className="text-[#3df57f]"
              disabled={chatFrozen || !!currentMoodBlock}
            >
              <Send size={18} />
            </button>
          </div>
          {(chatFrozen || currentMoodBlock) && (
            <div className="mt-2 text-center text-xs text-white/40">
              {chatFrozen ? "Chat is frozen" : "Mood block active"}
            </div>
          )}
        </div>

        {/* Mood Block Modal */}
        {moodBlockModalOpen && (
          <MoodBlockModal
            onClose={() => setMoodBlockModalOpen(false)}
            onSelect={handleMoodBlockSelect}
          />
        )}

        {/* Mood Block UI */}
        {currentMoodBlock && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: activeMoodTheme.panel,
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <style>{`
              @keyframes moodProgressGlow {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
              }
            `}</style>
            <div
              style={{
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(20px)",
                borderRadius: 24,
                padding: 32,
                width: "100%",
                maxWidth: 360,
                border: `1px solid ${activeMoodTheme.accentSoft}`,
                boxShadow: `0 24px 48px ${activeMoodTheme.accentGlow}`,
              }}
            >
              <div
                style={{
                  fontSize: 64,
                  marginBottom: 16,
                  textAlign: "center",
                }}
              >
                {currentMoodBlock.mood === "angry"
                  ? "😠"
                  : currentMoodBlock.mood === "crying"
                    ? "😢"
                    : currentMoodBlock.mood === "irritated"
                      ? "😤"
                      : "😔"}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: activeMoodTheme.accent,
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {activeMoodTheme.label}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.6)",
                  marginBottom: 24,
                  textAlign: "center",
                }}
              >
                {currentMoodBlock.initiatedByName} started a mood block
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <span style={{ color: "#666" }}>⏳ Please wait...</span>
                <span style={{ color: "#666" }}>·</span>
                <MoodBlockTimer endTime={currentMoodBlock.endTime} />
              </div>

              <button
                onClick={() => setCurrentMoodBlock(null)}
                style={{
                  alignSelf: "flex-start",
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${activeMoodTheme.accentSoft}`,
                  borderRadius: 999,
                  padding: "10px 15px",
                  color: activeMoodTheme.accent,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
              >
                Skip
              </button>
            </div>

            <div
              style={{
                height: 6,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 999,
                overflow: "hidden",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
                width: "100%",
                maxWidth: 360,
                marginTop: 16,
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: `linear-gradient(90deg, ${activeMoodTheme.accent}, rgba(255,255,255,0.92))`,
                  borderRadius: 999,
                  transition: "width 1s linear",
                  width: `${progressBarWidth}%`,
                  animation: "moodProgressGlow 2.2s ease-in-out infinite",
                  boxShadow: `0 0 16px ${activeMoodTheme.accentGlow}`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAlerts = () => {
    const getAlertMeta = (alert: any) => {
      switch (alert.type) {
        case "like":
          return {
            label: "Post Liked",
            accentBarClass: "bg-pink-400",
            pillClass: "border-pink-500/25 bg-pink-500/10 text-pink-300",
            glowClass: "bg-pink-500/14",
            railClass: "from-pink-500/0 via-pink-500/80 to-pink-500/0",
            icon: <Heart size={12} fill="currentColor" />,
          };
        case "comment":
          return {
            label: "New Comment",
            accentBarClass: "bg-sky-400",
            pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
            glowClass: "bg-sky-500/14",
            railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
            icon: <MessageSquare size={12} />,
          };
        case "friend_request":
          return {
            label: "Friend Request",
            accentBarClass: "bg-[#4ade80]",
            pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
            glowClass: "bg-[#4ade80]/14",
            railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
            icon: <Star size={12} />,
          };
        case "dare":
          return {
            label: "Dare Received",
            accentBarClass: "bg-[#f59e0b]",
            pillClass: "border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#fbbf24]",
            glowClass: "bg-[#f59e0b]/14",
            railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
            icon: <Target size={12} />,
          };
        default:
          return {
            label: "Alert",
            accentBarClass: "bg-[#4ade80]",
            pillClass: "border-white/10 bg-white/[0.05] text-white",
            glowClass: "bg-[#4ade80]/10",
            railClass: "from-[#4ade80]/0 via-[#4ade80]/60 to-[#4ade80]/0",
            icon: <BellRing size={12} />,
          };
      }
    };

    const getTimeAgo = (createdAt: string): string => {
      const alertTime = new Date(createdAt);
      const now = new Date();
      const diffInMs = now.getTime() - alertTime.getTime();
      const diffInMins = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      if (diffInMins < 1) return "Just now";
      if (diffInMins < 60) return `${diffInMins}m ago`;
      if (diffInHours < 24) return `${diffInHours}h ago`;
      return `${diffInDays}d ago`;
    };

    return (
      <div className="px-4 pb-8 pt-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setAlertsActiveTab("social")}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
              alertsActiveTab === "social"
                ? "bg-[#4ade80] text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            Social
          </button>
          <button
            type="button"
            onClick={() => setAlertsActiveTab("sus")}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
              alertsActiveTab === "sus"
                ? "bg-[#4ade80] text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            SUS
          </button>
        </div>

        {/* Section Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]">
            <Sparkles size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#86efac]">
              Today
            </p>
            <div className="mt-2 h-px w-full bg-gradient-to-r from-[#4ade80]/0 via-[#4ade80]/70 to-[#4ade80]/0" />
          </div>
        </div>

        {/* Alert Items */}
        <div className="space-y-3">
          {alertsActiveTab === "social"
            ? guestAlerts.map((alert, index) => {
                const meta = getAlertMeta(alert);
                const profile = getProfile(alert.userId);

                return (
                  <div
                    key={alert.id}
                    className="group relative isolate overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(22,26,22,0.98),rgba(14,16,14,0.98))] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:border-[#4ade80]/20 hover:shadow-[0_24px_54px_rgba(0,0,0,0.5),0_0_32px_rgba(74,222,128,0.12)] animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div
                      className={`pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r ${meta.railClass}`}
                    />
                    <div
                      className={`pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full blur-3xl ${meta.glowClass}`}
                    />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_70%)] opacity-60" />
                    <div className="flex items-start space-x-3">
                      <div className="relative shrink-0">
                        <GuestAvatar
                          imageUrl={profile.avatarUrl}
                          name={profile.name}
                          size={44}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1 inline-flex rounded-full border border-white/7 bg-white/[0.04] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7dd3a7] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                              Social
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-bold tracking-tight text-white">
                                {profile.name}
                              </span>
                              <span className="truncate text-xs text-[#6ee7b7]">
                                @{profile.username}
                              </span>
                            </div>
                          </div>
                          <span className="shrink-0 pt-1 text-[11px] font-medium text-[#64748b]">
                            {getTimeAgo(alert.createdAt)}
                          </span>
                        </div>

                        <p className="mb-3 text-[14px] leading-relaxed text-[#e2e8f0]">
                          {alert.body}
                        </p>

                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <div
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${meta.pillClass}`}
                          >
                            {meta.icon}
                            <span>{meta.label}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            : guestSusAlerts.map((alert, index) => {
                const profile = getProfile(alert.userId);
                const isLive = alert.type === "live_view";

                return (
                  <div
                    key={alert.id}
                    className="group relative isolate overflow-hidden rounded-[28px] border border-red-500/20 bg-[linear-gradient(180deg,rgba(40,20,20,0.98),rgba(30,10,10,0.98))] p-4 shadow-[0_18px_44px_rgba(220,38,38,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:border-red-500/40 hover:shadow-[0_24px_54px_rgba(220,38,38,0.3),0_0_32px_rgba(239,68,68,0.15)] animate-slide-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0" />
                    <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full blur-3xl bg-red-500/20" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.1),transparent_70%)] opacity-60" />
                    <div className="flex items-start space-x-3">
                      <div className="relative shrink-0">
                        <GuestAvatar
                          imageUrl={profile.avatarUrl}
                          name={profile.name}
                          size={44}
                        />
                        {isLive && (
                          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 shadow-lg">
                            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-red-400 shadow-[inset_0_1px_0_rgba(239,68,68,0.2)]">
                              SUS
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-bold tracking-tight text-white">
                                {profile.name}
                              </span>
                              <span className="truncate text-xs text-red-400">
                                @{profile.username}
                              </span>
                            </div>
                          </div>
                          {isLive && alert.duration && (
                            <span className="shrink-0 pt-1 text-[11px] font-medium text-red-400">
                              {alert.duration}
                            </span>
                          )}
                        </div>

                        <p className="mb-3 text-[14px] leading-relaxed text-[#fca5a5]">
                          {alert.type === "live_view"
                            ? "is viewing your profile"
                            : alert.type === "story_reaction"
                              ? `reacted to your story ${alert.count} times`
                              : `liked your post ${alert.count} times`}
                        </p>

                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-red-400">
                            <Eye size={12} />
                            <span>
                              {alert.type === "live_view" ? "Live" : "Recent"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    );
  };

  const renderSearch = () => {
    const frequentSearches = guestUsers
      .filter((user) => user.id !== guestUser.id)
      .slice(0, 3);
    const newOnDare = guestUsers
      .filter((user) => user.id !== guestUser.id)
      .slice(3, 6);

    return (
      <div className="screen-container bg-[radial-gradient(circle_at_top,#162016_0%,#0b100b_45%,#070a07_100%)]">
        <div className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(11,16,11,0.96),rgba(11,16,11,0.78))] backdrop-blur-xl">
          <div className="px-4 pb-5 pt-4">
            <div className="mb-4 flex items-center gap-4">
              <button
                onClick={() => setCurrentScreen("feed")}
                className="rounded-full border border-white/8 bg-white/5 p-2.5 text-[#94a3b8] transition-colors hover:text-white"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white">Search users</h1>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,29,24,0.98),rgba(17,21,17,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-3 rounded-full border border-white/6 bg-black/20 px-4 py-3">
                <Search size={18} className="text-[#7f8b7f]" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search by username or display name"
                  className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-[#64748b]"
                  autoFocus
                />
                {searchText ? (
                  <button
                    onClick={() => setSearchText("")}
                    className="rounded-full bg-white/6 p-1.5 text-[#94a3b8] transition-colors hover:text-white"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-8 pt-4">
          {searchText.trim() ? (
            filteredUsers.length > 0 ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-[#4ade80]/15 bg-[#4ade80]/[0.08] px-4 py-3 text-sm text-[#d8ffe3]">
                  Found {filteredUsers.length}{" "}
                  {filteredUsers.length === 1 ? "person" : "people"} for "
                  {searchText}"
                </div>

                <div className="space-y-3">
                  {filteredUsers.map((user, index) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => openProfile(user.id)}
                      className="flex w-full items-center gap-3 rounded-[26px] border border-white/6 bg-white/[0.03] px-4 py-4 text-left animate-slide-up transition-colors hover:border-[#4ade80]/25 hover:bg-white/[0.05]"
                      style={{ animationDelay: `${index * 0.04}s` }}
                    >
                      <GuestAvatar
                        imageUrl={user.avatarUrl}
                        name={user.name}
                        size={56}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-white">
                          {user.name}
                        </p>
                        <p className="truncate text-sm text-[#7f8b7f]">
                          @{user.username}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(22,26,22,0.98),rgba(15,18,15,0.98))] px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/8 bg-white/5 text-[#7f8b7f]">
                  <User size={28} />
                </div>
                <p className="text-lg font-semibold text-white">
                  No users found for "{searchText}"
                </p>
                <p className="mt-2 text-sm text-[#7f8b7f]">
                  Try another name or username.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-6">
              <div className="rounded-[30px] border border-white/6 bg-[linear-gradient(135deg,rgba(20,28,20,0.98),rgba(13,16,13,0.98))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.26)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-3 inline-flex rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86efac]">
                      Discovery
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      Find the newest people joining Dare
                    </h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#8ea18e]">
                      Guest mode uses curated mock profiles so the search
                      experience still feels like the real app.
                    </p>
                  </div>
                  <div className="rounded-[24px] bg-[radial-gradient(circle_at_top,#4ade80_0%,rgba(74,222,128,0.12)_35%,transparent_70%)] p-3 text-[#86efac]">
                    <Sparkles size={24} />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader icon={<Users size={15} />} title="New on Dare" />
                <div className="space-y-3">
                  {newOnDare.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => openProfile(user.id)}
                      className="flex w-full items-center gap-3 rounded-[26px] border border-white/6 bg-white/[0.03] px-4 py-4 text-left transition-colors hover:border-[#4ade80]/25 hover:bg-white/[0.05]"
                    >
                      <GuestAvatar
                        imageUrl={user.avatarUrl}
                        name={user.name}
                        size={56}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-white">
                          {user.name}
                        </p>
                        <p className="truncate text-sm text-[#7f8b7f]">
                          @{user.username}
                        </p>
                      </div>
                      <span className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86efac]">
                        New
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionHeader
                  icon={<Flame size={15} />}
                  title="Frequent searches"
                />
                <div className="space-y-3">
                  {frequentSearches.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => openProfile(user.id)}
                      className="flex w-full items-center gap-3 rounded-[26px] border border-white/6 bg-white/[0.03] px-4 py-4 text-left transition-colors hover:border-[#4ade80]/25 hover:bg-white/[0.05]"
                    >
                      <GuestAvatar
                        imageUrl={user.avatarUrl}
                        name={user.name}
                        size={56}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-white">
                          {user.name}
                        </p>
                        <p className="truncate text-sm text-[#7f8b7f]">
                          @{user.username}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                        Frequent
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderUserProfile = () => (
    <div className="px-4 pb-8 pt-4">
      <div className="rounded-[32px] border border-white/10 bg-[#101610] p-5">
        <div className="flex items-center gap-4">
          <GuestAvatar
            imageUrl={selectedProfile.avatarUrl}
            name={selectedProfile.name}
            size={72}
          />
          <div>
            <h2 className="text-2xl font-semibold text-white lg:text-3xl">
              {selectedProfile.name}
            </h2>
            <p className="text-sm text-[#96a998]">
              @{selectedProfile.username}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#d8e4d9]">
          {selectedProfile.bio}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-3 text-center">
            <p className="text-lg font-semibold text-white">
              {selectedProfile.stats.posts}
            </p>
            <p className="text-xs text-[#92a494]">Posts</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3 text-center">
            <p className="text-lg font-semibold text-white">
              {selectedProfile.stats.daresCompleted}
            </p>
            <p className="text-xs text-[#92a494]">Completed</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3 text-center">
            <p className="text-lg font-semibold text-white">
              {selectedProfile.stats.friends}
            </p>
            <p className="text-xs text-[#92a494]">Friends</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <GlassButton
          onClick={() => {
            const match = guestConversations.find(
              (conversation) => conversation.userId === selectedProfile.id,
            );
            if (match) {
              openConversation(match);
            }
          }}
          className="flex-1"
        >
          Preview chat
        </GlassButton>
        <GlassButton
          onClick={() => setCurrentScreen("activity")}
          className="flex-1"
        >
          View activity
        </GlassButton>
      </div>

      <SectionHeader title="Featured mock post" />
      <div className="space-y-4">
        {guestFeedPosts
          .filter((post) => post.authorId === selectedProfile.id)
          .slice(0, 1)
          .map((post) => (
            <article
              key={post.id}
              className="rounded-[28px] border border-white/10 bg-[#101610] p-4"
            >
              <div
                className={`rounded-[24px] bg-gradient-to-br ${post.accent} px-4 py-10 text-white`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                  Demo media
                </p>
                <p className="mt-2 text-xl font-semibold">{post.mediaLabel}</p>
              </div>
              <p className="mt-4 text-sm text-white">{post.caption}</p>
            </article>
          ))}
      </div>
    </div>
  );

  const renderActivity = () => (
    <div className="px-4 pb-8 pt-4 space-y-4">
      {guestActivity.map((item, index) => (
        <article
          key={item.id}
          className="card-compact rounded-[28px] border border-white/10 bg-[#101610] p-4 animate-slide-up"
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">{item.title}</p>
            <span className="text-xs text-[#92a494]">
              {formatTimeAgo(item.createdAt)}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#d5e1d7]">{item.detail}</p>
        </article>
      ))}
    </div>
  );

  const renderCreate = () => (
    <div className="px-4 pb-8 pt-4">
      <div className="rounded-[32px] border border-white/10 bg-[#101610] p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[#4ade80]/15 p-3 text-[#4ade80]">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              Create flow preview
            </h2>
            <p className="text-sm text-[#93a594]">
              Preview mode - changes are temporary
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {[
            "Create truth prompt",
            "Create dare challenge",
            "Create feed post",
          ].map((label) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
            >
              <span className="text-sm text-white">{label}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-[#9aab9b]">
                Preview only
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBody = () => {
    switch (currentScreen) {
      case "feed":
        return (
          <>
            {isDesktop ? renderTopBar("Home") : null}
            {renderFeed()}
            {storyModalOpen && (
              <StoryModal onClose={() => setStoryModalOpen(false)} />
            )}
          </>
        );
      case "main":
        return (
          <>
            <GuestMainScreen onNavigateToProfile={openProfile} />
          </>
        );
      case "dares":
        return <>{renderDares()}</>;
      case "profile":
        return <>{renderProfile()}</>;
      case "chat-list":
        return (
          <>
            {renderTopBar("Chats", "feed")}
            {renderChatList()}
          </>
        );
      case "chat":
        return (
          <>
            {renderTopBar("Conversation", "chat-list")}
            {renderChat()}
          </>
        );
      case "alerts":
        return (
          <>
            {renderTopBar("Alerts", "feed")}
            {renderAlerts()}
          </>
        );
      case "user-search":
        return <>{renderSearch()}</>;
      case "user-profile":
        return (
          <>
            {renderTopBar("Profile Preview", "user-search")}
            {renderUserProfile()}
          </>
        );
      case "activity":
        return (
          <>
            {renderTopBar("Activity", "profile")}
            {renderActivity()}
          </>
        );
      case "create":
        return (
          <>
            {renderTopBar("Create", "profile")}
            {renderCreate()}
          </>
        );
      default:
        return null;
    }
  };

  const tabScreen =
    currentScreen === "chat-list"
      ? "main"
      : currentScreen === "create"
        ? "profile"
        : currentScreen;

  return (
    <div className="app-viewport bg-[#0a0f0a]">
      {isDesktop ? (
        <DesktopNavigation
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
        />
      ) : null}
      <div className={`${isDesktop ? "max-w-7xl mx-auto" : ""}`}>
        {renderBody()}
        {showActionPicker && (
          <ActionPickerModal
            onClose={() => setShowActionPicker(false)}
            onSelectAction={(action) => {
              setShowActionPicker(false);
              if (action === "truth") {
                setCreateMode("truth");
                setShowCreateInteraction(true);
              } else if (action === "dare") {
                setCreateMode("dare");
                setShowCreateInteraction(true);
              } else if (action === "feed") {
                goBackInGuestApp("feed");
              }
            }}
          />
        )}
        {showCreateInteraction && (
          <CreateInteractionModal
            onClose={() => setShowCreateInteraction(false)}
            mode={createMode}
          />
        )}
        {storyViewerOpen && guestStorySlides.length > 0 && (
          <GuestStoryViewerModal
            stories={guestStorySlides}
            initialIndex={storyViewerIndex}
            onClose={() => setStoryViewerOpen(false)}
            onNavigateToProfile={openProfile}
          />
        )}
        {showCommentModal && selectedPostId && (
          <CommentModal
            onClose={() => setShowCommentModal(false)}
            postId={selectedPostId}
          />
        )}
        {showShareModal && selectedPostId && (
          <ShareModal
            onClose={() => setShowShareModal(false)}
            postId={selectedPostId}
          />
        )}
        {showLikesModal &&
          selectedPostId &&
          (() => {
            const selectedPost = guestFeedPosts.find(
              (p) => p.id === selectedPostId,
            );
            if (!selectedPost) return null;
            const author = getProfile(selectedPost.authorId);
            const likeCount = likeCounts[selectedPostId] || 0;
            return (
              <div
                className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                  animation: "backdropFadeIn 0.25s ease-out forwards",
                }}
                onClick={() => setShowLikesModal(false)}
              >
                <style>{`
                @keyframes backdropFadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                @keyframes slideUpFromBottom {
                  from { transform: translateY(100%); }
                  to { transform: translateY(0); }
                }
                @keyframes fadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
                .modal-fade-in { animation: fadeIn 0.2s ease-out forwards; }
              `}</style>
                <div
                  className="app-modal-sheet bg-[#111] w-full rounded-t-3xl flex flex-col"
                  style={{
                    maxHeight: "98vh",
                    minHeight: "60vh",
                    touchAction: "pan-y",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-6 pt-4 pb-3 shrink-0">
                    <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-5" />
                    <h3 className="text-white font-bold text-lg mb-1">Likes</h3>
                    <p className="text-[#64748b] text-sm mb-3">
                      {likeCount} total likes
                    </p>
                  </div>
                  {likeCount === 0 ? (
                    <p className="text-[#64748b] text-center py-8 text-sm">
                      No likes yet
                    </p>
                  ) : (
                    <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
                      {[author].map((user, index) => (
                        <div
                          key={user.id}
                          className="flex items-center space-x-4 p-3 bg-[#1a1a1a] rounded-2xl modal-fade-in"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <GuestAvatar
                            imageUrl={user.avatarUrl}
                            name={user.name}
                            size={64}
                          />
                          <div className="flex-1">
                            <p
                              onClick={() => {
                                openProfile(user.id);
                                setShowLikesModal(false);
                              }}
                              className="text-sm text-[#94a3b8] cursor-pointer hover:text-[#4ade80] transition-colors"
                            >
                              {user.username}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-full px-4 py-2">
                            <Heart
                              size={14}
                              fill="#ef4444"
                              className="text-red-500"
                            />
                            <span className="text-white text-sm font-semibold">
                              liked
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        {["feed", "main", "dares", "profile"].includes(currentScreen) &&
        !isDesktop ? (
          <BottomNavigation
            currentScreen={tabScreen as "feed" | "main" | "dares" | "profile"}
            onScreenChange={(screen) => setCurrentScreen(screen)}
            onCreateClick={() => setShowActionPicker(true)}
          />
        ) : null}
        {!["feed", "main", "dares", "profile"].includes(currentScreen) ? (
          <button
            type="button"
            onClick={() => goBackInGuestApp("feed")}
            className="fixed bottom-6 right-4 rounded-full border border-white/10 bg-[#0f1811] p-3 text-white shadow-[0_20px_45px_rgba(0,0,0,0.35)]"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
