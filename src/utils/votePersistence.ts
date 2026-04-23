// Vote Persistence Utility
// SECURITY: Using sessionStorage to reduce XSS exposure
// Stores user votes in sessionStorage for persistence within session only
// Follows architecture contract: UI components use this utility, never direct storage

export type DareVote = "real" | "fake";
export type TruthVote = "truth" | "lie";

interface VoteStorage {
  dareVotes: Record<string, DareVote>;
  truthVotes: Record<string, TruthVote>;
}

const STORAGE_KEY = "dare_app_votes";

class VotePersistenceManager {
  private getStorage(): VoteStorage {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate data structure
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.dareVotes === "object" &&
          typeof parsed.truthVotes === "object"
        ) {
          return parsed;
        }
        console.warn("Invalid vote storage structure, resetting");
      }
    } catch (error) {
      console.warn("Failed to load votes from sessionStorage:", error);
    }
    return { dareVotes: {}, truthVotes: {} };
  }

  private saveStorage(storage: VoteStorage): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    } catch (error) {
      console.warn("Failed to save votes to sessionStorage:", error);
    }
  }

  // Dare vote methods
  getDareVote(dareId: string): DareVote | null {
    const storage = this.getStorage();
    return storage.dareVotes[dareId] || null;
  }

  setDareVote(dareId: string, vote: DareVote): void {
    const storage = this.getStorage();
    storage.dareVotes[dareId] = vote;
    this.saveStorage(storage);
  }

  removeDareVote(dareId: string): void {
    const storage = this.getStorage();
    delete storage.dareVotes[dareId];
    this.saveStorage(storage);
  }

  getAllDareVotes(): Record<string, DareVote> {
    return this.getStorage().dareVotes;
  }

  // Truth vote methods
  getTruthVote(truthId: string): TruthVote | null {
    const storage = this.getStorage();
    return storage.truthVotes[truthId] || null;
  }

  setTruthVote(truthId: string, vote: TruthVote): void {
    const storage = this.getStorage();
    storage.truthVotes[truthId] = vote;
    this.saveStorage(storage);
  }

  removeTruthVote(truthId: string): void {
    const storage = this.getStorage();
    delete storage.truthVotes[truthId];
    this.saveStorage(storage);
  }

  getAllTruthVotes(): Record<string, TruthVote> {
    return this.getStorage().truthVotes;
  }

  // Clear all votes (for testing/logout)
  clearAllVotes(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to clear votes from sessionStorage:", error);
    }
  }

  // Get vote count stats
  getVoteStats(): { dareVotesCount: number; truthVotesCount: number } {
    const storage = this.getStorage();
    return {
      dareVotesCount: Object.keys(storage.dareVotes).length,
      truthVotesCount: Object.keys(storage.truthVotes).length,
    };
  }
}

// Export singleton instance
export const votePersistence = new VotePersistenceManager();
