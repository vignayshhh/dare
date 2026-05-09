import { db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
  increment,
} from "firebase/firestore";

export interface StoryReaction {
  storyId: string;
  userId: string;
  type: "like" | "hate";
  createdAt: string;
}

export interface StoryReactionStats {
  storyId: string;
  likeCount: number;
  hateCount: number;
}

class StoryReactionService {
  private readonly reactionsCollection = "story_reactions";
  private readonly statsCollection = "story_reaction_stats";

  private isPermissionDenied(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String((error as { code?: unknown }).code) : "";
    const message =
      "message" in error ? String((error as { message?: unknown }).message) : "";

    return code.includes("permission-denied") || message.includes("Missing or insufficient permissions");
  }

  /**
   * Add or update a reaction to a story
   * If the user already reacted with the same type, remove it (toggle)
   * If the user reacted with a different type, replace it
   */
  async toggleReaction(
    storyId: string,
    userId: string,
    type: "like" | "hate",
  ): Promise<{ success: boolean; currentReaction: "like" | "hate" | null }> {
    try {
      const reactionRef = doc(
        db,
        this.reactionsCollection,
        `${storyId}_${userId}`,
      );
      const reactionDoc = await getDoc(reactionRef);

      if (reactionDoc.exists()) {
        const existingReaction = reactionDoc.data() as StoryReaction;
        
        if (existingReaction.type === type) {
          // Remove reaction (toggle off)
          await deleteDoc(reactionRef);
          await this.updateStats(storyId, type, -1);
          return { success: true, currentReaction: null };
        } else {
          // Change reaction type
          await updateDoc(reactionRef, {
            type,
            createdAt: new Date().toISOString(),
          });
          await this.updateStats(storyId, existingReaction.type, -1);
          await this.updateStats(storyId, type, 1);
          return { success: true, currentReaction: type };
        }
      } else {
        // Add new reaction
        await setDoc(reactionRef, {
          storyId,
          userId,
          type,
          createdAt: new Date().toISOString(),
        });
        await this.updateStats(storyId, type, 1);
        return { success: true, currentReaction: type };
      }
    } catch (error) {
      if (this.isPermissionDenied(error)) {
        console.error(
          "Error toggling story reaction: Firestore rules for story reactions are not live yet.",
          error,
        );
      } else {
        console.error("Error toggling story reaction:", error);
      }
      return { success: false, currentReaction: null };
    }
  }

  /**
   * Get a user's reaction to a specific story
   */
  async getUserReaction(
    storyId: string,
    userId: string,
  ): Promise<"like" | "hate" | null> {
    try {
      const reactionRef = doc(
        db,
        this.reactionsCollection,
        `${storyId}_${userId}`,
      );
      const reactionDoc = await getDoc(reactionRef);

      if (reactionDoc.exists()) {
        const reaction = reactionDoc.data() as StoryReaction;
        return reaction.type;
      }
      return null;
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        console.error("Error getting user reaction:", error);
      }
      return null;
    }
  }

  /**
   * Get all reactions for a story
   */
  async getStoryReactions(storyId: string): Promise<StoryReaction[]> {
    try {
      const reactionsQuery = query(
        collection(db, this.reactionsCollection),
        where("storyId", "==", storyId),
      );
      const snapshot = await getDocs(reactionsQuery);
      return snapshot.docs.map((doc) => doc.data() as StoryReaction);
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        console.error("Error getting story reactions:", error);
      }
      return [];
    }
  }

  /**
   * Get reaction stats for a story
   */
  async getStoryStats(storyId: string): Promise<StoryReactionStats> {
    try {
      const statsRef = doc(db, this.statsCollection, storyId);
      const statsDoc = await getDoc(statsRef);

      if (statsDoc.exists()) {
        return statsDoc.data() as StoryReactionStats;
      }

      // Initialize stats if they don't exist
      const initialStats: StoryReactionStats = {
        storyId,
        likeCount: 0,
        hateCount: 0,
      };
      await setDoc(statsRef, initialStats);
      return initialStats;
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        console.error("Error getting story stats:", error);
      }
      return { storyId, likeCount: 0, hateCount: 0 };
    }
  }

  /**
   * Subscribe to real-time reaction updates for a story
   */
  subscribeToStoryStats(
    storyId: string,
    callback: (stats: StoryReactionStats) => void,
  ): Unsubscribe {
    const statsRef = doc(db, this.statsCollection, storyId);
    return onSnapshot(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as StoryReactionStats);
      } else {
        callback({ storyId, likeCount: 0, hateCount: 0 });
      }
    });
  }

  /**
   * Get all reactions by a user across all stories
   */
  async getUserReactions(userId: string): Promise<
    Map<string, "like" | "hate">
  > {
    try {
      const reactionsQuery = query(
        collection(db, this.reactionsCollection),
        where("userId", "==", userId),
      );
      const snapshot = await getDocs(reactionsQuery);
      
      const reactionsMap = new Map<string, "like" | "hate">();
      snapshot.docs.forEach((doc) => {
        const reaction = doc.data() as StoryReaction;
        reactionsMap.set(reaction.storyId, reaction.type);
      });
      
      return reactionsMap;
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        console.error("Error getting user reactions:", error);
      }
      return new Map();
    }
  }

  /**
   * Update reaction stats atomically
   */
  private async updateStats(
    storyId: string,
    type: "like" | "hate",
    delta: number,
  ): Promise<void> {
    try {
      const statsRef = doc(db, this.statsCollection, storyId);
      const field = type === "like" ? "likeCount" : "hateCount";

      await setDoc(
        statsRef,
        {
          storyId,
          [field]: increment(delta),
        },
        { merge: true },
      );
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        console.error("Error updating reaction stats:", error);
      }
    }
  }

  /**
   * Delete all reactions for a story (when story is deleted)
   */
  async deleteStoryReactions(storyId: string): Promise<void> {
    try {
      const reactionsQuery = query(
        collection(db, this.reactionsCollection),
        where("storyId", "==", storyId),
      );
      const snapshot = await getDocs(reactionsQuery);
      
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Also delete stats
      await deleteDoc(doc(db, this.statsCollection, storyId));
    } catch (error) {
      if (!this.isPermissionDenied(error)) {
        console.error("Error deleting story reactions:", error);
      }
    }
  }
}

export const storyReactionService = new StoryReactionService();
