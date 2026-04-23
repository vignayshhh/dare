export type ReportReason = "harassment" | "spam" | "inappropriate_content" | "fake_profile" | "other";
export type ReportStatus = "pending" | "reviewing" | "resolved";
export type ModerationAction = "warning" | "temporary_suspend" | "permanent_ban" | "content_removal";

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedPostId: string | null;
  reportedDareId: string | null;
  reportedMessageId: string | null;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  createdAt: string;
}

export interface ModerationActionRecord {
  id: string;
  moderatorId: string;
  targetUserId: string;
  action: ModerationAction;
  reason: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateReportRequest {
  reporterId: string;
  reportedUserId?: string;
  reportedPostId?: string;
  reportedDareId?: string;
  reportedMessageId?: string;
  reason: ReportReason;
  description: string;
}

export interface IModerationRepository {
  createReport(request: CreateReportRequest): Promise<Report>;
  getReportById(reportId: string): Promise<Report | null>;
  getReportsByStatus(status: ReportStatus): Promise<Report[]>;
  getReportsByReporter(reporterId: string): Promise<Report[]>;
  getReportsByReportedUser(reportedUserId: string): Promise<Report[]>;
  updateReportStatus(reportId: string, status: ReportStatus): Promise<Report>;

  createModerationAction(action: Omit<ModerationActionRecord, "id" | "createdAt">): Promise<ModerationActionRecord>;
  getActiveModerationActions(userId: string): Promise<ModerationActionRecord[]>;
  updateModerationAction(actionId: string, updates: Partial<ModerationActionRecord>): Promise<ModerationActionRecord>;
  deactivateModerationAction(actionId: string): Promise<void>;
}
