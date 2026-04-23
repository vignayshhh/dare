import {
  IDareRepository,
  Dare,
} from "@/backend/domain/interfaces/IDareRepository";
import { DareRepository } from "@/backend/repositories/DareRepository";
import {
  DareEntity,
  DareState,
  VoteType,
} from "@/backend/domain/entities/Dare";
import { IFriendshipRepository } from "@/backend/domain/interfaces/IFriendshipRepository";
import { FriendshipRepository } from "@/backend/repositories/FriendshipRepository";
import { IFeedRepository } from "@/backend/domain/interfaces/IFeedRepository";
import { FeedRepository } from "@/backend/repositories/FeedRepository";
import {
  IAlertRepository,
  AlertRepository,
} from "@/backend/repositories/AlertRepository";
import { AlertEntity } from "@/backend/domain/entities/Alert";
import { UserRepository } from "@/backend/repositories/UserRepository";
import { friendsService } from "./friends.service";
import { ghostModeService } from "./ghost-mode.service";
import {
  requireAuthenticatedUser,
  secureLogError,
  validateRequiredText,
  SECURITY_LIMITS,
} from "@/security/appSecurity";

export interface DareResponse {
  success: boolean;
  dare?: DareEntity;
  error?: string;
}

export interface CreateDareRequest {
  challengerId: string;
  receiverId: string;
  description: string;
}

export interface DareListResponse {
  success: boolean;
  dares?: DareEntity[];
  error?: string;
}

export interface VoteResponse {
  success: boolean;
  error?: string;
}

class DareService {
  private dareRepository: IDareRepository;
  private friendshipRepository: IFriendshipRepository;
  private feedRepository: IFeedRepository;
  private alertRepository: IAlertRepository;
  private userRepository: UserRepository;

  // Helper method to truncate content to prevent large alerts
  private truncateContent(content: string, maxLength: number): string {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }

  constructor(
    dareRepository?: IDareRepository,
    friendshipRepository?: IFriendshipRepository,
    feedRepository?: IFeedRepository,
    alertRepository?: IAlertRepository,
  ) {
    this.dareRepository = dareRepository || new DareRepository();
    this.friendshipRepository =
      friendshipRepository || new FriendshipRepository();
    this.feedRepository = feedRepository || new FeedRepository();
    this.alertRepository = alertRepository || new AlertRepository();
    this.userRepository = new UserRepository();
  }

