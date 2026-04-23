import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";

interface SpamReport {
  userId: string;
  contentType: 'post' | 'comment' | 'message' | 'dare' | 'truth';
  content: string;
  timestamp: number;
  isSpam: boolean;
  reason: string;
  score: number;
}

interface UserReputation {
  userId: string;
  score: number;
  reports: number;
  lastActivity: number;
  flags: string[];
}

/**
 * Spam Detection Service
 * Detects and prevents spam through content analysis, rate limiting, and reputation tracking
 */
class SpamDetectionService {
  private readonly COLLECTION = "spam_reports";
  private readonly REPUTATION_COLLECTION = "user_reputation";
  
  private readonly LINK_PATTERN = /https?:\/\/[^\s]+/gi;
  private readonly REPEATIVE_CHAR_PATTERN = /(.)\1{5,}/g;
  private readonly ALL_CAPS_PATTERN = /^[A-Z\s!?.,]{10,}$/;
  
  // Spam keywords
  private readonly SPAM_KEYWORDS = [
    'buy now', 'click here', 'free money', 'win prize', 'limited time',
    'act now', 'don\'t miss', 'exclusive offer', 'guaranteed',
    'make money', 'work from home', 'crypto investment', 'forex',
    'viagra', 'casino', 'poker', 'lottery', 'winner',
  ];

