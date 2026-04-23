import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";

interface BlockedIP {
  ipAddress: string;
  blockedAt: number;
  blockedBy: string; // admin userId
  reason: string;
  expiresAt?: number;
  severity: 'temporary' | 'permanent';
}

interface IPAttempt {
  ipAddress: string;
  attempts: number;
  lastAttempt: number;
  blockedUntil?: number;
}

/**
 * IP-Based Blocking Service
 * Tracks IP addresses for rate limiting and blocking abusive users
 * Note: Client-side IP detection is limited; this service works best with server-side IP detection
 */
class IPBlockingService {
  private readonly COLLECTION = "ip_blocks";
  private readonly ATTEMPTS_COLLECTION = "ip_attempts";
  private readonly MAX_ATTEMPTS = 100;
  private readonly BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Get client IP address (best effort from request headers)
   * Note: This is a placeholder - real IP detection requires server-side implementation
   */
  async getClientIP(): Promise<string> {
    try {
      // In a real implementation, this would come from request headers
      // For client-side, we'll use a device fingerprint as a proxy
      const { deviceFingerprintingService } = await import("./deviceFingerprinting");
      const fingerprint = deviceFingerprintingService.generateFingerprint();
      return fingerprint;
    } catch (error) {
      console.error("Error getting client IP:", error);
      return "unknown";
    }
  }

  /**
   * Check if an IP is blocked
   */
  async isIPBlocked(ipAddress: string): Promise<{ blocked: boolean; reason?: string; expiresAt?: number }> {
    try {
      const blockRef = doc(db, this.COLLECTION, ipAddress);
      const blockDoc = await getDoc(blockRef);

      if (!blockDoc.exists()) {
        return { blocked: false };
      }

      const data = blockDoc.data() as BlockedIP;
      
      // Check if block has expired
      if (data.expiresAt && data.expiresAt < Date.now()) {
        await this.unblockIP(ipAddress);
        return { blocked: false };
      }

      return {
        blocked: true,
        reason: data.reason,
        expiresAt: data.expiresAt,
      };
    } catch (error) {
      console.error("Error checking IP block:", error);
      return { blocked: false };
    }
  }

  /**
   * Record an attempt from an IP
   */
  async recordAttempt(ipAddress: string): Promise<void> {
    try {
      const attemptRef = doc(db, this.ATTEMPTS_COLLECTION, ipAddress);
      const attemptDoc = await getDoc(attemptRef);

      if (!attemptDoc.exists()) {
        await setDoc(attemptRef, {
          ipAddress,
          attempts: 1,
          lastAttempt: Date.now(),
        });
        return;
      }

      const data = attemptDoc.data() as IPAttempt;
      
      // Check if currently blocked
      if (data.blockedUntil && data.blockedUntil > Date.now()) {
        return; // Already blocked
      }

      const newAttempts = data.attempts + 1;
      const now = Date.now();
      const updateData: any = {
        attempts: newAttempts,
        lastAttempt: now,
      };

      // Block if threshold exceeded
      if (newAttempts >= this.MAX_ATTEMPTS) {
        updateData.blockedUntil = now + this.BLOCK_DURATION_MS;
        console.warn(`🚫 IP ${ipAddress} blocked due to excessive attempts`);
      }

      await updateDoc(attemptRef, updateData);
    } catch (error) {
      console.error("Error recording IP attempt:", error);
    }
  }

  /**
   * Block an IP address (admin function)
   */
  async blockIP(ipAddress: string, reason: string, blockedBy: string, durationMs?: number): Promise<void> {
    try {
      const blockRef = doc(db, this.COLLECTION, ipAddress);
      const data: BlockedIP = {
        ipAddress,
        blockedAt: Date.now(),
        blockedBy,
        reason,
        severity: durationMs ? 'temporary' : 'permanent',
      };

      if (durationMs) {
        data.expiresAt = Date.now() + durationMs;
      }

      await setDoc(blockRef, data);
      console.log(`🚫 IP ${ipAddress} blocked: ${reason}`);
    } catch (error) {
      console.error("Error blocking IP:", error);
    }
  }

  /**
   * Unblock an IP address
   */
  async unblockIP(ipAddress: string): Promise<void> {
    try {
      const blockRef = doc(db, this.COLLECTION, ipAddress);
      await updateDoc(blockRef, {
        expiresAt: Date.now(), // Expire immediately
      });
      console.log(`✅ IP ${ipAddress} unblocked`);
    } catch (error) {
      console.error("Error unblocking IP:", error);
    }
  }

  /**
   * Get all blocked IPs (admin function)
   */
  async getBlockedIPs(): Promise<BlockedIP[]> {
    try {
      const blocksRef = collection(db, this.COLLECTION);
      const snapshot = await getDocs(blocksRef);
      
      return snapshot.docs
        .map(doc => doc.data() as BlockedIP)
        .filter(block => !block.expiresAt || block.expiresAt > Date.now());
    } catch (error) {
      console.error("Error getting blocked IPs:", error);
      return [];
    }
  }

  /**
   * Clean up expired blocks
   */
  async cleanupExpiredBlocks(): Promise<void> {
    try {
      const blocksRef = collection(db, this.COLLECTION);
      const snapshot = await getDocs(blocksRef);
      
      const now = Date.now();
      const expiredBlocks = snapshot.docs.filter(doc => {
        const data = doc.data() as BlockedIP;
        return data.expiresAt && data.expiresAt < now;
      });

      for (const doc of expiredBlocks) {
        await updateDoc(doc.ref, { expiresAt: now });
      }

      if (expiredBlocks.length > 0) {
        console.log(`🧹 Cleaned up ${expiredBlocks.length} expired IP blocks`);
      }
    } catch (error) {
      console.error("Error cleaning up expired blocks:", error);
    }
  }
}

// Singleton instance
export const ipBlockingService = new IPBlockingService();
