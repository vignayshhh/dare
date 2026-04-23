// Truth Store - Single source of truth for all truth data
// Uses service factory and follows architecture contract strictly
// UI components only interact with this store - never directly with services

import { create } from "zustand";
import {
  truthService,
  CreateTruthRequest,
} from "@/middleware/services/truth.service.new";
import { TruthEntity, TruthState } from "@/backend/domain/entities/Truth";
import { alertService } from "@/middleware/services/service-factory";
import { getDefaultAvatarUrl } from "@/utils/placeholderImages";

// Helper to convert TruthEntity to TruthWithUsers
const mapTruthEntityToWithUsers = (truth: TruthEntity): TruthWithUsers => ({
  id: truth.id,
  challengerId: truth.challengerId,
  receiverId: truth.receiverId,
  question: truth.question,
  state: truth.state,
  createdAt: truth.createdAt,
  updatedAt: truth.updatedAt,
  answer: truth.answer,
  votes: truth.votes,
  answeredAt: truth.answeredAt,
  reviewedAt: truth.reviewedAt,
  challenger: {
    id: truth.challengerId,
    nickname: `User ${truth.challengerId.slice(0, 8)}`,
    avatar: getDefaultAvatarUrl(truth.challengerId),
  },
  receiver: {
    id: truth.receiverId,
    nickname: `User ${truth.receiverId.slice(0, 8)}`,
    avatar: getDefaultAvatarUrl(truth.receiverId),
  },
  // TruthEntity methods
  canBeAnswered: truth.canBeAnswered,
  canBeReviewed: truth.canBeReviewed,
  isAnswered: truth.isAnswered,
  isPublished: truth.isPublished,
  submitAnswer: (answer: string) =>
    mapTruthEntityToWithUsers(truth.submitAnswer(answer)),
  review: (isApproved: boolean) =>
    mapTruthEntityToWithUsers(truth.review(isApproved)),
  updateVotes: (truthVotes: number, lieVotes: number) =>
    mapTruthEntityToWithUsers(truth.updateVotes(truthVotes, lieVotes)),
});

interface TruthWithUsers {
  id: string;
  challengerId: string;
  receiverId: string;
  question: string;
  state: TruthState;
  createdAt: string;
  updatedAt: string;
  answer?: string;
  votes?: { truth: number; lie: number; total: number };
  answeredAt?: string;
  reviewedAt?: string;
  challenger: {
    id: string;
    nickname: string;
    avatar: string;
    verified?: boolean;
  };
  receiver: {
    id: string;
    nickname: string;
    avatar: string;
    verified?: boolean;
  };
  // TruthEntity methods
  canBeAnswered: () => boolean;
  canBeReviewed: () => boolean;
  isAnswered: () => boolean;
  isPublished: () => boolean;
  submitAnswer: (answer: string) => TruthWithUsers;
  review: (isApproved: boolean) => TruthWithUsers;
  updateVotes: (truthVotes: number, lieVotes: number) => TruthWithUsers;
}

interface TruthStore {
  // State
  sentTruths: TruthWithUsers[];
  receivedTruths: TruthWithUsers[];
  currentTruth: TruthWithUsers | null;
  loading: boolean;
  error: string | null;
  creatingTruth: boolean;

  // Actions
  loadUserTruths: (
    userId: string,
    type?: "sent" | "received" | "all" | undefined,
  ) => Promise<void>;
  createTruth: (request: CreateTruthRequest) => Promise<TruthWithUsers | null>;
  answerTruth: (
    truthId: string,
    userId: string,
    answer: string,
  ) => Promise<void>;
  submitDare: (
    dareId: string,
    userId: string,
    proof: { type: "image" | "video" | "audio"; url: string },
  ) => Promise<void>;
  refuseTruth: (truthId: string, userId: string) => Promise<void>;
  voteOnTruth: (
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ) => Promise<void>;
  getTruth: (
    truthId: string,
    currentUserId?: string,
  ) => Promise<TruthWithUsers | null>;
  canUserTruthUser: (
    challengerId: string,
    receiverId: string,
  ) => Promise<boolean>;
  clearError: () => void;
}