  /**
   * Analyze content for spam indicators
   */
  analyzeContent(content: string, contentType: string): { isSpam: boolean; score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Check for excessive links
    const links = content.match(this.LINK_PATTERN);
    if (links && links.length > 3) {
      score += 30;
      reasons.push(`Too many links (${links.length})`);
    }

    // Check for repetitive characters
    if (this.REPEATIVE_CHAR_PATTERN.test(content)) {
      score += 20;
      reasons.push('Repetitive characters detected');
    }

    // Check for all caps (except short messages)
    if (content.length > 20 && this.ALL_CAPS_PATTERN.test(content)) {
      score += 10;
      reasons.push('All caps message');
    }

    // Check for spam keywords
    const lowerContent = content.toLowerCase();
    for (const keyword of this.SPAM_KEYWORDS) {
      if (lowerContent.includes(keyword)) {
        score += 25;
        reasons.push(`Spam keyword: "${keyword}"`);
      }
    }

    // Check for excessive repetition of the same content
    const wordCount = content.split(/\s+/).length;
    const uniqueWords = new Set(content.toLowerCase().split(/\s+/)).size;
    if (wordCount > 10 && uniqueWords / wordCount < 0.3) {
      score += 15;
      reasons.push('Low content uniqueness');
    }

    // Check for suspicious patterns (e.g., phone numbers, emails in content)
    if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(content)) {
      score += 15;
      reasons.push('Phone number detected');
    }

    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content)) {
      score += 10;
      reasons.push('Email address detected');
    }

    // Determine if spam based on score threshold
    const isSpam = score >= 50;

    return { isSpam, score, reasons };
  }

  /**
   * Report spam content
   */
  async reportSpam(userId: string, contentType: 'post' | 'comment' | 'message' | 'dare' | 'truth', content: string): Promise<void> {
    try {
      const analysis = this.analyzeContent(content, contentType);
      
      const report: SpamReport = {
        userId,
        contentType,
        content: content.substring(0, 500), // Truncate for storage
        timestamp: Date.now(),
        isSpam: analysis.isSpam,
        reason: analysis.reasons.join(', '),
        score: analysis.score,
      };

      const reportRef = doc(collection(db, this.COLLECTION));
      await setDoc(reportRef, report);

      // Update user reputation if spam detected
      if (analysis.isSpam) {
        await this.updateUserReputation(userId, -10);
      }

      console.log(`🚫 Spam report: ${contentType} by ${userId}, score: ${analysis.score}`);
    } catch (error) {
      console.error("Error reporting spam:", error);
    }
  }

  /**
   * Get user reputation
   */
  async getUserReputation(userId: string): Promise<UserReputation | null> {
    try {
      const reputationRef = doc(db, this.REPUTATION_COLLECTION, userId);
      const reputationDoc = await getDoc(reputationRef);

      if (!reputationDoc.exists()) {
        // Create default reputation for new users
        const defaultReputation: UserReputation = {
          userId,
          score: 100, // Start with good reputation
          reports: 0,
          lastActivity: Date.now(),
          flags: [],
        };
        await setDoc(reputationRef, defaultReputation);
        return defaultReputation;
      }

      return reputationDoc.data() as UserReputation;
    } catch (error) {
      console.error("Error getting user reputation:", error);
      return null;
    }
  }

  /**
   * Update user reputation
   */
  async updateUserReputation(userId: string, delta: number, flag?: string): Promise<void> {
    try {
      const reputation = await this.getUserReputation(userId);
      if (!reputation) return;

      const updateData: any = {
        score: Math.max(0, Math.min(100, reputation.score + delta)),
        lastActivity: Date.now(),
      };

      if (delta < 0) {
        updateData.reports = (reputation.reports || 0) + 1;
      }

      if (flag && !reputation.flags.includes(flag)) {
        updateData.flags = [...reputation.flags, flag];
      }

      const reputationRef = doc(db, this.REPUTATION_COLLECTION, userId);
      await updateDoc(reputationRef, updateData);
    } catch (error) {
      console.error("Error updating user reputation:", error);
    }
  }

  /**
   * Check if user is allowed to post based on reputation
   */
  async canUserPost(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const reputation = await this.getUserReputation(userId);
      if (!reputation) return { allowed: true };

      // Block users with very low reputation
      if (reputation.score < 20) {
        return { allowed: false, reason: 'Reputation too low' };
      }

      // Block users with too many recent spam reports
      if (reputation.reports > 10) {
        return { allowed: false, reason: 'Too many spam reports' };
      }

      return { allowed: true };
    } catch (error) {
      console.error("Error checking user posting permission:", error);
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Rate limit by content type per user
   */
  async checkContentRateLimit(userId: string, contentType: string, maxPosts: number = 10, windowMs: number = 60000): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const key = `${userId}_${contentType}`;
      const rateLimitRef = doc(db, "content_rate_limits", key);
      const rateLimitDoc = await getDoc(rateLimitRef);

      const now = Date.now();

      if (!rateLimitDoc.exists()) {
        await setDoc(rateLimitRef, {
          count: 1,
          windowStart: now,
          lastReset: now,
        });
        return { allowed: true, remaining: maxPosts - 1 };
      }

      const data = rateLimitDoc.data() as any;
      const windowStart = data.windowStart || now;

      // Reset if window expired
      if (now - windowStart > windowMs) {
        await updateDoc(rateLimitRef, {
          count: 1,
          windowStart: now,
          lastReset: now,
        });
        return { allowed: true, remaining: maxPosts - 1 };
      }

      // Check limit
      if (data.count >= maxPosts) {
        const resetTime = windowStart + windowMs;
        const remainingMs = resetTime - now;
        return { allowed: false, remaining: 0 };
      }

      // Increment count
      await updateDoc(rateLimitRef, {
        count: data.count + 1,
      });

      return { allowed: true, remaining: maxPosts - data.count - 1 };
    } catch (error) {
      console.error("Error checking content rate limit:", error);
      return { allowed: true, remaining: maxPosts }; // Fail open
    }
  }

  /**
   * Check for repetitive content from same user
   */
  async checkRepetitiveContent(userId: string, content: string, threshold: number = 3): Promise<boolean> {
    try {
      // Get recent content from the same user
      const reportsRef = collection(db, this.COLLECTION);
      const queryRef = query(
        reportsRef,
        where('userId', '==', userId),
        where('timestamp', '>', Date.now() - 3600000) // Last hour
      );
      const snapshot = await getDocs(queryRef);

      let matchCount = 0;
      const normalizedContent = content.toLowerCase().trim();

      for (const doc of snapshot.docs) {
        const report = doc.data() as SpamReport;
        const normalizedReportContent = report.content.toLowerCase().trim();
        
        // Check for similarity (simple string comparison)
        if (normalizedReportContent === normalizedContent ||
            normalizedReportContent.includes(normalizedContent) ||
            normalizedContent.includes(normalizedReportContent)) {
          matchCount++;
        }
      }

      return matchCount >= threshold;
    } catch (error) {
      console.error("Error checking repetitive content:", error);
      return false;
    }
  }

  /**
   * Get spam statistics for a user
   */
  async getUserSpamStats(userId: string): Promise<{ totalReports: number; spamCount: number; recentActivity: number }> {
    try {
      const reportsRef = collection(db, this.COLLECTION);
      const queryRef = query(
        reportsRef,
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(queryRef);

      const now = Date.now();
      let spamCount = 0;
      let recentActivity = 0;

      for (const doc of snapshot.docs) {
        const report = doc.data() as SpamReport;
        if (report.isSpam) spamCount++;
        if (now - report.timestamp < 86400000) recentActivity++; // Last 24 hours
      }

      return {
        totalReports: snapshot.size,
        spamCount,
        recentActivity,
      };
    } catch (error) {
      console.error("Error getting user spam stats:", error);
      return { totalReports: 0, spamCount: 0, recentActivity: 0 };
    }
  }
}

// Singleton instance
export const spamDetectionService = new SpamDetectionService();
