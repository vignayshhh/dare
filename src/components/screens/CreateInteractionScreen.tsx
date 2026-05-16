"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  Send,
  AtSign,
  Target,
  MessageSquare,
  Search,
  X,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Wand2,
  Loader2,
} from "lucide-react";
import {
  dareService,
  truthService,
} from "@/middleware/services/service-factory";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useDareStore } from "@/stores/useDareStore";
import { useUserSearchStore } from "@/stores/useUserSearchStore";
import { Avatar } from "@/components/ui/Avatar";

interface Friend {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

interface CreateInteractionScreenProps {
  mode: "truth" | "dare";
  onBack: () => void;
}

const TRUTH_PROMPTS = [
  "What is something you have never admitted out loud?",
  "What did you almost say this week but held back?",
  "Who do you trust with your unfiltered thoughts?",
];

const DARE_PROMPTS = [
  "Send proof within 24 hours.",
  "Make it funny enough for the feed.",
  "No retakes. One shot only.",
];

export function CreateInteractionScreen({
  mode,
  onBack,
}: CreateInteractionScreenProps) {
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  const { user } = useAuthStore();
  const { creatingDare } = useDareStore();
  const { searchUsers, searchResults, isSearching } = useUserSearchStore();

  useEffect(() => {
    setFriends([]);
  }, []);

  const isTruth = mode === "truth";
  const title = isTruth ? "Ask a Truth" : "Give a Dare";
  const eyebrow = isTruth ? "Truth drop" : "Dare drop";
  const placeholder = isTruth
    ? "Ask the question they will replay in their head..."
    : "Describe the dare clearly enough that proof is undeniable...";
  const actionButtonText = isTruth ? "Ask Truth" : "Send Dare";
  const contextText = isTruth
    ? "One sharp question. Let the answer do the damage."
    : "Give them a clean mission with a clear proof moment.";
  const privacyText = isTruth
    ? "Privacy rules decide visibility after they answer."
    : "Proof is required if the dare is accepted.";
  const accent = isTruth ? "#60a5fa" : "#4ade80";
  const accentDeep = isTruth ? "#2563eb" : "#22c55e";
  const accentText = isTruth ? "#bfdbfe" : "#bbf7d0";
  const suggestions = isTruth ? TRUTH_PROMPTS : DARE_PROMPTS;
  const ModeIcon = isTruth ? MessageSquare : Target;
  const interactionStyle = {
    "--interaction-accent": accent,
    "--interaction-accent-deep": accentDeep,
    "--interaction-accent-soft": `${accent}55`,
    "--interaction-accent-wash": `${accent}14`,
    "--interaction-accent-glow": `${accent}2e`,
  } as CSSProperties & Record<string, string>;

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId],
    );
  };

  const handleTagInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log("handleTagInput called with:", value);
    setTagInput(value);

    if (value.endsWith("@") || value.startsWith("@")) {
      console.log("Showing friend picker for:", value);
      setShowFriendPicker(true);
    }

    if (value.startsWith("@") && value.length > 1) {
      const searchQuery = value.replace("@", "").trim();
      console.log("Triggering search for query:", searchQuery);
      if (searchQuery.length > 0) {
        await searchUsers(searchQuery);
      }
    } else {
      console.log("Clearing search results");
      await searchUsers("");
    }
  };

  const selectFriend = (user: any) => {
    console.log("selectFriend called with:", user);
    const friendId = user.id || user.user_id;
    console.log("Using friend ID:", friendId);
    if (!friendId) return;

    if (!selectedFriends.includes(friendId)) {
      console.log("Adding friend to selected list:", friendId);
      setSelectedFriends((prev) => {
        const newFriends = [...prev, friendId];
        console.log("New selected friends:", newFriends);
        return newFriends;
      });

      const friendData = {
        id: friendId,
        name: user.display_name || user.username || "Unknown",
        username: user.username || "unknown",
        avatar: user.avatar_url || "/default-avatar.png",
      };

      setFriends((prev) => {
        const exists = prev.some((f) => f.id === friendId);
        if (!exists) {
          return [...prev, friendData];
        }
        return prev;
      });
    } else {
      console.log("Friend already selected:", friendId);
    }
    setTagInput("");
    setShowFriendPicker(false);
  };

  const handleManualUsernameSubmit = async () => {
    const username = tagInput.trim().replace("@", "");
    console.log("Manual username submit:", {
      username,
      tagInput,
      selectedFriends,
    });

    if (username && !selectedFriends.some((f) => f === username)) {
      try {
        console.log("Looking up user ID for username:", username);
        await searchUsers(username);

        const foundUser = searchResults.find(
          (user: any) => user.username === username,
        );

        if (foundUser) {
          const actualUserId = foundUser.user_id || foundUser.id;
          console.log(
            "Found actual user ID:",
            actualUserId,
            "for username:",
            username,
          );

          setSelectedFriends((prev) => {
            const newFriends = [...prev, actualUserId];
            console.log("New selected friends:", newFriends);
            return newFriends;
          });
          setFriends((prev) => {
            const exists = prev.some((friend) => friend.id === actualUserId);
            if (exists) return prev;
            return [
              ...prev,
              {
                id: actualUserId,
                name:
                  foundUser.display_name || foundUser.username || "Unknown",
                username: foundUser.username || username,
                avatar: foundUser.avatar_url || "/default-avatar.png",
              },
            ];
          });
          setTagInput("");
          setShowFriendPicker(false);
        } else {
          console.error("User not found for username:", username);
        }
      } catch (error) {
        console.error("Error looking up user ID:", error);
        setSelectedFriends((prev) => {
          const newFriends = [...prev, username];
          console.log("Fallback - using username as ID:", newFriends);
          return newFriends;
        });
        setTagInput("");
        setShowFriendPicker(false);
      }
    } else {
      console.log("Username already selected or empty:", username);
    }
  };

  const handleSubmit = async () => {
    if (submitStatus === "sending" || submitStatus === "sent") return;

    console.log("Submit button clicked:", {
      user: user?.id,
      selectedFriends,
      content: content.trim(),
      contentLength: content.trim().length,
      creatingDare,
      canSubmit: !!(user?.id && selectedFriends.length > 0 && content.trim()),
    });

    if (!user?.id || selectedFriends.length === 0 || !content.trim()) {
      console.log("Submit blocked - missing required fields");
      return;
    }

    setSubmitStatus("sending");

    try {
      if (isTruth) {
        console.log("Creating truth for friends:", selectedFriends);
        try {
          for (const friendId of selectedFriends) {
            console.log("Creating truth for:", {
              challenger_id: user.id,
              receiver_id: friendId,
              question: content.trim(),
            });

            const result = await truthService.createTruth({
              challengerId: user.id,
              receiverId: friendId,
              question: content.trim(),
            });

            console.log("Truth creation result:", result);

            if (!result.success) {
              console.error("Failed to create truth:", result.error);
              throw new Error(result.error || "Failed to create truth");
            }

            console.log("Truth created successfully:", result.truth);
          }
        } catch (truthError) {
          console.error("Error creating truth:", truthError);
          throw truthError;
        }
      } else {
        console.log("Creating dare for friends:", selectedFriends);
        for (const friendId of selectedFriends) {
          console.log("Creating dare for:", {
            challengerId: user.id,
            receiverId: friendId,
            description: content.trim(),
          });

          const result = await dareService.createDare({
            challengerId: user.id,
            receiverId: friendId,
            description: content.trim(),
          });

          console.log("Dare creation result:", result);

          if (!result.success) {
            console.error("Failed to create dare:", result.error);
            throw new Error(result.error || "Failed to create dare");
          }

          console.log("Dare created successfully:", result.dare);
        }
      }

      console.log("Interaction created successfully, going back");
      setSubmitStatus("sent");
      await new Promise((resolve) => setTimeout(resolve, 650));
      onBack();
    } catch (error) {
      console.error("Error creating interaction:", error);
      setSubmitStatus("error");
      window.setTimeout(() => {
        setSubmitStatus("idle");
      }, 1800);
    }
  };

  const selectedFriendsData = friends.filter((friend) =>
    selectedFriends.includes(friend.id),
  );
  const manualSelectedFriends = selectedFriends.filter(
    (id) => !friends.find((friend) => friend.id === id),
  );
  const isSubmitting = submitStatus === "sending" || submitStatus === "sent";
  const canSubmit = Boolean(
    selectedFriends.length && content.trim() && !creatingDare && !isSubmitting,
  );
  const submitButtonText =
    submitStatus === "sending"
      ? "Sending..."
      : submitStatus === "sent"
        ? "Sent"
        : submitStatus === "error"
          ? "Try Again"
          : actionButtonText;
  const completionSteps = [
    {
      label: selectedFriends.length ? "Friend locked" : "Pick friend",
      active: selectedFriends.length > 0,
    },
    {
      label: content.trim() ? "Message ready" : "Write drop",
      active: content.trim().length > 0,
    },
    {
      label: canSubmit ? "Ready" : "Send",
      active: canSubmit || submitStatus === "sent",
    },
  ];

  return (
    <div
      className="screen-container create-interaction-screen text-white"
      style={interactionStyle}
    >
      <style>{`
        .create-interaction-screen {
          background:
            radial-gradient(circle at 50% -12%, var(--interaction-accent-glow), transparent 34%),
            radial-gradient(circle at 12% 18%, rgba(14,165,233,0.11), transparent 28%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes interactionFloatIn {
          from { opacity: 0; transform: translateY(18px) scale(0.98); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes interactionSweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes interactionPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.04); opacity: 0.9; }
        }
        .interaction-panel {
          animation: interactionFloatIn 0.56s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .interaction-panel-delay {
          animation-delay: 80ms;
        }
        .interaction-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          animation: interactionSweep 6.8s ease-in-out infinite;
          pointer-events: none;
        }
        .interaction-input:focus-within,
        .interaction-textarea:focus {
          border-color: var(--interaction-accent-soft);
          box-shadow:
            0 0 0 1px var(--interaction-accent-soft),
            inset 0 1px 0 rgba(255,255,255,0.045);
        }
        .interaction-halo {
          animation: interactionPulse 3.6s ease-in-out infinite;
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0">
        <div className="interaction-halo absolute left-1/2 top-20 h-56 w-56 -translate-x-1/2 rounded-full bg-[var(--interaction-accent-wash)] blur-3xl" />
        <div className="absolute -right-24 top-28 h-64 w-64 rounded-full bg-sky-400/[0.07] blur-3xl" />
      </div>

      <div className="relative z-30 border-b border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,0.98),rgba(5,7,5,0.84))] px-4 pb-4 pt-[calc(var(--safe-area-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="app-pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)] transition-colors hover:border-[var(--interaction-accent-soft)] hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft size={21} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
              {eyebrow}
            </p>
            <h1 className="m-0 truncate text-[31px] font-black leading-none tracking-tight text-white">
              {title}
            </h1>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[var(--interaction-accent)] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            <ModeIcon size={24} />
          </div>
        </div>
      </div>

      <div
        className="relative z-10 flex-1 overflow-y-auto px-4"
        style={{
          paddingBottom: "calc(126px + var(--safe-area-bottom))",
          paddingTop: "18px",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mx-auto max-w-2xl">
        <div className="interaction-panel interaction-shine relative mb-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="relative z-10 flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border"
              style={{
                color: accent,
                borderColor: `${accent}28`,
                background: `${accent}14`,
                boxShadow: `0 0 32px ${accent}18`,
              }}
            >
              <Sparkles size={23} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                Make it count
              </p>
              <p className="text-[18px] font-black leading-snug text-white">
                {contextText}
              </p>
            </div>
          </div>
          <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
            {completionSteps.map((step) => (
              <div
                key={step.label}
                className={`rounded-[18px] border px-2.5 py-3 text-center transition-colors ${
                  step.active
                    ? "border-[var(--interaction-accent-soft)] bg-[var(--interaction-accent-wash)]"
                    : "border-white/8 bg-white/[0.035]"
                }`}
              >
                <p
                  className={`truncate text-[11px] font-black uppercase tracking-[0.1em] ${
                    step.active ? "text-white" : "text-[#64748b]"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="interaction-panel relative z-40 mb-5 overflow-visible rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(22,27,22,0.98),rgba(8,10,8,0.99))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.055)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}aa, transparent)`,
            }}
          />
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full blur-3xl"
            style={{ background: `${accent}18` }}
          />

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/38">
                Recipient
              </p>
              <p className="mt-1 text-sm font-semibold text-white/70">
                {selectedFriends.length
                  ? `${selectedFriends.length} selected`
                  : "Search by @username"}
              </p>
            </div>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl border"
              style={{
                color: accent,
                borderColor: `${accent}24`,
                background: `${accent}12`,
              }}
            >
              <AtSign size={20} />
            </div>
          </div>

          <div className="relative">
            <div className="interaction-input flex min-h-[56px] items-center rounded-[20px] border border-white/8 bg-white/[0.045] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors">
              <Search size={18} className="mr-3 shrink-0 text-white/36" />
              <input
                type="text"
                value={tagInput}
                onChange={handleTagInput}
                onFocus={() => {
                  if (tagInput.startsWith("@")) setShowFriendPicker(true);
                }}
                placeholder="@username"
                className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-white placeholder:text-white/28 focus:outline-none"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
            </div>

            {showFriendPicker && (
              <div className="absolute left-0 right-0 top-full z-[90] mt-3 max-h-64 overflow-y-auto rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,18,0.99),rgba(9,11,9,0.99))] shadow-[0_24px_54px_rgba(0,0,0,0.42)]">
                {isSearching ? (
                  <div className="p-4 text-center text-sm font-semibold text-white/42">
                    Searching users...
                  </div>
                ) : tagInput.startsWith("@") && tagInput.length > 1 ? (
                  <>
                    {searchResults.length > 0 ? (
                      <>
                        <div className="border-b border-white/8 px-4 py-3">
                          <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">
                            Search results
                          </p>
                        </div>
                        {searchResults.map((user: any) => (
                          <button
                            key={user.id || user.user_id}
                            onClick={() => selectFriend(user)}
                            className="flex w-full items-center gap-3 border-b border-white/6 p-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.045]"
                          >
                            <Avatar
                              src={user.avatar_url || ""}
                              alt={user.display_name || user.username}
                              size="sm"
                              userId={user.id}
                              username={user.username}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="m-0 truncate text-sm font-bold text-white">
                                {user.display_name ||
                                  user.username ||
                                  "Unknown"}
                              </p>
                              <p className="m-0 mt-0.5 truncate text-xs font-semibold text-white/38">
                                @{user.username || "unknown"}
                              </p>
                            </div>
                            <CheckCircle2 size={17} style={{ color: accent }} />
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="p-4 text-center text-sm font-semibold text-white/42">
                        No users found for &quot;
                        {tagInput.replace("@", "")}
                        &quot;
                      </div>
                    )}
                    <div className="border-t border-white/8 p-2">
                      <button
                        onClick={handleManualUsernameSubmit}
                        className="w-full rounded-2xl p-3 text-center text-sm font-bold transition-colors hover:bg-[#4ade80]/10"
                        style={{ color: accent }}
                      >
                        Use &quot;{tagInput.replace("@", "")}&quot;
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {friends.map((friend) => (
                      <button
                        key={friend.id}
                        onClick={() => selectFriend(friend)}
                        className="flex w-full items-center gap-3 border-b border-white/6 p-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.045]"
                      >
                        <Avatar
                          src={friend.avatar}
                          alt={friend.name}
                          size="sm"
                          userId={friend.id}
                          username={friend.username}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-sm font-bold text-white">
                            {friend.name}
                          </p>
                          <p className="m-0 mt-0.5 truncate text-xs font-semibold text-white/38">
                            @{friend.username}
                          </p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {(selectedFriendsData.length > 0 ||
            manualSelectedFriends.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedFriendsData.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-2.5"
                  style={{
                    borderColor: `${accent}2e`,
                    background: `${accent}12`,
                  }}
                >
                  <Avatar
                    src={friend.avatar}
                    alt={friend.name}
                    size="xs"
                    userId={friend.id}
                    username={friend.username}
                  />
                  <span className="max-w-[120px] truncate text-sm font-bold text-white">
                    {friend.name}
                  </span>
                  <button
                    onClick={() => toggleFriend(friend.id)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white/42 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {manualSelectedFriends.map((username) => (
                <div
                  key={username}
                  className="flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-2.5"
                  style={{
                    borderColor: `${accent}2e`,
                    background: `${accent}12`,
                  }}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/8 text-xs font-bold text-white/50">
                    @
                  </div>
                  <span className="max-w-[120px] truncate text-sm font-bold text-white">
                    {username}
                  </span>
                  <button
                    onClick={() => toggleFriend(username)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white/42 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="interaction-panel interaction-panel-delay relative z-0 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,22,18,0.98),rgba(8,10,8,0.99))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/38">
                {isTruth ? "Truth question" : "Dare description"}
              </p>
              <p className="mt-1 text-sm font-semibold text-white/44">
                {privacyText}
              </p>
            </div>
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
              style={{
                color: accent,
                borderColor: `${accent}24`,
                background: `${accent}12`,
              }}
            >
              <ModeIcon size={20} />
            </div>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="interaction-textarea min-h-[190px] w-full resize-none rounded-[22px] border border-white/8 bg-white/[0.045] p-4 text-[17px] font-semibold leading-relaxed text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus:outline-none"
            rows={6}
          />
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-white/30">
            <div className="flex items-center gap-1.5" style={{ color: accentText }}>
              <ShieldCheck size={14} />
              <span>{isTruth ? "Answer decides the story" : "Proof keeps it real"}</span>
            </div>
            <span>{content.trim().length} chars</span>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#64748b]">
              <Wand2 size={13} />
              Quick sparks
            </div>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setContent(suggestion)}
                  className="app-pressable snap-start rounded-full border border-white/8 bg-white/[0.045] px-4 py-2.5 text-left text-sm font-bold text-white/58 transition-colors hover:border-[var(--interaction-accent-soft)] hover:bg-[var(--interaction-accent-wash)] hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,0.82),rgba(5,7,5,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <p className="truncate text-xs font-bold text-white/42">
              {selectedFriends.length
                ? `${selectedFriends.length} recipient${selectedFriends.length > 1 ? "s" : ""}`
                : "Choose a recipient"}
            </p>
            <p className="truncate text-xs font-bold" style={{ color: accentText }}>
              {content.trim() ? "Drop is ready" : "Add your message"}
            </p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="app-pressable flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-base font-black text-black transition-all disabled:cursor-not-allowed disabled:opacity-55"
            style={{
              background: canSubmit
                ? `linear-gradient(135deg, ${accent}, ${accentDeep})`
                : "rgba(255,255,255,0.12)",
              color: canSubmit ? "#020402" : "rgba(255,255,255,0.4)",
              boxShadow: canSubmit
                ? `0 18px 42px ${accent}30`
                : "none",
            }}
          >
            {submitStatus === "sent" ? (
              <CheckCircle2 size={20} />
            ) : submitStatus === "sending" ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
            <span>{creatingDare ? "Sending..." : submitButtonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}


