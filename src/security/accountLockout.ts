import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

interface LockoutData {
  failedAttempts: number;
  lockoutUntil?: number;
  lastAttemptAt: number;
}

/**
 * Account Lockout Service
 * Tracks failed authentication attempts and locks accounts after threshold
 */
class AccountLockoutService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly COLLECTION = "account_lockouts";

  /**
   * Check if an account is currently locked
   */
  async isAccountLocked(email: string): Promise<{ locked: boolean; reason?: string; unlockTime?: number }> {
    try {
      const lockoutRef = doc(db, this.COLLECTION, email.toLowerCase());
      const lockoutDoc = await getDoc(lockoutRef);

      if (!lockoutDoc.exists()) {
        return { locked: false };
      }

      const data = lockoutDoc.data() as LockoutData;
      
      // Check if lockout has expired
      if (data.lockoutUntil && data.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((data.lockoutUntil - Date.now()) / (60 * 1000));
        return {
          locked: true,
          reason: `Too many failed attempts. Account locked for ${remainingMinutes} minutes.`,
          unlockTime: data.lockoutUntil,
        };
      }

      // Lockout expired, reset attempts
      await this.resetLockout(email);
      return { locked: false };
    } catch (error) {
      console.error("Error checking account lockout:", error);
      // Fail open - allow access if check fails
      return { locked: false };
    }
  }

  /**
   * Record a failed authentication attempt
   */
  async recordFailedAttempt(email: string): Promise<void> {
    try {
      const lockoutRef = doc(db, this.COLLECTION, email.toLowerCase());
      const lockoutDoc = await getDoc(lockoutRef);

      if (!lockoutDoc.exists()) {
        // First failed attempt
        await setDoc(lockoutRef, {
          failedAttempts: 1,
          lastAttemptAt: Date.now(),
        });
        return;
      }

      const data = lockoutDoc.data() as LockoutData;
      
      // Check if previous lockout has expired
      if (data.lockoutUntil && data.lockoutUntil <= Date.now()) {
        // Reset attempts if lockout expired
        await updateDoc(lockoutRef, {
          failedAttempts: 1,
          lastAttemptAt: Date.now(),
          lockoutUntil: null,
        });
        return;
      }

      // Increment failed attempts
      const newAttempts = data.failedAttempts + 1;
      const updateData: any = {
        failedAttempts: newAttempts,
        lastAttemptAt: Date.now(),
      };

      // Lock account if threshold reached
      if (newAttempts >= this.MAX_ATTEMPTS) {
        updateData.lockoutUntil = Date.now() + this.LOCKOUT_DURATION_MS;
        console.warn(`🔒 Account locked for email: ${email} after ${newAttempts} failed attempts`);
      }

      await updateDoc(lockoutRef, updateData);
    } catch (error) {
      console.error("Error recording failed attempt:", error);
    }
  }

  /**
   * Reset lockout after successful authentication
   */
  async resetLockout(email: string): Promise<void> {
    try {
      const lockoutRef = doc(db, this.COLLECTION, email.toLowerCase());
      await updateDoc(lockoutRef, {
        failedAttempts: 0,
        lockoutUntil: null,
        lastAttemptAt: Date.now(),
      });
    } catch (error) {
      console.error("Error resetting lockout:", error);
    }
  }

  /**
   * Get remaining attempts before lockout
   */
  async getRemainingAttempts(email: string): Promise<number> {
    try {
      const lockoutRef = doc(db, this.COLLECTION, email.toLowerCase());
      const lockoutDoc = await getDoc(lockoutRef);

      if (!lockoutDoc.exists()) {
        return this.MAX_ATTEMPTS;
      }

      const data = lockoutDoc.data() as LockoutData;
      
      // If lockout has expired, reset
      if (data.lockoutUntil && data.lockoutUntil <= Date.now()) {
        await this.resetLockout(email);
        return this.MAX_ATTEMPTS;
      }

      return Math.max(0, this.MAX_ATTEMPTS - data.failedAttempts);
    } catch (error) {
      console.error("Error getting remaining attempts:", error);
      return this.MAX_ATTEMPTS;
    }
  }

  /**
   * Admin function to unlock an account
   */
  async unlockAccount(email: string): Promise<void> {
    try {
      const lockoutRef = doc(db, this.COLLECTION, email.toLowerCase());
      await updateDoc(lockoutRef, {
        failedAttempts: 0,
        lockoutUntil: null,
        lastAttemptAt: Date.now(),
      });
    } catch (error) {
      console.error("Error unlocking account:", error);
    }
  }
}

// Singleton instance
export const accountLockoutService = new AccountLockoutService();
