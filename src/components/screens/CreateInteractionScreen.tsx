"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Users, Send, AtSign } from "lucide-react";
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
  const [loading, setLoading] = useState(false);

  const { user } = useAuthStore();
  const { createDare, creatingDare } = useDareStore();
  const { searchUsers, searchResults, isSearching } = useUserSearchStore();

  useEffect(() => {
    setFriends([]);
    setLoading(false);
  }, []);

  const isTruth = mode === "truth";
  const title = isTruth ? "Ask a Truth" : "Give a Dare";
  const placeholder = isTruth
    ? "Ask your truth question…"
    : "Describe the dare action…";
  const actionButtonText = isTruth ? "Ask Truth" : "Send Dare";
  const contextText = isTruth
    ? "Their answer will be visible based on privacy rules"
    : "Proof will be required if accepted";

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

    // Search for users when typing
    if (value.startsWith("@") && value.length > 1) {
      const searchQuery = value.replace("@", "").trim();
      console.log("Triggering search for query:", searchQuery);
      if (searchQuery.length > 0) {
        await searchUsers(searchQuery);
      }
    } else {
      console.log("Clearing search results");
      // Store will handle clearing automatically when query is empty
      await searchUsers("");
    }
  };

  const selectFriend = (user: any) => {
    console.log("selectFriend called with:", user);
    // Use the document ID as the primary identifier
    const friendId = user.id || user.user_id;
    console.log("Using friend ID:", friendId);

    if (!selectedFriends.includes(friendId)) {
      console.log("Adding friend to selected list:", friendId);
      setSelectedFriends((prev) => {
        const newFriends = [...prev, friendId];
        console.log("New selected friends:", newFriends);
        return newFriends;
      });

      // Also add to friends list for display if not already there
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
        // Look up the actual user ID from username using the store
        console.log("Looking up user ID for username:", username);
        await searchUsers(username);

        // Check if user exists in search results
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
        // Fallback: use username as ID (old behavior)
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

  return (
    <div className="min-h-screen bg-[#0a0f0a]">
      {/* Header */}
      <div className="nav-header">
        <div className="p-4">
          <div className="flex items-center">
            <button onClick={onBack} className="btn-icon btn-ghost mr-4">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">{title}</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-24">
        {/* Tag User(s) */}
        <div className="mb-6">
          <label className="block text-white font-semibold mb-3">
            Tag User(s)
          </label>
          <div className="relative">
            <div className="flex items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
              <AtSign size={20} className="text-[#94a3b8] mr-3" />
              <input
                type="text"
                value={tagInput}
                onChange={handleTagInput}
                placeholder="username"
                className="flex-1 bg-transparent text-white placeholder-[#94a3b8] focus:outline-none"
              />
            </div>

            {/* Friend Picker Dropdown */}
            {showFriendPicker && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-center text-[#94a3b8] text-sm">
                    Searching users...
                  </div>
                ) : tagInput.startsWith("@") && tagInput.length > 1 ? (
                  <>
                    {searchResults.length > 0 ? (
                      <>
                        <div className="p-2 border-b border-[#2a2a2a]">
                          <p className="text-[#94a3b8] text-xs font-medium">
                            SEARCH RESULTS
                          </p>
                        </div>
                        {searchResults.map((user: any) => (
                          <button
                            key={user.id}
                            onClick={() => selectFriend(user)}
                            className="w-full p-3 flex items-center space-x-3 hover:bg-[#2a2a2a] transition-colors border-b border-[#2a2a2a] last:border-b-0"
                          >
                            <Avatar
                              src={user.avatar_url || ""}
                              alt={user.display_name || user.username}
                              size="sm"
                              userId={user.id}
                              username={user.username}
                            />
                            <div className="flex-1 text-left">
                              <p className="text-white font-medium text-sm">
                                {user.display_name ||
                                  user.username ||
                                  "Unknown"}
                              </p>
                              <p className="text-[#94a3b8] text-xs">
                                @{user.username || "unknown"}
                              </p>
                            </div>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="p-3 text-center text-[#94a3b8] text-sm">
                        No users found for &quot;
                        {tagInput.replace("@", "")}
                        &quot;
                      </div>
                    )}
                    <div className="p-2 border-t border-[#2a2a2a]">
                      <button
                        onClick={handleManualUsernameSubmit}
                        className="w-full p-2 text-center text-[#4ade80] text-sm font-medium hover:bg-[#4ade80]/10 transition-colors rounded"
                      >
                        Use &quot;{tagInput.replace("@", "")}&quot; as username
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {friends.map((friend) => (
                      <button
                        key={friend.id}
                        onClick={() => selectFriend(friend)}
                        className="w-full p-3 flex items-center space-x-3 hover:bg-[#2a2a2a] transition-colors border-b border-[#2a2a2a] last:border-b-0"
                      >
                        <Avatar
                          src={friend.avatar}
                          alt={friend.name}
                          size="sm"
                          userId={friend.id}
                          username={friend.username}
                        />
                        <div className="flex-1 text-left">
                          <p className="text-white font-medium text-sm">
                            {friend.name}
                          </p>
                          <p className="text-[#94a3b8] text-xs">
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

          {/* Selected Friends */}
          {selectedFriendsData.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedFriendsData.map((friend) => (
                <div
                  key={friend.id}
                  className="bg-[#4ade80]/20 border border-[#4ade80]/30 rounded-full px-3 py-1 flex items-center space-x-2"
                >
                  <Avatar
                    src={friend.avatar}
                    alt={friend.name}
                    size="xs"
                    userId={friend.id}
                    username={friend.username}
                  />
                  <span className="text-white text-sm">{friend.name}</span>
                  <button
                    onClick={() => toggleFriend(friend.id)}
                    className="text-[#94a3b8] hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Show manually entered usernames */}
              {selectedFriends
                .filter((id) => !friends.find((f) => f.id === id))
                .map((username) => (
                  <div
                    key={username}
                    className="bg-[#4ade80]/20 border border-[#4ade80]/30 rounded-full px-3 py-1 flex items-center space-x-2"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                      <span className="text-[#94a3b8] text-xs">@</span>
                    </div>
                    <span className="text-white text-sm">{username}</span>
                    <button
                      onClick={() => toggleFriend(username)}
                      className="text-[#94a3b8] hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Main Input */}
        <div className="mb-6">
          <label className="block text-white font-semibold mb-3">
            {isTruth ? "Truth Question" : "Dare Description"}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 text-white placeholder-[#94a3b8] focus:border-[#4ade80]/50 focus:outline-none transition-all resize-none"
            rows={6}
          />
        </div>

        {/* Optional Context */}
        <div className="mb-6">
          <p className="text-[#94a3b8] text-sm italic">{contextText}</p>
        </div>
      </div>

      {/* Fixed Bottom Action Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0f0a]/95 backdrop-blur-lg border-t border-[#2a2a2a] p-4">
        <button
          onClick={handleSubmit}
          disabled={!selectedFriends.length || !content.trim() || creatingDare}
          className="w-full btn btn-primary py-4 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          <Send size={20} />
          <span>{creatingDare ? "Creating..." : actionButtonText}</span>
        </button>

        {/* Debug info - remove later */}
        <div className="mt-2 p-2 bg-[#1a1a1a] rounded text-xs text-[#94a3b8]">
          <div>Selected: {selectedFriends.length}</div>
          <div>Content: {content.trim().length > 0 ? "✓" : "✗"}</div>
          <div>User: {user?.id ? "✓" : "✗"}</div>
          <div>Creating: {creatingDare ? "✓" : "✗"}</div>
        </div>
      </div>
    </div>
  );
}
