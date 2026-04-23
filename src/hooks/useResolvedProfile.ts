import { useProfileDataStore, getResolvedDisplayName, getResolvedUsername } from "../stores/profileDataStore";

/**
 * Hook that returns resolved display name and username for any user.
 * Subscribes to profileDataStore so it re-renders when names change.
 * 
 * Usage:
 *   const { displayName, username } = useResolvedProfile(userId, fallbackName, fallbackUsername);
 */
export function useResolvedProfile(
  userId?: string,
  fallbackDisplayName?: string,
  fallbackUsername?: string,
) {
  // Subscribe to store changes so component re-renders on profile updates
  const userProfiles = useProfileDataStore((s) => s.userProfiles);
  const currentUserId = useProfileDataStore((s) => s.currentUserId);
  const currentDisplayName = useProfileDataStore((s) => s.currentDisplayName);
  const currentUsername = useProfileDataStore((s) => s.currentUsername);

  const isCurrentUser = userId && currentUserId && userId === currentUserId;

  let displayName = fallbackDisplayName || "";
  let username = fallbackUsername || "";

  if (isCurrentUser && currentDisplayName) {
    displayName = currentDisplayName;
  } else if (userId && userProfiles[userId]) {
    displayName = userProfiles[userId].displayName || displayName;
  }

  if (isCurrentUser && currentUsername) {
    username = currentUsername;
  } else if (userId && userProfiles[userId]) {
    username = userProfiles[userId].username || username;
  }

  return { displayName, username };
}

/**
 * Resolve a post author's display name and username from the profileDataStore.
 * Non-hook version for use outside React components (e.g., store mappers).
 */
export function resolveAuthorInfo(author: {
  name?: string;
  username?: string;
  avatar?: string;
}, authorId?: string): { name: string; username: string; avatar: string } {
  const resolvedName = getResolvedDisplayName(author.name, authorId, author.username);
  const resolvedUsername = getResolvedUsername(author.username, authorId);

  return {
    name: resolvedName || author.name || "",
    username: resolvedUsername || author.username || "",
    avatar: author.avatar || "",
  };
}
