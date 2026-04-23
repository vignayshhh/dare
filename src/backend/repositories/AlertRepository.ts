// Alert Repository - Infrastructure layer
// Handles Firebase operations only, no business logic
// Follows architecture contract strictly

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as queryLimit,
  startAfter,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { AlertEntity, AlertType } from "../domain/entities/Alert";

const isDevelopment = process.env.NODE_ENV !== "production";

function debugLog(...args: unknown[]) {
  if (isDevelopment) {
    console.log(...args);
  }
}

export interface IAlertRepository {
  createAlert(alert: AlertEntity): Promise<void>;
  getAlertsForUser(
    userId: string,
    limit?: number,
    offset?: number,
    unreadOnly?: boolean,
  ): Promise<AlertEntity[]>;
  markAlertAsRead(alertId: string, userId: string): Promise<void>;
  markAllAlertsAsRead(userId: string): Promise<void>;
  deleteAlert(alertId: string, userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  updateAlert(
    alertId: string,
    userId: string,
    updates: Partial<AlertEntity>,
  ): Promise<void>;
}

export class AlertRepository implements IAlertRepository {
  private readonly collectionName = "alerts";

  async createAlert(alert: AlertEntity): Promise<void> {
    try {
      debugLog(
        "🔔 Repository: Creating alert for user:",
        alert.userId,
        "type:",
        alert.type,
      );

      const alertRef = collection(db, this.collectionName);
      const alertData = {
        userId: alert.userId,
        type: alert.type,
        entityId: alert.entityId,
        actorId: alert.actorId,
        message: alert.message,
        metadata: alert.metadata,
        isRead: alert.isRead,
        createdAt: Timestamp.fromDate(new Date(alert.createdAt)),
        updatedAt: Timestamp.fromDate(new Date(alert.updatedAt)),
      };

      debugLog("Creating alert document");

      const docRef = await addDoc(alertRef, alertData);
      debugLog("Alert created successfully");
    } catch (error) {
      console.error("❌ Repository: Error creating alert:", error);
      throw new Error(
        `Failed to create alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getAlertsForUser(
    userId: string,
    limit?: number,
    offset?: number,
    unreadOnly?: boolean,
  ): Promise<AlertEntity[]> {
    try {
      debugLog("Getting alerts for user");

      const alertsRef = collection(db, this.collectionName);
      let q = query(alertsRef, where("userId", "==", userId));

      if (unreadOnly) {
        q = query(q, where("isRead", "==", false));
      }

      if (limit) {
        q = query(q, queryLimit(limit));
      }

      debugLog("Executing alert query");

      const snapshot = await getDocs(q);
      debugLog("Fetched alert documents", snapshot.docs.length);

      const alerts = snapshot.docs.map((doc) => this.docToEntity(doc));

      // Sort in memory by createdAt (descending)
      alerts.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      debugLog("Sorted alerts");

      return alerts;
    } catch (error) {
      console.error("❌ Repository: Error getting alerts for user:", error);
      throw new Error(
        `Failed to get alerts for user: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async markAlertAsRead(alertId: string, userId: string): Promise<void> {
    try {
      const alertRef = doc(db, this.collectionName, alertId);
      const alertDoc = await getDoc(alertRef);

      if (!alertDoc.exists()) {
        throw new Error("Alert not found");
      }

      const alertData = alertDoc.data();
      if (alertData.userId !== userId) {
        throw new Error("Unauthorized to mark this alert as read");
      }

      await updateDoc(alertRef, {
        isRead: true,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      throw new Error(
        `Failed to mark alert as read: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async markAllAlertsAsRead(userId: string): Promise<void> {
    try {
      const alertsRef = collection(db, this.collectionName);
      const q = query(
        alertsRef,
        where("userId", "==", userId),
        where("isRead", "==", false),
      );

      const snapshot = await getDocs(q);
      const batch = snapshot.docs.map((doc) =>
        updateDoc(doc.ref, {
          isRead: true,
          updatedAt: Timestamp.now(),
        }),
      );

      await Promise.all(batch);
    } catch (error) {
      throw new Error(
        `Failed to mark all alerts as read: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async deleteAlert(alertId: string, userId: string): Promise<void> {
    try {
      const alertRef = doc(db, this.collectionName, alertId);
      const alertDoc = await getDoc(alertRef);

      if (!alertDoc.exists()) {
        throw new Error("Alert not found");
      }

      const alertData = alertDoc.data();
      if (alertData.userId !== userId) {
        throw new Error("Unauthorized to delete this alert");
      }

      await deleteDoc(alertRef);
    } catch (error) {
      throw new Error(
        `Failed to delete alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const alertsRef = collection(db, this.collectionName);
      const q = query(
        alertsRef,
        where("userId", "==", userId),
        where("isRead", "==", false),
      );

      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      throw new Error(
        `Failed to get unread count: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async updateAlert(
    alertId: string,
    userId: string,
    updates: Partial<AlertEntity>,
  ): Promise<void> {
    try {
      debugLog("Updating alert");

      const alertRef = doc(db, this.collectionName, alertId);
      const alertDoc = await getDoc(alertRef);

      if (!alertDoc.exists()) {
        throw new Error("Alert not found");
      }

      const alertData = alertDoc.data();

      // Verify ownership
      if (alertData.userId !== userId) {
        throw new Error("Unauthorized to update this alert");
      }

      // Prepare update data
      const updateData: any = {
        updatedAt: Timestamp.now(),
      };

      // Map fields from AlertEntity to Firestore format
      if (updates.type !== undefined) updateData.type = updates.type;
      if (updates.message !== undefined) updateData.message = updates.message;
      if (updates.metadata !== undefined)
        updateData.metadata = updates.metadata;
      if (updates.isRead !== undefined) updateData.isRead = updates.isRead;

      debugLog("Applying alert update");
      await updateDoc(alertRef, updateData);
      debugLog("Alert updated successfully");
    } catch (error) {
      console.error("❌ Repository: Error updating alert:", error);
      throw new Error(
        `Failed to update alert: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Helper method to convert Firestore document to AlertEntity
  private docToEntity(doc: any): AlertEntity {
    const data = doc.data();
    return AlertEntity.create({
      id: doc.id, // Use Firestore document ID
      userId: data.userId,
      type: data.type as AlertType,
      entityId: data.entityId,
      actorId: data.actorId,
      message: data.message,
      metadata: data.metadata || {},
      isRead: data.isRead,
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    });
  }
}
