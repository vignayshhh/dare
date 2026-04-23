/**
 * AggregatedCounters - Distributed counter pattern for likes/comments
 *
 * Uses sharded counters to handle high write loads while reducing reads by ~90%.
 * Instead of counting documents, we read a single counter document.
 */

import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

interface CounterData {
  count: number;
  lastUpdated: number;
}

class AggregatedCounters {
  private readonly NUM_SHARDS = 10; // Number of shards for write distribution
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private counterCache = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  /**
   * Get counter value for a post (likes or comments)
   */
  async getCounter(
    postId: string,
    counterType: "likes" | "comments",
  ): Promise<number> {
    const cacheKey = `${counterType}:${postId}`;
    const cached = this.counterCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.count;
    }

    // Try to get the counter document
    const counterRef = doc(db, "post_counters", `${postId}_${counterType}`);
    const counterDoc = await getDoc(counterRef);

    if (counterDoc.exists()) {
      const data = counterDoc.data() as CounterData;
      this.counterCache.set(cacheKey, {
        count: data.count,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return data.count;
    }

    // If counter doesn't exist, fall back to counting (legacy)
    return this.fallbackCount(postId, counterType);
  }

  /**
   * Increment counter
   */
  async incrementCounter(
    postId: string,
    counterType: "likes" | "comments",
    amount: number = 1,
  ): Promise<void> {
    // Invalidate cache
    const cacheKey = `${counterType}:${postId}`;
    this.counterCache.delete(cacheKey);

    // Increment sharded counter using cryptographically secure random
    const shardId =
      crypto.getRandomValues(new Uint32Array(1))[0] % this.NUM_SHARDS;
    const shardRef = doc(
      db,
      "post_counters",
      `${postId}_${counterType}`,
      "shards",
      shardId.toString(),
    );

    await setDoc(shardRef, { count: increment(amount) }, { merge: true });

    // Also update the main counter document (for reads)
    const counterRef = doc(db, "post_counters", `${postId}_${counterType}`);
    await updateDoc(counterRef, {
      count: increment(amount),
      lastUpdated: Date.now(),
    }).catch(() => {
      // If counter doc doesn't exist, create it
      setDoc(
        counterRef,
        { count: amount, lastUpdated: Date.now() },
        { merge: true },
      );
    });
  }

  /**
   * Decrement counter
   */
  async decrementCounter(
    postId: string,
    counterType: "likes" | "comments",
    amount: number = 1,
  ): Promise<void> {
    await this.incrementCounter(postId, counterType, -amount);
  }

  /**
   * Subscribe to counter updates (real-time)
   */
  subscribeToCounter(
    postId: string,
    counterType: "likes" | "comments",
    callback: (count: number) => void,
  ): () => void {
    const counterRef = doc(db, "post_counters", `${postId}_${counterType}`);

    const unsubscribe = onSnapshot(
      counterRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as CounterData;
          const cacheKey = `${counterType}:${postId}`;
          this.counterCache.set(cacheKey, {
            count: data.count,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          callback(data.count);
        } else {
          // Fallback to counting if counter doesn't exist
          this.fallbackCount(postId, counterType).then(callback);
        }
      },
      (error) => {
        console.error(`Error subscribing to ${counterType} counter:`, error);
      },
    );

    return unsubscribe;
  }

  /**
   * Fallback to counting documents (legacy support)
   */
  private async fallbackCount(
    postId: string,
    counterType: "likes" | "comments",
  ): Promise<number> {
    try {
      if (counterType === "likes") {
        const likesRef = collection(db, "post_likes");
        const q = query(likesRef, where("post_id", "==", postId));
        const snapshot = await getDocs(q);
        return snapshot.size;
      } else {
        const commentsRef = collection(db, "post_comments");
        const q = query(commentsRef, where("post_id", "==", postId));
        const snapshot = await getDocs(q);
        return snapshot.size;
      }
    } catch (error) {
      console.error(`Error counting ${counterType}:`, error);
      return 0;
    }
  }

  /**
   * Initialize counter for a post (call when post is created)
   */
  async initializeCounter(
    postId: string,
    counterType: "likes" | "comments",
    initialCount: number = 0,
  ): Promise<void> {
    const counterRef = doc(db, "post_counters", `${postId}_${counterType}`);
    await setDoc(
      counterRef,
      { count: initialCount, lastUpdated: Date.now() },
      { merge: true },
    );

    // Initialize shards
    for (let i = 0; i < this.NUM_SHARDS; i++) {
      const shardRef = doc(
        db,
        "post_counters",
        `${postId}_${counterType}`,
        "shards",
        i.toString(),
      );
      await setDoc(shardRef, { count: 0 }, { merge: true });
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.counterCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const entry of this.counterCache.values()) {
      if (entry.expiresAt > now) {
        validCount++;
      } else {
        expiredCount++;
      }
    }

    return {
      total: this.counterCache.size,
      valid: validCount,
      expired: expiredCount,
    };
  }
}

// Singleton instance
export const aggregatedCounters = new AggregatedCounters();
