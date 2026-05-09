// Truth Interaction Store
// Manages real-time truth votes and comments
// UI components interact with this store only — never directly with Firebase

import { create } from "zustand";
import { authService } from "@/middleware/services/auth-v2.service";
import {
  truthInteractionsService,
  type TruthComment,
  type TruthVoteData,
} from "@/middleware/services/truth-interactions.service";
import { Unsubscribe } from "firebase/firestore";
import { votePersistence, type TruthVote } from "@/utils/votePersistence";
import { commentLikePersistence } from "@/utils/commentLikePersistence";

interface TruthInteractionState {
  // Vote data keyed by truthId
  voteData: Record<string, TruthVoteData>;
  // Comments data keyed by truthId
  comments: Record<string, TruthComment[]>;
  // Loading states
  loadingVotes: Record<string, boolean>;
  loadingComments: Record<string, boolean>;
  // Active subscriptions (not serialized)
  _voteSubs: Record<string, Unsubscribe>;
  _commentSubs: Record<string, Unsubscribe>;

  // Actions
  recordVote: (
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ) => Promise<void>;
  subscribeToVotes: (truthId: string, currentUserId: string) => void;
  unsubscribeFromVotes: (truthId: string) => void;
  subscribeToComments: (truthId: string) => void;
  unsubscribeFromComments: (truthId: string) => void;
  addComment: (
    truthId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    text: string,
    parentId?: string | null,
  ) => Promise<TruthComment | null>;
  likeComment: (commentId: string) => void;
  unsubscribeAll: () => void;
  // Persistent vote methods
  getUserVote: (truthId: string) => TruthVote | null;
  setUserVote: (truthId: string, vote: TruthVote) => void;
  clearUserVote: (truthId: string) => void;
}

