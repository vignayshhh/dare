export interface TruthResponse {
  success: boolean;
  truths?: any[];
  error?: string;
}

export class TruthService {
  async getUserTruths(userId: string, type: "received" | "sent"): Promise<TruthResponse> {
    try {
      // Mock implementation - replace with actual backend call
      console.log(`Getting ${type} truths for user: ${userId}`);
      
      // Return mock data for now
      const mockTruths = [
        {
          id: "truth-1",
          challengerId: "user-123",
          receiverId: userId,
          question: "What is your biggest fear?",
          answer: type === "sent" ? "Spiders" : undefined,
          state: "SENT",
          createdAt: new Date().toISOString(),
        },
        {
          id: "truth-2", 
          challengerId: "user-456",
          receiverId: userId,
          question: "Have you ever lied to get out of trouble?",
          answer: type === "sent" ? "Yes, when I was younger" : undefined,
          state: type === "received" ? "ACCEPTED" : "ANSWERED",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ];

      return {
        success: true,
        truths: mockTruths,
      };
    } catch (error) {
      console.error("Error getting truths:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get truths",
      };
    }
  }

  async createTruth(truthData: any): Promise<TruthResponse> {
    try {
      console.log("Creating truth:", truthData);
      // Mock implementation
      return {
        success: true,
        truths: [{ ...truthData, id: "new-truth-" + Date.now() }],
      };
    } catch (error) {
      console.error("Error creating truth:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create truth",
      };
    }
  }
}

export const truthService = new TruthService();
