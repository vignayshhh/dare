// Ghost Mode Service - Handles 15-minute ghost mode after dare completion
// Follows architecture contract: clean service interface, DTOs only
// Suppresses all surveillance alerts during ghost mode period

import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { logFirestoreError } from "@/utils/firestoreErrors";

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
  activatedAt?: string | Date;
  expiresAt?: string | Date;
}

// ---------------------------------------------------------------------------
// Ghost Mode Service
// ---------------------------------------------------------------------------

class GhostModeService {
  private readonly DEFAULT_DURATION_MINUTES = 15;
  private readonly COLLECTION_NAME = "ghost_mode";

  private resolveDateInput(value: string | Date | undefined): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

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
        activatedAt:
          data.activatedAt?.toDate?.()?.toISOString() || data.activatedAt,
        expiresAt: expiresAt.toISOString(),
        dareId: data.dareId,
      };
    } catch (error) {
      logFirestoreError("Error checking ghost mode status:", error);
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
      const {
        userId,
        dareId,
        durationMinutes = this.DEFAULT_DURATION_MINUTES,
      } = request;
      const activatedAt =
        this.resolveDateInput(request.activatedAt) || new Date();
      const explicitExpiresAt = this.resolveDateInput(request.expiresAt);
      const expiresAt =
        explicitExpiresAt ||
        new Date(activatedAt.getTime() + durationMinutes * 60 * 1000);

      const ghostData = {
        userId,
        isActive: true,
        activatedAt: Timestamp.fromDate(activatedAt),
        expiresAt: Timestamp.fromDate(expiresAt),
        dareId,
        durationMinutes,
      };

      await setDoc(doc(db, this.COLLECTION_NAME, userId), ghostData);
      const ancillaryWrites = await Promise.allSettled([
        setDoc(
          doc(db, "users", userId),
          {
            ghost_mode_active: true,
            ghost_mode_expires_at: expiresAt.toISOString(),
            updated_at: activatedAt.toISOString(),
          },
          { merge: true },
        ),
        setDoc(
          doc(db, "presence", userId),
          {
            ghost_mode: true,
            ghost_mode_expires_at: expiresAt.toISOString(),
            last_seen: Timestamp.fromDate(activatedAt),
          },
          { merge: true },
        ),
      ]);

      ancillaryWrites.forEach((result, index) => {
        if (result.status === "rejected") {
          const target = index === 0 ? "users" : "presence";
          console.warn(
            `Ghost mode ancillary ${target} write failed:`,
            result.reason,
          );
        }
      });

      console.log(
        `Ghost mode activated for user ${userId} until ${expiresAt.toISOString()}`,
      );
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
      const now = new Date();
      await Promise.all([
        setDoc(
          doc(db, this.COLLECTION_NAME, userId),
          {
            isActive: false,
            deactivatedAt: Timestamp.now(),
          },
          { merge: true },
        ),
        setDoc(
          doc(db, "users", userId),
          {
            ghost_mode_active: false,
            ghost_mode_expires_at: null,
            updated_at: now.toISOString(),
          },
          { merge: true },
        ),
        setDoc(
          doc(db, "presence", userId),
          {
            ghost_mode: false,
            ghost_mode_expires_at: null,
            last_seen: Timestamp.fromDate(now),
          },
          { merge: true },
        ),
      ]);

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

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Subscribe to real-time ghost mode status changes
   */
  subscribeToGhostMode(
    userId: string,
    callback: (status: GhostModeStatus) => void,
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
        const expiresAt =
          data.expiresAt?.toDate?.() || new Date(data.expiresAt);

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
          activatedAt:
            data.activatedAt?.toDate?.()?.toISOString() || data.activatedAt,
          expiresAt: expiresAt.toISOString(),
          dareId: data.dareId,
        });
      });
    });

    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }
}

export const ghostModeService = new GhostModeService();
