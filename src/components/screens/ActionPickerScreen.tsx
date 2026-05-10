"use client";

import { X, Target, MessageSquare, Share2, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

interface ActionPickerScreenProps {
  onClose: () => void;
  onSelectAction: (action: "truth" | "dare" | "feed") => void;
}

export function ActionPickerScreen({
  onClose,
  onSelectAction,
}: ActionPickerScreenProps) {
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
    setTimeout(() => onSelectAction(action), 200);
  };

  if (!mounted) return null;
  const actions = [
    {
      id: "truth" as const,
      title: "Ask a Truth",
      description: "Start with a question",
      icon: MessageSquare,
      accent: "#60a5fa",
      background:
        "linear-gradient(135deg, rgba(96,165,250,0.16), rgba(255,255,255,0.035))",
    },
    {
      id: "dare" as const,
      title: "Give a Dare",
      description: "Send a challenge",
      icon: Target,
      accent: "#4ade80",
      background:
        "linear-gradient(135deg, rgba(74,222,128,0.17), rgba(255,255,255,0.035))",
    },
    {
      id: "feed" as const,
      title: "Post to Feed",
      description: "Share a moment",
      icon: Share2,
      accent: "#facc15",
      background:
        "linear-gradient(135deg, rgba(250,204,21,0.15), rgba(255,255,255,0.035))",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
        className="app-modal-backdrop modal-backdrop absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={handleClose}
        style={{
          background:
            "radial-gradient(circle at 50% 8%, rgba(74,222,128,0.13), transparent 34%), radial-gradient(circle at 82% 28%, rgba(96,165,250,0.08), transparent 28%), rgba(0,0,0,0.86)",
        }}
      />

      <div className="app-modal-sheet modal-content relative mx-3 mb-[calc(16px+env(safe-area-inset-bottom,0px))] w-[calc(100%-24px)] max-w-md sm:mb-0">
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-colors hover:text-white"
          aria-label="Close"
        >
          <X size={19} />
        </button>

        <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(20,25,20,0.98),rgba(8,10,8,0.99))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.72),rgba(96,165,250,0.28),transparent)]" />
          <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-[#4ade80]/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-14 bottom-8 h-36 w-36 rounded-full bg-sky-400/8 blur-3xl" />

          <div className="relative mb-5 pr-12">
            <h1 className="m-0 text-[26px] font-black leading-none tracking-[-0.04em] text-white">
              Choose interaction
            </h1>
          </div>

          <div className="relative space-y-3">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleActionSelect(action.id)}
                className="action-card group w-full overflow-hidden rounded-[22px] border border-white/8 p-4 text-left shadow-[0_14px_34px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.045)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4ade80]/30"
                style={{
                  animationDelay: `${0.1 + index * 0.05}s`,
                  background: action.background,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:scale-105"
                    style={{
                      color: action.accent,
                      background: `${action.accent}14`,
                      borderColor: `${action.accent}28`,
                      boxShadow: `0 0 24px ${action.accent}18`,
                    }}
                  >
                    <Icon size={22} strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 text-[17px] font-extrabold tracking-[-0.02em] text-white">
                      {action.title}
                    </h3>
                    <p className="text-sm font-medium text-white/42">
                      {action.description}
                    </p>
                  </div>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.035] text-white/42 transition-colors group-hover:text-white"
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
                  >
                    <ArrowRight size={17} />
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
