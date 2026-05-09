import { create } from "zustand";
import {
  dareService,
  DareWithUsers,
  CreateDareRequest,
  DareProof,
  VoteType,
} from "@/middleware/services/dare.service";
import { friendsService } from "@/middleware/services/friends.service";
import { alertService } from "@/middleware/services/service-factory";

interface DareStore {
  // State
  sentDares: DareWithUsers[];
  receivedDares: DareWithUsers[];
  currentDare: DareWithUsers | null;
  loading: boolean;
  error: string | null;
  creatingDare: boolean;

  // Timer state
  ghostModeDares: Map<string, number>; // dareId -> remaining minutes

  // Actions
  loadUserDares: (
    userId: string,
    type?: "sent" | "received" | "all",
  ) => Promise<void>;
  createDare: (request: CreateDareRequest) => Promise<DareWithUsers | null>;
  acceptDare: (dareId: string, receiverId: string) => Promise<void>;
  chickenOut: (dareId: string, receiverId: string) => Promise<void>;
  submitProof: (
    dareId: string,
    receiverId: string,
    proof: DareProof,
  ) => Promise<void>;
  startReview: (dareId: string, challengerId: string) => Promise<void>;
  moveToFriendsValidation: (
    dareId: string,
    challengerId: string,
  ) => Promise<void>;
  voteOnDare: (
    dareId: string,
    voterId: string,
    vote: VoteType,
  ) => Promise<void>;
  challengerReviewDare: (
    dareId: string,
    challengerId: string,
    decision: "ACCEPT" | "REJECT",
  ) => Promise<void>;
  getDare: (
    dareId: string,
    currentUserId?: string,
  ) => Promise<DareWithUsers | null>;
  canUserDareUser: (
    challengerId: string,
    receiverId: string,
  ) => Promise<boolean>;
  getDareStats: (userId: string) => Promise<any>;
  clearCurrentDare: () => void;
  clearError: () => void;

  // Timer actions
  updateGhostModeTimers: () => void;
  getGhostModeRemaining: (dareId: string) => number;
  isInGhostMode: (dareId: string) => boolean;

  // Computed values
  activeDaresCount: number;
  pendingDaresCount: number;
  completedDaresCount: number;
}

