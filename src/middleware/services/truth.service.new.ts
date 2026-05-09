// Truth Service - Business logic layer for truth operations
// Follows architecture contract strictly

import { ITruthRepository } from "@/backend/domain/interfaces/ITruthRepository";
import { TruthRepository } from "@/backend/repositories/TruthRepository";
import { TruthEntity, TruthState } from "@/backend/domain/entities/Truth";
import { IFriendshipRepository } from "@/backend/domain/interfaces/IFriendshipRepository";
import { FriendshipRepository } from "@/backend/repositories/FriendshipRepository";
import { IFeedRepository } from "@/backend/domain/interfaces/IFeedRepository";
import { FeedRepository } from "@/backend/repositories/FeedRepository";
import { AlertService } from "./alert.service.new";
import { AlertRepository } from "@/backend/repositories/AlertRepository";
import { friendsService } from "./friends.service";

export interface TruthResponse {
  success: boolean;
  truth?: TruthEntity;
  error?: string;
}

export interface CreateTruthRequest {
  challengerId: string;
  receiverId: string;
  question: string;
}

export interface TruthListResponse {
  success: boolean;
  truths?: TruthEntity[];
  error?: string;
}

export interface VoteResponse {
  success: boolean;
  error?: string;
}

class TruthService {
  private truthRepository: ITruthRepository;
  private friendshipRepository: IFriendshipRepository;
  private feedRepository: IFeedRepository;
  private alertService: AlertService;

  // Helper method to truncate content to prevent large alerts
  private truncateContent(content: string, maxLength: number): string {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }

  constructor(
    truthRepository?: ITruthRepository,
    friendshipRepository?: IFriendshipRepository,
    feedRepository?: IFeedRepository,
  ) {
    this.truthRepository = truthRepository || new TruthRepository();
    this.friendshipRepository =
      friendshipRepository || new FriendshipRepository();
    this.feedRepository = feedRepository || new FeedRepository();
    this.alertService = new AlertService(new AlertRepository());
  }

  // Helper to convert repository Truth to TruthEntity format
  private mapToEntity(truth: any): any {
    return {
      id: truth.id,
      challengerId: truth.challenger_id,
      receiverId: truth.receiver_id,
      question: truth.question,
      state: truth.state,
      createdAt:
        truth.created_at instanceof Date
          ? truth.created_at.toISOString()
          : truth.created_at || new Date().toISOString(),
      updatedAt:
        truth.updated_at instanceof Date
          ? truth.updated_at.toISOString()
          : truth.updated_at || new Date().toISOString(),
      answer: truth.answer,
      votes: truth.votes,
      answeredAt:
        truth.answered_at instanceof Date
          ? truth.answered_at.toISOString()
          : truth.answered_at || undefined,
      reviewedAt:
        truth.reviewed_at instanceof Date
          ? truth.reviewed_at.toISOString()
          : truth.reviewed_at || undefined,
    };
  }

