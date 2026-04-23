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
  orderBy,
  limit,
  startAfter,
  increment,
} from "firebase/firestore";
import { dareService } from "./dare.service";
import { friendsService } from "./friends.service";

export interface ModerationAction {
  id: string;
  moderator_id: string;
  target_user_id: string;
  action_type:
    | "warning"
    | "temporary_ban"
    | "permanent_ban"
    | "content_removal";
  reason: string;
  details?: string;
  expires_at?: string;
  created_at: string;
}

export interface ContentReport {
  id: string;
  reporter_id: string;
  content_type: "dare" | "post" | "message" | "user_profile";
  content_id: string;
  reason: string;
  details?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  reviewed_by?: string;
  reviewed_at?: string;
  resolution?: string;
  created_at: string;
}

export interface OverrideVote {
  id: string;
  dare_id: string;
  voter_id: string;
  vote_type: "real" | "fake";
  is_override: boolean;
  override_reason?: string;
  created_at: string;
}

class ModerationService {
  async createContentReport(
    report: Omit<ContentReport, "id" | "created_at" | "status">,
  ): Promise<ContentReport> {
    try {
      const reportRef = doc(collection(db, "reports"));
      const reportData = {
        ...report,
        status: "pending",
        created_at: new Date().toISOString(),
      };

      await setDoc(reportRef, reportData);
      return { id: reportRef.id, ...reportData } as ContentReport;
    } catch (error) {
      console.error("Error creating content report:", error);
      throw error;
    }
  }

