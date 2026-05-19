// Alert Service - Handles all cross-domain notifications
// Separate from Feed Service to avoid coupling
// Follows architecture contract strictly

import { AlertRepository } from "@/backend/repositories/AlertRepository";
import { AlertEntity, AlertType } from "@/backend/domain/entities/Alert";
import { FriendshipRepository } from "@/backend/repositories/FriendshipRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";

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

export interface CreateFriendChallengeActivityAlertsRequest {
  challengeKind: "dare" | "truth";
  challengeId: string;
  challengerId: string;
  receiverId: string;
  prompt: string;
  activityType?: "sent" | "completed";
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
  private friendshipRepository = new FriendshipRepository();
  private userRepository = new UserRepository();
  private acceptedFriendIdsCache = new Map<
    string,
    { ids: string[]; expiresAt: number }
  >();
  private readonly friendCacheTtlMs = 60_000;

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
      if (request.type === "STORY_REPLY") {
        console.log("Skipping STORY_REPLY alert; story replies live in DMs.");
        return { success: true };
      }

      console.log(
        "🔔 Creating alert for user:",
        request.userId,
        "type:",
        request.type,
      );
      console.log("🔔 Alert data:", request);

      let actorProfile: Awaited<ReturnType<UserRepository["getProfileById"]>> =
        null;
      if (request.actorId) {
        try {
          actorProfile = await this.userRepository.getProfileById(
            request.actorId,
          );
        } catch {
          actorProfile = null;
        }
      }
      const actorName =
        request.actorName ||
        actorProfile?.displayName ||
        actorProfile?.username ||
        "User";
      const actorUsername =
        request.actorUsername || actorProfile?.username || "user";
      const actorAvatar = request.actorAvatar || actorProfile?.avatarUrl || "";
      const aggregatedAlert = await this.tryUpdateAggregatedAlert(
        request,
        actorName,
        actorUsername,
        actorAvatar,
      );

      if (aggregatedAlert) {
        console.log("✅ Aggregated existing alert:", aggregatedAlert.id);
        return { success: true, alert: aggregatedAlert };
      }