export const useTruthInteractionStore = create<TruthInteractionState>(
  (set, get) => ({
    voteData: {},
    comments: {},
    loadingVotes: {},
    loadingComments: {},
    _voteSubs: {},
    _commentSubs: {},

    // Subscribe to real-time vote data for a truth (used when vote modal is open)
    subscribeToVotes: (truthId: string, currentUserId: string) => {
      const { _voteSubs } = get();
      if (_voteSubs[truthId]) return;

      set((state: any) => ({
        loadingVotes: { ...state.loadingVotes, [truthId]: true },
      }));

      const unsub = truthInteractionsService.subscribeToVotes(
        truthId,
        currentUserId,
        (data) => {
          set((state: any) => ({
            voteData: { ...state.voteData, [truthId]: data },
            loadingVotes: { ...state.loadingVotes, [truthId]: false },
          }));
        },
      );

      set((state: any) => ({
        _voteSubs: { ...state._voteSubs, [truthId]: unsub },
      }));
    },

    // Unsubscribe from vote data when modal closes
    unsubscribeFromVotes: (truthId: string) => {
      const { _voteSubs } = get();
      if (_voteSubs[truthId]) {
        _voteSubs[truthId]();
        const newSubs = { ...get()._voteSubs };
        delete newSubs[truthId];
        set({ _voteSubs: newSubs });
      }
    },

    // Record a vote on a truth
    recordVote: async (
      truthId: string,
      voterId: string,
      vote: "TRUTH" | "LIE",
    ) => {
      try {
        await truthInteractionsService.recordVote(truthId, voterId, vote);
      } catch (error) {
        console.error("❌ recordVote error:", error);
      }
    },

    // Subscribe to real-time comments for a truth
    subscribeToComments: (truthId: string) => {
      const { _commentSubs } = get();
      if (_commentSubs[truthId]) return;

      set((state: any) => ({
        loadingComments: { ...state.loadingComments, [truthId]: true },
      }));

      const unsub = truthInteractionsService.subscribeToComments(
        truthId,
        (comments) => {
          set((state: any) => ({
            comments: { ...state.comments, [truthId]: comments },
            loadingComments: { ...state.loadingComments, [truthId]: false },
          }));
        },
      );

      set((state: any) => ({
        _commentSubs: { ...state._commentSubs, [truthId]: unsub },
      }));
    },

    // Unsubscribe from comments when modal closes
    unsubscribeFromComments: (truthId: string) => {
      const { _commentSubs } = get();
      if (_commentSubs[truthId]) {
        _commentSubs[truthId]();
        const newSubs = { ...get()._commentSubs };
        delete newSubs[truthId];
        set({ _commentSubs: newSubs });
      }
    },

    // Add a comment
    addComment: async (
      truthId: string,
      userId: string,
      username: string,
      displayName: string,
      avatarUrl: string,
      text: string,
      parentId?: string | null,
    ) => {
      try {
        const newComment = await truthInteractionsService.addComment(
          truthId,
          userId,
          username,
          displayName,
          avatarUrl,
          text,
          parentId,
        );

        // Fire alerts for replies and truth post participants
        if (newComment) {
          try {
            const comments = get().comments[truthId] || [];
            const parentComment = parentId
              ? comments.find((c) => c.id === parentId)
              : null;
            const { alertService } =
              await import("@/middleware/services/service-factory");
            const { useContentStore } = await import("./useContentStore");
            const truthPost = useContentStore
              .getState()
              .truthPosts.find((truth) => truth.id === truthId);

            if (parentComment && parentComment.userId !== userId) {
              await alertService.createAlert({
                userId: parentComment.userId,
                type: "COMMENT_REPLY",
                entityId: truthId,
                actorId: userId,
                actorName: displayName,
                actorUsername: username,
                actorAvatar: avatarUrl,
                message: `@${username.replace(/^@/, "")} replied to your comment`,
                metadata: {
                  truthId,
                  commentId: newComment.id,
                  parentCommentId: parentId,
                  commentText: text,
                },
              });
            }

            const participantIds = [
              truthPost?.challengerId,
              truthPost?.receiverId,
            ].filter(
              (participantId): participantId is string =>
                !!participantId && participantId !== userId,
            );

            const uniqueParticipantIds = [...new Set(participantIds)].filter(
              (participantId) => participantId !== parentComment?.userId,
            );

            await Promise.all(
              uniqueParticipantIds.map((participantId) =>
                alertService.createAlert({
                  userId: participantId,
                  type: "COMMENT_RECEIVED",
                  entityId: truthId,
                  actorId: userId,
                  actorName: displayName,
                  actorUsername: username,
                  actorAvatar: avatarUrl,
                  message: `@${username.replace(/^@/, "")} commented on your truth post`,
                  metadata: {
                    truthId,
                    commentId: newComment.id,
                    parentCommentId: parentId || null,
                    commentText: text,
                  },
                }),
              ),
            );
          } catch (alertError) {
            console.error("Failed to send truth comment alert:", alertError);
          }
        }

        return newComment;
      } catch (error) {
        console.error("❌ addComment error:", error);
        return null;
      }
    },

    // Like a comment
    likeComment: (commentId: string) => {
      try {
        const currentUser = authService.getCurrentUser();
        if (!currentUser?.id) return;
        if (commentLikePersistence.hasLiked("truth", currentUser.id, commentId)) {
          return;
        }

        commentLikePersistence.markLiked("truth", currentUser.id, commentId);
        set((state: any) => ({
          comments: Object.fromEntries(
            Object.entries(state.comments).map(([truthId, truthComments]) => [
              truthId,
              (truthComments as TruthComment[]).map((comment) =>
                comment.id === commentId
                  ? { ...comment, likes: (comment.likes || 0) + 1 }
                  : comment,
              ),
            ]),
          ),
        }));
        truthInteractionsService.likeComment(commentId);
      } catch (error) {
        console.error("❌ likeComment error:", error);
      }
    },

    // Clean up all subscriptions
    unsubscribeAll: () => {
      const { _voteSubs, _commentSubs } = get();
      Object.values(_voteSubs).forEach((unsub) => unsub());
      Object.values(_commentSubs).forEach((unsub) => unsub());
      set({ _voteSubs: {}, _commentSubs: {} });
    },

    // Persistent vote methods
    getUserVote: (truthId: string): TruthVote | null => {
      return votePersistence.getTruthVote(truthId);
    },

    setUserVote: (truthId: string, vote: TruthVote): void => {
      votePersistence.setTruthVote(truthId, vote);
    },

    clearUserVote: (truthId: string): void => {
      votePersistence.removeTruthVote(truthId);
    },
  }),
);
