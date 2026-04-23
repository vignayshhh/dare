"use client";

import { X, Target, MessageSquare, Share2 } from "lucide-react";
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
      description: "Put someone on the spot",
      icon: MessageSquare,
      color: "text-blue-400",
    },
    {
      id: "dare" as const,
      title: "Give a Dare",
      description: "Challenge someone publicly",
      icon: Target,
      color: "text-red-400",
    },
    {
      id: "feed" as const,
      title: "Post to Feed",
      description: "Share something with friends",
      icon: Share2,
      color: "text-green-400",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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

      {/* Dark blurred overlay */}
      <div
        className="modal-backdrop absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={handleClose}
      />

      {/* Content */}
      <div className="modal-content relative w-full max-w-md mx-4">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute -top-12 right-0 text-white/60 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center mb-8">
          What do you want to do
        </h1>

        {/* Action Cards */}
        <div className="space-y-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleActionSelect(action.id)}
                className={`action-card w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 hover:border-[#4ade80]/50 transition-all duration-200 group hover:shadow-lg`}
                style={{ animationDelay: `${0.1 + index * 0.05}s` }}
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
