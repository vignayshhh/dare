// Alert Service - Handles all cross-domain notifications
// Separate from Feed Service to avoid coupling
// Follows architecture contract strictly

import { AlertRepository } from "@/backend/repositories/AlertRepository";
import { AlertEntity, AlertType } from "@/backend/domain/entities/Alert";

function createAlertId(): string {
  const maybeRandomUuid = globalThis.crypto?.randomUUID;
  if (typeof maybeRandomUuid === "function") {
    return maybeRandomUuid.call(globalThis.crypto);
  }

  // Fallback to cryptographically secure random values
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const randomStr = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `alert_${Date.now()}_${randomStr}`;
}

// Request/Response DTOs
export interface CreateAlertRequest {
  userId: string;
  type: AlertType;
  entityId: string;
  actorId: string;
  actorName?: string;
  actorUsername?: string;
  actorAvatar?: string; // Add actor avatar field
  message?: string;
  metadata?: Record<string, any>;
}

export interface GetAlertsRequest {
  userId: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export interface MarkAlertReadRequest {
  alertId: string;
  userId: string;
}

export interface AlertListResponse {
  success: boolean;
  alerts?: AlertEntity[];
  error?: string;
}

export interface AlertResponse {
  success: boolean;
  alert?: AlertEntity;
  error?: string;
}

export interface MarkReadResponse {
  success: boolean;
  error?: string;
}

export class AlertService {
  constructor(private alertRepository: AlertRepository) {}

  private isPermissionDenied(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const message =
      "message" in error ? String((error as { message?: unknown }).message) : "";

    return message.includes("Missing or insufficient permissions");
  }

