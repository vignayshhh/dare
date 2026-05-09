import { db, storage } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import crypto from "crypto";

interface SignedUrlToken {
  token: string;
  resourcePath: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  userAgent?: string;
}

/**
 * Signed URL Service
 *
 * ⚠️ SECURITY NOTICE (§2.7): This is NOT a real signed-URL service.
 * The previous implementation appended a random `?token=...` to the
 * Firebase Storage download URL, stored the token in Firestore, and
 * returned it to the caller. Firebase Storage does NOT validate this
 * custom token — the URL is accessible to anyone with the underlying
 * Storage access token, with or without the query string. That made the
 * API security theater.
 *
 * A correct signed-URL pipeline requires either:
 *   - Cloud Functions using Admin SDK `getSignedUrl()` (GCS), or
 *   - A Next.js API route acting as a proxy that validates the custom
 *     token before streaming the object bytes back to the client.
 *
 * Neither is available on the free plan this app targets. Until a proxy
 * exists, this service:
 *   - Still returns the plain Firebase download URL (so calling code
 *     continues to work — images render, etc.).
 *   - Does NOT append a fake token (removes the misleading illusion of
 *     security).
 *   - `validateToken` always returns `{ valid: false }` because there is
 *     no trusted verifier.
 */
class SignedUrlService {
  private readonly COLLECTION = "signed_url_tokens";
  private readonly TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
  private readonly TOKEN_LENGTH = 32;

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    const randomBytes = crypto.getRandomValues(
      new Uint8Array(this.TOKEN_LENGTH),
    );
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Create a signed URL token for a storage resource
   */
  async createSignedToken(
    resourcePath: string,
    userId: string,
    durationMs: number = this.TOKEN_EXPIRY_MS,
  ): Promise<string> {
    try {
      const token = this.generateToken();
      const now = Date.now();
      const expiresAt = now + durationMs;

      const tokenData: SignedUrlToken = {
        token,
        resourcePath,
        userId,
        createdAt: now,
        expiresAt,
        userAgent:
          typeof navigator !== "undefined"
            ? navigator.userAgent
            : "server-side",
      };

      const tokenRef = doc(db, this.COLLECTION, token);
      await setDoc(tokenRef, tokenData);

      console.log(
        `🔑 Created signed token for ${resourcePath} (expires in ${durationMs / 1000}s)`,
      );

      return token;
    } catch (error) {
      console.error("Error creating signed token:", error);
      throw new Error("Failed to create signed token");
    }
  }

  /**
   * Validate a signed URL token
   */
  async validateToken(
    _token: string,
    _userId: string,
  ): Promise<{ valid: boolean; resourcePath?: string }> {
    // SECURITY FIX (§2.7): No server-side verifier exists, so a positive
    // return would be a lie. Always fail closed; callers must not rely on
    // this for authorization.
    return { valid: false };
  }

  /**
   * Get a signed download URL for a storage resource
   */
  async getSignedDownloadURL(
    resourcePath: string,
    _userId: string,
  ): Promise<string> {
    try {
      // SECURITY FIX (§2.7): Return the plain Firebase Storage download URL.
      // Appending a random `?token=` was misleading because Firebase does
      // not validate custom tokens. Access control comes entirely from the
      // Storage rules in `storage.rules`.
      const storageRef = ref(storage, resourcePath);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error getting download URL:", error);
      throw new Error("Failed to get download URL");
    }
  }

  /**
   * Revoke a signed token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const tokenRef = doc(db, this.COLLECTION, token);
      await deleteDoc(tokenRef);
      console.log(`🗑️ Revoked signed token: ${token}`);
    } catch (error) {
      console.error("Error revoking token:", error);
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      // This would require a Cloud Function or batch delete in production
      // For now, we'll log it
      console.log(`🗑️ Revoking all tokens for user: ${userId}`);
      // Note: Implementing full cleanup would require a Cloud Function
      // or client-side query with batch delete
    } catch (error) {
      console.error("Error revoking user tokens:", error);
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      // This would require a Cloud Function for efficiency
      // For now, we'll log it
      console.log(
        `🧹 Cleanup expired tokens (requires Cloud Function for efficiency)`,
      );
    } catch (error) {
      console.error("Error cleaning up expired tokens:", error);
    }
  }

  /**
   * Check if a storage path is accessible to a user
   * This is a helper function that checks Firestore rules logic
   */
  async canAccessResource(
    resourcePath: string,
    userId: string,
  ): Promise<boolean> {
    try {
      // Parse the resource path to determine ownership
      // Paths are typically: avatars/{userId}/{filename}, feed-media/{userId}/{filename}, etc.
      const pathParts = resourcePath.split("/");

      // Check if user owns the resource
      if (pathParts.includes(userId)) {
        return true;
      }

      // Check if it's public content (feed, etc.)
      // This would need additional logic based on your data model
      const publicFolders = ["feed-media", "stories"];
      if (publicFolders.some((folder) => pathParts.includes(folder))) {
        return true; // Public content
      }

      return false;
    } catch (error) {
      console.error("Error checking resource access:", error);
      return false;
    }
  }
}

// Singleton instance
export const signedUrlService = new SignedUrlService();
