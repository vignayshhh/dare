/**
 * Session Storage Utility
 *
 * SECURITY FIX: Removed false encryption wrapper.
 *
 * Previous implementation stored AES-GCM encryption key in sessionStorage
 * alongside ciphertext, providing zero actual security against XSS attacks.
 * Any XSS that could read sessionStorage could also read the key.
 *
 * This module now provides a simple, transparent sessionStorage wrapper
 * with the following security considerations:
 * - SessionStorage is cleared when tab closes (better than localStorage)
 * - Still vulnerable to XSS attacks - treat all stored data as non-sensitive
 * - Do NOT store long-lived secrets, API keys, or sensitive PII
 * - Use only for short-lived UI state (drafts, UI preferences, etc.)
 *
 * For sensitive session data, use:
 * - Firebase Auth session (HttpOnly cookies managed by Firebase)
 * - Server-side session storage via Cloud Functions
 * - Short-lived tokens with server validation
 */

/**
 * Simple session storage wrapper with error handling
 * Provides consistent interface for sessionStorage operations
 */
export const secureSessionStorage = {
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.setItem(key, value);
      }
    } catch (error) {
      // Quota exceeded or other storage error
      console.error("SessionStorage set error:", error);
    }
  },

  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return sessionStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.error("SessionStorage get error:", error);
      return null;
    }
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.error("SessionStorage remove error:", error);
    }
  },

  clear(): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.clear();
      }
    } catch (error) {
      console.error("SessionStorage clear error:", error);
    }
  },
};
