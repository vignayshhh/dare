import { friendsService } from "@/middleware/services/friends.service";
import { userService } from "@/middleware/services/user.service";

/**
 * Background pre-caching utility
 * Uses requestIdleCallback to pre-cache data during browser idle time
 * This spreads reads across idle periods and makes the app feel faster
 */
class BackgroundPreCache {
  private isPreCaching = false;
  private preCachePromise: Promise<void> | null = null;

  /**
   * Trigger background pre-caching during browser idle time
   * Non-blocking - if it fails, app still works normally
   */
  async preCache(userId: string): Promise<void> {
    if (!userId || this.isPreCaching) {
      return this.preCachePromise || Promise.resolve();
    }

    this.isPreCaching = true;
    this.preCachePromise = this.runPreCache(userId);

    try {
      await this.preCachePromise;
    } finally {
      this.isPreCaching = false;
    }
  }

  private async runPreCache(userId: string): Promise<void> {
    const idleCallback = (): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(() => {
            this.preCacheData(userId).then(resolve).catch(() => resolve());
          }, { timeout: 5000 });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(() => {
            this.preCacheData(userId).then(resolve).catch(() => resolve());
          }, 1000);
        }
      });
    };

    await idleCallback();
  }

  private async preCacheData(userId: string): Promise<void> {
    try {
      // Pre-cache friends (already cached for 15min, but warm it up)
      await friendsService.getFriends(userId);

      // Pre-cache user's own profile (already cached, but warm it up)
      await userService.getProfile(userId);
    } catch (error) {
      // Non-fatal - pre-cache failures should not break the app
      console.error("Background pre-cache error:", error);
    }
  }
}

export const backgroundPreCache = new BackgroundPreCache();
