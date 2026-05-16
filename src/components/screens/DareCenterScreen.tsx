"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  Eye,
  Heart,
  ImagePlus,
  MessageCircle,
  MessageSquare,
  Play,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
  Zap,
} from "lucide-react";

type CenterTarget =
  | "create"
  | "dares"
  | "daily"
  | "feed"
  | "main"
  | "alerts"
  | "chat";

type DareCenterPage = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  icon: LucideIcon;
  steps: string[];
  stats: [string, string][];
  cta: string;
  ctaTarget: CenterTarget;
};

const pages: DareCenterPage[] = [
  {
    id: "map",
    eyebrow: "Start here",
    title: "Dare is not just another feed",
    body: "It is built around pressure, proof, visibility, and tiny social signals that turn normal posting into a game.",
    accent: "#4ade80",
    icon: Sparkles,
    steps: [
      "Use the plus button for posts, truths, and dares.",
      "Use Home for stories and posts from friends.",
      "Use Feed for the public dare and truth voting deck.",
    ],
    stats: [
      ["4 lanes", "Home, Dares, Feed, Profile"],
      ["1 hidden", "Long-press DARE"],
    ],
    cta: "Open creator",
    ctaTarget: "create",
  },
  {
    id: "dare-loop",
    eyebrow: "Signature flow",
    title: "Dare, prove, get judged real or fake",
    body: "A dare is sent to a friend, accepted, completed with proof, then pushed into review so the result can become a public moment.",
    accent: "#facc15",
    icon: Target,
    steps: [
      "Tap plus, choose Give a Dare, tag a friend, and write the action.",
      "The receiver accepts or refuses from the Dares screen.",
      "After proof is submitted, friends validate it as real or fake.",
    ],
    stats: [
      ["Proof", "image or video"],
      ["Votes", "real vs fake"],
    ],
    cta: "Go to Dares",
    ctaTarget: "dares",
  },
  {
    id: "ghost",
    eyebrow: "After approval",
    title: "Ghost Mode rewards completed dares",
    body: "When a dare is accepted as real, the app activates a short quiet window that suppresses surveillance-style alerts.",
    accent: "#86efac",
    icon: ShieldCheck,
    steps: [
      "Complete a dare and get it approved as real.",
      "Watch the DARE header turn into a live countdown.",
      "During Ghost Mode, profile, photo, mention, and like alerts stay quiet.",
    ],
    stats: [
      ["15 min", "standard timer"],
      ["Quiet", "alert suppression"],
    ],
    cta: "See alerts",
    ctaTarget: "alerts",
  },
  {
    id: "truth",
    eyebrow: "Truth engine",
    title: "Truth or Lie turns answers into votes",
    body: "Truth prompts create a separate social game: someone answers, then friends decide if the answer feels true or fake.",
    accent: "#60a5fa",
    icon: MessageSquare,
    steps: [
      "Tap plus, choose Ask a Truth, tag a friend, and ask the question.",
      "They answer from the Dares screen.",
      "Approved answers appear in the Feed deck for Truth or Lie voting.",
    ],
    stats: [
      ["2 choices", "truth or lie"],
      ["Comments", "debate inside the sheet"],
    ],
    cta: "Open Feed",
    ctaTarget: "main",
  },
  {
    id: "daily",
    eyebrow: "Daily challenge",
    title: "Match Hour creates one focused chat",
    body: "Every day at 8:00 PM, Dare can randomly match you with a friend and a question that opens a real conversation.",
    accent: "#38bdf8",
    icon: Clock3,
    steps: [
      "Tap the sparkle button in the Home header.",
      "Enter the match room and roll a random friend.",
      "Pick a suggested question or write your own, then accept to open chat.",
    ],
    stats: [
      ["8 PM", "daily unlock"],
      ["1 chat", "one first question"],
    ],
    cta: "Open Match Hour",
    ctaTarget: "daily",
  },
  {
    id: "stories",
    eyebrow: "Stories plus",
    title: "Dedications, filters, text, music, reactions",
    body: "Stories are built as tiny editable scenes, not just uploads. You can dedicate one to a friend, move text, add a filter, and attach generated music.",
    accent: "#fb7185",
    icon: ImagePlus,
    steps: [
      "Tap Your Story on Home.",
      "Choose Personal or Dedication before picking media.",
      "Drag text, pick a filter, choose generated music, then publish.",
    ],
    stats: [
      ["Audience", "views, likes, hates"],
      ["Reply", "story goes into DM"],
    ],
    cta: "Go Home",
    ctaTarget: "feed",
  },
  {
    id: "signals",
    eyebrow: "Social radar",
    title: "Dare shows the signals other apps hide",
    body: "The alert system tracks repeated likes, live profile viewing, photo views, mention talk, close-friend activity, and grouped story reactions.",
    accent: "#ef4444",
    icon: Bell,
    steps: [
      "Open Alerts to split social notifications from suspicious signals.",
      "Live profile views update while someone is on your profile.",
      "Ghost Mode suppresses these signals when someone earned privacy.",
    ],
    stats: [
      ["Live", "profile watching"],
      ["Thresholds", "5, 10, 20, 50 taps"],
    ],
    cta: "Open Alerts",
    ctaTarget: "alerts",
  },
  {
    id: "multi-like",
    eyebrow: "Multi-like posts",
    title: "Every like tap counts, not just the first",
    body: "Dare posts remember repeated likes from the same person. The feed shows unique likers, the likes sheet shows tap counts, and sus alerts fire when someone keeps tapping.",
    accent: "#a3e635",
    icon: Heart,
    steps: [
      "Double tap a post to burst hearts and add another tap.",
      "Open the likes sheet to see who liked and how many times they tapped.",
      "At bigger tap counts, Dare can surface repeated-like alerts.",
    ],
    stats: [
      ["Tap count", "saved per person"],
      ["Signals", "5, 10, 20, 50 taps"],
    ],
    cta: "Go Home",
    ctaTarget: "feed",
  },
  {
    id: "messaging",
    eyebrow: "Messaging layer",
    title: "Chat has presence, signals, invites, and rich shares",
    body: "Dare messaging is wired into the rest of the app: shared posts and stories become previews, typing and online state are live, seen state is tracked, and chat events can reveal behavior.",
    accent: "#c084fc",
    icon: MessageCircle,
    steps: [
      "Open Messages from the Home header or bottom flows.",
      "Share a post or reply to a story to send a rich preview into chat.",
      "Watch typing, online, seen, temporary invite, and chat-switch signals update live.",
    ],
    stats: [
      ["Live", "typing and online"],
      ["Rich", "post/story previews"],
    ],
    cta: "Open Messages",
    ctaTarget: "chat",
  },
];

