"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Send,
  AtSign,
  Target,
  MessageSquare,
  Search,
  X,
  CheckCircle2,
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

export function CreateInteractionScreen({
  mode,
  onBack,
}: CreateInteractionScreenProps) {
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);

  const { user } = useAuthStore();
  const { creatingDare } = useDareStore();
  const { searchUsers, searchResults, isSearching } = useUserSearchStore();

  useEffect(() => {
    setFriends([]);
  }, []);

  const isTruth = mode === "truth";
  const title = isTruth ? "Ask a Truth" : "Give a Dare";
  const placeholder = isTruth
    ? "Ask your truth question..."
    : "Describe the dare action...";
  const actionButtonText = isTruth ? "Ask Truth" : "Send Dare";
  const contextText = isTruth
    ? "Their answer will be visible based on privacy rules"
    : "Proof will be required if accepted";
  const accent = isTruth ? "#60a5fa" : "#4ade80";
  const ModeIcon = isTruth ? MessageSquare : Target;

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
      onBack();
    } catch (error) {
      console.error("Error creating interaction:", error);
    }
  };

  const selectedFriendsData = friends.filter((friend) =>
    selectedFriends.includes(friend.id),
  );
  const manualSelectedFriends = selectedFriends.filter(
    (id) => !friends.find((friend) => friend.id === id),
  );
  const canSubmit = Boolean(
    selectedFriends.length && content.trim() && !creatingDare,
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050705] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(74,222,128,0.12),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(96,165,250,0.07),transparent_28%)]" />

      <div className="sticky top-0 z-30 border-b border-white/6 bg-[linear-gradient(180deg,rgba(5,7,5,0.98),rgba(5,7,5,0.88))] px-4 pb-4 pt-[calc(16px+env(safe-area-inset-top,0px))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/80 shadow-[0_12px_28px_rgba(0,0,0,0.26)] transition-colors hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[25px] font-black leading-none tracking-[-0.04em] text-white">
              {title}
            </h1>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-[calc(126px+env(safe-area-inset-bottom,0px))] pt-5">
        <div className="relative mb-5 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(22,27,22,0.98),rgba(8,10,8,0.99))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.055)]">
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
                {selectedFriends.length} selected
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
            <div className="flex min-h-[56px] items-center rounded-[20px] border border-white/8 bg-white/[0.045] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus-within:border-[#4ade80]/35">
              <Search size={18} className="mr-3 shrink-0 text-white/36" />
              <input
                type="text"
                value={tagInput}
                onChange={handleTagInput}
                placeholder="@username"
                className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-white placeholder:text-white/28 focus:outline-none"
              />
            </div>

            {showFriendPicker && (
              <div className="absolute left-0 right-0 top-full z-20 mt-3 max-h-64 overflow-y-auto rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,18,0.99),rgba(9,11,9,0.99))] shadow-[0_24px_54px_rgba(0,0,0,0.42)]">
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
                            key={user.id}
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
                        style={{ color: "#4ade80" }}
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
                  className="flex items-center gap-2 rounded-full border border-[#4ade80]/24 bg-[#4ade80]/10 py-1.5 pl-1.5 pr-2.5"
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
                  className="flex items-center gap-2 rounded-full border border-[#4ade80]/24 bg-[#4ade80]/10 py-1.5 pl-2 pr-2.5"
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

        <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,22,18,0.98),rgba(8,10,8,0.99))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/38">
                {isTruth ? "Truth question" : "Dare description"}
              </p>
              <p className="mt-1 text-sm font-semibold text-white/44">
                {contextText}
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
            className="min-h-[190px] w-full resize-none rounded-[22px] border border-white/8 bg-white/[0.045] p-4 text-[17px] font-semibold leading-relaxed text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus:border-[#4ade80]/35 focus:outline-none"
            rows={6}
          />
          <div className="mt-3 flex justify-end text-xs font-bold text-white/30">
            {content.trim().length} chars
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,0.82),rgba(5,7,5,0.98))] px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-[20px] px-5 py-4 text-base font-black text-black shadow-[0_16px_42px_rgba(74,222,128,0.24)] transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: canSubmit
                ? "linear-gradient(135deg, #4ade80, #22c55e)"
                : "rgba(255,255,255,0.12)",
              color: canSubmit ? "#020402" : "rgba(255,255,255,0.4)",
            }}
          >
            <Send size={20} />
            <span>{creatingDare ? "Creating..." : actionButtonText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
