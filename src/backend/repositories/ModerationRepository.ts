import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IModerationRepository,
  Report,
  ReportStatus,
  ModerationActionRecord,
  CreateReportRequest,
} from "@/backend/domain/interfaces/IModerationRepository";

export class ModerationRepository implements IModerationRepository {
  async createReport(request: CreateReportRequest): Promise<Report> {
    try {
      const reportRef = await addDoc(collection(db, "reports"), {
        reporter_id: request.reporterId,
        reported_user_id: request.reportedUserId || null,
        reported_post_id: request.reportedPostId || null,
        reported_dare_id: request.reportedDareId || null,
        reported_message_id: request.reportedMessageId || null,
        reason: request.reason,
        description: request.description,
        status: "pending",
        created_at: serverTimestamp(),
      });

      const report = await this.getReportById(reportRef.id);
      if (!report) {
        throw new Error("Failed to create report");
      }
      return report;
    } catch (error) {
      console.error("createReport error:", error);
      throw error;
    }
  }

  async getReportById(reportId: string): Promise<Report | null> {
    try {
      const reportDocRef = doc(db, "reports", reportId);
      const reportDoc = await getDoc(reportDocRef);

      if (!reportDoc.exists()) {
        return null;
      }

      const data = reportDoc.data();
      return this.mapToReport(data);
    } catch (error) {
      console.error("getReportById error:", error);
      throw error;
    }
  }

  async getReportsByStatus(status: ReportStatus): Promise<Report[]> {
    try {
      const reportsQuery = query(
        collection(db, "reports"),
        where("status", "==", status),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(reportsQuery);
      const reports: Report[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push(this.mapToReport(data));
      });

      return reports;
    } catch (error) {
      console.error("getReportsByStatus error:", error);
      throw error;
    }
  }

  async getReportsByReporter(reporterId: string): Promise<Report[]> {
    try {
      const reportsQuery = query(
        collection(db, "reports"),
        where("reporter_id", "==", reporterId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(reportsQuery);
      const reports: Report[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push(this.mapToReport(data));
      });

      return reports;
    } catch (error) {
      console.error("getReportsByReporter error:", error);
      throw error;
    }
  }

  async getReportsByReportedUser(reportedUserId: string): Promise<Report[]> {
    try {
      const reportsQuery = query(
        collection(db, "reports"),
        where("reported_user_id", "==", reportedUserId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(reportsQuery);
      const reports: Report[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push(this.mapToReport(data));
      });

      return reports;
    } catch (error) {
      console.error("getReportsByReportedUser error:", error);
      throw error;
    }
  }

  async updateReportStatus(
    reportId: string,
    status: ReportStatus,
  ): Promise<Report> {
    try {
      const reportRef = doc(db, "reports", reportId);

      await updateDoc(reportRef, {
        status,
      });

      const updatedReport = await this.getReportById(reportId);
      if (!updatedReport) {
        throw new Error("Report not found after update");
      }

      return updatedReport;
    } catch (error) {
      console.error("updateReportStatus error:", error);
      throw error;
    }
  }

  async createModerationActionRecord(
    action: Omit<ModerationActionRecord, "id" | "createdAt">,
  ): Promise<ModerationActionRecord> {
    try {
      const actionRef = await addDoc(collection(db, "moderation_actions"), {
        moderator_id: action.moderatorId,
        target_user_id: action.targetUserId,
        action: action.action,
        reason: action.reason,
        expires_at: action.expiresAt || null,
        is_active: true,
        created_at: serverTimestamp(),
      });

      const createdAction = await this.getModerationActionRecordById(
        actionRef.id,
      );
      if (!createdAction) {
        throw new Error("Failed to create moderation action");
      }
      return createdAction;
    } catch (error) {
      console.error("createModerationActionRecord error:", error);
      throw error;
    }
  }

  async createModerationAction(
    action: Omit<ModerationActionRecord, "id" | "createdAt">,
  ): Promise<ModerationActionRecord> {
    return this.createModerationActionRecord(action);
  }

  async getActiveModerationActionRecords(
    userId: string,
  ): Promise<ModerationActionRecord[]> {
    try {
      const actionsQuery = query(
        collection(db, "moderation_actions"),
        where("target_user_id", "==", userId),
        where("is_active", "==", true),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(actionsQuery);
      const actions: ModerationActionRecord[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        actions.push(this.mapToModerationActionRecord(data));
      });

      return actions;
    } catch (error) {
      console.error("getActiveModerationActionRecords error:", error);
      throw error;
    }
  }

  async getActiveModerationActions(
    userId: string,
  ): Promise<ModerationActionRecord[]> {
    return this.getActiveModerationActionRecords(userId);
  }

  async updateModerationActionRecord(
    actionId: string,
    updates: Partial<ModerationActionRecord>,
  ): Promise<ModerationActionRecord> {
    try {
      const actionRef = doc(db, "moderation_actions", actionId);

      const firestoreUpdates: any = {};

      if (updates.expiresAt !== undefined) {
        firestoreUpdates.expires_at = updates.expiresAt;
      }
      if (updates.isActive !== undefined) {
        firestoreUpdates.is_active = updates.isActive;
      }

      await updateDoc(actionRef, firestoreUpdates);

      const updatedAction = await this.getModerationActionRecordById(actionId);
      if (!updatedAction) {
        throw new Error("Moderation action not found after update");
      }

      return updatedAction;
    } catch (error) {
      console.error("updateModerationActionRecord error:", error);
      throw error;
    }
  }

  async updateModerationAction(
    actionId: string,
    updates: Partial<ModerationActionRecord>,
  ): Promise<ModerationActionRecord> {
    return this.updateModerationActionRecord(actionId, updates);
  }

  async deactivateModerationActionRecord(actionId: string): Promise<void> {
    await this.updateModerationActionRecord(actionId, { isActive: false });
  }

  async deactivateModerationAction(actionId: string): Promise<void> {
    await this.deactivateModerationActionRecord(actionId);
  }

  private async getModerationActionRecordById(
    actionId: string,
  ): Promise<ModerationActionRecord | null> {
    try {
      const actionDocRef = doc(db, "moderation_actions", actionId);
      const actionDoc = await getDoc(actionDocRef);

      if (!actionDoc.exists()) {
        return null;
      }

      const data = actionDoc.data();
      return this.mapToModerationActionRecord(data);
    } catch (error) {
      console.error("getModerationActionRecordById error:", error);
      return null;
    }
  }

  private mapToReport(data: any): Report {
    return {
      id: data.id || "",
      reporterId: data.reporter_id,
      reportedUserId: data.reported_user_id,
      reportedPostId: data.reported_post_id,
      reportedDareId: data.reported_dare_id,
      reportedMessageId: data.reported_message_id,
      reason: data.reason,
      description: data.description,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  private mapToModerationActionRecord(data: any): ModerationActionRecord {
    return {
      id: data.id || "",
      moderatorId: data.moderator_id,
      targetUserId: data.target_user_id,
      action: data.action,
      reason: data.reason,
      expiresAt: data.expires_at,
      isActive: data.is_active,
      createdAt: data.created_at,
    };
  }
}
