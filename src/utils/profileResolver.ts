import { userService } from "@/middleware/services/service-factory";
import { useAvatarStore } from "@/stores/avatarStore";
import { useProfileDataStore } from "@/stores/profileDataStore";

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

function normalizeResolvedUserProfile(
  userId: string,
  rawProfile: any,
): ResolvedUserProfile | null {
  if (!rawProfile) return null;

  return {
    id: userId,
    userId,
    user_id: userId,
    displayName:
      rawProfile.displayName ||
      rawProfile.display_name ||
      rawProfile.nickname ||
      rawProfile.username ||
      "Someone",
    display_name:
      rawProfile.displayName ||
      rawProfile.display_name ||
      rawProfile.nickname ||
      rawProfile.username ||
      "Someone",
    username: rawProfile.username || "someone",
    nickname:
      rawProfile.nickname ||
      rawProfile.displayName ||
      rawProfile.display_name ||
      rawProfile.username ||
      "Someone",
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
  if (memoryCached) {
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

  if (resolvedProfile) {
    resolvedProfileCache.set(userId, resolvedProfile);
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
      console.error("Error resolving profile:", error);
    }

    resolvedProfileCache.set(userId, null);
    return null;
  })().finally(() => {
    inFlightProfileRequests.delete(userId);
  });

  inFlightProfileRequests.set(userId, request);
  return request;
}