  async getReportsForReview(): Promise<ContentReport[]> {
    try {
      const reportsRef = collection(db, "reports");
      const q = query(
        reportsRef,
        where("status", "==", "pending"),
        orderBy("created_at", "desc"),
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ContentReport[];
    } catch (error) {
      console.error("Error getting reports for review:", error);
      return [];
    }
  }

  async reviewReport(
    reportId: string,
    moderatorId: string,
    resolution: string,
    status: "resolved" | "dismissed",
  ): Promise<ContentReport> {
    try {
      const reportRef = doc(db, "reports", reportId);
      await updateDoc(reportRef, {
        status,
        reviewed_by: moderatorId,
        reviewed_at: new Date().toISOString(),
        resolution,
      });

      const updatedDoc = await getDoc(reportRef);
      if (!updatedDoc.exists()) {
        throw new Error("Report not found after update");
      }

      return { id: updatedDoc.id, ...updatedDoc.data() } as ContentReport;
    } catch (error) {
      console.error("Error reviewing report:", error);
      throw error;
    }
  }

  async createModerationAction(
    action: Omit<ModerationAction, "id" | "created_at">,
  ): Promise<ModerationAction> {
    try {
      const actionRef = doc(collection(db, "moderation_actions"));
      const actionData = {
        ...action,
        created_at: new Date().toISOString(),
      };

      await setDoc(actionRef, actionData);
      return { id: actionRef.id, ...actionData } as ModerationAction;
    } catch (error) {
      console.error("Error creating moderation action:", error);
      throw error;
    }
  }

  async getActiveModerationActions(
    userId: string,
  ): Promise<ModerationAction[]> {
    try {
      const actionsRef = collection(db, "moderation_actions");
      const q = query(
        actionsRef,
        where("target_user_id", "==", userId),
        where("action_type", "in", ["temporary_ban", "permanent_ban"]),
      );
      const querySnapshot = await getDocs(q);

      const actions = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ModerationAction[];

      const now = new Date();
      return actions.filter((action) => {
        if (action.action_type === "temporary_ban" && action.expires_at) {
          return new Date(action.expires_at) > now;
        }
        return action.action_type === "permanent_ban";
      });
    } catch (error) {
      console.error("Error getting active moderation actions:", error);
      return [];
    }
  }

  async isUserBanned(userId: string): Promise<boolean> {
    try {
      const activeActions = await this.getActiveModerationActions(userId);
      return activeActions.some(
        (action) =>
          action.action_type === "permanent_ban" ||
          (action.action_type === "temporary_ban" &&
            (!action.expires_at || new Date(action.expires_at) > new Date())),
      );
    } catch (error) {
      console.error("Error checking if user is banned:", error);
      return false;
    }
  }

  async processFriendsOverride(dareId: string): Promise<boolean> {
    try {
      const dare = await dareService.getDare(dareId);
      if (!dare || (dare.state as string) !== "rejected_by_friends") {
        throw new Error("Invalid dare state for friends override");
      }

      const challengerFriends = await friendsService.getFriends(
        dare.challenger_id,
      );
      const receiverFriends = await friendsService.getFriends(dare.receiver_id);

      const allFriends = new Map();
      challengerFriends.forEach((friend) =>
        allFriends.set(friend.user_id, friend),
      );
      receiverFriends.forEach((friend) =>
        allFriends.set(friend.user_id, friend),
      );

      const totalFriends = allFriends.size;
      const requiredVotes = Math.ceil(totalFriends * 0.1);

      const votesRef = collection(db, "dare_votes");
      const q = query(votesRef, where("dare_id", "==", dareId));
      const querySnapshot = await getDocs(q);
      const existingVotes = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      const overrideVotes = existingVotes.filter(
        (vote) => vote.vote_type === "real" && allFriends.has(vote.voter_id),
      );

      if (overrideVotes.length >= requiredVotes) {
        await dareService.approveDare(dareId);

        for (const vote of overrideVotes) {
          await this.recordOverrideVote(
            dareId,
            vote.voter_id,
            "real",
            "Friends override successful",
          );
        }

        return true;
      } else {
        await dareService.rejectDareByFriends(dareId);

        for (const vote of overrideVotes) {
          await this.recordOverrideVote(
            dareId,
            vote.voter_id,
            "real",
            "Friends override failed",
          );
        }

        return false;
      }
    } catch (error) {
      console.error("Error processing friends override:", error);
      throw error;
    }
  }

  private async recordOverrideVote(
    dareId: string,
    voterId: string,
    voteType: "real" | "fake",
    reason?: string,
  ): Promise<OverrideVote> {
    try {
      const voteRef = doc(collection(db, "override_votes"));
      const voteData = {
        dare_id: dareId,
        voter_id: voterId,
        vote_type: voteType,
        is_override: true,
        override_reason: reason,
        created_at: new Date().toISOString(),
      };

      await setDoc(voteRef, voteData);
      return { id: voteRef.id, ...voteData } as OverrideVote;
    } catch (error) {
      console.error("Error recording override vote:", error);
      throw error;
    }
  }

  async getOverrideVotes(dareId: string): Promise<OverrideVote[]> {
    try {
      const votesRef = collection(db, "override_votes");
      const q = query(votesRef, where("dare_id", "==", dareId));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as OverrideVote[];
    } catch (error) {
      console.error("Error getting override votes:", error);
      return [];
    }
  }

  async canUserOverrideDare(dareId: string, userId: string): Promise<boolean> {
    try {
      const dare = await dareService.getDare(dareId);
      if (!dare || (dare.state as string) !== "rejected_by_friends") {
        return false;
      }

      const isFriendsWithChallenger = await friendsService.areFriends(
        userId,
        dare.challenger_id,
      );
      const isFriendsWithReceiver = await friendsService.areFriends(
        userId,
        dare.receiver_id,
      );

      if (!isFriendsWithChallenger && !isFriendsWithReceiver) {
        return false;
      }

      const existingVotes = await this.getOverrideVotes(dareId);
      const alreadyVoted = existingVotes.some(
        (vote) => vote.voter_id === userId,
      );

      return !alreadyVoted;
    } catch (error) {
      console.error("Error checking if user can override dare:", error);
      return false;
    }
  }

  async submitOverrideVote(
    dareId: string,
    userId: string,
    voteType: "real" | "fake",
  ): Promise<boolean> {
    try {
      if (!(await this.canUserOverrideDare(dareId, userId))) {
        throw new Error("User cannot override this dare");
      }

      await this.recordOverrideVote(
        dareId,
        userId,
        voteType,
        "Friends override vote",
      );
      await this.processFriendsOverride(dareId);

      return true;
    } catch (error) {
      console.error("Error submitting override vote:", error);
      throw error;
    }
  }

  async getModerationHistory(userId: string): Promise<ModerationAction[]> {
    try {
      const actionsRef = collection(db, "moderation_actions");
      const q = query(
        actionsRef,
        where("target_user_id", "==", userId),
        orderBy("created_at", "desc"),
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ModerationAction[];
    } catch (error) {
      console.error("Error getting moderation history:", error);
      return [];
    }
  }

  async cleanupExpiredActions(): Promise<void> {
    try {
      const now = new Date();
      const actionsRef = collection(db, "moderation_actions");
      const q = query(
        actionsRef,
        where("action_type", "==", "temporary_ban"),
        where("expires_at", "<", now.toISOString()),
      );
      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        await updateDoc(doc.ref, {
          action_type: "expired_ban",
        });
      }
    } catch (error) {
      console.error("Error cleaning up expired actions:", error);
    }
  }
}

export const moderationService = new ModerationService();
