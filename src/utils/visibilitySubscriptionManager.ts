/**
 * VisibilitySubscriptionManager - Smart subscription unloading with Visibility API
 * 
 * Automatically unsubscribes from real-time listeners when tab is hidden
 * and resubscribes when tab becomes visible, reducing Firebase reads
 * for inactive tabs.
 */

type UnsubscribeFunction = () => void;

interface SubscriptionEntry {
  subscribe: () => UnsubscribeFunction;
  unsubscribe: UnsubscribeFunction | null;
  isActive: boolean;
  lastActive: number;
}

export class VisibilitySubscriptionManager {
  private subscriptions = new Map<string, SubscriptionEntry>();
  private isTabVisible = true;
  private visibilityCheckInterval: NodeJS.Timeout | null = null;
  private readonly VISIBLE_CHECK_INTERVAL = 1000; // Check every second

  constructor() {
    this.initializeVisibilityTracking();
  }

  /**
   * Initialize visibility tracking
   */
  private initializeVisibilityTracking(): void {
    // Handle visibility change
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    // Periodic check for tabs that become visible without visibilitychange event
    this.visibilityCheckInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !this.isTabVisible) {
        this.handleVisibilityChange();
      }
    }, this.VISIBLE_CHECK_INTERVAL);
  }

  /**
   * Handle visibility change event
   */
  private handleVisibilityChange(): void {
    const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    
    if (isVisible !== this.isTabVisible) {
      this.isTabVisible = isVisible;
      
      if (isVisible) {
        console.log('👁️ [Visibility] Tab became visible - resubscribing to all active subscriptions');
        this.resubscribeAll();
      } else {
        console.log('👁️ [Visibility] Tab hidden - unsubscribing from all subscriptions');
        this.unsubscribeAll();
      }
    }
  }

  /**
   * Register a subscription with visibility management
   */
  register(key: string, subscribeFn: () => UnsubscribeFunction): UnsubscribeFunction {
    // Clean up existing subscription if any
    this.unregister(key);

    // Create subscription entry
    const entry: SubscriptionEntry = {
      subscribe: subscribeFn,
      unsubscribe: null,
      isActive: false,
      lastActive: Date.now(),
    };

    this.subscriptions.set(key, entry);

    // Subscribe immediately if tab is visible
    if (this.isTabVisible) {
      entry.unsubscribe = subscribeFn();
      entry.isActive = true;
      entry.lastActive = Date.now();
      console.log(`👁️ [Visibility] Registered and subscribed: ${key}`);
    } else {
      console.log(`👁️ [Visibility] Registered (deferred): ${key}`);
    }

    // Return cleanup function
    return () => this.unregister(key);
  }

  /**
   * Unregister a specific subscription
   */
  unregister(key: string): void {
    const entry = this.subscriptions.get(key);
    if (entry) {
      if (entry.unsubscribe) {
        try {
          entry.unsubscribe();
        } catch (error) {
          console.error(`❌ [Visibility] Error unsubscribing ${key}:`, error);
        }
      }
      this.subscriptions.delete(key);
      console.log(`👁️ [Visibility] Unregistered: ${key}`);
    }
  }

  /**
   * Unsubscribe from all subscriptions
   */
  private unsubscribeAll(): void {
    let count = 0;
    for (const [key, entry] of this.subscriptions.entries()) {
      if (entry.unsubscribe && entry.isActive) {
        try {
          entry.unsubscribe();
          entry.isActive = false;
          count++;
        } catch (error) {
          console.error(`❌ [Visibility] Error unsubscribing ${key}:`, error);
        }
      }
    }
    console.log(`👁️ [Visibility] Unsubscribed from ${count} active subscriptions`);
  }

  /**
   * Resubscribe to all subscriptions
   */
  private resubscribeAll(): void {
    let count = 0;
    for (const [key, entry] of this.subscriptions.entries()) {
      if (!entry.isActive) {
        try {
          entry.unsubscribe = entry.subscribe();
          entry.isActive = true;
          entry.lastActive = Date.now();
          count++;
        } catch (error) {
          console.error(`❌ [Visibility] Error resubscribing ${key}:`, error);
        }
      }
    }
    console.log(`👁️ [Visibility] Resubscribed to ${count} subscriptions`);
  }

  /**
   * Get statistics
   */
  getStats() {
    let activeCount = 0;
    let inactiveCount = 0;
    
    for (const entry of this.subscriptions.values()) {
      if (entry.isActive) {
        activeCount++;
      } else {
        inactiveCount++;
      }
    }

    return {
      total: this.subscriptions.size,
      active: activeCount,
      inactive: inactiveCount,
      isTabVisible: this.isTabVisible,
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.unsubscribeAll();
    this.subscriptions.clear();
    
    if (this.visibilityCheckInterval) {
      clearInterval(this.visibilityCheckInterval);
      this.visibilityCheckInterval = null;
    }
    
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', () => this.handleVisibilityChange());
    }
  }
}

// Singleton instance
export const visibilitySubscriptionManager = new VisibilitySubscriptionManager();