function clampPage(index: number) {
  return Math.max(0, Math.min(pages.length - 1, index));
}

function FeatureMockup({ page }: { page: DareCenterPage }) {
  const Icon = page.icon;
  const isDare = page.id === "dare-loop";
  const isTruth = page.id === "truth";
  const isStories = page.id === "stories";
  const isSignals = page.id === "signals";
  const isMultiLike = page.id === "multi-like";
  const isMessaging = page.id === "messaging";

  return (
    <div className="dare-center-device relative mx-auto h-[240px] w-full max-w-[260px] overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,25,21,0.98),rgba(5,7,6,0.99))] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div
        className="absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl"
        style={{ background: `${page.accent}30` }}
      />
      <div className="relative z-10 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-white/10"
            style={{ background: `${page.accent}18`, color: page.accent }}
          >
            <Icon size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b]">
              {page.eyebrow}
            </p>
            <p className="text-sm font-black text-white">
              {page.id === "map" ? "DARE" : page.title.split(" ")[0]}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: dot === 1 ? page.accent : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 h-[162px] overflow-hidden rounded-[26px] border border-white/8 bg-black/35 p-3">
        {isStories ? (
          <div className="relative h-full overflow-hidden rounded-[22px] bg-[linear-gradient(160deg,#162016,#2a1420_48%,#071011)]">
            <div className="absolute left-4 top-4 h-20 w-20 rounded-full border border-white/15 bg-white/10" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-black/35 px-3 py-2 text-center text-sm font-black text-white backdrop-blur-sm">
              For @friend
            </div>
            <div className="absolute right-4 top-5 rounded-full border border-white/15 bg-black/30 px-2 py-1 text-[10px] font-bold text-white">
              music
            </div>
          </div>
        ) : isMultiLike ? (
          <div className="flex h-full flex-col justify-between">
            <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(160deg,rgba(74,222,128,0.18),rgba(250,204,21,0.13),rgba(5,7,6,0.9))] p-4">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-white/15" />
                <div>
                  <div className="mb-1 h-2.5 w-20 rounded-full bg-white/30" />
                  <div className="h-2 w-12 rounded-full bg-white/15" />
                </div>
              </div>
              <div className="flex h-24 items-center justify-center rounded-[20px] bg-black/24">
                {[0, 1, 2, 3, 4].map((heart) => (
                  <Heart
                    key={heart}
                    size={heart === 2 ? 36 : 24}
                    fill={heart === 2 ? page.accent : "#fb7185"}
                    color={heart === 2 ? page.accent : "#fb7185"}
                    className="dare-center-row mx-[-2px]"
                    style={{ animationDelay: `${heart * 80}ms` }}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-2 text-center">
                <p className="text-base font-black text-white">37</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                  taps
                </p>
              </div>
              <div className="rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-2 text-center">
                <p className="text-base font-black text-white">4</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                  people
                </p>
              </div>
            </div>
          </div>
        ) : isMessaging ? (
          <div className="flex h-full flex-col justify-between">
            <div className="space-y-2">
              <div className="max-w-[78%] rounded-[18px] rounded-bl-md border border-white/8 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white">
                shared a dare post
              </div>
              <div className="ml-auto max-w-[78%] rounded-[18px] rounded-br-md bg-[#4ade80] px-3 py-2 text-xs font-black text-black">
                that proof is real
              </div>
              <div className="max-w-[82%] rounded-[18px] border border-[#c084fc]/25 bg-[#c084fc]/12 p-2">
                <div className="mb-2 h-14 rounded-[14px] bg-black/30" />
                <p className="text-[11px] font-bold text-white">
                  Story reply preview
                </p>
              </div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-white/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-[#94a3b8]">
                <span>typing...</span>
                <span>seen</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {["online", "invite", "switch"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-black/30 px-2 py-1 text-center text-[9px] font-black uppercase tracking-[0.08em] text-[#c084fc]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : isSignals ? (
          <div className="space-y-2">
            {[
              [Eye, "viewing profile now", "#ef4444"],
              [Heart, "liked your post 10x", "#fb7185"],
              [Search, "saw your photo 5x", "#facc15"],
            ].map(([SignalIcon, label, color], index) => {
              const TypedIcon = SignalIcon as LucideIcon;
              return (
                <div
                  key={String(label)}
                  className="dare-center-row flex items-center gap-2 rounded-[18px] border border-white/8 bg-white/[0.04] p-3"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ background: `${color}1f`, color: String(color) }}
                  >
                    <TypedIcon size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
                    {String(label)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col justify-between">
            <div
              className="dare-center-orbit relative mx-auto flex h-24 w-24 items-center justify-center rounded-full border"
              style={{
                borderColor: `${page.accent}45`,
                background: `${page.accent}10`,
              }}
            >
              <Icon size={36} color={page.accent} />
              <span
                className="absolute -right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#111] text-white"
                style={{ color: page.accent }}
              >
                {isDare ? <Upload size={15} /> : isTruth ? <CheckCircle2 size={15} /> : <Zap size={15} />}
              </span>
            </div>
            <div className="space-y-2">
              {page.steps.slice(0, 3).map((step, index) => (
                <div
                  key={step}
                  className="dare-center-row flex items-center gap-2 rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-2"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-black"
                    style={{ background: page.accent }}
                  >
                    {index + 1}
                  </span>
                  <span className="line-clamp-1 text-[11px] font-semibold text-[#d1d5db]">
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DareCenterScreen({
  onBack,
  onOpenCreate,
  onOpenDares,
  onOpenDaily,
  onOpenFeed,
  onOpenMain,
  onOpenAlerts,
  onOpenChat,
}: {
  onBack: () => void;
  onOpenCreate: () => void;
  onOpenDares: () => void;
  onOpenDaily: () => void;
  onOpenFeed: () => void;
  onOpenMain: () => void;
  onOpenAlerts: () => void;
  onOpenChat: () => void;
}) {
  const [activePage, setActivePage] = useState(0);
  const page = pages[activePage];
  const Icon = page.icon;
  const progress = useMemo(
    () => Math.round(((activePage + 1) / pages.length) * 100),
    [activePage],
  );

  const openTarget = (target: CenterTarget) => {
    switch (target) {
      case "create":
        onOpenCreate();
        break;
      case "dares":
        onOpenDares();
        break;
      case "daily":
        onOpenDaily();
        break;
      case "feed":
        onOpenFeed();
        break;
      case "main":
        onOpenMain();
        break;
      case "alerts":
        onOpenAlerts();
        break;
      case "chat":
        onOpenChat();
        break;
    }
  };

  return (
    <div className="screen-container dare-center-screen">
      <style>{`
        .dare-center-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%),
            radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes dareCenterFloatIn {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dareCenterSweep {
          0% { transform: translateX(-125%); }
          42% { transform: translateX(125%); }
          100% { transform: translateX(125%); }
        }
        @keyframes dareCenterSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes dareCenterRow {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .dare-center-panel {
          animation: dareCenterFloatIn 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .dare-center-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: dareCenterSweep 6.6s ease-in-out infinite;
        }
        .dare-center-orbit::before {
          content: "";
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          border: 1px dashed rgba(255,255,255,0.16);
          animation: dareCenterSpin 8s linear infinite;
        }
        .dare-center-row {
          animation: dareCenterRow 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 12px)",
          paddingBottom: "calc(var(--safe-area-bottom) + 188px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)] transition-colors hover:border-[#4ade80]/30 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                <Sparkles size={13} />
                Dare Center
              </div>
              <h1 className="text-[32px] font-black leading-none tracking-tight text-white">
                Feature Vault
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setActivePage((index) => clampPage(index - 1))}
              disabled={activePage === 0}
              className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)] transition-colors disabled:cursor-not-allowed disabled:text-[#334155]"
              aria-label="Previous Dare Center screen"
            >
              <ArrowLeft size={19} />
            </button>
            <button
              onClick={() =>
                activePage === pages.length - 1
                  ? onBack()
                  : setActivePage((index) => clampPage(index + 1))
              }
              className="flex h-12 min-w-[82px] items-center justify-center gap-1.5 rounded-[20px] border border-[#4ade80]/25 bg-[#4ade80]/10 px-3 text-sm font-black text-[#bbf7d0] shadow-[0_18px_44px_rgba(0,0,0,0.32)] transition-colors hover:bg-[#4ade80]/14"
            >
              {activePage === pages.length - 1 ? "Done" : "Next"}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>

        <div className="dare-center-panel dare-center-shine relative mb-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
                Screen {activePage + 1} of {pages.length}
              </p>
              <p className="text-2xl font-black text-white">{page.eyebrow}</p>
            </div>
            <div className="rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/10 px-4 py-3 text-right">
              <div className="mb-1 flex items-center justify-end gap-1.5 text-[#86efac]">
                <Play size={14} />
                <span className="text-[11px] font-black uppercase tracking-[0.14em]">
                  Tour
                </span>
              </div>
              <p className="text-lg font-black text-white">{progress}%</p>
            </div>
          </div>
          <div className="relative z-10 mt-4 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${page.accent}, #4ade80)`,
              }}
            />
          </div>
        </div>

        <div
          key={page.id}
          className="dare-center-panel relative mb-5 overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div
            className="pointer-events-none absolute inset-x-8 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${page.accent}, transparent)`,
            }}
          />
          <div
            className="pointer-events-none absolute left-1/2 top-24 h-44 w-44 -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: `${page.accent}16` }}
          />

          <div className="relative z-10">
            <FeatureMockup page={page} />

            <div className="mt-5">
              <div
                className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/10"
                style={{ background: `${page.accent}14`, color: page.accent }}
              >
                <Icon size={22} />
              </div>
              <h2 className="text-[28px] font-black leading-tight text-white">
                {page.title}
              </h2>
              <p className="mt-3 text-[15px] font-semibold leading-relaxed text-[#94a3b8]">
                {page.body}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {page.stats.map(([top, bottom]) => (
                <div
                  key={`${page.id}-${top}`}
                  className="rounded-[22px] border border-white/8 bg-white/[0.035] px-3 py-4 text-center"
                >
                  <p className="text-lg font-black text-white">{top}</p>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748b]">
                    {bottom}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                How to use it
              </p>
              {page.steps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-[22px] border border-white/8 bg-white/[0.035] p-3"
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-black"
                    style={{ background: page.accent }}
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-relaxed text-[#d1d5db]">
                    {step}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2">
          {pages.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setActivePage(index)}
              className="h-2.5 rounded-full transition-all duration-300"
              style={{
                width: index === activePage ? 28 : 10,
                background:
                  index === activePage ? page.accent : "rgba(255,255,255,0.18)",
              }}
              aria-label={`Open Dare Center screen ${index + 1}`}
            />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {[
            [Target, "Dare"],
            [Users, "Match"],
            [Share2, "Share"],
            [Send, "Chat"],
          ].map(([MiniIcon, label]) => {
            const TypedIcon = MiniIcon as LucideIcon;
            return (
              <div
                key={String(label)}
                className="rounded-[20px] border border-white/8 bg-white/[0.035] px-2 py-3 text-center"
              >
                <TypedIcon className="mx-auto mb-1 text-[#4ade80]" size={17} />
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#64748b]">
                  {String(label)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--safe-area-bottom)+84px)] z-30">
        <div className="pointer-events-none absolute inset-x-0 bottom-[-88px] h-40 bg-[linear-gradient(180deg,rgba(3,4,3,0),rgba(3,4,3,0.96)_50%,#030403_100%)]" />
        <button
          onClick={() => openTarget(page.ctaTarget)}
          className="pointer-events-auto relative flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full border border-[#4ade80]/25 bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-[15px] font-black text-black shadow-[0_18px_44px_rgba(74,222,128,0.32),0_18px_48px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]"
        >
          {page.cta}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
