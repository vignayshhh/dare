// Alert Entity - Pure business logic, no external dependencies
// Follows architecture contract strictly

export type AlertType =
  | "DARE_RECEIVED"
  | "DARE_ACCEPTED"
  | "DARE_COMPLETED"
  | "DARE_REFUSED"
  | "DARE_APPROVED"
  | "DARE_REJECTED"
  | "TRUTH_RECEIVED"
  | "TRUTH_ANSWERED"
  | "TRUTH_REFUSED"
  | "TRUTH_COMPLETED"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "MESSAGE_RECEIVED"
  | "POST_LIKED"
  | "PROFILE_VIEW"
  | "SYSTEM_NOTIFICATION"
  | "SUS_REPEATED_LIKES"
  | "SUS_PROFILE_VIEWING"
  | "SUS_PHOTO_VIEWS"
  | "SUS_MENTION_TALKING"
  | "SUS_CLOSE_FRIEND_ACTIVITY"
  | "COMMENT_RECEIVED"
  | "COMMENT_REPLY";

const SUS_ALERT_TYPES: Set<AlertType> = new Set([
  "SUS_REPEATED_LIKES",
  "SUS_PROFILE_VIEWING",
  "SUS_PHOTO_VIEWS",
  "SUS_MENTION_TALKING",
  "SUS_CLOSE_FRIEND_ACTIVITY",
  "PROFILE_VIEW",
]);

export class AlertEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly type: AlertType,
    public readonly entityId: string,
    public readonly actorId: string,
    public readonly message: string,
    public readonly metadata: Record<string, any>,
    public readonly isRead: boolean,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  static create(data: {
    id: string;
    userId: string;
    type: AlertType;
    entityId: string;
    actorId: string;
    message: string;
    metadata: Record<string, any>;
    isRead: boolean;
    createdAt: string;
    updatedAt: string;
  }): AlertEntity {
    return new AlertEntity(
      data.id,
      data.userId,
      data.type,
      data.entityId,
      data.actorId,
      data.message,
      data.metadata,
      data.isRead,
      data.createdAt,
      data.updatedAt,
    );
  }

  // Business logic methods
  canBeMarkedAsRead(): boolean {
    return !this.isRead;
  }

  canBeDeleted(): boolean {
    return true; // All alerts can be deleted by their owner
  }

  isSystemAlert(): boolean {
    return this.type === "SYSTEM_NOTIFICATION";
  }

  isSocialAlert(): boolean {
    return !this.isSystemAlert() && !this.isSusAlert();
  }

  isSusAlert(): boolean {
    return SUS_ALERT_TYPES.has(this.type);
  }

  isDareRelated(): boolean {
    return this.type.startsWith("DARE_");
  }

  isTruthRelated(): boolean {
    return this.type.startsWith("TRUTH_");
  }

  isCommentRelated(): boolean {
    return this.type === "COMMENT_RECEIVED" || this.type === "COMMENT_REPLY";
  }

  markAsRead(): AlertEntity {
    if (this.isRead) {
      return this; // Already read, return self without throwing
    }

    return new AlertEntity(
      this.id,
      this.userId,
      this.type,
      this.entityId,
      this.actorId,
      this.message,
      this.metadata,
      true,
      this.createdAt,
      new Date().toISOString(),
    );
  }

  updateMessage(newMessage: string): AlertEntity {
    return new AlertEntity(
      this.id,
      this.userId,
      this.type,
      this.entityId,
      this.actorId,
      newMessage,
      this.metadata,
      this.isRead,
      this.createdAt,
      new Date().toISOString(),
    );
  }

  updateMetadata(newMetadata: Record<string, any>): AlertEntity {
    return new AlertEntity(
      this.id,
      this.userId,
      this.type,
      this.entityId,
      this.actorId,
      this.message,
      { ...this.metadata, ...newMetadata },
      this.isRead,
      this.createdAt,
      new Date().toISOString(),
    );
  }
}
