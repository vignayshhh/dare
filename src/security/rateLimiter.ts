import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "@/backend/lib/firebase";

/**
 * Firestore-based rate limiting utility
 * Provides server-side rate limiting without Cloud Functions
 */

interface RateLimitData {
  attempts: number[];
  last_updated: Date;
  user_id: string;
}

/**
 * Check if the user is under the rate limit for a specific action
 * @param action - The action being rate limited (e.g., 'profile_update', 'auth_attempt')
 * @param maxAttempts - Maximum number of attempts allowed within the window
 * @param windowMs - Time window in milliseconds
 * @param identifier - Optional identifier for rate limiting (defaults to user ID, can be email for sign up)
 * @throws Error if rate limit is exceeded
 */
export async function checkRateLimit(
  action: string,
  maxAttempts: number,
  windowMs: number = 15 * 60 * 1000, // Default 15 minutes
  identifier?: string,
): Promise<void> {
  const userId = auth.currentUser?.uid;
  const rateLimitId = identifier || userId;

  if (!rateLimitId) {
    // Skip rate limiting if no identifier available (e.g., during sign up before auth)
    // Rely on Firebase Auth's built-in rate limiting instead
    if (process.env.NODE_ENV === "development") {
      console.log("⚠️ Rate limiting skipped - no identifier available");
    }
    return;
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const rateLimitRef = doc(db, "rate_limits", `${rateLimitId}_${action}`);

  try {
    const snap = await getDoc(rateLimitRef);

    if (snap.exists()) {
      const data = snap.data() as RateLimitData;

      // Clean old entries (attempts outside the time window)
      const recentAttempts = (data.attempts || []).filter(
        (t: number) => t > windowStart,
      );

      if (recentAttempts.length >= maxAttempts) {
        const oldestAttempt = Math.min(...recentAttempts);
        const retryAfter = Math.ceil((oldestAttempt + windowMs - now) / 1000);
        throw new Error(
          `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        );
      }

      // Add new attempt
      recentAttempts.push(now);
      await updateDoc(rateLimitRef, {
        attempts: recentAttempts,
        last_updated: serverTimestamp(),
      });
    } else {
      // First attempt - create new rate limit document
      await setDoc(rateLimitRef, {
        attempts: [now],
        last_updated: serverTimestamp(),
        user_id: userId,
      });
    }
  } catch (error: any) {
    if (error.message.includes("Rate limit exceeded")) {
      throw error; // Re-throw rate limit errors
    }
    console.error("Rate limit check failed:", error);
    // Fail closed in production - block if rate limit service is down
    // Fail open in development only for testing
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Rate limit service unavailable. Please try again later.",
      );
    }
    // Fail open in development
  }
}

/**
 * Clear rate limit for a specific action (for testing or admin use)
 * @param action - The action to clear
 */
export async function clearRateLimit(action: string): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error("Authentication required");
  }

  const rateLimitRef = doc(db, "rate_limits", `${userId}_${action}`);
  try {
    await updateDoc(rateLimitRef, {
      attempts: [],
      last_updated: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to clear rate limit:", error);
  }
}

/**
 * Get current rate limit status for an action
 * @param action - The action to check
 * @returns Object with remaining attempts and reset time
 */
export async function getRateLimitStatus(
  action: string,
  maxAttempts: number,
  windowMs: number = 15 * 60 * 1000,
): Promise<{ remaining: number; resetAt: number | null }> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return { remaining: maxAttempts, resetAt: null };
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const rateLimitRef = doc(db, "rate_limits", `${userId}_${action}`);

  try {
    const snap = await getDoc(rateLimitRef);
    if (snap.exists()) {
      const data = snap.data() as RateLimitData;
      const recentAttempts = (data.attempts || []).filter(
        (t: number) => t > windowStart,
      );
      const remaining = Math.max(0, maxAttempts - recentAttempts.length);

      if (recentAttempts.length > 0) {
        const oldestAttempt = Math.min(...recentAttempts);
        const resetAt = oldestAttempt + windowMs;
        return { remaining, resetAt };
      }
    }
  } catch (error) {
    console.error("Failed to get rate limit status:", error);
  }

  return { remaining: maxAttempts, resetAt: null };
}
