/**
 * Session Storage Encryption Utility
 * Provides encryption for sensitive data stored in sessionStorage
 * Uses Web Crypto API for secure encryption
 */

class SessionEncryption {
  private algorithm = "AES-GCM";
  private keyLength = 256;

  /**
   * Generate a cryptographic key
   */
  private async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Get or create encryption key stored in sessionStorage (SECURITY: sessionStorage instead of localStorage to reduce XSS exposure)
   */
  private async getKey(): Promise<CryptoKey | null> {
    try {
      const keyData = sessionStorage.getItem("session_encryption_key");

      if (keyData) {
        const keyBuffer = this.base64ToArrayBuffer(keyData);
        return await crypto.subtle.importKey(
          "raw",
          keyBuffer,
          { name: this.algorithm, length: this.keyLength },
          true,
          ["encrypt", "decrypt"],
        );
      }

      // Generate new key
      const key = await this.generateKey();
      const exportedKey = await crypto.subtle.exportKey("raw", key);
      const keyBase64 = this.arrayBufferToBase64(exportedKey);
      sessionStorage.setItem("session_encryption_key", keyBase64);

      return key;
    } catch (error) {
      console.error("Error getting encryption key:", error);
      return null;
    }
  }

  /**
   * Encrypt data
   */
  async encrypt(data: string): Promise<string> {
    try {
      const key = await this.getKey();
      if (!key) {
        // SECURITY: Fail securely - throw error instead of insecure base64 fallback
        throw new Error("Encryption key not available");
      }

      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: this.algorithm, iv },
        key,
        encodedData,
      );

      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return this.arrayBufferToBase64(combined.buffer);
    } catch (error) {
      console.error("Encryption error:", error);
      // SECURITY: Fail securely - throw error instead of insecure base64 fallback
      throw new Error(
        `Failed to encrypt data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getKey();
      if (!key) {
        // SECURITY: Fail securely - throw error instead of insecure base64 fallback
        throw new Error("Encryption key not available");
      }

      const combined = this.base64ToArrayBuffer(encryptedData);
      const combinedArray = new Uint8Array(combined);
      const iv = combinedArray.slice(0, 12);
      const encrypted = combinedArray.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: this.algorithm, iv },
        key,
        encrypted,
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("Decryption error:", error);
      // SECURITY: Fail securely - throw error instead of insecure base64 fallback
      throw new Error(
        `Failed to decrypt data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Clear encryption key (for logout)
   */
  clearKey(): void {
    sessionStorage.removeItem("session_encryption_key");
  }
}

// Singleton instance
export const sessionEncryption = new SessionEncryption();

/**
 * Secure session storage wrapper
 */
export const secureSessionStorage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      const encrypted = await sessionEncryption.encrypt(value);
      sessionStorage.setItem(key, encrypted);
    } catch (error) {
      console.error("Secure session storage set error:", error);
      // SECURITY: Fail securely - throw error instead of storing unencrypted data
      throw new Error(
        `Failed to securely store data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      const encrypted = sessionStorage.getItem(key);
      if (!encrypted) return null;

      const decrypted = await sessionEncryption.decrypt(encrypted);
      return decrypted;
    } catch (error) {
      console.error("Secure session storage get error:", error);
      // SECURITY: Fail securely - return null instead of returning unencrypted data
      return null;
    }
  },

  removeItem(key: string): void {
    sessionStorage.removeItem(key);
  },

  clear(): void {
    sessionStorage.clear();
  },
};
