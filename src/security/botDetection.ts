import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";

interface BotSignal {
  userId: string;
  timestamp: number;
  signalType:
    | "rapid_requests"
    | "suspicious_timing"
    | "unnatural_patterns"
    | "failed_auth"
    | "honeypot_trigger";
  details: any;
}

interface BotProfile {
  userId: string;
  botScore: number;
  signals: number;
  lastSignal: number;
  isFlagged: boolean;
  flaggedAt?: number;
}

interface UserBehavior {
  userId: string;
  requestCount: number;
  firstSeen: number;
  lastSeen: number;
  actions: Array<{
    action: string;
    timestamp: number;
  }>;
}

/**
 * Bot Detection Service
 * Detects automated/bot behavior through behavioral analysis and heuristics
 */
class BotDetectionService {
  private readonly SIGNALS_COLLECTION = "bot_signals";
  private readonly PROFILES_COLLECTION = "bot_profiles";
  private readonly BEHAVIOR_COLLECTION = "user_behavior";

  private readonly SIGNAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_REQUESTS_PER_WINDOW = 100;
  private readonly BOT_SCORE_THRESHOLD = 70;

  /**
   * Record a user action for behavioral analysis
   */
  async recordAction(userId: string, action: string): Promise<void> {
    try {
      const behaviorRef = doc(db, this.BEHAVIOR_COLLECTION, userId);
      const behaviorDoc = await getDoc(behaviorRef);

      const now = Date.now();

      if (!behaviorDoc.exists()) {
        await setDoc(behaviorRef, {
          userId,
          requestCount: 1,
          firstSeen: now,
          lastSeen: now,
          actions: [{ action, timestamp: now }],
        });
        return;
      }

      const behavior = behaviorDoc.data() as UserBehavior;
      const actions = behavior.actions || [];

      // Keep only last 100 actions to prevent bloat
      if (actions.length >= 100) {
        actions.shift();
      }
      actions.push({ action, timestamp: now });

      await updateDoc(behaviorRef, {
        requestCount: behavior.requestCount + 1,
        lastSeen: now,
        actions,
      });
    } catch (error) {
      console.error("Error recording user action:", error);
    }
  }

  /**
   * Analyze user behavior for bot patterns
   */
  async analyzeBehavior(
    userId: string,
  ): Promise<{ isBot: boolean; score: number; reasons: string[] }> {
    try {
      const behaviorRef = doc(db, this.BEHAVIOR_COLLECTION, userId);
      const behaviorDoc = await getDoc(behaviorRef);

      if (!behaviorDoc.exists()) {
        return { isBot: false, score: 0, reasons: [] };
      }

      const behavior = behaviorDoc.data() as UserBehavior;
      const reasons: string[] = [];
      let score = 0;

      const now = Date.now();
      const recentActions = (behavior.actions || []).filter(
        (a) => now - a.timestamp < this.SIGNAL_WINDOW_MS,
      );

      // Check for rapid requests
      if (recentActions.length > this.MAX_REQUESTS_PER_WINDOW) {
        score += 40;
        reasons.push(
          `Rapid requests: ${recentActions.length} in ${this.SIGNAL_WINDOW_MS / 1000}s`,
        );
        await this.recordSignal(userId, "rapid_requests", {
          count: recentActions.length,
        });
      }

      // Check for suspicious timing (requests at exact intervals)
      if (recentActions.length > 5) {
        const intervals = [];
        for (let i = 1; i < recentActions.length; i++) {
          intervals.push(
            recentActions[i].timestamp - recentActions[i - 1].timestamp,
          );
        }

        // Check if all intervals are the same (or very close)
        const uniqueIntervals = new Set(
          intervals.map((i) => Math.round(i / 100) * 100),
        );
        if (uniqueIntervals.size === 1 && intervals.length > 5) {
          score += 30;
          reasons.push("Exact timing intervals detected");
          await this.recordSignal(userId, "suspicious_timing", { intervals });
        }
      }

      // Check for unnatural patterns (same action repeated)
      const actionCounts = new Map<string, number>();
      for (const action of recentActions) {
        actionCounts.set(
          action.action,
          (actionCounts.get(action.action) || 0) + 1,
        );
      }

      for (const [action, count] of actionCounts) {
        if (count > 20) {
          score += 20;
          reasons.push(`Repetitive action: "${action}" ${count} times`);
          await this.recordSignal(userId, "unnatural_patterns", {
            action,
            count,
          });
        }
      }

      // Check for 24/7 activity (no sleep pattern)
      const dayMs = 24 * 60 * 60 * 1000;
      if (behavior.lastSeen - behavior.firstSeen > dayMs * 7) {
        // User has been active for more than a week
        // Check if they've been active during typical sleep hours
        const sleepActions = (behavior.actions || []).filter((a) => {
          const hour = new Date(a.timestamp).getHours();
          return hour >= 2 && hour <= 5; // 2 AM to 5 AM
        });

        if (sleepActions.length > 20) {
          score += 15;
          reasons.push("Activity during unusual hours");
        }
      }

      const isBot = score >= this.BOT_SCORE_THRESHOLD;
      return { isBot, score, reasons };
    } catch (error) {
      console.error("Error analyzing user behavior:", error);
      return { isBot: false, score: 0, reasons: [] };
    }
  }

