import { IUserRepository } from "@/backend/domain/interfaces/IUserRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";
import { UserProfileEntity } from "@/backend/domain/entities/UserProfile";
import { IPresenceRepository } from "@/backend/domain/interfaces/IPresenceRepository";
import { PresenceRepository } from "@/backend/repositories/PresenceRepository";
import {
  requireAuthenticatedUser,
  secureLogError,
  validateDisplayName,
  validateOptionalBio,
} from "@/security/appSecurity";

export interface UserProfileResponse {
  success: boolean;
  profile?: UserProfileEntity;
  error?: string;
}

export interface UserProfileListResponse {
  success: boolean;
  profiles?: UserProfileEntity[];
  error?: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  ghostModeActive?: boolean;
}

export interface SearchProfilesResponse {
  success: boolean;
  profiles?: UserProfileEntity[];
  error?: string;
}

class UserService {
  private userRepository: IUserRepository;
  private presenceRepository: IPresenceRepository;

  constructor(
    userRepository?: IUserRepository,
    presenceRepository?: IPresenceRepository,
  ) {
    this.userRepository = userRepository || new UserRepository();
    this.presenceRepository = presenceRepository || new PresenceRepository();
  }

  async getProfileById(
    profileId: string,
    viewerId?: string,
  ): Promise<UserProfileResponse> {
    try {
      const canView = await this.userRepository.canViewProfile(
        profileId,
        viewerId,
      );

      if (!canView) {
        return {
          success: false,
          error: "Profile is private or not accessible",
        };
      }

      const profileData = await this.userRepository.getProfileById(profileId);

      if (!profileData) {
        return { success: false, error: "Profile not found" };
      }

      const profileEntity = UserProfileEntity.create(profileData);

      if (viewerId && viewerId !== profileId) {
        await this.userRepository.recordProfileView(profileId, viewerId);
      }

      return { success: true, profile: profileEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getProfileByUserId(
    userId: string,
    viewerId?: string,
  ): Promise<UserProfileResponse> {
    return this.getProfileById(userId, viewerId);
  }

  // Get profile without privacy checks (for content display)
  async getProfileByUserIdForContent(
    userId: string,
  ): Promise<UserProfileResponse> {
    try {
      const profileData = await this.userRepository.getProfileByUserId(userId);

      if (!profileData) {
        return { success: false, error: "Profile not found" };
      }

      const profileEntity = UserProfileEntity.create(profileData);

      return { success: true, profile: profileEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async updateProfile(
    userId: string,
    updates: UpdateProfileRequest,
  ): Promise<UserProfileResponse> {
    try {
      requireAuthenticatedUser(userId);
      const currentProfile =
        await this.userRepository.getProfileByUserId(userId);

      if (!currentProfile) {
        return { success: false, error: "Profile not found" };
      }

      const repositoryUpdates = {
        displayName:
          updates.displayName !== undefined
            ? validateDisplayName(updates.displayName)
            : undefined,
        bio:
          updates.bio !== undefined ? validateOptionalBio(updates.bio) : undefined,
        avatarUrl: updates.avatarUrl,
        visibility: updates.visibility,
        ghostModeActive: updates.ghostModeActive,
      };

      const updatedProfileData = await this.userRepository.updateProfile(
        userId,
        repositoryUpdates,
      );
      const updatedProfileEntity = UserProfileEntity.create(updatedProfileData);

      return { success: true, profile: updatedProfileEntity };
    } catch (error) {
      secureLogError("userService.updateProfile failed", error);
      return { success: false, error: "Unable to update profile." };
    }
  }

  async searchProfiles(
    query: string,
    limit?: number,
  ): Promise<SearchProfilesResponse> {
    try {
      const profilesData = await this.userRepository.searchProfiles(
        query,
        limit,
      );
      const profiles = profilesData.map((profileData) =>
        UserProfileEntity.create(profileData),
      );
      return { success: true, profiles };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async setOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      requireAuthenticatedUser(userId);
      await this.presenceRepository.ensurePresenceExists(userId);
      await this.presenceRepository.setOnlineStatus(userId, isOnline);
    } catch (error) {
      secureLogError("setOnlineStatus failed", error);
      throw error;
    }
  }

  async setCurrentProfileViewing(
    userId: string,
    profileId: string,
  ): Promise<void> {
    try {
      requireAuthenticatedUser(userId);
      await this.presenceRepository.ensurePresenceExists(userId);
      await this.presenceRepository.setCurrentProfileViewing(userId, profileId);
    } catch (error) {
      secureLogError("setCurrentProfileViewing failed", error);
      throw error;
    }
  }

  async clearCurrentProfileViewing(userId: string): Promise<void> {
    try {
      requireAuthenticatedUser(userId);
      await this.presenceRepository.ensurePresenceExists(userId);
      await this.presenceRepository.setCurrentProfileViewing(userId, "");
    } catch (error) {
      secureLogError("clearCurrentProfileViewing failed", error);
      throw error;
    }
  }

  async setGhostMode(
    userId: string,
    ghostModeActive: boolean,
    expiresAt?: string,
  ): Promise<UserProfileResponse> {
    try {
      requireAuthenticatedUser(userId);
      await this.presenceRepository.ensurePresenceExists(userId);
      await this.presenceRepository.setGhostMode(userId, ghostModeActive);

      const currentProfile =
        await this.userRepository.getProfileByUserId(userId);

      if (!currentProfile) {
        return { success: false, error: "Profile not found" };
      }

      const repositoryUpdates = {
        ghostModeActive,
        ghostModeExpiresAt: ghostModeActive && expiresAt ? expiresAt : null,
      };

      const updatedProfileData = await this.userRepository.updateProfile(
        userId,
        repositoryUpdates,
      );
      const updatedProfileEntity = UserProfileEntity.create(updatedProfileData);

      return { success: true, profile: updatedProfileEntity };
    } catch (error) {
      secureLogError("setGhostMode failed", error);
      return { success: false, error: "Unable to update ghost mode." };
    }
  }

  async getOnlineUsers(): Promise<UserProfileListResponse> {
    try {
      const onlinePresence = await this.presenceRepository.getOnlineUsers();
      const userIds = onlinePresence.map((p) => p.userId);

      if (userIds.length === 0) {
        return { success: true, profiles: [] };
      }

      const profilePromises = userIds.map((userId) =>
        this.userRepository.getProfileByUserId(userId),
      );

      const profileResults = await Promise.allSettled(profilePromises);
      const profiles: UserProfileEntity[] = [];

      profileResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          profiles.push(UserProfileEntity.create(result.value));
        }
      });

      return { success: true, profiles };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getUsersViewingProfile(
    profileId: string,
  ): Promise<UserProfileListResponse> {
    try {
      const viewersPresence =
        await this.presenceRepository.getUsersViewingProfile(profileId);
      const userIds = viewersPresence.map((p) => p.userId);

      if (userIds.length === 0) {
        return { success: true, profiles: [] };
      }

      const profilePromises = userIds.map((userId) =>
        this.userRepository.getProfileByUserId(userId),
      );

      const profileResults = await Promise.allSettled(profilePromises);
      const profiles: UserProfileEntity[] = [];

      profileResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          profiles.push(UserProfileEntity.create(result.value));
        }
      });

      return { success: true, profiles };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async canViewProfile(profileId: string, viewerId?: string): Promise<boolean> {
    try {
      return await this.userRepository.canViewProfile(profileId, viewerId);
    } catch (error) {
      console.error("canViewProfile error:", error);
      return false;
    }
  }

  async incrementDaresCompleted(userId: string): Promise<UserProfileResponse> {
    try {
      requireAuthenticatedUser(userId);
      const currentProfile =
        await this.userRepository.getProfileByUserId(userId);

      if (!currentProfile) {
        return { success: false, error: "Profile not found" };
      }

      const currentEntity = UserProfileEntity.create(currentProfile);
      const updatedEntity = currentEntity.incrementDaresCompleted();

      const repositoryUpdates = {
        daresCompleted: updatedEntity.daresCompleted,
      };

      const updatedProfileData = await this.userRepository.updateProfile(
        userId,
        repositoryUpdates,
      );
      const updatedProfileEntity = UserProfileEntity.create(updatedProfileData);

      return { success: true, profile: updatedProfileEntity };
    } catch (error) {
      secureLogError("incrementDaresCompleted failed", error);
      return { success: false, error: "Unable to update dare stats." };
    }
  }

  async incrementDaresRefused(userId: string): Promise<UserProfileResponse> {
    try {
      requireAuthenticatedUser(userId);
      const currentProfile =
        await this.userRepository.getProfileByUserId(userId);

      if (!currentProfile) {
        return { success: false, error: "Profile not found" };
      }

      const currentEntity = UserProfileEntity.create(currentProfile);
      const updatedEntity = currentEntity.incrementDaresRefused();

      const repositoryUpdates = {
        daresRefused: updatedEntity.daresRefused,
      };

      const updatedProfileData = await this.userRepository.updateProfile(
        userId,
        repositoryUpdates,
      );
      const updatedProfileEntity = UserProfileEntity.create(updatedProfileData);

      return { success: true, profile: updatedProfileEntity };
    } catch (error) {
      secureLogError("incrementDaresRefused failed", error);
      return { success: false, error: "Unable to update dare stats." };
    }
  }
}

const userService = new UserService();
export default userService;