export const useDareStore = create<DareStore>((set, get) => ({
  // Initial state
  sentDares: [],
  receivedDares: [],
  currentDare: null,
  loading: false,
  error: null,
  creatingDare: false,
  ghostModeDares: new Map(),

  // Computed values
  get activeDaresCount() {
    const { sentDares, receivedDares } = get();
    const activeStates = [
      "SENT",
      "ACCEPTED",
      "PROOF_SUBMITTED",
      "FRIENDS_VALIDATION",
    ];
    return [...sentDares, ...receivedDares].filter((dare) =>
      activeStates.includes(dare.state),
    ).length;
  },

  get pendingDaresCount() {
    const { receivedDares } = get();
    return receivedDares.filter((dare) => dare.state === "SENT").length;
  },

  get completedDaresCount() {
    const { sentDares, receivedDares } = get();
    const completedStates = ["ACCEPTED_REAL", "REJECTED_FAKE", "CHICKEN_OUT"];
    return [...sentDares, ...receivedDares].filter((dare) =>
      completedStates.includes(dare.state),
    ).length;
  },

  // Actions
  loadUserDares: async (userId: string, type = "all") => {
    set({ loading: true, error: null });

    try {
      const dares = await dareService.getDaresForUser(
        userId,
        type === "sent" ? "challenger" : "receiver",
      );

      if (type === "sent") {
        set({ sentDares: dares, loading: false });
      } else if (type === "received") {
        set({ receivedDares: dares, loading: false });
      } else {
        // Split into sent and received
        const sent = dares.filter((dare) => dare.challenger_id === userId);
        const received = dares.filter((dare) => dare.receiver_id === userId);
        set({ sentDares: sent, receivedDares: received, loading: false });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load dares";
      set({ loading: false, error: errorMessage });
    }
  },

  createDare: async (request: CreateDareRequest) => {
    console.log("🎯 DARESTORE: createDare called with:", {
      challenger_id: request.challenger_id,
      receiver_id: request.receiver_id,
      description: request.description,
    });

    set({ creatingDare: true, error: null });

    try {
      console.log("🎯 DARESTORE: Calling dareService.createDare...");
      const dare = await dareService.createDare(request);
      console.log("🎯 DARESTORE: Dare created:", dare);

      // Get full dare with users
      console.log("🎯 DARESTORE: Getting dare with users...");
      const dareWithUsers = await dareService.getDareWithUsers(
        dare.id,
        request.challenger_id,
      );
      console.log("🎯 DARESTORE: Dare with users:", dareWithUsers);

      if (dareWithUsers) {
        // 🔥 ALERT: Create DARE_RECEIVED alert for receiver
        console.log(
          "🎯 DARESTORE: Creating DARE_RECEIVED alert for:",
          request.receiver_id,
        );

        // Get challenger profile for actor info
        let actorName = "Someone";
        let actorUsername = "someone";

        try {
          console.log(
            "🎯 DARESTORE: Getting challenger profile for:",
            request.challenger_id,
          );
          const { UserRepository } =
            await import("@/backend/repositories/UserRepository");
          const userRepository = new UserRepository();
          const challengerProfile = await userRepository.getProfileById(
            request.challenger_id,
          );
          console.log("🎯 DARESTORE: Challenger profile:", challengerProfile);

          if (challengerProfile) {
            actorName =
              challengerProfile.displayName ||
              challengerProfile.username ||
              "Someone";
            actorUsername = challengerProfile.username || "someone";
          }
        } catch (error) {
          console.error(
            "🎯 DARESTORE: Error getting challenger profile:",
            error,
          );
        }

        console.log("🎯 DARESTORE: About to create alert with:", {
          userId: request.receiver_id,
          type: "DARE_RECEIVED",
          entityId: dare.id,
          actorId: request.challenger_id,
          actorName,
          actorUsername,
          message: "sent you a dare",
        });

        await alertService.createAlert({
          userId: request.receiver_id,
          type: "DARE_RECEIVED",
          entityId: dare.id,
          actorId: request.challenger_id,
          actorName,
          actorUsername,
          message: "sent you a dare",
        });

        console.log("✅ DARESTORE: DARE_RECEIVED alert created successfully");

        set((state) => ({
          sentDares: [dareWithUsers, ...state.sentDares],
          creatingDare: false,
        }));
      } else {
        console.log("❌ DARESTORE: No dareWithUsers returned");
        set({ creatingDare: false });
      }

      return dareWithUsers;
    } catch (error) {
      console.error("❌ DARESTORE: Error in createDare:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create dare";
      set({ creatingDare: false, error: errorMessage });
      return null;
    }
  },

  acceptDare: async (dareId: string, receiverId: string) => {
    try {
      console.log("🎯 DARESTORE: Calling dareService.acceptDare...");
      await dareService.acceptDare(dareId, receiverId);
      console.log("✅ DARESTORE: Dare accepted (alerts handled by service)");

      // Update local state
      set((state) => ({
        receivedDares: state.receivedDares.map((dare) =>
          dare.id === dareId
            ? {
                ...dare,
                state: "ACCEPTED",
                accepted_at: new Date().toISOString(),
                ghost_mode_until: new Date(
                  Date.now() + 15 * 60 * 1000,
                ).toISOString(), // 15 minutes
              }
            : dare,
        ),
      }));

      // Update timers
      get().updateGhostModeTimers();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to accept dare";
      set({ error: errorMessage });
    }
  },

  chickenOut: async (dareId: string, receiverId: string) => {
    try {
      console.log("🎯 DARESTORE: Calling dareService.rejectDare...");
      await dareService.rejectDare(dareId, receiverId);
      console.log("✅ DARESTORE: Dare rejected (alerts handled by service)");

      // Update local state
      set((state) => ({
        receivedDares: state.receivedDares.map((dare) =>
          dare.id === dareId ? { ...dare, state: "CHICKEN_OUT" } : dare,
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to chicken out";
      set({ error: errorMessage });
    }
  },

  submitProof: async (dareId: string, receiverId: string, proof: DareProof) => {
    try {
      console.log("🎯 DARESTORE: Calling dareService.submitProof...");
      await dareService.submitProof(dareId, receiverId, proof);
      console.log("✅ DARESTORE: Proof submitted (alerts handled by service)");

      // Update local state
      set((state) => ({
        receivedDares: state.receivedDares.map((dare) =>
          dare.id === dareId
            ? {
                ...dare,
                state: "PROOF_SUBMITTED",
                proof_media_url: proof.media_url,
                proof_media_type: proof.media_type,
                proof_submitted_at: new Date().toISOString(),
              }
            : dare,
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit proof";
      set({ error: errorMessage });
    }
  },

  startReview: async (dareId: string, challengerId: string) => {
    try {
      // Dare moves to FRIENDS_VALIDATION state automatically when voting begins
      // This method is kept for compatibility but doesn't need to do anything

      // Update local state
      set((state) => ({
        sentDares: state.sentDares.map((dare) =>
          dare.id === dareId ? { ...dare, state: "FRIENDS_VALIDATION" } : dare,
        ),
        receivedDares: state.receivedDares.map((dare) =>
          dare.id === dareId ? { ...dare, state: "FRIENDS_VALIDATION" } : dare,
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to start review";
      set({ error: errorMessage });
    }
  },

  moveToFriendsValidation: async (dareId: string, challengerId: string) => {
    try {
      // Dare moves to REJECTED_FAKE state automatically when needed
      // This method is kept for compatibility but doesn't need to do anything

      // Update local state
      set((state) => ({
        sentDares: state.sentDares.map((dare) =>
          dare.id === dareId ? { ...dare, state: "REJECTED_FAKE" } : dare,
        ),
        receivedDares: state.receivedDares.map((dare) =>
          dare.id === dareId ? { ...dare, state: "REJECTED_FAKE" } : dare,
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to move to friends validation";
      set({ error: errorMessage });
    }
  },

  voteOnDare: async (dareId: string, voterId: string, vote: VoteType) => {
    try {
      await dareService.voteOnDare(dareId, voterId, vote);

      // Update local state - add vote and update counts
      set((state) => {
        const updateDareWithVote = (dare: DareWithUsers) => {
          if (dare.id === dareId) {
            const newVotes = [
              ...(dare.votes || []),
              {
                dare_id: dareId,
                voter_id: voterId,
                vote,
                created_at: new Date().toISOString(),
              } as any,
            ];

            const realVotes = newVotes.filter((v) => v.vote === "REAL").length;
            const fakeVotes = newVotes.filter((v) => v.vote === "FAKE").length;

            return {
              ...dare,
              votes: newVotes,
              current_user_vote: vote,
              can_vote: false,
              friends_real_votes: realVotes,
              friends_fake_votes: fakeVotes,
              total_votes: newVotes.length,
            };
          }
          return dare;
        };

        return {
          sentDares: state.sentDares.map(updateDareWithVote),
          receivedDares: state.receivedDares.map(updateDareWithVote),
          currentDare: state.currentDare
            ? updateDareWithVote(state.currentDare)
            : null,
        };
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to vote on dare";
      set({ error: errorMessage });
    }
  },

  challengerReviewDare: async (
    dareId: string,
    challengerId: string,
    decision: "ACCEPT" | "REJECT",
  ) => {
    try {
      await dareService.challengerReviewDare(dareId, challengerId, decision);

      // Update local state
      const newState =
        decision === "ACCEPT" ? "ACCEPTED_REAL" : "REJECTED_FAKE";

      set((state) => ({
        sentDares: state.sentDares.map((dare) =>
          dare.id === dareId
            ? {
                ...dare,
                state: newState,
                completed_at: new Date().toISOString(),
              }
            : dare,
        ),
        receivedDares: state.receivedDares.map((dare) =>
          dare.id === dareId
            ? {
                ...dare,
                state: newState,
                completed_at: new Date().toISOString(),
              }
            : dare,
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to review dare";
      set({ error: errorMessage });
    }
  },

  getDare: async (dareId: string, currentUserId?: string) => {
    try {
      const dare = await dareService.getDareWithUsers(dareId, currentUserId);
      set({ currentDare: dare });
      return dare;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get dare";
      set({ error: errorMessage });
      return null;
    }
  },

  canUserDareUser: async (challengerId: string, receiverId: string) => {
    try {
      // Check if users are friends
      const areFriends = await friendsService.areFriends(
        challengerId,
        receiverId,
      );
      if (!areFriends) return false;

      // Check if there's already an active dare
      const activeDare = await dareService.getActiveDareBetweenUsers(
        challengerId,
        receiverId,
      );
      return !activeDare;
    } catch (error) {
      console.error("Error checking if user can dare user:", error);
      return false;
    }
  },

  getDareStats: async (userId: string) => {
    try {
      // Get user's dares and calculate stats
      const sentDares = await dareService.getDaresForUser(userId, "challenger");
      const receivedDares = await dareService.getDaresForUser(
        userId,
        "receiver",
      );

      const completed =
        sentDares.filter((d) => d.state === "ACCEPTED_REAL").length +
        receivedDares.filter((d) => d.state === "ACCEPTED_REAL").length;
      const refused =
        sentDares.filter((d) => d.state === "REJECTED_FAKE").length +
        receivedDares.filter((d) => d.state === "REJECTED_FAKE").length;
      const total = sentDares.length + receivedDares.length;

      return {
        sent: sentDares.length,
        received: receivedDares.length,
        completed,
        refused,
        success_rate: total > 0 ? (completed / total) * 100 : 0,
      };
    } catch (error) {
      console.error("Error getting dare stats:", error);
      return {
        sent: 0,
        received: 0,
        completed: 0,
        refused: 0,
        success_rate: 0,
      };
    }
  },

  clearCurrentDare: () => {
    set({ currentDare: null });
  },

  clearError: () => {
    set({ error: null });
  },

  // Timer methods
  updateGhostModeTimers: () => {
    const { sentDares, receivedDares } = get();
    const allDares = [...sentDares, ...receivedDares];
    const updatedTimers = new Map<string, number>();

    allDares.forEach((dare) => {
      if (dare.state === "ACCEPTED" && dare.ghost_mode_until) {
        const now = new Date();
        const expiry = new Date(dare.ghost_mode_until);
        const remaining = Math.max(
          0,
          Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60)),
        );
        updatedTimers.set(dare.id, remaining);
      }
    });

    set({ ghostModeDares: updatedTimers });
  },

  getGhostModeRemaining: (dareId: string) => {
    const { ghostModeDares } = get();
    return ghostModeDares.get(dareId) || 0;
  },

  isInGhostMode: (dareId: string) => {
    const { ghostModeDares } = get();
    const remaining = ghostModeDares.get(dareId);
    return remaining !== undefined && remaining > 0;
  },
}));