      const alertData = {
        id: createAlertId(),
        userId: request.userId,
        type: request.type,
        entityId: request.entityId,
        actorId: request.actorId,
        message: request.message || this.generateDefaultMessage(request.type),
        metadata: {
          ...request.metadata,
          actorName,
          actorUsername,
          actorAvatar,
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

  private getAggregationTarget(input: {
    type: AlertType;
    entityId: string;
    metadata?: Record<string, any>;
  }): string | null {
    switch (input.type) {
      case "POST_LIKED":
        return `post-like:${input.metadata?.postId || input.entityId}`;
      case "STORY_REACTION":
        return `story-reaction:${input.entityId}`;
      case "COMMENT_RECEIVED":
        return `post-comment:${input.metadata?.postId || input.entityId}`;
      case "COMMENT_REPLY":
        return `comment-reply:${
          input.metadata?.parentCommentId ||
          input.metadata?.commentId ||
          input.metadata?.postId ||
          input.entityId
        }`;
      case "STORY_REPLY":
        return `story-reply:${input.entityId}`;
      default:
        return null;
    }
  }

  private formatAggregatedMessage(
    type: AlertType,
    actors: Array<{ username?: string; name?: string }>,
  ) {
    const displayActors = [...actors].reverse();
    const names = displayActors.slice(0, 3).map((actor) => {
      const username = actor.username || actor.name || "someone";
      return username.startsWith("@") ? username : `@${username}`;
    });
    const actorLine =
      displayActors.length <= 1
        ? names[0] || "@someone"
        : displayActors.length === 2
          ? `${names[0]} and ${names[1]}`
          : displayActors.length === 3
            ? `${names[0]}, ${names[1]} and ${names[2]}`
            : `${names[0]}, ${names[1]} and ${displayActors.length - 2} others`;
    const reactionTypes = new Set(
      displayActors.flatMap((actor: any) => {
        const types = Array.isArray(actor.reactionTypes)
          ? actor.reactionTypes
          : [];
        return [
          ...types,
          ...(actor.reactionType ? [actor.reactionType] : []),
        ].map((type) => (type === "hate" ? "hate" : "like"));
      }),
    );
    const action =
      type === "POST_LIKED"
        ? "liked your post"
        : type === "STORY_REACTION"
          ? reactionTypes.has("like") && reactionTypes.has("hate")
            ? displayActors.length === 1
              ? "liked and hated your story"
              : "reacted to your story"
            : reactionTypes.has("hate")
              ? "hated your story"
              : "liked your story"
          : type === "COMMENT_RECEIVED"
            ? "commented on your post"
            : type === "COMMENT_REPLY"
              ? "replied to your comment"
              : type === "STORY_REPLY"
                ? "replied to your story"
                : this.generateDefaultMessage(type);

    return `${actorLine} ${action}`;
  }

  private async tryUpdateAggregatedAlert(
    request: CreateAlertRequest,
    actorName: string,
    actorUsername: string,
    actorAvatar: string,
  ): Promise<AlertEntity | null> {
    const target = this.getAggregationTarget(request);
    if (!target) return null;

    let existingAlerts: AlertEntity[] = [];
    try {
      existingAlerts = await this.alertRepository.getAlertsForUser(
        request.userId,
        100,
        0,
        false,
      );
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }
      return null;
    }
    const existingAlert = existingAlerts.find(
      (alert) =>
        this.getAggregationTarget({
          type: alert.type,
          entityId: alert.entityId,
          metadata: alert.metadata,
        }) === target,
    );

    if (!existingAlert) return null;

    const actor = {
      id: request.actorId,
      name: actorName,
      username: actorUsername,
      avatar: actorAvatar,
      reactionType: request.metadata?.reactionType,
      reactionTypes: request.metadata?.reactionType
        ? [request.metadata.reactionType === "hate" ? "hate" : "like"]
        : [],
    };
    const previousActors = Array.isArray(existingAlert.metadata?.actors)
      ? existingAlert.metadata.actors
      : [
          {
            id: existingAlert.actorId,
            name: existingAlert.metadata?.actorName || "Someone",
            username: existingAlert.metadata?.actorUsername || "someone",
            avatar: existingAlert.metadata?.actorAvatar || "",
            reactionType: existingAlert.metadata?.reactionType,
            reactionTypes: existingAlert.metadata?.reactionType
              ? [
                  existingAlert.metadata.reactionType === "hate"
                    ? "hate"
                    : "like",
                ]
              : [],
          },
        ];
    const existingActor = previousActors.find(
      (item: any) => item.id === request.actorId,
    );
    const mergedActor = existingActor
      ? {
          ...existingActor,
          ...actor,
          reactionTypes: [
            ...new Set([
              ...(Array.isArray(existingActor.reactionTypes)
                ? existingActor.reactionTypes
                : []),
              ...(existingActor.reactionType
                ? [existingActor.reactionType]
                : []),
              ...actor.reactionTypes,
            ]),
          ].map((type) => (type === "hate" ? "hate" : "like")),
        }
      : actor;
    const actors = [
      ...previousActors.filter((item: any) => item.id !== request.actorId),
      mergedActor,
    ];
    const storyReactionTypes = new Set(
      actors.flatMap((item: any) => [
        ...(Array.isArray(item.reactionTypes) ? item.reactionTypes : []),
        ...(item.reactionType ? [item.reactionType] : []),
      ]),
    );
    const now = new Date().toISOString();
    const metadata = {
      ...existingAlert.metadata,
      ...request.metadata,
      actorName,
      actorUsername,
      actorAvatar,
      actors,
      aggregatedCount: actors.length,
      lastActivityAt: now,
      lastReactionAt:
        request.type === "STORY_REACTION"
          ? now
          : existingAlert.metadata?.lastReactionAt,
      reactionType:
        request.type === "STORY_REACTION"
          ? storyReactionTypes.has("like") && storyReactionTypes.has("hate")
            ? "mixed"
            : storyReactionTypes.has("hate")
              ? "hate"
              : "like"
          : request.metadata?.reactionType,
    };
    const message = this.formatAggregatedMessage(request.type, actors);

    await this.updateAlert(existingAlert.id, request.userId, {
      message,
      metadata,
      isRead: false,
    });

    return AlertEntity.create({
      id: existingAlert.id,
      userId: existingAlert.userId,
      type: existingAlert.type,
      entityId: existingAlert.entityId,
      actorId: existingAlert.actorId,
      message,
      metadata,
      isRead: false,
      createdAt: existingAlert.createdAt,
      updatedAt: now,
    });
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
      DARE_FRIEND_ACTIVITY: "sent your friend a dare",
      TRUTH_RECEIVED: "asked you a truth",
      TRUTH_ANSWERED: "answered your truth",
      TRUTH_REFUSED: "refused your truth",
      TRUTH_COMPLETED: "completed your truth",
      TRUTH_FRIEND_ACTIVITY: "asked your friend a truth",
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

  private async getAcceptedFriendIds(userId: string): Promise<string[]> {
    const cached = this.acceptedFriendIdsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    const friendships =
      await this.friendshipRepository.getAcceptedFriends(userId);
    const ids = friendships
      .map((friendship) =>
        friendship.requesterId === userId
          ? friendship.addresseeId
          : friendship.requesterId,
      )
      .filter(Boolean);

    this.acceptedFriendIdsCache.set(userId, {
      ids,
      expiresAt: Date.now() + this.friendCacheTtlMs,
    });

    return ids;
  }

  private async getCompactProfile(userId: string) {
    const profile = await this.userRepository.getProfileById(userId);
    const username = profile?.username || "someone";
    const name = profile?.displayName || profile?.username || "Someone";

    return {
      id: userId,
      name,
      username,
      avatar: profile?.avatarUrl || "",
    };
  }

  async createFriendChallengeActivityAlerts(
    request: CreateFriendChallengeActivityAlertsRequest,
  ): Promise<void> {
    try {
      if (request.challengerId === request.receiverId) return;

      const [challengerFriendIds, receiverFriendIds] = await Promise.all([
        this.getAcceptedFriendIds(request.challengerId),
        this.getAcceptedFriendIds(request.receiverId),
      ]);

      const receiverFriendSet = new Set(receiverFriendIds);
      const observerIds = challengerFriendIds.filter(
        (friendId, index, source) =>
          receiverFriendSet.has(friendId) &&
          friendId !== request.challengerId &&
          friendId !== request.receiverId &&
          source.indexOf(friendId) === index,
      );

      if (observerIds.length === 0) return;

      const [challenger, receiver] = await Promise.all([
        this.getCompactProfile(request.challengerId),
        this.getCompactProfile(request.receiverId),
      ]);

      const isDare = request.challengeKind === "dare";
      const type: AlertType = isDare
        ? "DARE_FRIEND_ACTIVITY"
        : "TRUTH_FRIEND_ACTIVITY";
      const label = isDare ? "dare" : "truth";
      const activityType = request.activityType || "sent";
      const message =
        activityType === "completed" && isDare
          ? `${receiver.name} completed ${challenger.name}'s dare`
          : `${challenger.name} sent ${receiver.name} a ${label}`;
      const createdAt = new Date().toISOString();

      await Promise.all(
        observerIds.map((observerId) =>
          this.createAlert({
            userId: observerId,
            type,
            entityId: request.challengeId,
            actorId: request.challengerId,
            actorName: challenger.name,
            actorUsername: challenger.username,
            actorAvatar: challenger.avatar,
            message,
            metadata: {
              challengeKind: request.challengeKind,
              challengerId: request.challengerId,
              challengerName: challenger.name,
              challengerUsername: challenger.username,
              challengerAvatar: challenger.avatar,
              receiverId: request.receiverId,
              receiverName: receiver.name,
              receiverUsername: receiver.username,
              receiverAvatar: receiver.avatar,
              prompt: this.truncateChallengePrompt(request.prompt),
              activityType,
              observerAlert: true,
              createdAt,
            },
          }),
        ),
      );
    } catch (error) {
      console.error("Error creating friend challenge activity alerts:", error);
    }
  }

  private truncateChallengePrompt(prompt: string): string {
    if (!prompt) return "";
    return prompt.length <= 220 ? prompt : `${prompt.slice(0, 220)}...`;
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
          const reactionTypes = [
            ...new Set([
              ...(Array.isArray(actors[actorIndex].reactionTypes)
                ? actors[actorIndex].reactionTypes
                : []),
              ...(actors[actorIndex].reactionType
                ? [actors[actorIndex].reactionType]
                : []),
              reactionType,
            ]),
          ].map((type) => (type === "hate" ? "hate" : "like"));

          actors[actorIndex] = {
            ...actors[actorIndex],
            name: actorName,
            username: actorUsername,
            avatar: actorAvatar,
            reactionType,
            reactionTypes,
          };
        } else {
          actors.push({
            id: actorId,
            name: actorName,
            username: actorUsername,
            avatar: actorAvatar,
            reactionType,
            reactionTypes: [reactionType],
          });
        }

        const reactionCounts = {
          likes: actors.filter(
            (a: any) =>
              a.reactionType === "like" || a.reactionTypes?.includes("like"),
          ).length,
          hates: actors.filter(
            (a: any) =>
              a.reactionType === "hate" || a.reactionTypes?.includes("hate"),
          ).length,
        };

        const message = this.formatAggregatedMessage(
          "STORY_REACTION",
          actors,
        );

        await this.updateAlert(existingAlert.id, storyAuthorId, {
          metadata: {
            ...existingAlert.metadata,
            actors,
            reactionCounts,
            lastReactionAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            reactionType:
              reactionCounts.likes > 0 && reactionCounts.hates > 0
                ? "mixed"
                : reactionCounts.hates > 0
                  ? "hate"
                  : "like",
          },
          message,
          isRead: false,
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
                reactionTypes: [reactionType],
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
