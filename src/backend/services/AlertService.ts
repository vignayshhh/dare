export interface AlertResponse {
  success: boolean;
  alert?: any;
  error?: string;
}

// Simple in-memory storage for alerts (for testing)
const alertStorage: { [userId: string]: any[] } = {};

export class AlertService {
  async createAlert(alertData: any): Promise<AlertResponse> {
    try {
      console.log("🚨 Creating alert:", alertData);

      // Store the alert in memory
      const userId = alertData.userId;
      if (!alertStorage[userId]) {
        alertStorage[userId] = [];
      }

      const alert = {
        ...alertData,
        id: "alert-" + Date.now(),
        createdAt: new Date().toISOString(),
        read: false,
      };

      alertStorage[userId].push(alert);
      console.log(
        `🚨 Alert stored for user ${userId}. Total alerts: ${alertStorage[userId].length}`,
      );

      return {
        success: true,
        alert: alert,
      };
    } catch (error) {
      console.error("Error creating alert:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create alert",
      };
    }
  }

  async getUserAlerts(userId: string): Promise<AlertResponse> {
    try {
      console.log(`🚨 Getting alerts for user: ${userId}`);

      const userAlerts = alertStorage[userId] || [];
      console.log(`🚨 Found ${userAlerts.length} alerts for user ${userId}`);

      return {
        success: true,
        alert: userAlerts, // Return the actual alerts instead of empty array
      };
    } catch (error) {
      console.error("Error getting alerts:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get alerts",
      };
    }
  }
}

export const alertService = new AlertService();
