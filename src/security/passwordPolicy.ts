import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventPersonalInfo: boolean;
  maxHistory: number;
  expiryDays: number;
}

interface PasswordHistory {
  userId: string;
  passwords: Array<{
    hash: string;
    createdAt: number;
  }>;
  lastChanged: number;
  requiresChange: boolean;
}

interface PasswordStrength {
  score: number;
  level: 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
  feedback: string[];
  suggestions: string[];
}

/**
 * Password Policy Enforcement Service
 * Enforces strong password policies and tracks password history
 */
class PasswordPolicyService {
  private readonly HISTORY_COLLECTION = "password_history";
  
  private readonly DEFAULT_POLICY: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventCommonPasswords: true,
    preventPersonalInfo: true,
    maxHistory: 5,
    expiryDays: 90,
  };

  private readonly COMMON_PASSWORDS = [
    'password', '123456', '12345678', 'qwerty', 'abc123',
    'password123', 'admin', 'welcome', 'monkey', 'letmein',
    'dragon', 'master', 'hello', 'football', 'shadow',
    'sunshine', 'princess', 'password1', '123456789',
  ];

  /**
   * Get current password policy
   */
  getPolicy(): PasswordPolicy {
    return { ...this.DEFAULT_POLICY };
  }

  /**
   * Validate password against policy
   */
  validatePassword(password: string, userInfo?: { email?: string; username?: string }): { valid: boolean; errors: string[] } {
    const policy = this.getPolicy();
    const errors: string[] = [];

    // Check minimum length
    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters`);
    }

    // Check uppercase
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Check lowercase
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Check numbers
    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Check special characters
    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check common passwords
    if (policy.preventCommonPasswords) {
      const lowerPassword = password.toLowerCase();
      for (const commonPwd of this.COMMON_PASSWORDS) {
        if (lowerPassword.includes(commonPwd)) {
          errors.push('Password contains a common pattern');
          break;
        }
      }
    }

    // Check personal information
    if (policy.preventPersonalInfo && userInfo) {
      const lowerPassword = password.toLowerCase();
      if (userInfo.email && lowerPassword.includes(userInfo.email.split('@')[0].toLowerCase())) {
        errors.push('Password should not contain your email');
      }
      if (userInfo.username && lowerPassword.includes(userInfo.username.toLowerCase())) {
        errors.push('Password should not contain your username');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate password strength
   */
  calculateStrength(password: string): PasswordStrength {
    let score = 0;
    const feedback: string[] = [];
    const suggestions: string[] = [];

    // Length score
    if (password.length >= 8) score += 10;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;

    // Character variety
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/\d/.test(password)) score += 10;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 15;

    // Complexity
    const uniqueChars = new Set(password.split('')).size;
    if (uniqueChars >= password.length * 0.7) score += 10;

    // Patterns
    if (!/(.)\1{2,}/.test(password)) score += 10; // No repeated characters
    if (!/123|abc|qwe/i.test(password)) score += 5; // No sequential patterns

    // Cap score at 100
    score = Math.min(100, score);

    // Determine level
    let level: PasswordStrength['level'];
    if (score < 30) level = 'weak';
    else if (score < 50) level = 'fair';
    else if (score < 70) level = 'good';
    else if (score < 90) level = 'strong';
    else level = 'very-strong';

    // Generate feedback
    if (password.length < 8) feedback.push('Password is too short');
    if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/\d/.test(password)) feedback.push('Add numbers');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) feedback.push('Add special characters');
    if (/(.)\1{2,}/.test(password)) feedback.push('Avoid repeated characters');

    // Generate suggestions
    if (score < 50) {
      suggestions.push('Use a passphrase with multiple words');
      suggestions.push('Mix letters, numbers, and symbols');
    }
    if (score < 70) {
      suggestions.push('Make it longer for better security');
    }

    return { score, level, feedback, suggestions };
  }

  /**
   * Hash password (client-side only for comparison, real hashing should be server-side)
   * Note: This is a simple hash for demonstration - use bcrypt/scrypt in production
   */
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if password is in user's history
   */
  async isPasswordInHistory(userId: string, password: string): Promise<boolean> {
    try {
      const historyRef = doc(db, this.HISTORY_COLLECTION, userId);
      const historyDoc = await getDoc(historyRef);

      if (!historyDoc.exists()) {
        return false;
      }

      const history = historyDoc.data() as PasswordHistory;
      const passwordHash = await this.hashPassword(password);

      return history.passwords.some(p => p.hash === passwordHash);
    } catch (error) {
      console.error("Error checking password history:", error);
      return false;
    }
  }

  /**
   * Record password change
   */
  async recordPasswordChange(userId: string, password: string): Promise<void> {
    try {
      const historyRef = doc(db, this.HISTORY_COLLECTION, userId);
      const historyDoc = await getDoc(historyRef);

      const passwordHash = await this.hashPassword(password);
      const policy = this.getPolicy();
      const now = Date.now();

      if (!historyDoc.exists()) {
        await setDoc(historyRef, {
          userId,
          passwords: [{ hash: passwordHash, createdAt: now }],
          lastChanged: now,
          requiresChange: false,
        });
        return;
      }

      const history = historyDoc.data() as PasswordHistory;
      const passwords = history.passwords || [];

      // Add new password to history
      passwords.push({ hash: passwordHash, createdAt: now });

      // Keep only last N passwords
      if (passwords.length > policy.maxHistory) {
        passwords.splice(0, passwords.length - policy.maxHistory);
      }

      await updateDoc(historyRef, {
        passwords,
        lastChanged: now,
        requiresChange: false,
      });

      console.log(`🔐 Password changed for user ${userId}`);
    } catch (error) {
      console.error("Error recording password change:", error);
    }
  }

  /**
   * Check if password change is required
   */
  async isPasswordChangeRequired(userId: string): Promise<{ required: boolean; reason?: string }> {
    try {
      const historyRef = doc(db, this.HISTORY_COLLECTION, userId);
      const historyDoc = await getDoc(historyRef);

      if (!historyDoc.exists()) {
        return { required: false };
      }

      const history = historyDoc.data() as PasswordHistory;
      const policy = this.getPolicy();

      // Check if explicitly required
      if (history.requiresChange) {
        return { required: true, reason: 'Password change requested by admin' };
      }

      // Check if password has expired
      if (policy.expiryDays > 0 && history.lastChanged) {
        const expiryTime = history.lastChanged + (policy.expiryDays * 24 * 60 * 60 * 1000);
        if (Date.now() > expiryTime) {
          return { required: true, reason: 'Password has expired' };
        }
      }

      return { required: false };
    } catch (error) {
      console.error("Error checking password change requirement:", error);
      return { required: false };
    }
  }

  /**
   * Force password change for user
   */
  async forcePasswordChange(userId: string): Promise<void> {
    try {
      const historyRef = doc(db, this.HISTORY_COLLECTION, userId);
      const historyDoc = await getDoc(historyRef);

      if (!historyDoc.exists()) {
        await setDoc(historyRef, {
          userId,
          passwords: [],
          lastChanged: 0,
          requiresChange: true,
        });
      } else {
        await updateDoc(historyRef, {
          requiresChange: true,
        });
      }

      console.log(`🔐 Password change forced for user ${userId}`);
    } catch (error) {
      console.error("Error forcing password change:", error);
    }
  }

  /**
   * Get password history for user
   */
  async getPasswordHistory(userId: string): Promise<{ lastChanged: number; changeCount: number }> {
    try {
      const historyRef = doc(db, this.HISTORY_COLLECTION, userId);
      const historyDoc = await getDoc(historyRef);

      if (!historyDoc.exists()) {
        return { lastChanged: 0, changeCount: 0 };
      }

      const history = historyDoc.data() as PasswordHistory;
      return {
        lastChanged: history.lastChanged || 0,
        changeCount: history.passwords?.length || 0,
      };
    } catch (error) {
      console.error("Error getting password history:", error);
      return { lastChanged: 0, changeCount: 0 };
    }
  }
}

// Singleton instance
export const passwordPolicyService = new PasswordPolicyService();
