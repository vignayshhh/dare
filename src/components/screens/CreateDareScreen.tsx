"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Users, Target, Send, Search, X } from "lucide-react";
import { useDareStore } from "../../stores/useDareStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useUserSearchStore } from "../../stores/useUserSearchStore";
import { Avatar } from "../ui/Avatar";
import {
  userService,
  UserProfile,
} from "../../middleware/services/user.service";

interface CreateDareScreenProps {
  onBack: () => void;
}

export function CreateDareScreen({ onBack }: CreateDareScreenProps) {
  const [dareType, setDareType] = useState<"physical" | "creative" | "funny">(
    "physical",
  );
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [dareDescription, setDareDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const { createDare, creatingDare } = useDareStore();
  const { user } = useAuthStore();
  const { searchUsers, searchResults, isSearching } = useUserSearchStore();

  // Debug logging for search results
  console.log(
    `🔍 CreateDareScreen - Current searchResults: ${searchResults.length}`,
    searchResults.map((u) => ({ username: u.username, user_id: u.user_id })),
  );

  const dareTypes = [
    {
      id: "physical",
      label: "Physical Challenge",
      icon: "💪",
      description: "Push-ups, running, etc.",
    },
    {
      id: "creative",
      label: "Creative Challenge",
      icon: "🎨",
      description: "Art, music, writing",
    },
    {
      id: "funny",
      label: "Funny Challenge",
      icon: "😄",
      description: "Comedy, pranks, etc.",
    },
  ];

  // Load available users on mount
  useEffect(() => {
    const loadAvailableUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const users = await userService.getPublicProfiles();
        // Filter out current user
        const filteredUsers = user
          ? users.filter((u) => u.user_id !== user.id)
          : users;
        setAvailableUsers(filteredUsers.slice(0, 15)); // Show first 15 users
        console.log(`📊 Loaded ${filteredUsers.length} users for suggestions`);
      } catch (error) {
        console.error("Error loading users:", error);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    loadAvailableUsers();
  }, [user]);

  // Search users when query changes - faster debounce for real-time feel
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim() && searchQuery.length >= 1) {
        console.log(
          `🔍 CreateDareScreen - Triggering search for: "${searchQuery}"`,
        );
        searchUsers(searchQuery);
      } else {
        // Clear results when search is empty
        console.log(`🔍 CreateDareScreen - Clearing search results`);
        const { clearSearch } = useUserSearchStore.getState();
        clearSearch();
      }
    }, 150); // Faster debounce - 150ms for instant feel

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchUsers]);

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId],
    );
  };

  const handleUserSelect = (userId: string) => {
    toggleFriend(userId);
    setShowUserSearch(false);
    setSearchQuery("");
  };

  const getSelectedUserProfile = (userId: string): UserProfile | undefined => {
    return [...availableUsers, ...searchResults].find(
      (u) => u.user_id === userId || u.id === userId,
    );
  };

  const handleCreateDare = async () => {
    if (!user || selectedFriends.length === 0 || !dareDescription.trim()) {
      return;
    }

    try {
      // Create dare for each selected friend
      for (const friendId of selectedFriends) {
        await createDare({
          challenger_id: user.id,
          receiver_id: friendId,
          description: dareDescription.trim(),
        });
      }

      // Success - go back
      onBack();
    } catch (error) {
      console.error("Failed to create dare:", error);
    }
  };

  return (
    <div className="screen-container">
      {/* Header */}
      <div className="sticky top-0 bg-[#0a0f0a]/95 backdrop-blur-lg z-10 border-b border-[#2a2a2a]">
        <div className="p-4">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="text-[#94a3b8] hover:text-white transition-colors mr-4"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">Create Dare</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-[calc(var(--safe-area-bottom)+2rem)]">
        {/* Dare Type Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">
            What kind of dare?
          </h2>
          <div className="space-y-3">
            {dareTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setDareType(type.id as any)}
                className={`w-full bg-[#1a1a1a] rounded-xl p-4 border border-[#2a2a2a] hover:border-[#4ade80]/50 transition-all text-left ${
                  dareType === type.id ? "border-[#4ade80]" : ""
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="text-2xl">{type.icon}</div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{type.label}</h3>
                    <p className="text-[#94a3b8] text-sm">{type.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Friends Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Tag friends</h2>
            <button
              onClick={() => setShowUserSearch(!showUserSearch)}
              className="text-[#4ade80] hover:text-[#22c55e] text-sm font-medium transition-colors"
            >
              {showUserSearch ? "Show Suggestions" : "Search Users"}
            </button>
          </div>

          {showUserSearch ? (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="bg-[#1a1a1a] rounded-xl p-3 border border-[#2a2a2a]">
                <div className="flex items-center space-x-3">
                  <Search size={20} className="text-[#64748b]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type to search users..."
                    className="bg-transparent text-white text-base flex-1 outline-none placeholder-[#64748b]"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="text-[#64748b] hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Search Results */}
              <div className="max-h-80 overflow-y-auto space-y-1">
                {isSearching ? (
                  <div className="text-center py-6">
                    <div className="text-[#64748b] text-sm">
                      Searching users...
                    </div>
                  </div>
                ) : searchQuery &&
                  searchQuery.length >= 1 &&
                  searchResults.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-[#64748b] text-sm">
                      No users found for &quot;{searchQuery}&quot;
                    </p>
                    <p className="text-[#4a5568] text-xs mt-1">
                      Try a different username
                    </p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    <div className="px-3 py-2 text-[#64748b] text-xs font-medium">
                      Found {searchResults.length}{" "}
                      {searchResults.length === 1 ? "user" : "users"}
                    </div>
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleUserSelect(user.user_id)}
                        disabled={selectedFriends.includes(user.user_id)}
                        className={`w-full bg-[#1a1a1a] rounded-lg p-3 border transition-all text-left mx-1 ${
                          selectedFriends.includes(user.user_id)
                            ? "border-[#4ade80] opacity-50 cursor-not-allowed"
                            : "border-[#2a2a2a] hover:border-[#4ade80]/50 hover:bg-[#2a2a2a]"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar
                            src={user.avatar_url || ""}
                            alt={user.display_name || user.username}
                            size="sm"
                            userId={user.user_id}
                            username={user.username}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">
                              {user.display_name ||
                                user.username ||
                                "Unknown User"}
                            </p>
                            <p className="text-[#4ade80] text-xs">
                              @{user.username || "unknown"}
                            </p>
                          </div>
                          {selectedFriends.includes(user.user_id) && (
                            <span className="text-[#4ade80] text-xs font-medium">
                              Selected
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                ) : searchQuery && searchQuery.length >= 1 ? (
                  <div className="text-center py-6">
                    <p className="text-[#64748b] text-sm">
                      Type at least 1 character to search
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-[#64748b] text-sm">
                      Start typing to search users
                    </p>
                    <div className="mt-3 space-y-1">
                      <p className="text-[#4a5568] text-xs">
                        Try: alex, sarah, mike, emma...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {isLoadingUsers ? (
                <div className="text-center py-8">
                  <div className="text-[#64748b]">Loading users...</div>
                </div>
              ) : availableUsers.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {availableUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => toggleFriend(user.user_id)}
                      className={`bg-[#1a1a1a] rounded-xl p-3 border border-[#2a2a2a] hover:border-[#4ade80]/50 transition-all ${
                        selectedFriends.includes(user.user_id)
                          ? "border-[#4ade80]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar
                          src={user.avatar_url || ""}
                          alt={user.display_name || user.username}
                          size="sm"
                          userId={user.user_id}
                          username={user.username}
                        />
                        <div className="flex-1 text-left">
                          <p className="text-white font-medium text-sm truncate">
                            {user.display_name || user.username}
                          </p>
                          <p className="text-[#4ade80] text-xs">
                            {selectedFriends.includes(user.user_id)
                              ? "Selected"
                              : "Tap to select"}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-[#64748b]">No users available</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Friends Preview */}
        {selectedFriends.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-[#94a3b8] mb-2">
              Selected ({selectedFriends.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {selectedFriends.map((userId) => {
                const user = getSelectedUserProfile(userId);
                return (
                  <div
                    key={userId}
                    className="bg-[#4ade80]/20 border border-[#4ade80]/50 rounded-full px-3 py-1 flex items-center space-x-2"
                  >
                    <Avatar
                      src={user?.avatar_url || ""}
                      alt={user?.display_name || user?.username || "User"}
                      size="xs"
                      userId={userId}
                      username={user?.username}
                    />
                    <span className="text-[#4ade80] text-sm font-medium">
                      {user?.display_name || user?.username || "Unknown"}
                    </span>
                    <button
                      onClick={() => toggleFriend(userId)}
                      className="text-[#4ade80] hover:text-white transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dare Description */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">
            Dare description
          </h2>
          <textarea
            value={dareDescription}
            onChange={(e) => setDareDescription(e.target.value)}
            placeholder="Describe your dare challenge..."
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 text-white placeholder-[#94a3b8] focus:border-[#4ade80]/50 focus:outline-none transition-all resize-none"
            rows={4}
          />
        </div>

        {/* Create Button */}
        <button
          onClick={handleCreateDare}
          disabled={!selectedFriends.length || !dareDescription.trim()}
          className="w-full bg-[#4ade80] text-black py-3 rounded-xl font-semibold hover:bg-[#22c55e] transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-center space-x-2">
            <Send size={20} />
            <span>Create Dare</span>
          </div>
        </button>
      </div>
    </div>
  );
}
