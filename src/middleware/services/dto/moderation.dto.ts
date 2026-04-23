export type ReportReason = "harassment" | "spam" | "inappropriate_content" | "fake_profile" | "other";
export type ReportStatus = "pending" | "reviewing" | "resolved";
export type ModerationAction = "warning" | "temporary_suspend" | "permanent_ban" | "content_removal";

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
  reason: ReportReason;
  description: string;
}

export interface UpdateReportStatusRequest {
  reportId: string;
  status: ReportStatus;
}

export interface CreateModerationActionRequest {
  targetUserId: string;
  action: ModerationAction;
  reason: string;
  expiresAt?: string;
}

export interface GetReportsRequest {
  status?: ReportStatus;
}

export interface GetActiveActionsRequest {
  userId: string;
}
