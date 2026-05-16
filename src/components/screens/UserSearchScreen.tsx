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

function profileTime(value: unknown): number {
  if (!value) return 0;

  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  if (typeof value === "object") {
    const timestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof timestamp.toDate === "function") {
      const time = timestamp.toDate().getTime();
      return Number.isFinite(time) ? time : 0;
    }

    if (typeof timestamp.seconds === "number") {
      return (
        timestamp.seconds * 1000 +
        Math.floor((timestamp.nanoseconds || 0) / 1000000)
      );
    }
  }

  return 0;
}

function profileCreatedTime(user: Partial<UserProfile> & { createdAt?: unknown }) {
  return profileTime(user.created_at ?? user.createdAt);
}

function compareRecentProfiles(a: UserProfile, b: UserProfile) {
  const timeDiff = profileCreatedTime(b) - profileCreatedTime(a);
  if (timeDiff !== 0) return timeDiff;

  return (a.user_id || a.id || "").localeCompare(b.user_id || b.id || "");
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
          .sort(compareRecentProfiles);

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
    <div className="daily-panel group relative overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] px-4 py-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:border-[#4ade80]/25">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.45),rgba(74,222,128,0))]" />
      <button
        onClick={() => handleUserClick(user)}
        className="relative z-10 flex w-full items-center gap-3 text-left"
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
            <p className="truncate text-[16px] font-black text-white group-hover:text-[#dfffe9]">
              {user.displayName}
            </p>
            {badge ? (
              <span className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="truncate text-sm font-semibold text-[#6ee7b7]">
            @{user.username.replace(/^@/, "")}
          </p>
          {subtitle ? (
            <p className="mt-1 truncate text-[12px] font-semibold text-[#64748b]">
              {subtitle}
            </p>
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
        <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.04] text-[#86efac] shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
          {icon}
        </div>
        <div>
          <h2 className="text-[12px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            {title}
          </h2>
        </div>
      </div>
    </div>
  );

  return (
    <div className="screen-container user-search-screen">
      <style>{`
        .user-search-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%),
            radial-gradient(circle at 12% 18%, rgba(14,165,233,0.12), transparent 28%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes dailySweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes dailyFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .daily-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: dailySweep 6.6s ease-in-out infinite;
        }
      `}</style>

      <div
        className="custom-scrollbar flex-1 min-h-0 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 12px)",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)] transition-colors hover:border-[#4ade80]/30 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[32px] font-black leading-none tracking-tight text-white">
                Search Users
              </h1>
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[#4ade80] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            <Search size={24} />
          </div>
        </div>

        <div className="daily-panel daily-shine relative mb-5 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="relative z-10 flex min-h-[56px] items-center gap-3 rounded-full border border-white/8 bg-[#070907] px-4">
            <Search size={18} className="shrink-0 text-[#86efac]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username or display name"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white outline-none placeholder:text-[#3d463f]"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        ) : null}

        {isSearching ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="animate-pulse rounded-[26px] border border-white/8 bg-white/[0.035] px-4 py-4"
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
              <div className="rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/10 px-4 py-3 text-sm font-semibold text-[#d1fae5]">
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
            <div className="daily-panel relative overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] px-6 py-10 text-center shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.04] text-[#64748b]">
                <User size={28} />
              </div>
              <p className="text-xl font-black text-white">
                No users found for "{searchQuery}"
              </p>
              <p className="mt-2 text-sm font-semibold text-[#64748b]">
                Try another name or username.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-6">
            <div className="daily-panel relative overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
              <div className="pointer-events-none absolute right-8 top-8 h-32 w-32 rounded-full bg-[#4ade80]/10 blur-3xl" />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                    Discovery
                  </div>
                  <h2 className="text-[24px] font-black leading-tight text-white">
                    Find the newest people joining Dare
                  </h2>
                  <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-[#6ee7b7]">
                    Find new people worth following fast.
                  </p>
                </div>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac] shadow-[0_18px_48px_rgba(74,222,128,0.12)]">
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
                  <div className="rounded-[24px] border border-white/8 bg-white/[0.035] px-4 py-5 text-sm font-semibold text-[#64748b]">
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
                  <div className="rounded-[24px] border border-white/8 bg-white/[0.035] px-4 py-5 text-sm font-semibold text-[#64748b]">
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