  // Create a new alert
  async createAlert(request: CreateAlertRequest): Promise<AlertResponse> {
    try {
      console.log(
        "🔔 Creating alert for user:",
        request.userId,
        "type:",
        request.type,
      );
      console.log("🔔 Alert data:", request);

      const alertData = {
        id: createAlertId(),
        userId: request.userId,
        type: request.type,
        entityId: request.entityId,
        actorId: request.actorId,
        message: request.message || this.generateDefaultMessage(request.type),
        metadata: {
          ...request.metadata,
          actorName: request.actorName || "Someone",
          actorUsername: request.actorUsername || "someone",
          actorAvatar: request.actorAvatar || "", // Add actor avatar to metadata
        },
        isRead: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      console.log("🔔 Final alert data:", alertData);

      const alertEntity = AlertEntity.create(alertData);
      await this.alertRepository.createAlert(alertEntity);

      console.log("✅ Alert created successfully:", alertEntity.id);
      return { success: true, alert: alertEntity };
    } catch (error) {
      console.error("❌ Error creating alert:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Get alerts for a user
  async getAlerts(request: GetAlertsRequest): Promise<AlertListResponse> {
    try {
      console.log("🔔 AlertService: Getting alerts for user:", request.userId);
      console.log("🔔 AlertService: Request params:", request);

      const alerts = await this.alertRepository.getAlertsForUser(
        request.userId,
        request.limit,
        request.offset,
        request.unreadOnly,
      );

      console.log(
        "🔔 AlertService: Retrieved",
        alerts.length,
        "alerts from repository",
      );
      console.log("🔔 AlertService: Alerts data:", alerts);

      return { success: true, alerts };
    } catch (error) {
      console.error("❌ AlertService: Error getting alerts:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Mark alert as read
  async markAlertAsRead(
    request: MarkAlertReadRequest,
  ): Promise<MarkReadResponse> {
    try {
      await this.alertRepository.markAlertAsRead(
        request.alertId,
        request.userId,
      );
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Mark multiple alerts as read
  async markAllAlertsAsRead(userId: string): Promise<MarkReadResponse> {
    try {
      await this.alertRepository.markAllAlertsAsRead(userId);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Delete alert
  async deleteAlert(
    alertId: string,
    userId: string,
  ): Promise<MarkReadResponse> {
    try {
      await this.alertRepository.deleteAlert(alertId, userId);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Get unread count
  async getUnreadCount(
    userId: string,
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const count = await this.alertRepository.getUnreadCount(userId);
      return { success: true, count };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Update an existing alert
  async updateAlert(
    alertId: string,
    userId: string,
    updates: {
      type?: AlertType;
      message?: string;
      metadata?: Record<string, any>;
      isRead?: boolean;
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("🔔 AlertService: Updating alert:", alertId);
      console.log("🔔 AlertService: Update data:", updates);

      // Pass updates directly to repository - it will handle the mapping
      await this.alertRepository.updateAlert(alertId, userId, updates as any);

      console.log("✅ AlertService: Alert updated successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ AlertService: Error updating alert:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  // Generate default message based on alert type
  private generateDefaultMessage(type: AlertType): string {
    const messageMap: Record<AlertType, string> = {
      DARE_RECEIVED: "gave you a dare",
      DARE_ACCEPTED: "accepted your dare",
      DARE_COMPLETED: "completed your dare",
      DARE_REFUSED: "refused your dare",
      DARE_APPROVED: "approved your dare submission",
      DARE_REJECTED: "rejected your dare submission",
      TRUTH_RECEIVED: "asked you a truth",
      TRUTH_ANSWERED: "answered your truth",
      TRUTH_REFUSED: "refused your truth",
      TRUTH_COMPLETED: "completed your truth",
      FRIEND_REQUEST: "sent you a friend request",
      FRIEND_ACCEPTED: "accepted your friend request",
      MESSAGE_RECEIVED: "sent you a message",
      POST_LIKED: "liked your post",
      PROFILE_VIEW: "viewed your profile",
      SYSTEM_NOTIFICATION: "System notification",
      SUS_REPEATED_LIKES: "liked your post multiple times",
      SUS_PROFILE_VIEWING: "is viewing your profile right now",
      SUS_PHOTO_VIEWS: "viewed your photo multiple times",
      SUS_MENTION_TALKING: "were talking about you",
      SUS_CLOSE_FRIEND_ACTIVITY: "has suspicious close friend activity",
      COMMENT_RECEIVED: "commented on your post",
      COMMENT_REPLY: "replied to your comment",
      STORY_REACTION: "liked your story",
      STORY_REPLY: "replied to your story",
    };

    return messageMap[type] || "System notification";
  }

  // Create or update aggregated alert for story reactions
  async handleStoryReactionAlert(
    userId: string,
    storyAuthorId: string,
    actorId: string,
    actorName: string,
    actorUsername: string,
    actorAvatar: string,
    reactionType: "like" | "hate",
    storyId: string,
  ): Promise<void> {
    try {
      // Check if there's an existing aggregated alert for this story
      let existingAlerts: AlertEntity[] = [];
      try {
        existingAlerts = await this.alertRepository.getAlertsForUser(
          storyAuthorId,
          100,
          0,
          false,
        );
      } catch (error) {
        if (!this.isPermissionDenied(error)) {
          throw error;
        }

        await this.createAlert({
          userId: storyAuthorId,
          type: "STORY_REACTION",
          entityId: storyId,
          actorId,
          actorName,
          actorUsername,
          actorAvatar,
          metadata: {
            reactionType,
          },
        });
        return;
      }

      // Find existing STORY_REACTION alert for this story
      const existingAlert = existingAlerts.find(
        (alert) =>
          alert.type === "STORY_REACTION" &&
          alert.entityId === storyId &&
          !alert.isRead,
      );

      if (existingAlert) {
        // Update existing alert with new actor info
        const actors = [...(existingAlert.metadata.actors || [])];
        const actorIndex = actors.findIndex((actor: any) => actor.id === actorId);

        if (actorIndex >= 0) {
          actors[actorIndex] = {
            ...actors[actorIndex],
            name: actorName,
            username: actorUsername,
            avatar: actorAvatar,
            reactionType,
          };
        } else {
          actors.push({
            id: actorId,
            name: actorName,
            username: actorUsername,
            avatar: actorAvatar,
            reactionType,
          });
        }

        const reactionCounts = {
          likes: actors.filter((a: any) => a.reactionType === "like").length,
          hates: actors.filter((a: any) => a.reactionType === "hate").length,
        };

        const message =
          this.generateAggregatedReactionMessage(reactionCounts);

        await this.updateAlert(existingAlert.id, storyAuthorId, {
          metadata: {
            ...existingAlert.metadata,
            actors,
            reactionCounts,
            lastReactionAt: new Date().toISOString(),
          },
          message,
        });
      } else {
        // Create new alert
        await this.createAlert({
          userId: storyAuthorId,
          type: "STORY_REACTION",
          entityId: storyId,
          actorId,
          actorName,
          actorUsername,
          actorAvatar,
          metadata: {
            actors: [
              {
                id: actorId,
                name: actorName,
                username: actorUsername,
                avatar: actorAvatar,
                reactionType,
              },
            ],
            reactionCounts: {
              likes: reactionType === "like" ? 1 : 0,
              hates: reactionType === "hate" ? 1 : 0,
            },
            lastReactionAt: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error("Error handling story reaction alert:", error);
    }
  }

  // Generate aggregated reaction message
  private generateAggregatedReactionMessage(counts: {
    likes: number;
    hates: number;
  }): string {
    if (counts.likes > 0 && counts.hates > 0) {
      return `${counts.likes} liked your story and ${counts.hates} hated your story`;
    } else if (counts.likes > 0) {
      return counts.likes === 1
        ? "liked your story"
        : `${counts.likes} people liked your story`;
    } else if (counts.hates > 0) {
      return counts.hates === 1
        ? "hated your story"
        : `${counts.hates} people hated your story`;
    }
    return "liked your story";
  }
}

// Default export for service factory
export default new AlertService(new AlertRepository());
