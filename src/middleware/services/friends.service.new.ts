import { IFriendshipRepository } from "@/backend/domain/interfaces/IFriendshipRepository";
import { FriendshipRepository } from "@/backend/repositories/FriendshipRepository";
import { IUserRepository } from "@/backend/domain/interfaces/IUserRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";
import { UserProfileEntity } from "@/backend/domain/entities/UserProfile";

export interface FriendshipResponse {
  success: boolean;
  friendship?: any;
  error?: string;
}

export interface FriendListResponse {
  success: boolean;
  friends?: UserProfileEntity[];
  error?: string;
}

export interface PendingRequestsResponse {
  success: boolean;
  requests?: any[];
  error?: string;
}

export interface SearchUsersResponse {
  success: boolean;
  users?: UserProfileEntity[];
  error?: string;
}

class FriendsService {
  private friendshipRepository: IFriendshipRepository;
  private userRepository: IUserRepository;
  private readonly friendsCacheTtlMs = 5 * 60 * 1000;
  private readonly friendshipStatusCacheTtlMs = 60_000;
  private friendsCache = new Map<
    string,
    { data: UserProfileEntity[]; expiresAt: number }
  >();
  private inFlightFriendsRequests = new Map<
    string,
    Promise<FriendListResponse>
  >();
  private friendshipStatusCache = new Map<
    string,
    { data: any | null; expiresAt: number }
  >();

  private friendshipStatusCacheKey(a: string, b: string): string {
    return [a, b].sort().join(":");
  }

  constructor(
    friendshipRepository?: IFriendshipRepository,
    userRepository?: IUserRepository,
  ) {
    this.friendshipRepository =
      friendshipRepository || new FriendshipRepository();
    this.userRepository = userRepository || new UserRepository();
  }

  private getCachedFriends(userId: string): UserProfileEntity[] | null {
    const cached = this.friendsCache.get(userId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.friendsCache.delete(userId);
      return null;
    }
    return cached.data;
  }

  private setCachedFriends(userId: string, friends: UserProfileEntity[]): void {
    this.friendsCache.set(userId, {
      data: friends,
      expiresAt: Date.now() + this.friendsCacheTtlMs,
    });
  }

  private invalidateFriendsCache(...userIds: Array<string | undefined>): void {
    userIds.forEach((userId) => {
      if (!userId) return;
      this.friendsCache.delete(userId);
      this.inFlightFriendsRequests.delete(userId);
    });
    const [a, b] = userIds.filter(Boolean) as string[];
    if (a && b) {
      this.friendshipStatusCache.delete(this.friendshipStatusCacheKey(a, b));
    } else if (a) {
      for (const key of this.friendshipStatusCache.keys()) {
        if (key.startsWith(`${a}:`) || key.endsWith(`:${a}`)) {
          this.friendshipStatusCache.delete(key);
        }
      }
    }
  }

