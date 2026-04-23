"use client";

import { X, Target, FileText } from "lucide-react";

interface PostOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: "dare" | "feed") => void;
}

export function PostOptionsModal({
  isOpen,
  onClose,
  onSelect,
}: PostOptionsModalProps) {
  if (!isOpen) return null;

  const options = [
    {
      type: "dare" as const,
      title: "Create Dare",
      description: "Challenge someone to a dare",
      icon: Target,
      color: "bg-red-500",
    },
    {
      type: "feed" as const,
      title: "Feed Post",
      description: "Share with your friends",
      icon: FileText,
      color: "bg-green-500",
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] rounded-2xl max-w-md w-full p-6 border border-[#2a2a2a]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            What would you like to post?
          </h2>
          <button
            onClick={onClose}
            className="text-[#94a3b8] hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                onClick={() => {
                  onSelect(option.type);
                  onClose();
                }}
                className="w-full bg-[#0a0f0a] rounded-xl p-4 border border-[#2a2a2a] hover:border-[#4ade80]/50 transition-all text-left"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-12 h-12 ${option.color} rounded-full flex items-center justify-center`}
                  >
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{option.title}</h3>
                    <p className="text-[#94a3b8] text-sm">
                      {option.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 text-[#94a3b8] hover:text-white transition-colors font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
