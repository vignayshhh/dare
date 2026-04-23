import { IPresenceRepository } from "@/backend/domain/interfaces/IPresenceRepository";
import { PresenceRepository } from "@/backend/repositories/PresenceRepository";
import { IUserRepository } from "@/backend/domain/interfaces/IUserRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";

export interface PresenceResponse {
  success: boolean;
  presence?: any;
  error?: string;
}

export interface OnlineUsersResponse {
  success: boolean;
  users?: any[];
  error?: string;
}

export interface ProfileViewersResponse {
  success: boolean;
  viewers?: any[];
  error?: string;
}

export interface UpdatePresenceRequest {
  isOnline?: boolean;
  currentProfileViewing?: string;
  typingInChatWith?: string;
  ghostMode?: boolean;
}

class PresenceService {
  private presenceRepository: IPresenceRepository;
  private userRepository: IUserRepository;

  constructor(
    presenceRepository?: IPresenceRepository,
    userRepository?: IUserRepository,
  ) {
    this.presenceRepository = presenceRepository || new PresenceRepository();
    this.userRepository = userRepository || new UserRepository();
  }

  async getPresenceByUserId(
    userId: string,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return { success: false, error: "Requester not found" };
        }
      }

      const presence =
        await this.presenceRepository.getPresenceByUserId(userId);

      if (!presence) {
        const newPresence =
          await this.presenceRepository.ensurePresenceExists(userId);
        return { success: true, presence: newPresence };
      }

      return { success: true, presence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async updatePresence(
    userId: string,
    updates: UpdatePresenceRequest,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return { success: false, error: "Requester not found" };
        }
        return {
          success: false,
          error: "You can only update your own presence",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);

      const repositoryUpdates = {
        isOnline: updates.isOnline,
        currentProfileViewing: updates.currentProfileViewing || undefined,
        typingInChatWith: updates.typingInChatWith || undefined,
        ghostMode: updates.ghostMode,
      };

      const updatedPresence = await this.presenceRepository.updatePresence(
        userId,
        repositoryUpdates,
      );

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async setOnlineStatus(
    userId: string,
    isOnline: boolean,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        return {
          success: false,
          error: "You can only update your own online status",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);
      const updatedPresence = await this.presenceRepository.setOnlineStatus(
        userId,
        isOnline,
      );

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async setCurrentProfileViewing(
    userId: string,
    profileId: string,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        return {
          success: false,
          error: "You can only update your own profile viewing",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);
      const updatedPresence =
        await this.presenceRepository.setCurrentProfileViewing(
          userId,
          profileId,
        );

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async clearCurrentProfileViewing(
    userId: string,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        return {
          success: false,
          error: "You can only update your own profile viewing",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);
      const updatedPresence =
        await this.presenceRepository.setCurrentProfileViewing(userId, "");

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async setTypingInChat(
    userId: string,
    chatUserId: string,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        return {
          success: false,
          error: "You can only update your own typing status",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);
      const updatedPresence = await this.presenceRepository.setTypingInChat(
        userId,
        chatUserId,
      );

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async clearTypingInChat(
    userId: string,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        return {
          success: false,
          error: "You can only update your own typing status",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);
      const updatedPresence =
        await this.presenceRepository.clearTypingInChat(userId);

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async setGhostMode(
    userId: string,
    ghostMode: boolean,
    requesterId?: string,
  ): Promise<PresenceResponse> {
    try {
      if (requesterId && requesterId !== userId) {
        return {
          success: false,
          error: "You can only update your own ghost mode",
        };
      }

      await this.presenceRepository.ensurePresenceExists(userId);
      const updatedPresence = await this.presenceRepository.setGhostMode(
        userId,
        ghostMode,
      );

      return { success: true, presence: updatedPresence };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getOnlineUsers(requesterId?: string): Promise<OnlineUsersResponse> {
    try {
      if (requesterId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return { success: false, error: "Requester not found" };
        }
      }

      const onlinePresence = await this.presenceRepository.getOnlineUsers();
      const userIds = onlinePresence.map((p) => p.userId);

      if (userIds.length === 0) {
        return { success: true, users: [] };
      }

      const profilePromises = userIds.map((userId) =>
        this.userRepository.getProfileByUserId(userId),
      );

      const profileResults = await Promise.allSettled(profilePromises);
      const users: any[] = [];

      profileResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          users.push(result.value);
        }
      });

      return { success: true, users };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getUsersViewingProfile(
    profileId: string,
    requesterId?: string,
  ): Promise<ProfileViewersResponse> {
    try {
      if (requesterId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return { success: false, error: "Requester not found" };
        }
      }

      const viewersPresence =
        await this.presenceRepository.getUsersViewingProfile(profileId);
      const userIds = viewersPresence.map((p) => p.userId);

      if (userIds.length === 0) {
        return { success: true, viewers: [] };
      }

      const profilePromises = userIds.map((userId) =>
        this.userRepository.getProfileByUserId(userId),
      );

      const profileResults = await Promise.allSettled(profilePromises);
      const viewers: any[] = [];

      profileResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          viewers.push(result.value);
        }
      });

      return { success: true, viewers };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async isUserOnline(userId: string, requesterId?: string): Promise<boolean> {
    try {
      if (requesterId && requesterId !== userId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return false;
        }
      }

      const presence =
        await this.presenceRepository.getPresenceByUserId(userId);
      return presence?.isOnline || false;
    } catch (error) {
      console.error("isUserOnline error:", error);
      return false;
    }
  }

  async isUserInGhostMode(
    userId: string,
    requesterId?: string,
  ): Promise<boolean> {
    try {
      if (requesterId && requesterId !== userId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return false;
        }
      }

      const presence =
        await this.presenceRepository.getPresenceByUserId(userId);
      return presence?.ghostMode || false;
    } catch (error) {
      console.error("isUserInGhostMode error:", error);
      return false;
    }
  }
}

const presenceService = new PresenceService();
export default presenceService;
