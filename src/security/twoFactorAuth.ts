import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "@/backend/lib/firebase";

interface TwoFactorSettings {
  enabled: boolean;
  method: "email" | "sms" | "none";
  phoneNumber?: string;
  verified: boolean;
  secret?: string;
  backupCodes?: string[];
  lastUsedAt?: number;
}

/**
 * Two-Factor Authentication Service
 * Provides infrastructure for 2FA that can be enabled per user
 * Note: This is a foundation - full implementation requires Firebase Phone Auth setup
 */
class TwoFactorAuthService {
  private readonly COLLECTION = "two_factor_settings";

  /**
   * Get 2FA settings for a user
   */
  async getSettings(userId: string): Promise<TwoFactorSettings | null> {
    try {
      const settingsRef = doc(db, this.COLLECTION, userId);
      const settingsDoc = await getDoc(settingsRef);

      if (!settingsDoc.exists()) {
        return null;
      }

      return settingsDoc.data() as TwoFactorSettings;
    } catch (error) {
      console.error("Error getting 2FA settings:", error);
      return null;
    }
  }

  /**
   * Check if 2FA is enabled for a user
   */
  async isEnabled(userId: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return !!(settings?.enabled && settings.verified === true);
  }

  /**
   * Enable 2FA for a user (requires verification)
   */
  async enableTwoFactor(
    userId: string,
    method: "email" | "sms",
    phoneNumber?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const settingsRef = doc(db, this.COLLECTION, userId);

      // Generate a secret (in production, use proper TOTP library)
      const secret = this.generateSecret();

      await setDoc(settingsRef, {
        enabled: true,
        method,
        phoneNumber: phoneNumber || null,
        verified: false, // Requires verification before active
        secret,
        backupCodes: this.generateBackupCodes(),
        createdAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enabling 2FA:", error);
      return { success: false, error: "Failed to enable 2FA" };
    }
  }

  /**
   * Verify 2FA setup
   */
  async verifySetup(
    userId: string,
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const settings = await this.getSettings(userId);
      if (!settings) {
        return { success: false, error: "2FA not enabled" };
      }

      // In production, verify TOTP code against secret
      // For now, accept any 6-digit code as placeholder
      if (code.length === 6 && /^\d+$/.test(code)) {
        const settingsRef = doc(db, this.COLLECTION, userId);
        await updateDoc(settingsRef, {
          verified: true,
          lastUsedAt: Date.now(),
        });
        return { success: true };
      }

      return { success: false, error: "Invalid verification code" };
    } catch (error) {
      console.error("Error verifying 2FA setup:", error);
      return { success: false, error: "Verification failed" };
    }
  }

  /**
   * Verify 2FA during authentication
   */
  async verifyCode(
    userId: string,
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const settings = await this.getSettings(userId);
      if (!settings || !settings.enabled || !settings.verified) {
        // 2FA not required for this user
        return { success: true };
      }

      // In production, verify TOTP code against secret
      // For now, accept any 6-digit code as placeholder
      if (code.length === 6 && /^\d+$/.test(code)) {
        const settingsRef = doc(db, this.COLLECTION, userId);
        await updateDoc(settingsRef, {
          lastUsedAt: Date.now(),
        });
        return { success: true };
      }

      return { success: false, error: "Invalid verification code" };
    } catch (error) {
      console.error("Error verifying 2FA code:", error);
      return { success: false, error: "Verification failed" };
    }
  }

  /**
   * Disable 2FA for a user
   */
  async disableTwoFactor(
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const settingsRef = doc(db, this.COLLECTION, userId);
      await updateDoc(settingsRef, {
        enabled: false,
        verified: false,
      });
      return { success: true };
    } catch (error) {
      console.error("Error disabling 2FA:", error);
      return { success: false, error: "Failed to disable 2FA" };
    }
  }

  /**
   * Generate a secret for TOTP (placeholder - use proper TOTP library in production)
   */
  private generateSecret(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Generate backup codes (placeholder - use proper implementation in production)
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(4));
      const code = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()
        .substring(0, 8);
      codes.push(code);
    }
    return codes;
  }

  /**
   * Check if 2FA is required for a sensitive operation
   */
  async isRequiredForOperation(
    userId: string,
    operation: string,
  ): Promise<boolean> {
    // 2FA is optional by default - can be enforced per operation
    const settings = await this.getSettings(userId);
    if (!settings?.enabled || !settings.verified) {
      return false;
    }

    // Define operations that require 2FA
    const sensitiveOperations = [
      "change_password",
      "change_email",
      "delete_account",
      "export_data",
    ];

    return sensitiveOperations.includes(operation);
  }
}

// Singleton instance
export const twoFactorAuthService = new TwoFactorAuthService();
