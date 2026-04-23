import { IModerationRepository } from "@/backend/domain/interfaces/IModerationRepository";
import { ModerationRepository } from "@/backend/repositories/ModerationRepository";
import { IUserRepository } from "@/backend/domain/interfaces/IUserRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";

export interface ReportResponse {
  success: boolean;
  report?: any;
  error?: string;
}

export interface ReportListResponse {
  success: boolean;
  reports?: any[];
  error?: string;
}

export interface ModerationActionResponse {
  success: boolean;
  action?: any;
  error?: string;
}

export interface CreateReportRequest {
  reportedUserId?: string;
  reportedPostId?: string;
  reportedDareId?: string;
  reportedMessageId?: string;
  reason:
    | "harassment"
    | "spam"
    | "inappropriate_content"
    | "fake_profile"
    | "other";
  description: string;
}

export interface CreateModerationActionRequest {
  targetUserId: string;
  action: "warning" | "temporary_suspend" | "permanent_ban" | "content_removal";
  reason: string;
  expiresAt?: string;
}

class ModerationService {
  private moderationRepository: IModerationRepository;
  private userRepository: IUserRepository;

  constructor(
    moderationRepository?: IModerationRepository,
    userRepository?: IUserRepository,
  ) {
    this.moderationRepository =
      moderationRepository || new ModerationRepository();
    this.userRepository = userRepository || new UserRepository();
  }

  async createReport(
    reporterId: string,
    request: CreateReportRequest,
  ): Promise<ReportResponse> {
    try {
      if (
        !request.reportedUserId &&
        !request.reportedPostId &&
        !request.reportedDareId &&
        !request.reportedMessageId
      ) {
        return {
          success: false,
          error: "At least one reported item must be specified",
        };
      }

      if (!request.description.trim()) {
        return { success: false, error: "Description is required" };
      }

      const report = await this.moderationRepository.createReport({
        reporterId,
        reportedUserId: request.reportedUserId,
        reportedPostId: request.reportedPostId,
        reportedDareId: request.reportedDareId,
        reportedMessageId: request.reportedMessageId,
        reason: request.reason,
        description: request.description,
      });

      return { success: true, report };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getReportById(
    reportId: string,
    userId: string,
  ): Promise<ReportResponse> {
    try {
      const report = await this.moderationRepository.getReportById(reportId);

      if (!report) {
        return { success: false, error: "Report not found" };
      }

      if (report.reporterId !== userId) {
        return { success: false, error: "Access denied" };
      }

      return { success: true, report };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getReportsByStatus(
    status: "pending" | "reviewing" | "resolved",
    moderatorId?: string,
  ): Promise<ReportListResponse> {
    try {
      if (moderatorId) {
        const moderatorProfile =
          await this.userRepository.getProfileByUserId(moderatorId);
        if (!moderatorProfile) {
          return { success: false, error: "Moderator not found" };
        }
      }

      const reports =
        await this.moderationRepository.getReportsByStatus(status);

      return { success: true, reports };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getReportsByReporter(
    reporterId: string,
    userId: string,
  ): Promise<ReportListResponse> {
    try {
      if (reporterId !== userId) {
        return { success: false, error: "Access denied" };
      }

      const reports =
        await this.moderationRepository.getReportsByReporter(reporterId);

      return { success: true, reports };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getReportsByReportedUser(
    reportedUserId: string,
    userId: string,
  ): Promise<ReportListResponse> {
    try {
      const reporterProfile =
        await this.userRepository.getProfileByUserId(userId);
      if (!reporterProfile) {
        return { success: false, error: "User not found" };
      }

      const reports =
        await this.moderationRepository.getReportsByReportedUser(
          reportedUserId,
        );

      return { success: true, reports };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async updateReportStatus(
    reportId: string,
    status: "pending" | "reviewing" | "resolved",
    moderatorId: string,
  ): Promise<ReportResponse> {
    try {
      const moderatorProfile =
        await this.userRepository.getProfileByUserId(moderatorId);
      if (!moderatorProfile) {
        return { success: false, error: "Moderator not found" };
      }

      const report = await this.moderationRepository.getReportById(reportId);
      if (!report) {
        return { success: false, error: "Report not found" };
      }

      const updatedReport = await this.moderationRepository.updateReportStatus(
        reportId,
        status,
      );

      return { success: true, report: updatedReport };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async createModerationAction(
    moderatorId: string,
    request: CreateModerationActionRequest,
  ): Promise<ModerationActionResponse> {
    try {
      const moderatorProfile =
        await this.userRepository.getProfileByUserId(moderatorId);
      if (!moderatorProfile) {
        return { success: false, error: "Moderator not found" };
      }

      const targetProfile = await this.userRepository.getProfileByUserId(
        request.targetUserId,
      );
      if (!targetProfile) {
        return { success: false, error: "Target user not found" };
      }

      if (!request.reason.trim()) {
        return { success: false, error: "Reason is required" };
      }

      if (request.action === "temporary_suspend" && !request.expiresAt) {
        return {
          success: false,
          error: "Expiration date is required for temporary suspension",
        };
      }

      const action = await this.moderationRepository.createModerationAction({
        moderatorId,
        targetUserId: request.targetUserId,
        action: request.action,
        reason: request.reason,
        expiresAt: request.expiresAt || null,
        isActive: true,
      });

      return { success: true, action };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getActiveModerationActions(
    userId: string,
    requesterId: string,
  ): Promise<ModerationActionResponse> {
    try {
      if (userId !== requesterId) {
        const requesterProfile =
          await this.userRepository.getProfileByUserId(requesterId);
        if (!requesterProfile) {
          return { success: false, error: "Requester not found" };
        }
      }

      const actions =
        await this.moderationRepository.getActiveModerationActions(userId);

      return { success: true, action: actions };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async updateModerationAction(
    actionId: string,
    updates: any,
    moderatorId: string,
  ): Promise<ModerationActionResponse> {
    try {
      const moderatorProfile =
        await this.userRepository.getProfileByUserId(moderatorId);
      if (!moderatorProfile) {
        return { success: false, error: "Moderator not found" };
      }

      const updatedAction =
        await this.moderationRepository.updateModerationAction(
          actionId,
          updates || {},
        );

      return { success: true, action: updatedAction };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async deactivateModerationAction(
    actionId: string,
    moderatorId: string,
  ): Promise<ModerationActionResponse> {
    try {
      const moderatorProfile =
        await this.userRepository.getProfileByUserId(moderatorId);
      if (!moderatorProfile) {
        return { success: false, error: "Moderator not found" };
      }

      await this.moderationRepository.deactivateModerationAction(actionId);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async canUserBeModerated(
    targetUserId: string,
    moderatorId: string,
  ): Promise<boolean> {
    try {
      const [moderatorProfile, targetProfile] = await Promise.all([
        this.userRepository.getProfileByUserId(moderatorId),
        this.userRepository.getProfileByUserId(targetUserId),
      ]);

      if (!moderatorProfile || !targetProfile) {
        return false;
      }

      return moderatorProfile.userId !== targetProfile.userId;
    } catch (error) {
      console.error("canUserBeModerated error:", error);
      return false;
    }
  }
}

const moderationService = new ModerationService();
export default moderationService;
