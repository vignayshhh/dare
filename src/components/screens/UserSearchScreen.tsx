"use client";

import { useState, useEffect } from "react";
import { Search, ArrowLeft, User } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useUserSearchStore } from "../../stores/useUserSearchStore";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { Avatar } from "../ui/Avatar";

interface UserSearchScreenProps {
  onBack: () => void;
  onUserSelect: (userId: string) => void;
}

export function UserSearchScreen({
  onBack,
  onUserSelect,
}: UserSearchScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { searchUsers, searchResults, isSearching, error } =
    useUserSearchStore();
  const { user: currentUser } = useAuthStore();
  const searchProfiles = useProfileDataStore((s) => s.userProfiles);

  // Search users when query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers(searchQuery);
      } else {
        searchUsers("");
      }
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchUsers]);

  const handleUserClick = (userId: string) => {
    onUserSelect(userId);
  };

  return (
    <div className="screen-container">
      {/* Header */}
      <div className="bg-black border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="text-[#94a3b8] hover:text-white transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">Search Users</h1>
          </div>
        </div>
      </div>

      {/* Search Bar Capsule */}
      <div className="p-4">
        <div className="bg-[#1e1e1e] rounded-full flex items-center px-4 py-3 space-x-3">
          <Search size={20} className="text-[#64748b]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or username..."
            className="bg-transparent text-white text-base flex-1 outline-none placeholder-[#64748b]"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[#64748b] hover:text-white transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {isSearching ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-[#64748b]">Searching...</div>
          </div>
        ) : searchQuery && searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <User size={48} className="text-[#64748b] mb-4" />
            <p className="text-[#64748b] text-center">
              No users found for "{searchQuery}"
            </p>
            <p className="text-[#4a5568] text-sm mt-2">
              Try a different search term
            </p>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[#64748b] text-sm mb-4">
              Found {searchResults.length}{" "}
              {searchResults.length === 1 ? "user" : "users"}
            </p>
            {searchResults.map((user, index) => (
              (() => {
                const cached = searchProfiles[user.id];
                const resolvedName =
                  cached?.displayName || user.display_name || user.username;
                const resolvedUsername = cached?.username || user.username;
                const resolvedAvatar = cached?.avatarUrl || user.avatar_url || "";

                return (
                  <button
                    key={`${user.id}-${index}`}
                    onClick={() => handleUserClick(user.id)}
                    className="w-full bg-[#1e1e1e] rounded-2xl p-4 flex items-center space-x-4 hover:bg-[#2a2a2a] transition-colors group"
                  >
                    <Avatar
                      src={resolvedAvatar}
                      alt={resolvedName}
                      size="lg"
                      userId={user.id}
                      username={resolvedUsername}
                    />
                    <div className="flex-1 text-left">
                      <h3 className="text-white font-semibold text-base group-hover:text-[#4ade80] transition-colors">
                        {resolvedName}
                      </h3>
                      <p className="text-[#4ade80] text-sm font-medium">
                        @{resolvedUsername}
                      </p>
                    </div>
                    <div className="text-[#64748b] group-hover:text-white transition-colors">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </button>
                );
              })()
            ))}
          </div>
        ) : searchQuery ? (
          <div className="text-center py-8">
            <p className="text-[#64748b]">Start typing to search for users</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Search size={48} className="text-[#64748b] mb-4 mx-auto" />
            <p className="text-[#64748b] text-lg mb-2">Search for Users</p>
            <p className="text-[#4a5568] text-sm mb-6">
              Find friends by name or username
            </p>

            {/* Suggested usernames for testing */}
            <div className="bg-[#1e1e1e] rounded-2xl p-4 max-w-xs mx-auto">
              <p className="text-[#64748b] text-sm mb-3">Try searching for:</p>
              <div className="space-y-2">
                <button
                  onClick={() => setSearchQuery("vigneshoct")}
                  className="block w-full text-left bg-[#2a2a2a] rounded-full px-4 py-2 text-[#4ade80] hover:bg-[#333] transition-colors text-sm"
                >
                  @vigneshoct62002
                </button>
                <button
                  onClick={() => setSearchQuery("vignayshhh")}
                  className="block w-full text-left bg-[#2a2a2a] rounded-full px-4 py-2 text-[#4ade80] hover:bg-[#333] transition-colors text-sm"
                >
                  @vignayshhh
                </button>
                <button
                  onClick={() => setSearchQuery("testuser")}
                  className="block w-full text-left bg-[#2a2a2a] rounded-full px-4 py-2 text-[#4ade80] hover:bg-[#333] transition-colors text-sm"
                >
                  @testuser
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
