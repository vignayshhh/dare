import { db } from "@/backend/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";

interface DeviceFingerprint {
  fingerprint: string;
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  timezone: string;
  firstSeen: number;
  lastSeen: number;
  trusted: boolean;
}

interface DeviceHistory {
  userId: string;
  fingerprint: string;
  userAgent: string;
  ip?: string;
  firstSeen: number;
  lastSeen: number;
  trusted: boolean;
}

/**
 * Device Fingerprinting Service
 * Tracks device identifiers to detect suspicious activity and new device logins
 */
class DeviceFingerprintingService {
  private readonly COLLECTION = "device_fingerprints";
  private readonly HISTORY_COLLECTION = "device_history";

  /**
   * Generate device fingerprint from browser characteristics
   */
  generateFingerprint(): string {
    if (typeof window === 'undefined') {
      return 'server';
    }

    const components = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      (navigator as any).deviceMemory || 'unknown',
    ];

    const fingerprintString = components.join('|');
    
    // Simple hash function (use proper fingerprinting library in production)
    let hash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
      const char = fingerprintString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Get current device info
   */
  getDeviceInfo(): { userAgent: string; platform: string; language: string; screenResolution: string; timezone: string } {
    if (typeof window === 'undefined') {
      return {
        userAgent: 'server',
        platform: 'server',
        language: 'en',
        screenResolution: 'unknown',
        timezone: 'UTC',
      };
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Register device for a user
   */
  async registerDevice(userId: string): Promise<{ fingerprint: string; isNewDevice: boolean }> {
    try {
      const fingerprint = this.generateFingerprint();
      const deviceInfo = this.getDeviceInfo();
      const now = Date.now();

      const fingerprintRef = doc(db, this.COLLECTION, fingerprint);
      const fingerprintDoc = await getDoc(fingerprintRef);

      if (!fingerprintDoc.exists()) {
        // New device fingerprint
        await setDoc(fingerprintRef, {
          fingerprint,
          ...deviceInfo,
          firstSeen: now,
          lastSeen: now,
          trusted: false,
        });
      } else {
        // Update last seen
        await updateDoc(fingerprintRef, {
          lastSeen: now,
        });
      }

      // Check if this device is associated with the user
      const historyQuery = query(
        collection(db, this.HISTORY_COLLECTION),
        where('userId', '==', userId),
        where('fingerprint', '==', fingerprint)
      );
      const historySnapshot = await getDocs(historyQuery);

      const isNewDevice = historySnapshot.empty;

      if (isNewDevice) {
        // Record new device association
        const historyRef = doc(collection(db, this.HISTORY_COLLECTION));
        await setDoc(historyRef, {
          userId,
          fingerprint,
          ...deviceInfo,
          firstSeen: now,
          lastSeen: now,
          trusted: false,
        });
      } else {
        // Update last seen for existing device
        const historyDoc = historySnapshot.docs[0];
        await updateDoc(historyDoc.ref, {
          lastSeen: now,
        });
      }

      return { fingerprint, isNewDevice };
    } catch (error) {
      console.error("Error registering device:", error);
      // Fail gracefully - return fingerprint but don't block
      return { fingerprint: this.generateFingerprint(), isNewDevice: false };
    }
  }

  /**
   * Get device history for a user
   */
  async getDeviceHistory(userId: string): Promise<DeviceHistory[]> {
    try {
      const historyQuery = query(
        collection(db, this.HISTORY_COLLECTION),
        where('userId', '==', userId)
      );
      const historySnapshot = await getDocs(historyQuery);

      return historySnapshot.docs.map(doc => doc.data() as DeviceHistory);
    } catch (error) {
      console.error("Error getting device history:", error);
      return [];
    }
  }

  /**
   * Trust a device for a user
   */
  async trustDevice(userId: string, fingerprint: string): Promise<void> {
    try {
      const historyQuery = query(
        collection(db, this.HISTORY_COLLECTION),
        where('userId', '==', userId),
        where('fingerprint', '==', fingerprint)
      );
      const historySnapshot = await getDocs(historyQuery);

      if (!historySnapshot.empty) {
        await updateDoc(historySnapshot.docs[0].ref, {
          trusted: true,
        });
      }

      // Also update fingerprint record
      const fingerprintRef = doc(db, this.COLLECTION, fingerprint);
      await updateDoc(fingerprintRef, {
        trusted: true,
      });
    } catch (error) {
      console.error("Error trusting device:", error);
    }
  }

  /**
   * Check if device is trusted for a user
   */
  async isDeviceTrusted(userId: string, fingerprint: string): Promise<boolean> {
    try {
      const historyQuery = query(
        collection(db, this.HISTORY_COLLECTION),
        where('userId', '==', userId),
        where('fingerprint', '==', fingerprint),
        where('trusted', '==', true)
      );
      const historySnapshot = await getDocs(historyQuery);

      return !historySnapshot.empty;
    } catch (error) {
      console.error("Error checking device trust:", error);
      return false;
    }
  }

  /**
   * Get number of devices for a user
   */
  async getDeviceCount(userId: string): Promise<number> {
    try {
      const historyQuery = query(
        collection(db, this.HISTORY_COLLECTION),
        where('userId', '==', userId)
      );
      const historySnapshot = await getDocs(historyQuery);

      return historySnapshot.size;
    } catch (error) {
      console.error("Error getting device count:", error);
      return 0;
    }
  }

  /**
   * Detect suspicious activity (too many devices in short time)
   */
  async detectSuspiciousActivity(userId: string, timeWindowMs: number = 24 * 60 * 60 * 1000): Promise<boolean> {
    try {
      const historyQuery = query(
        collection(db, this.HISTORY_COLLECTION),
        where('userId', '==', userId)
      );
      const historySnapshot = await getDocs(historyQuery);

      const now = Date.now();
      const recentDevices = historySnapshot.docs.filter(doc => {
        const data = doc.data() as DeviceHistory;
        return now - data.firstSeen < timeWindowMs;
      });

      // Flag if more than 3 new devices in time window
      return recentDevices.length > 3;
    } catch (error) {
      console.error("Error detecting suspicious activity:", error);
      return false;
    }
  }
}

// Singleton instance
export const deviceFingerprintingService = new DeviceFingerprintingService();
