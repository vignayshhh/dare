"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Flame,
  Search,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useUserSearchStore } from "../../stores/useUserSearchStore";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { Avatar } from "../ui/Avatar";
import {
  userService,
  type UserProfile,
} from "../../middleware/services/user.service";

interface UserSearchScreenProps {
  onBack: () => void;
  onUserSelect: (userId: string) => void;
}

interface SearchHistoryEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  lastSearchedAt: string;
  searchCount: number;
}

const SEARCH_HISTORY_LIMIT = 18;

function normalizeUser(user: UserProfile, cached?: {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}) {
  return {
    id: user.user_id || user.id,
    displayName: cached?.displayName || user.display_name || user.username,
    username: cached?.username || user.username,
    avatarUrl: cached?.avatarUrl || user.avatar_url || "",
    createdAt: user.created_at,
  };
}

function getHistoryStorageKey(userId?: string) {
  return `dare-user-search-history:${userId || "guest"}`;
}

function readHistory(userId?: string): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(getHistoryStorageKey(userId));
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is SearchHistoryEntry =>
        entry &&
        typeof entry.userId === "string" &&
        typeof entry.username === "string" &&
        typeof entry.displayName === "string" &&
        typeof entry.lastSearchedAt === "string" &&
        typeof entry.searchCount === "number",
    );
  } catch {
    return [];
  }
}

function writeHistory(userId: string | undefined, history: SearchHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getHistoryStorageKey(userId),
    JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)),
  );
}