  async createDare(request: CreateDareRequest): Promise<DareResponse> {
    try {
      const authenticatedUserId = requireAuthenticatedUser(request.challengerId);
      const sanitizedDescription = validateRequiredText(
        request.description,
        "Dare description",
        SECURITY_LIMITS.dareDescription,
      );

      if (authenticatedUserId === request.receiverId) {
        return { success: false, error: "You cannot send a dare to yourself." };
      }

      const areFriends = await this.friendshipRepository.areUsersFriends(
        authenticatedUserId,
        request.receiverId,
      );

      if (!areFriends) {
        return {
          success: false,
          error: "You can only send dares to friends.",
        };
      }

      const dareData = await this.dareRepository.createDare({
        ...request,
        challengerId: authenticatedUserId,
        description: sanitizedDescription,
      });
      const dareEntity = DareEntity.create(dareData);

      let actorName = "Someone";
      let actorUsername = "someone";
      let actorAvatar = "";
      try {
        const challengerProfile = await this.userRepository.getProfileById(
          authenticatedUserId,
        );
        if (challengerProfile) {
          actorName =
            challengerProfile.displayName ||
            challengerProfile.username ||
            "Someone";
          actorUsername = challengerProfile.username || "someone";
          actorAvatar = challengerProfile.avatarUrl || "";
        }
      } catch (error) {
        secureLogError(
          "Error fetching challenger profile for dare alert",
          error,
        );
      }

      const alert = AlertEntity.create({
        id: `alert_${dareEntity.id}_${Date.now()}`,
        userId: request.receiverId,
        type: "DARE_RECEIVED",
        entityId: dareEntity.id,
        actorId: authenticatedUserId,
        message: `${actorName} gave you a dare`,
        metadata: {
          challengerId: authenticatedUserId,
          receiverId: request.receiverId,
          description: this.truncateContent(sanitizedDescription, 200),
          actorName,
          actorUsername,
          actorAvatar,
        },
        isRead: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await this.alertRepository.createAlert(alert);

      await this.feedRepository.createFeedEvent({
        userId: authenticatedUserId,
        eventType: "dare_sent",
        relatedDareId: dareEntity.id,
        eventData: {
          challengerId: authenticatedUserId,
          receiverId: request.receiverId,
          description: sanitizedDescription,
        },
      });

      return { success: true, dare: dareEntity };
    } catch (error) {
      secureLogError("createDare failed", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unable to create dare.",
      };
    }
  }
  async getDareById(dareId: string): Promise<DareResponse> {
    try {
      const dareData = await this.dareRepository.getDareById(dareId);

      if (!dareData) {
        return { success: false, error: "Dare not found" };
      }

      const dareEntity = DareEntity.create(dareData);
      return { success: true, dare: dareEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getReceivedDares(userId: string): Promise<DareListResponse> {
    try {
      const daresData = await this.dareRepository.getReceivedDares(userId);
      const dares = daresData.map((dareData) => DareEntity.create(dareData));
      return { success: true, dares };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getSentDares(userId: string): Promise<DareListResponse> {
    try {
      const daresData = await this.dareRepository.getSentDares(userId);
      const dares = daresData.map((dareData) => DareEntity.create(dareData));
      return { success: true, dares };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async acceptDare(dareId: string, userId: string): Promise<DareResponse> {
    try {
      const dareResponse = await this.getDareById(dareId);

      if (!dareResponse.success || !dareResponse.dare) {
        return dareResponse;
      }

      const dare = dareResponse.dare;

      if (dare.receiverId !== userId) {
        return {
          success: false,
          error: "You can only accept dares sent to you",
        };
      }

      if (!dare.canBeAccepted()) {
        return { success: false, error: "This dare cannot be accepted" };
      }

      const acceptedDare = dare.accept();
      const updatedDareData = await this.dareRepository.updateDare(dareId, {
        state: acceptedDare.state,
      });

      const updatedDareEntity = DareEntity.create(updatedDareData);

      await this.feedRepository.createFeedEvent({
        userId: userId,
        eventType: "dare_accepted",
        relatedDareId: dareId,
        eventData: {
          challengerId: dare.challengerId,
          receiverId: dare.receiverId,
        },
      });

      return { success: true, dare: updatedDareEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async chickenOut(dareId: string, userId: string): Promise<DareResponse> {
    try {
      const dareResponse = await this.getDareById(dareId);

      if (!dareResponse.success || !dareResponse.dare) {
        return dareResponse;
      }

      const dare = dareResponse.dare;

      if (dare.receiverId !== userId) {
        return {
          success: false,
          error: "You can only chicken out of dares sent to you",
        };
      }

      if (!dare.canBeAccepted()) {
        return {
          success: false,
          error: "This dare cannot be chickened out of",
        };
      }

      const chickenedOutDare = dare.chickenOut();
      const updatedDareData = await this.dareRepository.updateDare(dareId, {
        state: chickenedOutDare.state,
      });

      const updatedDareEntity = DareEntity.create(updatedDareData);

      return { success: true, dare: updatedDareEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async submitProof(
    dareId: string,
    userId: string,
    mediaUrl: string,
    mediaType: "TEXT" | "PHOTO" | "VIDEO",
  ): Promise<DareResponse> {
    try {
      const dareResponse = await this.getDareById(dareId);

      if (!dareResponse.success || !dareResponse.dare) {
        return dareResponse;
      }

      const dare = dareResponse.dare;

      if (dare.receiverId !== userId) {
        return {
          success: false,
          error: "You can only submit proof for dares sent to you",
        };
      }

      if (!dare.canSubmitProof()) {
        return {
          success: false,
          error: "Proof cannot be submitted for this dare",
        };
      }

      const updatedDareData = await this.dareRepository.submitProof(
        dareId,
        mediaUrl,
        mediaType,
      );
      const updatedDareEntity = DareEntity.create(updatedDareData);

      const validationDare = updatedDareEntity.moveToValidation();
      await this.dareRepository.updateDare(dareId, {
        state: validationDare.state,
      });

      const finalDareEntity = DareEntity.create({
        ...updatedDareData,
        state: validationDare.state,
      });

      // Notify the challenger that the receiver completed the dare submission.
      let actorName = "Someone";
      let actorUsername = "someone";
      let actorAvatar = "";
      try {
        const receiverProfile =
          await this.userRepository.getProfileById(userId);
        if (receiverProfile) {
          actorName =
            receiverProfile.displayName ||
            receiverProfile.username ||
            "Someone";
          actorUsername = receiverProfile.username || "someone";
          actorAvatar = receiverProfile.avatarUrl || "";
        }
      } catch (profileError) {
        console.error(
          "Error fetching receiver profile for dare alert:",
          profileError,
        );
      }

      const completedAlert = AlertEntity.create({
        id: `alert_${dareId}_${Date.now()}`,
        userId: dare.challengerId,
        type: "DARE_COMPLETED",
        entityId: dareId,
        actorId: userId,
        message: `${actorName} completed your dare`,
        metadata: {
          challengerId: dare.challengerId,
          receiverId: dare.receiverId,
          description: this.truncateContent(dare.description, 200),
          actorName,
          actorUsername,
          actorAvatar,
        },
        isRead: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await this.alertRepository.createAlert(completedAlert);

      return { success: true, dare: finalDareEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async voteOnDare(
    dareId: string,
    voterId: string,
    vote: VoteType,
  ): Promise<VoteResponse> {
    try {
      const dareResponse = await this.getDareById(dareId);

      if (!dareResponse.success || !dareResponse.dare) {
        return { success: false, error: "Dare not found" };
      }

      const dare = dareResponse.dare;

      if (!dare.canVote(voterId)) {
        return { success: false, error: "You cannot vote on this dare" };
      }

      await this.dareRepository.voteOnDare(dareId, voterId, vote);

      const votes = await this.dareRepository.getDareVotes(dareId);
      const totalVotes = votes.length;
      const realVotes = votes.filter((v) => v.vote === "REAL").length;
      const fakeVotes = votes.filter((v) => v.vote === "FAKE").length;

      const threshold = 3;
      if (totalVotes >= threshold) {
        const isReal = realVotes > fakeVotes;

        const completedDare = isReal
          ? dare.completeAsReal()
          : dare.completeAsFake();
        await this.dareRepository.updateDare(dareId, {
          state: completedDare.state,
        });

        await this.feedRepository.createFeedEvent({
          userId: dare.receiverId,
          eventType: "dare_completed",
          relatedDareId: dareId,
          eventData: {
            challengerId: dare.challengerId,
            receiverId: dare.receiverId,
            result: isReal ? "REAL" : "FAKE",
            voteCount: totalVotes,
          },
        });

        // Activate ghost mode for the receiver if the dare was completed as REAL
        if (isReal) {
          try {
            await ghostModeService.activateGhostMode({
              userId: dare.receiverId,
              dareId: dareId,
              durationMinutes: 15,
            });
            console.log(
              `Ghost mode activated for user ${dare.receiverId} after dare completion via friends validation`,
            );
          } catch (ghostError) {
            console.error("Failed to activate ghost mode:", ghostError);
            // Don't fail the dare completion if ghost mode fails
          }
        }
      }

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async challengerReviewDare(
    dareId: string,
    challengerId: string,
    decision: "ACCEPT" | "REJECT",
  ): Promise<DareResponse> {
    try {
      const dareResponse = await this.getDareById(dareId);

      if (!dareResponse.success || !dareResponse.dare) {
        return { success: false, error: "Dare not found" };
      }

      const dare = dareResponse.dare;

      if (dare.challengerId !== challengerId) {
        return {
          success: false,
          error: "Only the challenger can review this dare",
        };
      }

      if (
        dare.state !== "PROOF_SUBMITTED" &&
        dare.state !== "FRIENDS_VALIDATION"
      ) {
        return {
          success: false,
          error: "Dare must have submitted proof before review",
        };
      }

      const reviewedDare =
        decision === "ACCEPT" ? dare.completeAsReal() : dare.completeAsFake();

      const updatedDareData = await this.dareRepository.updateDare(dareId, {
        state: reviewedDare.state,
      });

      const updatedDareEntity = DareEntity.create(updatedDareData);

      if (decision === "ACCEPT") {
        await this.feedRepository.createFeedEvent({
          userId: dare.receiverId,
          eventType: "dare_completed",
          relatedDareId: dareId,
          eventData: {
            challengerId: dare.challengerId,
            receiverId: dare.receiverId,
            result: "REAL",
          },
        });

        let challengerName = dare.challengerId;
        let challengerUsername = dare.challengerId;
        let challengerAvatar = "";
        try {
          const challengerProfile = await this.userRepository.getProfileById(
            dare.challengerId,
          );
          if (challengerProfile) {
            challengerName =
              challengerProfile.displayName ||
              challengerProfile.username ||
              dare.challengerId;
            challengerUsername = challengerProfile.username || challengerName;
            challengerAvatar = challengerProfile.avatarUrl || "";
          }
        } catch (profileError) {
          console.error(
            "Error fetching challenger profile for dare approval alert:",
            profileError,
          );
        }

        await this.alertRepository.createAlert(
          AlertEntity.create({
            id: `alert_dare_approved_${dareId}_${Date.now()}`,
            userId: dare.receiverId,
            type: "DARE_APPROVED",
            entityId: dareId,
            actorId: dare.challengerId,
            message: `${challengerName} approved your dare`,
            metadata: {
              challengerId: dare.challengerId,
              receiverId: dare.receiverId,
              description: this.truncateContent(dare.description, 200),
              actorName: challengerName,
              actorUsername: challengerUsername,
              actorAvatar: challengerAvatar,
            },
            isRead: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        );

        // Activate ghost mode for the receiver who completed the dare
        try {
          await ghostModeService.activateGhostMode({
            userId: dare.receiverId,
            dareId: dareId,
            durationMinutes: 15,
          });
          console.log(
            `Ghost mode activated for user ${dare.receiverId} after dare completion`,
          );
        } catch (ghostError) {
          console.error("Failed to activate ghost mode:", ghostError);
          // Don't fail the dare completion if ghost mode fails
        }
      }

      return { success: true, dare: updatedDareEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getFriendsDares(userId: string): Promise<DareListResponse> {
    try {
      console.log("🔍 Getting dares from friends for user:", userId);

      // Get user's friends
      const friends = await friendsService.getFriends(userId);
      console.log("👥 Found friends:", friends.length);

      if (friends.length === 0) {
        console.log("ℹ️ No friends found, returning empty list");
        return { success: true, dares: [] };
      }

      // Get friend IDs
      const friendIds = friends.map((friend) => friend.id);
      console.log("🆔 Friend IDs:", friendIds);

      // Get dares involving the user and their friends
      const allDares = await this.dareRepository.getDaresFromUserAndFriends(
        userId,
        friendIds,
      );

      const dareEntities = allDares.map((dare) => DareEntity.create(dare));

      console.log("✅ Found dares from friends:", dareEntities.length);
      return { success: true, dares: dareEntities };
    } catch (error) {
      console.error("💥 Error getting friends dares:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getActiveDaresCount(userId: string): Promise<number> {
    try {
      return await this.dareRepository.getActiveDaresCount(userId);
    } catch (error) {
      console.error("getActiveDaresCount error:", error);
      return 0;
    }
  }

  async getDaresForUser(userId: string): Promise<DareListResponse> {
    try {
      console.log("🔄 DareService.getDaresForUser called:", userId);
      const [receivedDares, sentDares] = await Promise.all([
        this.getReceivedDares(userId),
        this.getSentDares(userId),
      ]);

      console.log("🔄 DareService.getDaresForUser results:", {
        received: receivedDares.success
          ? receivedDares.dares?.length
          : "failed",
        sent: sentDares.success ? sentDares.dares?.length : "failed",
      });

      if (!receivedDares.success || !sentDares.success) {
        return {
          success: false,
          error: receivedDares.error || sentDares.error,
        };
      }

      const allDares = [
        ...(receivedDares.dares || []),
        ...(sentDares.dares || []),
      ];
      allDares.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      console.log(
        "🔄 DareService.getDaresForUser final result:",
        allDares.length,
        "dares",
      );
      return { success: true, dares: allDares };
    } catch (error) {
      console.error("❌ DareService.getDaresForUser error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async deleteDare(dareId: string): Promise<DareResponse> {
    try {
      await this.dareRepository.deleteDare(dareId);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete dare";
      return { success: false, error: errorMessage };
    }
  }

  subscribeToUserDares(
    userId: string,
    type: "sent" | "received" | "all",
    callback: (dares: DareEntity[]) => void,
  ): () => void {
    return this.dareRepository.subscribeToUserDares(
      userId,
      type,
      (dares: Dare[]) => {
        callback(dares.map((dare) => DareEntity.create(dare)));
      },
    );
  }
}

const dareService = new DareService();
export default dareService;
