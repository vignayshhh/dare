// Ghost Mode Service - Handles 15-minute ghost mode after dare completion
// Follows architecture contract: clean service interface, DTOs only
// Suppresses all surveillance alerts during ghost mode period

import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";

// ---------------------------------------------------------------------------  
// Types and DTOs
// ---------------------------------------------------------------------------

export interface GhostModeStatus {
  userId: string;
  isActive: boolean;
  activatedAt?: string;
  expiresAt?: string;
  dareId?: string; // The dare that triggered ghost mode
}

export interface GhostModeActivationRequest {
  userId: string;
  dareId: string;
  durationMinutes?: number; // Default 15 minutes
}

// ---------------------------------------------------------------------------  
// Ghost Mode Service
// ---------------------------------------------------------------------------

class GhostModeService {
  private readonly DEFAULT_DURATION_MINUTES = 15;
  private readonly COLLECTION_NAME = "ghost_mode";

  /**
   * Check if a user is currently in ghost mode
   */
  async getGhostModeStatus(userId: string): Promise<GhostModeStatus> {
    try {
      const ghostDoc = await getDoc(doc(db, this.COLLECTION_NAME, userId));
      
      if (!ghostDoc.exists()) {
        return {
          userId,
          isActive: false,
        };
      }

      const data = ghostDoc.data();
      const now = new Date();
      const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);

      // Check if ghost mode has expired
      if (now > expiresAt) {
        // Clean up expired ghost mode
        await this.deactivateGhostMode(userId);
        return {
          userId,
          isActive: false,
        };
      }

      return {
        userId,
        isActive: true,
        activatedAt: data.activatedAt?.toDate?.()?.toISOString() || data.activatedAt,
        expiresAt: expiresAt.toISOString(),
        dareId: data.dareId,
      };
    } catch (error) {
      console.error("Error checking ghost mode status:", error);
      return {
        userId,
        isActive: false,
      };
    }
  }

  /**
   * Activate ghost mode for a user after dare completion
   */
  async activateGhostMode(request: GhostModeActivationRequest): Promise<void> {
    try {
      const { userId, dareId, durationMinutes = this.DEFAULT_DURATION_MINUTES } = request;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      const ghostData = {
        userId,
        isActive: true,
        activatedAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expiresAt),
        dareId,
        durationMinutes,
      };

      await setDoc(doc(db, this.COLLECTION_NAME, userId), ghostData);
      
      console.log(`Ghost mode activated for user ${userId} until ${expiresAt.toISOString()}`);
    } catch (error) {
      console.error("Error activating ghost mode:", error);
      throw error;
    }
  }

  /**
   * Deactivate ghost mode for a user
   */
  async deactivateGhostMode(userId: string): Promise<void> {
    try {
      await updateDoc(doc(db, this.COLLECTION_NAME, userId), {
        isActive: false,
        deactivatedAt: Timestamp.now(),
      });
      
      console.log(`Ghost mode deactivated for user ${userId}`);
    } catch (error) {
      console.error("Error deactivating ghost mode:", error);
      throw error;
    }
  }

  /**
   * Check if surveillance alerts should be suppressed for a user
   * This is the key method that other services will call
   */
  async shouldSuppressAlerts(userId: string): Promise<boolean> {
    const status = await this.getGhostModeStatus(userId);
    return status.isActive;
  }

  /**
   * Get remaining time in ghost mode (in seconds)
   */
  async getRemainingTime(userId: string): Promise<number> {
    const status = await this.getGhostModeStatus(userId);
    
    if (!status.isActive || !status.expiresAt) {
      return 0;
    }

    const now = new Date();
    const expiresAt = new Date(status.expiresAt);
    const remainingMs = expiresAt.getTime() - now.getTime();
    
    return Math.max(0, Math.floor(remainingMs / 1000));
  }

  /**
   * Get formatted remaining time (MM:SS)
   */
  async getFormattedRemainingTime(userId: string): Promise<string> {
    const remainingSeconds = await this.getRemainingTime(userId);
    
    if (remainingSeconds === 0) {
      return "00:00";
    }

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Subscribe to real-time ghost mode status changes
   */
  subscribeToGhostMode(
    userId: string,
    callback: (status: GhostModeStatus) => void
  ): () => void {
    const unsubscribe = import("firebase/firestore").then(({ onSnapshot }) => {
      return onSnapshot(doc(db, this.COLLECTION_NAME, userId), (doc) => {
        if (!doc.exists()) {
          callback({
            userId,
            isActive: false,
          });
          return;
        }

        const data = doc.data();
        const now = new Date();
        const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);

        // Check if expired
        if (now > expiresAt) {
          callback({
            userId,
            isActive: false,
          });
          return;
        }

        callback({
          userId,
          isActive: data.isActive || false,
          activatedAt: data.activatedAt?.toDate?.()?.toISOString() || data.activatedAt,
          expiresAt: expiresAt.toISOString(),
          dareId: data.dareId,
        });
      });
    });

    return () => {
      unsubscribe.then(unsub => unsub());
    };
  }
}

export const ghostModeService = new GhostModeService();