  async createTruth(request: CreateTruthRequest): Promise<TruthResponse> {
    try {
      const canTruth = await this.truthRepository.canTruthUser(
        request.challengerId,
        request.receiverId,
      );

      if (!canTruth) {
        return {
          success: false,
          error: "You cannot send a truth to this user",
        };
      }

      const truthData = await this.truthRepository.createTruth({
        challenger_id: request.challengerId,
        receiver_id: request.receiverId,
        question: request.question,
      });

      console.log("Raw truth data from repository:", truthData);

      const mappedData = this.mapToEntity(truthData);
      console.log("Mapped data for TruthEntity:", mappedData);

      const truthEntity = TruthEntity.create(mappedData);
      console.log("Truth entity created:", truthEntity);

      console.log(
        "Truth created, creating alert for receiver:",
        request.receiverId,
      );
      console.log("Truth entity:", truthEntity);

      // Create alert for receiver
      await this.createTruthReceivedAlert(
        request.receiverId,
        truthEntity.id,
        request.challengerId,
      );

      console.log("Alert created successfully for truth:", truthEntity.id);

      await this.feedRepository.createFeedEvent({
        userId: request.challengerId,
        eventType: "truth_received",
        relatedTruthId: truthEntity.id,
        eventData: {
          challengerId: request.challengerId,
          receiverId: request.receiverId,
          question: request.question,
        },
      });

      return { success: true, truth: truthEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async answerTruth(
    truthId: string,
    userId: string,
    answer: string,
  ): Promise<TruthResponse> {
    try {
      const truthResponse = await this.getTruthById(truthId);

      if (!truthResponse.success || !truthResponse.truth) {
        return { success: false, error: "Truth not found" };
      }

      const truth = truthResponse.truth;

      if (!truth.canAnswer()) {
        return {
          success: false,
          error: "This truth cannot be answered",
        };
      }

      if (truth.receiverId !== userId) {
        return {
          success: false,
          error: "You are not authorized to answer this truth",
        };
      }

      const answeredTruth = truth.submitAnswer(answer);
      await this.truthRepository.updateTruth(truthId, {
        answer: answeredTruth.answer,
        state: answeredTruth.state,
        answered_at: new Date().toISOString(),
      });

      await this.feedRepository.createFeedEvent({
        userId: userId,
        eventType: "truth_answered",
        relatedTruthId: truthId,
        eventData: {
          challengerId: truth.challengerId,
          receiverId: truth.receiverId,
          answer: answer,
        },
      });

      // Create alert for challenger to review the answer
      console.log("🚨 CREATING ALERT FOR CHALLENGER:", truth.challengerId);
      console.log("🚨 ALERT DATA:", {
        userId: truth.challengerId,
        type: "TRUTH_ANSWERED",
        entityId: truthId,
        actorId: truth.receiverId,
        message: `answered your truth: "${truth.question}"`,
      });

      let receiverName = truth.receiverId;
      try {
        const { UserRepository } =
          await import("@/backend/repositories/UserRepository");
        const userRepository = new UserRepository();
        const receiverProfile = await userRepository.getProfileById(
          truth.receiverId,
        );
        if (receiverProfile) {
          receiverName =
            receiverProfile.displayName ||
            receiverProfile.username ||
            truth.receiverId;
        }
      } catch (error) {
        console.error("Error getting receiver profile:", error);
      }

      await this.alertService.createAlert({
        userId: truth.challengerId,
        type: "TRUTH_ANSWERED",
        entityId: truthId,
        actorId: truth.receiverId,
        actorName: receiverName,
        actorUsername: receiverName,
        message: `answered your question`,
        metadata: {
          answer: this.truncateContent(answer, 200), // Limit to 200 chars
          question: this.truncateContent(truth.question, 200), // Limit to 200 chars
          navigateTo: "dares", // Add navigation hint
        },
      });

      console.log("✅ ALERT CREATED SUCCESSFULLY");

      const finalTruthEntity = answeredTruth;

      return { success: true, truth: finalTruthEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async voteOnTruth(
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ): Promise<VoteResponse> {
    try {
      const truthResponse = await this.getTruthById(truthId);

      if (!truthResponse.success || !truthResponse.truth) {
        return { success: false, error: "Truth not found" };
      }

      const truth = truthResponse.truth;

      if (!truth.canVote()) {
        return { success: false, error: "You cannot vote on this truth" };
      }

      await this.truthRepository.voteOnTruth(truthId, voterId, vote);

      const votes = await this.truthRepository.getTruthVotes(truthId);
      const totalVotes = votes.length;
      const truthVotes = votes.filter((v) => v.vote === "TRUTH").length;
      const lieVotes = votes.filter((v) => v.vote === "LIE").length;

      const threshold = 3;
      if (totalVotes >= threshold) {
        const isTruth = truthVotes > lieVotes;

        const completedTruth = isTruth ? truth.approve() : truth.reject();

        await this.truthRepository.updateTruth(truthId, {
          state: completedTruth.state,
          reviewed_at: new Date().toISOString(),
        });

        await this.feedRepository.createFeedEvent({
          userId: voterId,
          eventType: "truth_completed",
          relatedTruthId: truthId,
          eventData: {
            challengerId: truth.challengerId,
            receiverId: truth.receiverId,
            result: isTruth ? "TRUTH" : "LIE",
            voteCount: totalVotes,
          },
        });
      }

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getUserTruths(
    userId: string,
    type?: "sent" | "received" | "all",
  ): Promise<TruthListResponse> {
    try {
      console.log("🔄 TruthService.getUserTruths called:", { userId, type });
      const truths = await this.truthRepository.getUserTruths(userId, type);
      console.log(
        "🔄 TruthService.getUserTruths repository result:",
        truths.length,
        "truths",
      );
      const truthEntities = truths.map((truth) =>
        TruthEntity.create(this.mapToEntity(truth)),
      );
      console.log(
        "🔄 TruthService.getUserTruths entities created:",
        truthEntities.length,
      );

      return { success: true, truths: truthEntities };
    } catch (error) {
      console.error("❌ TruthService.getUserTruths error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getFriendsTruths(userId: string): Promise<TruthListResponse> {
    try {
      const friends = await friendsService.getFriends(userId);

      if (!Array.isArray(friends) || friends.length === 0) {
        return { success: true, truths: [] };
      }

      const friendIds = friends
        .map((friend: any) => friend.id || friend.user_id || friend.userId)
        .filter(Boolean);

      const truthGroups = await Promise.all(
        friendIds.map((friendId: string) =>
          this.truthRepository.getUserTruths(friendId, "all"),
        ),
      );

      const seen = new Set<string>();
      const dedupedTruths = truthGroups
        .flat()
        .filter((truth) => {
          if (!truth?.id || seen.has(truth.id)) return false;
          seen.add(truth.id);
          return true;
        })
        .map((truth) => TruthEntity.create(this.mapToEntity(truth)))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      return { success: true, truths: dedupedTruths };
    } catch (error) {
      console.error("❌ TruthService.getFriendsTruths error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getTruthById(truthId: string): Promise<TruthResponse> {
    try {
      const truth = await this.truthRepository.getTruthById(truthId);

      if (!truth) {
        return { success: false, error: "Truth not found" };
      }

      const truthEntity = TruthEntity.create(this.mapToEntity(truth));
      return { success: true, truth: truthEntity };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async refuseTruth(truthId: string, userId: string): Promise<TruthResponse> {
    try {
      const truthResponse = await this.getTruthById(truthId);

      if (!truthResponse.success || !truthResponse.truth) {
        return { success: false, error: "Truth not found" };
      }

      const truth = truthResponse.truth;

      if (truth.receiverId !== userId) {
        return {
          success: false,
          error: "You are not authorized to refuse this truth",
        };
      }

      const refusedTruth = truth.refuse();
      await this.truthRepository.updateTruth(truthId, {
        state: refusedTruth.state,
        reviewed_at: new Date().toISOString(),
      });

      await this.feedRepository.createFeedEvent({
        userId: userId,
        eventType: "truth_refused",
        relatedTruthId: truthId,
        eventData: {
          challengerId: truth.challengerId,
          receiverId: truth.receiverId,
        },
      });

      return { success: true, truth: refusedTruth };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Alert integration methods
  private async createTruthAlert(
    userId: string,
    truthId: string,
    alertType: string,
    actorId: string,
  ): Promise<void> {
    try {
      const truthResponse = await this.getTruthById(truthId);
      if (!truthResponse.success || !truthResponse.truth) return;

      const truth = truthResponse.truth;

      const actor = await this.getUserProfile(actorId);
      const actorName = actor?.displayName || actor?.username || "Someone";
      const actorUsername = actor?.username || "someone";

      let message = "";
      switch (alertType) {
        case "TRUTH_RECEIVED":
          message = `${actorName} asked you a truth`;
          break;
        case "TRUTH_ANSWERED":
          message = `${actorName} answered your truth`;
          break;
        case "TRUTH_REFUSED":
          message = `${actorName} refused your truth`;
          break;
        case "TRUTH_COMPLETED":
          message = `Your truth was completed!`;
          break;
        default:
          message = `Truth update from ${actorName}`;
      }

      await this.alertService.createAlert({
        userId,
        type: alertType as any,
        entityId: truthId,
        actorId,
        actorName,
        actorUsername,
        message,
        metadata: {
          truthQuestion: this.truncateContent(truth.question, 200), // Limit to 200 chars
          truthState: truth.state,
        },
      });
    } catch (error) {
      console.error("Error creating truth alert:", error);
    }
  }

  // Public method for creating truth alerts
  async createTruthReceivedAlert(
    receiverId: string,
    truthId: string,
    challengerId: string,
  ): Promise<void> {
    await this.createTruthAlert(
      receiverId,
      truthId,
      "TRUTH_RECEIVED",
      challengerId,
    );
  }

  // Helper method to get user profile
  private async getUserProfile(userId: string) {
    try {
      console.log("Getting user profile for ID:", userId);

      // For truth alerts, we need to get the challenger's profile without privacy checks
      // Import and use the repository directly to bypass privacy restrictions
      const { UserRepository } =
        await import("@/backend/repositories/UserRepository");
      const userRepository = new UserRepository();
      const profileData = await userRepository.getProfileById(userId);

      console.log("User profile data:", profileData);

      if (profileData) {
        console.log("Found user profile:", {
          displayName: profileData.displayName,
          username: profileData.username,
        });
        return profileData;
      }

      return null;
    } catch (error) {
      console.error("Error getting user profile:", error);
      return null;
    }
  }

  async approveTruth(
    truthId: string,
    reviewerId: string,
  ): Promise<TruthResponse> {
    try {
      const truthResponse = await this.getTruthById(truthId);
      if (!truthResponse.success || !truthResponse.truth) {
        return { success: false, error: "Truth not found" };
      }

      const truth = truthResponse.truth;

      if (truth.challengerId !== reviewerId) {
        return {
          success: false,
          error: "Only the challenger can approve this truth",
        };
      }

      await this.truthRepository.updateTruth(truthId, {
        state: "APPROVED",
        reviewed_at: new Date().toISOString(),
      });

      let challengerName = truth.challengerId;
      let challengerUsername = truth.challengerId;
      let challengerAvatar = "";
      try {
        const { UserRepository } =
          await import("@/backend/repositories/UserRepository");
        const userRepository = new UserRepository();
        const challengerProfile = await userRepository.getProfileById(
          truth.challengerId,
        );
        if (challengerProfile) {
          challengerName =
            challengerProfile.displayName ||
            challengerProfile.username ||
            truth.challengerId;
          challengerUsername = challengerProfile.username || challengerName;
          challengerAvatar = challengerProfile.avatarUrl || "";
        }
      } catch (error) {
        console.error("Error getting challenger profile:", error);
      }

      await this.alertService.createAlert({
        userId: truth.receiverId,
        type: "TRUTH_COMPLETED",
        entityId: truthId,
        actorId: truth.challengerId,
        actorName: challengerName,
        actorUsername: challengerUsername,
        actorAvatar: challengerAvatar,
        message: `approved your answer`,
        metadata: {
          question: this.truncateContent(truth.question, 200),
          answer: this.truncateContent(truth.answer || "", 200),
          navigateTo: "main",
        },
      });

      return {
        success: true,
        truth: TruthEntity.create({
          ...this.mapToEntity(
            (await this.truthRepository.getTruthById(truthId)) as any,
          ),
        }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async deleteTruth(truthId: string): Promise<TruthResponse> {
    try {
      await this.truthRepository.deleteTruth(truthId);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete truth";
      return { success: false, error: errorMessage };
    }
  }

  subscribeToUserTruths(
    userId: string,
    type: "sent" | "received" | "all",
    callback: (truths: TruthEntity[]) => void,
  ): () => void {
    return this.truthRepository.subscribeToUserTruths(
      userId,
      type,
      (truths) => {
        // Convert repository Truth to TruthEntity
        const truthEntities = truths.map((truth) =>
          TruthEntity.create({
            id: truth.id,
            challengerId: truth.challenger_id,
            receiverId: truth.receiver_id,
            question: truth.question,
            state: truth.state,
            answer: truth.answer,
            votes: truth.votes,
            createdAt: truth.created_at,
            updatedAt: truth.updated_at,
            answeredAt: truth.answered_at,
            reviewedAt: truth.reviewed_at,
          }),
        );
        callback(truthEntities);
      },
    );
  }
}

// Export singleton instance
export const truthService = new TruthService();
export default truthService;
