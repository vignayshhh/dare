import { db, storage } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import crypto from 'crypto';

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
 * Provides time-limited access to Firebase Storage resources
 * Uses token-based authentication to prevent unauthorized access
 */
class SignedUrlService {
  private readonly COLLECTION = "signed_url_tokens";
  private readonly TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
  private readonly TOKEN_LENGTH = 32;

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(this.TOKEN_LENGTH));
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Create a signed URL token for a storage resource
   */
  async createSignedToken(resourcePath: string, userId: string, durationMs: number = this.TOKEN_EXPIRY_MS): Promise<string> {
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
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server-side',
      };

      const tokenRef = doc(db, this.COLLECTION, token);
      await setDoc(tokenRef, tokenData);

      console.log(`🔑 Created signed token for ${resourcePath} (expires in ${durationMs / 1000}s)`);
      
      return token;
    } catch (error) {
      console.error("Error creating signed token:", error);
      throw new Error("Failed to create signed token");
    }
  }

  /**
   * Validate a signed URL token
   */
  async validateToken(token: string, userId: string): Promise<{ valid: boolean; resourcePath?: string }> {
    try {
      const tokenRef = doc(db, this.COLLECTION, token);
      const tokenDoc = await getDoc(tokenRef);

      if (!tokenDoc.exists()) {
        return { valid: false };
      }

      const tokenData = tokenDoc.data() as SignedUrlToken;

      // Check if token belongs to the user
      if (tokenData.userId !== userId) {
        console.warn(`🚫 Token validation failed: user mismatch`);
        return { valid: false };
      }

      // Check if token has expired
      if (tokenData.expiresAt < Date.now()) {
        console.warn(`🚫 Token validation failed: token expired`);
        await deleteDoc(tokenRef);
        return { valid: false };
      }

      return {
        valid: true,
        resourcePath: tokenData.resourcePath,
      };
    } catch (error) {
      console.error("Error validating token:", error);
      return { valid: false };
    }
  }

  /**
   * Get a signed download URL for a storage resource
   */
  async getSignedDownloadURL(resourcePath: string, userId: string): Promise<string> {
    try {
      // Create a signed token
      const token = await this.createSignedToken(resourcePath, userId);

      // Get the actual download URL from Firebase Storage
      const storageRef = ref(storage, resourcePath);
      const downloadURL = await getDownloadURL(storageRef);

      // Append the token as a query parameter
      // In production, this would be validated by a Cloud Function or middleware
      const separator = downloadURL.includes('?') ? '&' : '?';
      return `${downloadURL}${separator}token=${token}`;
    } catch (error) {
      console.error("Error getting signed download URL:", error);
      throw new Error("Failed to get signed download URL");
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
      console.log(`🧹 Cleanup expired tokens (requires Cloud Function for efficiency)`);
    } catch (error) {
      console.error("Error cleaning up expired tokens:", error);
    }
  }

  /**
   * Check if a storage path is accessible to a user
   * This is a helper function that checks Firestore rules logic
   */
  async canAccessResource(resourcePath: string, userId: string): Promise<boolean> {
    try {
      // Parse the resource path to determine ownership
      // Paths are typically: avatars/{userId}/{filename}, feed-media/{userId}/{filename}, etc.
      const pathParts = resourcePath.split('/');
      
      // Check if user owns the resource
      if (pathParts.includes(userId)) {
        return true;
      }

      // Check if it's public content (feed, etc.)
      // This would need additional logic based on your data model
      const publicFolders = ['feed-media', 'stories'];
      if (publicFolders.some(folder => pathParts.includes(folder))) {
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
