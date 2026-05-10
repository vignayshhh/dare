import { useState } from "react";
import {
  X,
  MessageCircle,
  Heart,
  Users,
  TrendingUp,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Avatar } from "../../../components/ui/Avatar";
import { getDefaultAvatarUrl } from "@/utils/placeholderImages";

interface DareVoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  dare: {
    id: string;
    challenger: { name: string; avatar: string };
    receiver: { name: string; avatar: string };
    description: string;
    proof?: { type: string; url: string; thumbnail?: string };
    votes?: { real: number; fake: number; total: number };
  };
}

export default function DareVoteModal({
  isOpen,
  onClose,
  dare,
}: DareVoteModalProps) {
  const [activeTab, setActiveTab] = useState<"real" | "fake" | "comments">(
    "real",
  );

  // Mock data for demonstration
  const mockComments = [
    {
      id: "1",
      user: {
        name: "John",
        avatar: getDefaultAvatarUrl("john"),
      },
      comment: "This looks totally real! Great form on the pushups.",
      timestamp: "2 hours ago",
      likes: 24,
      isLiked: false,
    },
    {
      id: "2",
      user: {
        name: "Sarah",
        avatar: "https://picsum.photos/seed/sarah/40/40.jpg",
      },
      comment:
        "I'm calling fake - no way someone can do that many pushups that easily.",
      timestamp: "3 hours ago",
      likes: 18,
      isLiked: true,
    },
    {
      id: "3",
      user: {
        name: "Mike",
        avatar: "https://picsum.photos/seed/mike/40/40.jpg",
      },
      comment: "Real! You can see the muscle strain in the last few reps.",
      timestamp: "4 hours ago",
      likes: 31,
      isLiked: false,
    },
  ];

  const mockUsersWhoLiked = [
    { name: "Emma", avatar: "https://picsum.photos/seed/emma/32/32.jpg" },
    { name: "Lisa", avatar: "https://picsum.photos/seed/lisa/32/32.jpg" },
    { name: "David", avatar: "https://picsum.photos/seed/david/32/32.jpg" },
    { name: "James", avatar: "https://picsum.photos/seed/james/32/32.jpg" },
    { name: "Sophie", avatar: "https://picsum.photos/seed/sophie/32/32.jpg" },
    { name: "Ryan", avatar: "https://picsum.photos/seed/ryan/32/32.jpg" },
    { name: "Anna", avatar: "https://picsum.photos/seed/anna/32/32.jpg" },
    { name: "Tom", avatar: "https://picsum.photos/seed/tom/32/32.jpg" },
  ];

  if (!isOpen) return null;

  const realPercentage = dare.votes
    ? Math.round((dare.votes.real / dare.votes.total) * 100)
    : 0;
  const fakePercentage = dare.votes
    ? Math.round((dare.votes.fake / dare.votes.total) * 100)
    : 0;

  return (
    <div
      className="app-modal-backdrop fixed inset-0 bg-black/80 flex items-end justify-start z-9999 p-4"
      onClick={onClose}
    >
      <div
        className="app-modal-sheet bg-[#1a1a1a] rounded-2xl w-[98vw] h-[75vh] overflow-hidden border border-gray-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* What People Think Section */}
        <div className="px-4 pb-4 pt-8">
          <h3 className="text-white text-lg font-bold mb-6 flex items-center justify-center gap-2">
            <TrendingUp size={20} className="text-[#4ade80]" />
            What People Think
          </h3>

          {/* Voting Tabs - Always Horizontal */}
          <div className="flex gap-1 mb-4 flex-row md:flex-row">
            <button
              onClick={() => setActiveTab("real")}
              className={`flex-1 py-2 px-2 rounded-lg font-bold transition-all ${
                activeTab === "real"
                  ? "bg-[#4ade80] text-black"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <CheckCircle size={14} />
                <span className="text-xs">REAL</span>
                <span className="bg-black/20 px-1 py-0.5 rounded text-xs">
                  {realPercentage}%
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab("fake")}
              className={`flex-1 py-2 px-2 rounded-lg font-bold transition-all ${
                activeTab === "fake"
                  ? "bg-red-500 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <XCircle size={14} />
                <span className="text-xs">FAKE</span>
                <span className="bg-black/20 px-1 py-0.5 rounded text-xs">
                  {fakePercentage}%
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab("comments")}
              className={`flex-1 py-2 px-2 rounded-lg font-bold transition-all ${
                activeTab === "comments"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <MessageCircle size={14} />
                <span className="text-xs">COMMENTS</span>
                <span className="bg-black/20 px-1 py-0.5 rounded text-xs">
                  {mockComments.length}
                </span>
              </div>
            </button>
          </div>

          {/* Tab Content - Wider */}
          <div className="max-h-[65vh] overflow-y-auto">
            {activeTab === "real" && (
              <div className="space-y-3">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8 w-full max-w-none">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle size={20} className="text-[#4ade80]" />
                    <span className="text-[#4ade80] font-bold">REAL Votes</span>
                  </div>
                  <p className="text-white text-sm mb-2">
                    {dare.votes?.real || 0} people think this is real
                  </p>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-[#4ade80] to-[#22c55e] h-3 rounded-full"
                      style={{ width: `${realPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Users who voted real */}
                <div className="bg-gray-800/50 rounded-xl p-8 w-full max-w-none mb-6 max-h-80 overflow-y-auto">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Users size={16} />
                    Who voted REAL
                  </h4>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-6 w-full">
                    {mockUsersWhoLiked.slice(0, 8).map((user, index) => (
                      <div key={index} className="flex flex-col items-center">
                        <Avatar
                          src={user.avatar}
                          alt={user.name}
                          size="lg"
                          className="mb-2"
                        />
                        <span className="text-gray-400 text-sm font-medium">
                          {user.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "fake" && (
              <div className="space-y-3">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 w-full max-w-none">
                  <div className="flex items-center gap-3 mb-2">
                    <XCircle size={20} className="text-red-500" />
                    <span className="text-red-500 font-bold">FAKE Votes</span>
                  </div>
                  <p className="text-white text-sm mb-2">
                    {dare.votes?.fake || 0} people think this is fake
                  </p>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-linear-to-r from-red-500 to-red-600 h-3 rounded-full"
                      style={{ width: `${fakePercentage}%` }}
                    />
                  </div>
                </div>

                {/* Users who voted fake */}
                <div className="bg-gray-800/50 rounded-xl p-8 w-full max-w-none max-h-80 overflow-y-auto">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Users size={16} />
                    Who voted FAKE
                  </h4>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-6 w-full">
                    {mockUsersWhoLiked.slice(4, 12).map((user, index) => (
                      <div key={index} className="flex flex-col items-center">
                        <Avatar
                          src={user.avatar}
                          alt={user.name}
                          size="lg"
                          className="mb-2"
                        />
                        <span className="text-gray-400 text-sm font-medium">
                          {user.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "comments" && (
              <div className="space-y-4">
                {mockComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="bg-gray-800/50 rounded-xl p-8 w-full max-w-none"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={comment.user.avatar}
                        alt={comment.user.name}
                        size="md"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white font-semibold">
                            {comment.user.name}
                          </span>
                          <span className="text-gray-400 text-sm font-medium">
                            {comment.timestamp}
                          </span>
                        </div>
                        <p className="text-gray-200 text-sm mb-2">
                          {comment.comment}
                        </p>
                        <div className="flex items-center gap-4">
                          <button className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors">
                            <Heart
                              size={14}
                              className={
                                comment.isLiked
                                  ? "fill-red-500 text-red-500"
                                  : ""
                              }
                            />
                            <span className="text-xs">{comment.likes}</span>
                          </button>
                          <button className="flex items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors">
                            <MessageCircle size={14} />
                            <span className="text-xs">Reply</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-gray-700 text-white p-2 rounded-lg hover:bg-gray-600 transition-colors shadow-lg"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
