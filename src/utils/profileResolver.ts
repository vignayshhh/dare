import { userService } from "@/middleware/services/service-factory";
import { useAvatarStore } from "@/stores/avatarStore";
import { useProfileDataStore } from "@/stores/profileDataStore";
import { logFirestoreError } from "./firestoreErrors";

export interface ResolvedUserProfile {
  id: string;
  userId: string;
  user_id: string;
  displayName: string;
  display_name: string;
  username: string;
  nickname: string;
  avatarUrl: string;
  avatar_url: string;
}

const DEFAULT_AVATAR = "/default-avatar.png";
const resolvedProfileCache = new Map<string, ResolvedUserProfile | null>();
const inFlightProfileRequests = new Map<
  string,
  Promise<ResolvedUserProfile | null>
>();

function cleanProfileText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackUsernameForUser(userId: string): string {
  return userId ? `user_${userId.slice(-6)}` : "user";
}

function isPlaceholderProfileText(value: unknown, userId?: string): boolean {
  const text = cleanProfileText(value).toLowerCase().replace(/^@/, "");
  if (!text) return true;

  const generated = userId ? fallbackUsernameForUser(userId).toLowerCase() : "";
  return (
    text === "someone" ||
    text === "unknown" ||
    text === "unknown user" ||
    text === "user" ||
    text === "guest" ||
    (!!generated && text === generated)
  );
}

function hasMeaningfulProfileName(
  profile: Pick<ResolvedUserProfile, "displayName" | "username" | "userId">,
): boolean {
  return (
    !isPlaceholderProfileText(profile.displayName, profile.userId) ||
    !isPlaceholderProfileText(profile.username, profile.userId)
  );
}

function normalizeResolvedUserProfile(
  userId: string,
  rawProfile: any,
): ResolvedUserProfile | null {
  if (!rawProfile) return null;

  const username = cleanProfileText(rawProfile.username);
  const displayName =
    cleanProfileText(rawProfile.displayName) ||
    cleanProfileText(rawProfile.display_name) ||
    cleanProfileText(rawProfile.nickname) ||
    username ||
    fallbackUsernameForUser(userId);
  const resolvedUsername = username || fallbackUsernameForUser(userId);

  return {
    id: userId,
    userId,
    user_id: userId,
    displayName,
    display_name: displayName,
    username: resolvedUsername,
    nickname:
      cleanProfileText(rawProfile.nickname) || displayName || resolvedUsername,
    avatarUrl:
      rawProfile.avatarUrl ||
      rawProfile.avatar_url ||
      rawProfile.avatar ||
      DEFAULT_AVATAR,
    avatar_url:
      rawProfile.avatarUrl ||
      rawProfile.avatar_url ||
      rawProfile.avatar ||
      DEFAULT_AVATAR,
  };
}

function syncResolvedProfile(profile: ResolvedUserProfile): void {
  useProfileDataStore.getState().setUserProfile(
    profile.userId,
    profile.displayName,
    profile.username,
    profile.avatarUrl,
  );

  if (profile.avatarUrl && profile.avatarUrl !== DEFAULT_AVATAR) {
    useAvatarStore.getState().setUserAvatar(profile.userId, profile.avatarUrl);
  }
}

export function getCachedResolvedUserProfile(
  userId: string,
): ResolvedUserProfile | null {
  if (!userId) return null;

  const memoryCached = resolvedProfileCache.get(userId);
  if (memoryCached && hasMeaningfulProfileName(memoryCached)) {
    return memoryCached;
  }

  const profileStoreEntry = useProfileDataStore.getState().userProfiles[userId];
  const avatarStoreEntry = useAvatarStore.getState().userAvatars[userId];

  if (!profileStoreEntry && !avatarStoreEntry) {
    return null;
  }

  const resolvedProfile = normalizeResolvedUserProfile(userId, {
    displayName: profileStoreEntry?.displayName,
    username: profileStoreEntry?.username,
    avatarUrl: profileStoreEntry?.avatarUrl || avatarStoreEntry,
  });

  if (resolvedProfile && hasMeaningfulProfileName(resolvedProfile)) {
    resolvedProfileCache.set(userId, resolvedProfile);
  } else if (resolvedProfile) {
    resolvedProfileCache.delete(userId);
    return null;
  }

  return resolvedProfile;
}

export function primeResolvedUserProfile(
  userId: string,
  rawProfile: any,
): ResolvedUserProfile | null {
  const resolvedProfile = normalizeResolvedUserProfile(userId, rawProfile);
  if (!resolvedProfile) {
    return null;
  }

  if (!hasMeaningfulProfileName(resolvedProfile)) {
    resolvedProfileCache.delete(userId);
    return null;
  }

  resolvedProfileCache.set(userId, resolvedProfile);
  syncResolvedProfile(resolvedProfile);
  return resolvedProfile;
}

export async function resolveUserProfile(
  userId: string,
): Promise<ResolvedUserProfile | null> {
  if (!userId) return null;

  const cachedProfile = getCachedResolvedUserProfile(userId);
  if (cachedProfile) {
    return cachedProfile;
  }

  const existingRequest = inFlightProfileRequests.get(userId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      const response = await userService.getProfileByUserIdForContent(userId);
      const resolvedProfile = primeResolvedUserProfile(
        userId,
        response?.success ? response.profile : null,
      );

      if (resolvedProfile) {
        return resolvedProfile;
      }
    } catch (error) {
      logFirestoreError("Error resolving profile:", error);
    }

    resolvedProfileCache.set(userId, null);
    return null;
  })().finally(() => {
    inFlightProfileRequests.delete(userId);
  });

  inFlightProfileRequests.set(userId, request);
  return request;
}