export const useTruthStore = create<TruthStore>((set, get) => ({
  // Initial state
  sentTruths: [],
  receivedTruths: [],
  currentTruth: null,
  loading: false,
  error: null,
  creatingTruth: false,

  // Load user truths
  loadUserTruths: async (
    userId: string,
    type?: "sent" | "received" | "all",
  ) => {
    set({ loading: true, error: null });

    try {
      const response = await truthService.getUserTruths(
        userId,
        type || undefined,
      );

      if (response.success && response.truths) {
        // Transform to TruthWithUsers using the mapper
        const truthsWithUsers = response.truths.map((truth) =>
          mapTruthEntityToWithUsers(truth),
        );

        if (type === "sent") {
          set({ sentTruths: truthsWithUsers });
        } else if (type === "received") {
          set({ receivedTruths: truthsWithUsers });
        } else {
          // Split into sent/received
          const sent = truthsWithUsers.filter((t) => t.challengerId === userId);
          const received = truthsWithUsers.filter(
            (t) => t.receiverId === userId,
          );
          set({ sentTruths: sent, receivedTruths: received });
        }
      } else {
        throw new Error(response.error || "Failed to load truths");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load truths";
      set({ error: errorMessage });
    } finally {
      set({ loading: false });
    }
  },

  // Create truth
  createTruth: async (request: CreateTruthRequest) => {
    set({ creatingTruth: true, error: null });

    try {
      const response = await truthService.createTruth(request);

      if (response.success && response.truth) {
        // Create alert for receiver
        await alertService.createAlert({
          userId: request.receiverId,
          type: "TRUTH_RECEIVED",
          entityId: response.truth.id,
          actorId: request.challengerId,
        });

        // Transform to TruthWithUsers using the mapper
        const truthWithUsers = mapTruthEntityToWithUsers(response.truth);

        // Update local state
        set((state) => ({
          sentTruths: [truthWithUsers, ...state.sentTruths],
        }));

        return truthWithUsers;
      } else {
        throw new Error(response.error || "Failed to create truth");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create truth";
      set({ error: errorMessage });
      return null;
    } finally {
      set({ creatingTruth: false });
    }
  },

  // Answer truth
  answerTruth: async (truthId: string, userId: string, answer: string) => {
    try {
      console.log("🗣️ USETRUTHSTORE: Answering truth:", {
        truthId,
        userId,
        answer,
      });
      const response = await truthService.answerTruth(truthId, userId, answer);

      if (response.success) {
        console.log(
          "Truth answered successfully, creating alert for challenger",
        );

        // Get the truth to find challenger ID
        const truth =
          get().receivedTruths.find((t) => t.id === truthId) ||
          get().sentTruths.find((t) => t.id === truthId);
        const challengerId = truth?.challengerId;

        console.log("Found truth for alert:", { truthId, challengerId, truth });

        if (challengerId) {
          // Get user profile for actor name
          let actorName = "Someone";
          let actorUsername = "someone";

          try {
            const { UserRepository } =
              await import("@/backend/repositories/UserRepository");
            const userRepository = new UserRepository();
            const actorProfile = await userRepository.getProfileById(userId);

            if (actorProfile) {
              actorName =
                actorProfile.displayName || actorProfile.username || "Someone";
              actorUsername = actorProfile.username || "someone";
            }
          } catch (error) {
            console.error("Error getting actor profile:", error);
          }

          // Create alert for challenger
          await alertService.createAlert({
            userId: challengerId,
            type: "TRUTH_ANSWERED",
            entityId: truthId,
            actorId: userId,
            actorName,
            actorUsername,
            message: "finished your dare", // As requested
          });

          console.log("Alert created for challenger:", challengerId);
        }

        // Update local state
        set((state) => ({
          receivedTruths: state.receivedTruths.map((truth) =>
            truth.id === truthId
              ? { ...truth, answer, state: "ANSWERED" as const }
              : truth,
          ),
        }));

        console.log("Local state updated");
      } else {
        throw new Error(response.error || "Failed to answer truth");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to answer truth";
      throw new Error(errorMessage);
    }
  },

  // Submit dare (DEPRECATED - use useDareStore.submitProof instead)
  submitDare: async (
    dareId: string,
    userId: string,
    proof: { type: "image" | "video" | "audio"; url: string },
  ) => {
    console.warn(
      "⚠️ useTruthStore.submitDare is deprecated. Use useDareStore.submitProof for dare operations.",
    );

    try {
      // This method should not be used for dares anymore
      // Redirect to the proper dare store
      const { useDareStore } = await import("@/stores/useDareStore");
      const { submitProof } = useDareStore.getState();

      await submitProof(dareId, userId, {
        media_type: proof.type.toUpperCase() as "TEXT" | "PHOTO" | "VIDEO",
        media_url: proof.url,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit dare";
      throw new Error(errorMessage);
    }
  },

  // Refuse truth
  refuseTruth: async (truthId: string, userId: string) => {
    try {
      const response = await truthService.refuseTruth(truthId, userId);

      if (response.success) {
        // Create alert for challenger
        await alertService.createAlert({
          userId:
            get().receivedTruths.find((t) => t.id === truthId)?.challengerId ||
            "",
          type: "TRUTH_REFUSED",
          entityId: truthId,
          actorId: userId,
        });

        // Update local state
        set((state) => ({
          receivedTruths: state.receivedTruths.map((truth) =>
            truth.id === truthId
              ? { ...truth, state: "REJECTED" as const }
              : truth,
          ),
        }));
      } else {
        throw new Error(response.error || "Failed to refuse truth");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to refuse truth";
      set({ error: errorMessage });
    }
  },

  // Vote on truth
  voteOnTruth: async (
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ) => {
    try {
      const response = await truthService.voteOnTruth(truthId, voterId, vote);

      if (response.success) {
        // Update local state with new vote counts
        set((state) => ({
          sentTruths: state.sentTruths.map((truth) =>
            truth.id === truthId
              ? {
                  ...truth,
                  votes: truth.votes
                    ? {
                        ...truth.votes,
                        [vote.toLowerCase()]:
                          (vote.toLowerCase() === "truth"
                            ? truth.votes.truth
                            : truth.votes.lie) + 1,
                        total: truth.votes.total + 1,
                      }
                    : {
                        truth: vote === "TRUTH" ? 1 : 0,
                        lie: vote === "LIE" ? 1 : 0,
                        total: 1,
                      },
                }
              : truth,
          ),
          receivedTruths: state.receivedTruths.map((truth) =>
            truth.id === truthId
              ? {
                  ...truth,
                  votes: truth.votes
                    ? {
                        ...truth.votes,
                        [vote.toLowerCase()]:
                          (vote.toLowerCase() === "truth"
                            ? truth.votes.truth
                            : truth.votes.lie) + 1,
                        total: truth.votes.total + 1,
                      }
                    : {
                        truth: vote === "TRUTH" ? 1 : 0,
                        lie: vote === "LIE" ? 1 : 0,
                        total: 1,
                      },
                }
              : truth,
          ),
        }));
      } else {
        throw new Error(response.error || "Failed to vote on truth");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to vote on truth";
      set({ error: errorMessage });
    }
  },

  // Get truth by ID
  getTruth: async (truthId: string, currentUserId?: string) => {
    try {
      const response = await truthService.getTruthById(truthId);

      if (response.success && response.truth) {
        // Transform to TruthWithUsers using the mapper
        const truthWithUsers = mapTruthEntityToWithUsers(response.truth);

        set({ currentTruth: truthWithUsers });
        return truthWithUsers;
      } else {
        throw new Error(response.error || "Truth not found");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get truth";
      set({ error: errorMessage });
      return null;
    }
  },

  // Check if user can truth another user
  canUserTruthUser: async (challengerId: string, receiverId: string) => {
    try {
      // For now, just check they're not the same user
      return challengerId !== receiverId;
    } catch (error) {
      return false;
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