  /**
   * Record a bot signal
   */
  async recordSignal(
    userId: string,
    signalType: BotSignal["signalType"],
    details: any,
  ): Promise<void> {
    try {
      const signal: BotSignal = {
        userId,
        timestamp: Date.now(),
        signalType,
        details,
      };

      const signalRef = doc(collection(db, this.SIGNALS_COLLECTION));
      await setDoc(signalRef, signal);

      // Update bot profile
      await this.updateBotProfile(userId, signalType);
    } catch (error) {
      console.error("Error recording bot signal:", error);
    }
  }

  /**
   * Update bot profile based on signals
   */
  async updateBotProfile(
    userId: string,
    signalType: BotSignal["signalType"],
  ): Promise<void> {
    try {
      const profileRef = doc(db, this.PROFILES_COLLECTION, userId);
      const profileDoc = await getDoc(profileRef);

      let score = 0;
      let signals = 1;

      if (profileDoc.exists()) {
        const profile = profileDoc.data() as BotProfile;
        score = profile.botScore;
        signals = profile.signals + 1;
      }

      // Increase score based on signal type
      const signalWeights = {
        rapid_requests: 15,
        suspicious_timing: 20,
        unnatural_patterns: 10,
        failed_auth: 25,
        honeypot_trigger: 50,
      };

      score += signalWeights[signalType] || 10;

      const isFlagged = score >= this.BOT_SCORE_THRESHOLD;
      const updateData: any = {
        botScore: score,
        signals,
        lastSignal: Date.now(),
        isFlagged,
      };

      const existingData = profileDoc.exists() ? profileDoc.data() : null;
      if (isFlagged && (!existingData || !existingData.isFlagged)) {
        updateData.flaggedAt = Date.now();
      }

      if (profileDoc.exists()) {
        await updateDoc(profileRef, updateData);
      } else {
        await setDoc(profileRef, {
          userId,
          ...updateData,
        });
      }

      if (isFlagged) {
        console.warn(
          `🤖 Bot detected: ${userId} (score: ${score}, signal: ${signalType})`,
        );
      }
    } catch (error) {
      console.error("Error updating bot profile:", error);
    }
  }

  /**
   * Check if user is flagged as a bot
   */
  async isUserFlagged(userId: string): Promise<boolean> {
    try {
      const profileRef = doc(db, this.PROFILES_COLLECTION, userId);
      const profileDoc = await getDoc(profileRef);

      if (!profileDoc.exists()) {
        return false;
      }

      const profile = profileDoc.data() as BotProfile;
      return profile.isFlagged === true;
    } catch (error) {
      console.error("Error checking bot flag:", error);
      return false;
    }
  }

  /**
   * Get bot profile for a user
   */
  async getBotProfile(userId: string): Promise<BotProfile | null> {
    try {
      const profileRef = doc(db, this.PROFILES_COLLECTION, userId);
      const profileDoc = await getDoc(profileRef);

      if (!profileDoc.exists()) {
        return null;
      }

      return profileDoc.data() as BotProfile;
    } catch (error) {
      console.error("Error getting bot profile:", error);
      return null;
    }
  }

  /**
   * Honeypot field validation
   * Hidden fields that bots might fill but humans won't
   */
  validateHoneypot(honeypotValue: any): boolean {
    // Honeypot should be empty or null for legitimate users
    return (
      honeypotValue === null ||
      honeypotValue === undefined ||
      honeypotValue === ""
    );
  }

  /**
   * Check for Firebase App Check token
   * Note: This requires Firebase App Check to be configured
   */
  async validateAppCheckToken(token: string): Promise<boolean> {
    try {
      // In production, this would validate the token with Firebase App Check
      // For now, we'll do basic validation
      if (!token || typeof token !== "string") {
        return false;
      }

      // Token should be at least 20 characters
      return token.length >= 20;
    } catch (error) {
      console.error("Error validating App Check token:", error);
      return false;
    }
  }

  /**
   * Clean up old signals (maintenance)
   */
  async cleanupOldSignals(
    olderThanMs: number = 7 * 24 * 60 * 60 * 1000,
  ): Promise<void> {
    try {
      const cutoff = Date.now() - olderThanMs;
      const signalsRef = collection(db, this.SIGNALS_COLLECTION);
      const queryRef = query(signalsRef, where("timestamp", "<", cutoff));
      const snapshot = await getDocs(queryRef);

      for (const doc of snapshot.docs) {
        await deleteDoc(doc.ref);
      }

      console.log(`🧹 Cleaned up ${snapshot.size} old bot signals`);
    } catch (error) {
      console.error("Error cleaning up old signals:", error);
    }
  }

  /**
   * Get bot statistics
   */
  async getBotStats(): Promise<{
    totalFlagged: number;
    totalSignals: number;
    recentFlagged: number;
  }> {
    try {
      const profilesRef = collection(db, this.PROFILES_COLLECTION);
      const profilesSnapshot = await getDocs(profilesRef);

      const signalsRef = collection(db, this.SIGNALS_COLLECTION);
      const signalsSnapshot = await getDocs(signalsRef);

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let recentFlagged = 0;

      for (const doc of profilesSnapshot.docs) {
        const profile = doc.data() as BotProfile;
        if (
          profile.isFlagged &&
          profile.flaggedAt &&
          now - profile.flaggedAt < dayMs
        ) {
          recentFlagged++;
        }
      }

      return {
        totalFlagged: profilesSnapshot.size,
        totalSignals: signalsSnapshot.size,
        recentFlagged,
      };
    } catch (error) {
      console.error("Error getting bot stats:", error);
      return { totalFlagged: 0, totalSignals: 0, recentFlagged: 0 };
    }
  }
}

// Singleton instance
export const botDetectionService = new BotDetectionService();