export function UserSearchScreen({
  onBack,
  onUserSelect,
}: UserSearchScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [publicUsers, setPublicUsers] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const { searchUsers, searchResults, isSearching, error, clearSearch } =
    useUserSearchStore();
  const { user: currentUser } = useAuthStore();
  const searchProfiles = useProfileDataStore((s) => s.userProfiles);

  useEffect(() => {
    setHistory(readHistory(currentUser?.id));
  }, [currentUser?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadSuggestions = async () => {
      setIsLoadingSuggestions(true);
      try {
        const publicProfiles = await userService.getPublicProfiles();
        if (!isMounted) return;

        const filtered = publicProfiles
          .filter((profile) => {
            const profileId = profile.user_id || profile.id;
            return profileId && profileId !== currentUser?.id;
          })
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );

        setPublicUsers(filtered);
      } finally {
        if (isMounted) {
          setIsLoadingSuggestions(false);
        }
      }
    };

    void loadSuggestions();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (searchQuery.trim()) {
        void searchUsers(searchQuery);
      } else {
        clearSearch();
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery, searchUsers, clearSearch]);

  const recentSearches = useMemo(
    () =>
      [...history]
        .sort(
          (a, b) =>
            new Date(b.lastSearchedAt).getTime() -
            new Date(a.lastSearchedAt).getTime(),
        )
        .slice(0, 6),
    [history],
  );

  const frequentSearches = useMemo(
    () =>
      [...history]
        .sort((a, b) => {
          if (b.searchCount !== a.searchCount) {
            return b.searchCount - a.searchCount;
          }

          return (
            new Date(b.lastSearchedAt).getTime() -
            new Date(a.lastSearchedAt).getTime()
          );
        })
        .slice(0, 6),
    [history],
  );

  const publicUserLookup = useMemo(() => {
    const lookup = new Map<string, UserProfile>();

    publicUsers.forEach((user) => {
      const userId = user.user_id || user.id;
      if (userId) {
        lookup.set(userId, user);
      }
    });

    return lookup;
  }, [publicUsers]);

  const newcomerSuggestions = useMemo(() => {
    return publicUsers
      .filter((user) => Boolean(user.user_id || user.id))
      .slice(0, 6);
  }, [publicUsers]);

  const frequentSearchProfiles = useMemo(
    () =>
      frequentSearches.map((entry) => {
        const liveProfile = publicUserLookup.get(entry.userId);
        const cachedProfile = searchProfiles[entry.userId];

        if (liveProfile) {
          const resolvedUser = normalizeUser(liveProfile, cachedProfile);
          return {
            userId: resolvedUser.id,
            displayName: resolvedUser.displayName,
            username: resolvedUser.username,
            avatarUrl: resolvedUser.avatarUrl,
            searchCount: entry.searchCount,
          };
        }

        return entry;
      }),
    [frequentSearches, publicUserLookup, searchProfiles],
  );

  const saveSearchHistory = (user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }) => {
    const now = new Date().toISOString();
    const nextHistory = (() => {
      const previous = readHistory(currentUser?.id);
      const existing = previous.find((entry) => entry.userId === user.id);
      const updatedEntry: SearchHistoryEntry = {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        lastSearchedAt: now,
        searchCount: existing ? existing.searchCount + 1 : 1,
      };

      return [
        updatedEntry,
        ...previous.filter((entry) => entry.userId !== user.id),
      ].slice(0, SEARCH_HISTORY_LIMIT);
    })();

    writeHistory(currentUser?.id, nextHistory);
    setHistory(nextHistory);
  };

  const handleUserClick = (user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }) => {
    saveSearchHistory(user);
    onUserSelect(user.id);
  };

  const UserRow = ({
    user,
    subtitle,
    badge,
  }: {
    user: {
      id: string;
      displayName: string;
      username: string;
      avatarUrl: string;
    };
    subtitle?: string;
    badge?: string;
  }) => (
    <div className="group flex items-center gap-3 rounded-[26px] border border-white/6 bg-[linear-gradient(180deg,rgba(28,34,28,0.98),rgba(16,20,16,0.98))] px-4 py-4 text-left shadow-[0_12px_30px_rgba(0,0,0,0.24)] transition-all duration-200 hover:border-[#4ade80]/25 hover:bg-[linear-gradient(180deg,rgba(31,39,31,1),rgba(18,23,18,1))]">
      <button
        onClick={() => handleUserClick(user)}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <Avatar
          src={user.avatarUrl}
          alt={user.displayName}
          size="lg"
          userId={user.id}
          username={user.username}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-white group-hover:text-[#dfffe9]">
              {user.displayName}
            </p>
            {badge ? (
              <span className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#86efac]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="truncate text-sm font-medium text-[#4ade80]">
            @{user.username.replace(/^@/, "")}
          </p>
          {subtitle ? (
            <p className="mt-1 truncate text-xs text-[#7f8b7f]">{subtitle}</p>
          ) : null}
        </div>
      </button>
    </div>
  );

  const SectionHeader = ({
    icon,
    title,
  }: {
    icon: React.ReactNode;
    title: string;
  }) => (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="rounded-full border border-white/8 bg-white/5 p-2 text-[#9be8b1]">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-[0.02em] text-white">
            {title}
          </h2>
        </div>
      </div>
    </div>
  );

  return (
    <div className="screen-container bg-[radial-gradient(circle_at_top,#162016_0%,#0b100b_45%,#070a07_100%)]">
      <div className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(11,16,11,0.96),rgba(11,16,11,0.78))] backdrop-blur-xl">
        <div className="px-4 pb-5 pt-4">
          <div className="mb-4 flex items-center gap-4">
            <button
              onClick={onBack}
              className="rounded-full border border-white/8 bg-white/5 p-2.5 text-[#94a3b8] transition-colors hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">Search users</h1>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,29,24,0.98),rgba(17,21,17,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 rounded-full border border-white/6 bg-black/20 px-4 py-3">
              <Search size={18} className="text-[#7f8b7f]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username or display name"
                className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-[#64748b]"
                autoFocus
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="rounded-full bg-white/6 p-1.5 text-[#94a3b8] transition-colors hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-8 pt-4">
        {error ? (
          <div className="mb-4 rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {isSearching ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="animate-pulse rounded-[26px] border border-white/6 bg-white/[0.03] px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-[56px] w-[56px] rounded-full bg-white/8" />
                  <div className="flex-1">
                    <div className="mb-2 h-4 w-32 rounded-full bg-white/8" />
                    <div className="h-3 w-24 rounded-full bg-white/8" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : searchQuery.trim() ? (
          searchResults.length > 0 ? (
            <div className="space-y-5">
              <div className="rounded-[28px] border border-[#4ade80]/15 bg-[#4ade80]/[0.08] px-4 py-3 text-sm text-[#d8ffe3]">
                Found {searchResults.length}{" "}
                {searchResults.length === 1 ? "person" : "people"} for "
                {searchQuery}"
              </div>

              <div className="space-y-3">
                {searchResults.map((user) => {
                  const cached = searchProfiles[user.id];
                  const resolvedUser = normalizeUser(user, cached);

                  return (
                    <UserRow
                      key={resolvedUser.id}
                      user={resolvedUser}
                      subtitle="Tap to open profile"
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(22,26,22,0.98),rgba(15,18,15,0.98))] px-6 py-10 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/8 bg-white/5 text-[#7f8b7f]">
                <User size={28} />
              </div>
              <p className="text-lg font-semibold text-white">
                No users found for "{searchQuery}"
              </p>
              <p className="mt-2 text-sm text-[#7f8b7f]">
                Try another name or username.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-6">
            <div className="rounded-[30px] border border-white/6 bg-[linear-gradient(135deg,rgba(20,28,20,0.98),rgba(13,16,13,0.98))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.26)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86efac]">
                    Discovery
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    Find the newest people joining Dare
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#8ea18e]">
                    Find new people worth following fast.
                  </p>
                </div>
                <div className="rounded-[24px] bg-[radial-gradient(circle_at_top,#4ade80_0%,rgba(74,222,128,0.12)_35%,transparent_70%)] p-3 text-[#86efac]">
                  <Sparkles size={24} />
                </div>
              </div>
            </div>

            <div>
              <SectionHeader
                icon={<Users size={15} />}
                title="New on Dare"
              />
              <div className="space-y-3">
                {newcomerSuggestions.length > 0 ? (
                  newcomerSuggestions.map((user) => {
                    const cached = searchProfiles[user.id];
                    const resolvedUser = normalizeUser(user, cached);

                    return (
                      <UserRow
                        key={resolvedUser.id}
                        user={resolvedUser}
                        subtitle="Recently joined Dare"
                        badge="New"
                      />
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-5 text-sm text-[#7f8b7f]">
                    New user suggestions will appear here as people join the
                    app.
                  </div>
                )}
              </div>
            </div>

            <div>
              <SectionHeader
                icon={<Flame size={15} />}
                title="Frequent searches"
              />
              <div className="space-y-3">
                {frequentSearchProfiles.length > 0 ? (
                  frequentSearchProfiles.map((entry) => (
                    <UserRow
                      key={entry.userId}
                      user={{
                        id: entry.userId,
                        displayName: entry.displayName,
                        username: entry.username,
                        avatarUrl: entry.avatarUrl,
                      }}
                      subtitle={`Opened ${entry.searchCount} time${entry.searchCount > 1 ? "s" : ""}`}
                      badge="Frequent"
                    />
                  ))
                ) : (
                  <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-5 text-sm text-[#7f8b7f]">
                    Profiles you open most will surface here after a little usage.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
