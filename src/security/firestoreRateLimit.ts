import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetAt?: number;
}

/**
 * Firestore-based rate limiting using free tier
 * This provides distributed rate limiting that cannot be bypassed by clearing browser data
 */
export class FirestoreRateLimiter {
  private collectionName = "rate_limits";

  /**
   * Check if a request is allowed based on rate limit
   * @param key Unique identifier for the rate limit bucket (e.g., user_id, ip_address)
   * @param config Rate limit configuration
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const windowStart = now - config.windowMs;
      const rateLimitRef = doc(db, this.collectionName, key);
      const rateLimitDoc = await getDoc(rateLimitRef);

      if (!rateLimitDoc.exists()) {
        // First request - create rate limit document
        await setDoc(rateLimitRef, {
          count: 1,
          window_start: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
        return {
          allowed: true,
          remainingRequests: config.maxRequests - 1,
          resetAt: now + config.windowMs,
        };
      }

      const data = rateLimitDoc.data();
      const windowStartTime = data.window_start?.toMillis() || windowStart;

      // Check if window has expired
      if (windowStartTime < windowStart) {
        // Reset counter for new window
        await setDoc(rateLimitRef, {
          count: 1,
          window_start: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
        return {
          allowed: true,
          remainingRequests: config.maxRequests - 1,
          resetAt: now + config.windowMs,
        };
      }

      // Check if limit exceeded
      if (data.count >= config.maxRequests) {
        return {
          allowed: false,
          remainingRequests: 0,
          resetAt: windowStartTime + config.windowMs,
        };
      }

      // Increment counter
      await setDoc(
        rateLimitRef,
        {
          count: increment(1),
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );

      return {
        allowed: true,
        remainingRequests: config.maxRequests - data.count - 1,
        resetAt: windowStartTime + config.windowMs,
      };
    } catch (error) {
      console.error("Rate limit check error:", error);
      // Fail closed in production - block if rate limit service is down
      // Fail open in development only for testing
      if (process.env.NODE_ENV === "production") {
        return {
          allowed: false,
          remainingRequests: 0,
          resetAt: Date.now() + 5 * 60 * 1000, // 5 minute cooldown
        };
      }
      // Fail open in development
      return {
        allowed: true,
        remainingRequests: config.maxRequests,
      };
    }
  }

  /**
   * Reset rate limit for a specific key (admin function)
   */
  async resetRateLimit(key: string): Promise<void> {
    try {
      const rateLimitRef = doc(db, this.collectionName, key);
      await setDoc(rateLimitRef, {
        count: 0,
        window_start: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error("Rate limit reset error:", error);
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(
    key: string,
  ): Promise<{ count: number; windowStart: number } | null> {
    try {
      const rateLimitRef = doc(db, this.collectionName, key);
      const rateLimitDoc = await getDoc(rateLimitRef);

      if (!rateLimitDoc.exists()) {
        return null;
      }

      const data = rateLimitDoc.data();
      return {
        count: data.count || 0,
        windowStart: data.window_start?.toMillis() || Date.now(),
      };
    } catch (error) {
      console.error("Rate limit status error:", error);
      return null;
    }
  }
}

// Singleton instance
export const firestoreRateLimiter = new FirestoreRateLimiter();

// Predefined rate limit configurations
export const RATE_LIMITS = {
  AUTH: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 requests per 15 minutes
  PROFILE_UPDATE: { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10 updates per 15 minutes
  POST_CREATE: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 posts per 15 minutes
  COMMENT_CREATE: { maxRequests: 20, windowMs: 15 * 60 * 1000 }, // 20 comments per 15 minutes
  LIKE_ACTION: { maxRequests: 50, windowMs: 15 * 60 * 1000 }, // 50 likes per 15 minutes
  MESSAGE_SEND: { maxRequests: 30, windowMs: 15 * 60 * 1000 }, // 30 messages per 15 minutes
  UPLOAD: { maxRequests: 6, windowMs: 15 * 60 * 1000 }, // 6 uploads per 15 minutes
} as const;