  async sendFriendRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<FriendshipResponse> {
    try {
      if (requesterId === addresseeId) {
        return {
          success: false,
          error: "You cannot send a friend request to yourself",
        };
      }

      const existingFriendship =
        await this.friendshipRepository.getFriendshipBetweenUsers(
          requesterId,
          addresseeId,
        );

      if (existingFriendship) {
        if (existingFriendship.status === "pending") {
          return { success: false, error: "Friend request already sent" };
        } else if (existingFriendship.status === "accepted") {
          return { success: false, error: "You are already friends" };
        } else if (existingFriendship.status === "rejected") {
          await this.friendshipRepository.deleteFriendship(
            existingFriendship.id,
          );
          this.invalidateFriendsCache(requesterId, addresseeId);
        }
      }

      const friendship = await this.friendshipRepository.createFriendship({
        requesterId,
        addresseeId,
      });
      this.invalidateFriendsCache(requesterId, addresseeId);

      return { success: true, friendship };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async acceptFriendRequest(
    friendshipId: string,
    userId: string,
  ): Promise<FriendshipResponse> {
    try {
      console.log("🔄 acceptFriendRequest called with:", {
        friendshipId,
        userId,
      });

      const friendship =
        await this.friendshipRepository.getFriendshipById(friendshipId);

      console.log("🔄 Found friendship:", friendship);

      if (!friendship) {
        console.log("❌ Friendship not found");
        return { success: false, error: "Friend request not found" };
      }

      if (friendship.addresseeId !== userId) {
        console.log("❌ User not authorized to accept this request");
        return {
          success: false,
          error: "You can only accept requests sent to you",
        };
      }

      if (friendship.status !== "pending") {
        console.log(
          "❌ Friendship not pending, current status:",
          friendship.status,
        );
        return { success: false, error: "This request is no longer pending" };
      }

      console.log("🔄 Updating friendship status to accepted...");
      const updatedFriendship =
        await this.friendshipRepository.updateFriendshipStatus(
          friendshipId,
          "accepted",
        );
      this.invalidateFriendsCache(
        updatedFriendship.requesterId,
        updatedFriendship.addresseeId,
      );

      console.log("✅ Friendship updated successfully:", updatedFriendship);

      return { success: true, friendship: updatedFriendship };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Error in acceptFriendRequest:", error);
      return { success: false, error: errorMessage };
    }
  }

  async rejectFriendRequest(
    friendshipId: string,
    userId: string,
  ): Promise<FriendshipResponse> {
    try {
      const friendship =
        await this.friendshipRepository.getFriendshipById(friendshipId);

      if (!friendship) {
        return { success: false, error: "Friend request not found" };
      }

      if (friendship.addresseeId !== userId) {
        return {
          success: false,
          error: "You can only reject requests sent to you",
        };
      }

      if (friendship.status !== "pending") {
        return { success: false, error: "This request is no longer pending" };
      }

      const updatedFriendship =
        await this.friendshipRepository.updateFriendshipStatus(
          friendshipId,
          "rejected",
        );
      this.invalidateFriendsCache(
        updatedFriendship.requesterId,
        updatedFriendship.addresseeId,
      );

      return { success: true, friendship: updatedFriendship };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async removeFriend(
    friendshipId: string,
    userId: string,
  ): Promise<FriendshipResponse> {
    try {
      const friendship =
        await this.friendshipRepository.getFriendshipById(friendshipId);

      if (!friendship) {
        return { success: false, error: "Friendship not found" };
      }

      if (
        friendship.requesterId !== userId &&
        friendship.addresseeId !== userId
      ) {
        return {
          success: false,
          error: "You can only remove friendships you are part of",
        };
      }

      await this.friendshipRepository.deleteFriendship(friendshipId);
      this.invalidateFriendsCache(
        friendship.requesterId,
        friendship.addresseeId,
      );

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getFriends(userId: string): Promise<FriendListResponse> {
    const cachedFriends = this.getCachedFriends(userId);
    if (cachedFriends) {
      return { success: true, friends: cachedFriends };
    }

    const existingRequest = this.inFlightFriendsRequests.get(userId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.fetchFriends(userId).finally(() => {
      this.inFlightFriendsRequests.delete(userId);
    });
    this.inFlightFriendsRequests.set(userId, request);
    return request;
  }

  private async fetchFriends(userId: string): Promise<FriendListResponse> {
    try {
      console.log("🔄 getFriends called for user:", userId);

      const friendships =
        await this.friendshipRepository.getAcceptedFriends(userId);

      console.log("🔄 Retrieved accepted friendships:", friendships);

      const friendIds = friendships.map((f) =>
        f.requesterId === userId ? f.addresseeId : f.requesterId,
      );

      console.log("🔄 Extracted friend IDs:", friendIds);

      if (friendIds.length === 0) {
        this.setCachedFriends(userId, []);
        console.log("⚠️ No friends found");
        return { success: true, friends: [] };
      }

      console.log("🔄 Fetching profiles for friend IDs...");
      const profilePromises = friendIds.map((friendId) =>
        this.userRepository.getProfileByUserId(friendId),
      );

      const profileResults = await Promise.allSettled(profilePromises);
      console.log("🔄 Profile results:", profileResults);

      const friends: UserProfileEntity[] = [];

      profileResults.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) {
          console.log(`✅ Profile ${index} found:`, result.value);

          try {
            const friendEntity = UserProfileEntity.create(result.value);
            console.log(`✅ Friend entity ${index} created:`, friendEntity);
            friends.push(friendEntity);
          } catch (createError) {
            console.warn(
              `⚠️ UserProfileEntity.create failed for profile ${index}, using raw data:`,
              createError,
            );
            const raw = result.value;
            friends.push({
              id: raw.id || friendIds[index],
              userId: raw.userId || friendIds[index],
              username: raw.username || "unknown",
              nickname:
                raw.nickname || raw.displayName || raw.username || "Unknown",
              displayName: raw.displayName || raw.nickname || null,
              bio: raw.bio || null,
              avatarUrl: raw.avatarUrl || null,
              visibility: raw.visibility || "PUBLIC",
              is18Plus: raw.is18Plus ?? false,
              consentAccepted: raw.consentAccepted ?? false,
              daresCompleted: raw.daresCompleted ?? 0,
              daresRefused: raw.daresRefused ?? 0,
              ghostModeActive: raw.ghostModeActive ?? false,
              ghostModeExpiresAt: raw.ghostModeExpiresAt || null,
              createdAt: raw.createdAt || new Date().toISOString(),
              updatedAt: raw.updatedAt || new Date().toISOString(),
            } as any);
          }
        } else {
          console.log(`❌ Profile ${index} failed:`, result);
          if (result.status === "rejected") {
            console.log(`❌ Profile ${index} reason:`, result.reason);
          }
        }
      });

      console.log("🔄 Final friends list:", friends);
      this.setCachedFriends(userId, friends);
      return { success: true, friends };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getPendingRequests(userId: string): Promise<PendingRequestsResponse> {
    try {
      const pendingRequests =
        await this.friendshipRepository.getPendingFriendships(userId);
      return { success: true, requests: pendingRequests };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getSentRequests(userId: string): Promise<PendingRequestsResponse> {
    try {
      const friendships =
        await this.friendshipRepository.getFriendshipsForUser(userId);
      const sentRequests = friendships.filter(
        (f) => f.requesterId === userId && f.status === "pending",
      );

      return { success: true, requests: sentRequests };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async areUsersFriends(user1Id: string, user2Id: string): Promise<boolean> {
    try {
      return await this.friendshipRepository.areUsersFriends(user1Id, user2Id);
    } catch (error) {
      console.error("areUsersFriends error:", error);
      return false;
    }
  }

  async searchUsers(
    query: string,
    currentUserId: string,
  ): Promise<SearchUsersResponse> {
    try {
      const profilesData = await this.userRepository.searchProfiles(query);
      const profiles = profilesData.map((profileData) =>
        UserProfileEntity.create(profileData),
      );

      const filteredProfiles = profiles.filter(
        (profile) => profile.userId !== currentUserId,
      );

      const profilesWithFriendshipStatus = await Promise.all(
        filteredProfiles.map(async (profile) => {
          const areFriends = await this.areUsersFriends(
            currentUserId,
            profile.userId,
          );
          return {
            ...profile,
            isFriend: areFriends,
          };
        }),
      );

      return { success: true, users: profilesWithFriendshipStatus as any };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getFriendshipStatus(
    user1Id: string,
    user2Id: string,
  ): Promise<FriendshipResponse> {
    try {
      const cacheKey = this.friendshipStatusCacheKey(user1Id, user2Id);
      const cached = this.friendshipStatusCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { success: true, friendship: cached.data };
      }

      const friendship =
        await this.friendshipRepository.getFriendshipBetweenUsers(
          user1Id,
          user2Id,
        );

      this.friendshipStatusCache.set(cacheKey, {
        data: friendship ?? null,
        expiresAt: Date.now() + this.friendshipStatusCacheTtlMs,
      });

      if (!friendship) {
        return { success: true, friendship: null };
      }

      return { success: true, friendship };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async unfriendUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<FriendshipResponse> {
    try {
      if (currentUserId === targetUserId) {
        return { success: false, error: "You cannot unfriend yourself" };
      }

      const friendship =
        await this.friendshipRepository.getFriendshipBetweenUsers(
          currentUserId,
          targetUserId,
        );

      if (!friendship) {
        return { success: false, error: "No friendship found between users" };
      }

      if (friendship.status !== "accepted") {
        return { success: false, error: "Users are not friends" };
      }

      await this.friendshipRepository.deleteFriendship(friendship.id);
      this.invalidateFriendsCache(currentUserId, targetUserId);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }
}

const friendsService = new FriendsService();
export default friendsService;
