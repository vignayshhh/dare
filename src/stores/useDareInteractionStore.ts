// Dare Interaction Store
// Manages real-time view counts, comment counts, and comments for dare cards
// UI components interact with this store only — never directly with Firebase

import { create } from "zustand";
import { authService } from "@/middleware/services/auth-v2.service";
import {
  dareInteractionsService,
  type DareComment,
  type DareVoteData,
} from "@/middleware/services/dare-interactions.service";
import { Unsubscribe } from "firebase/firestore";
import { votePersistence, type DareVote } from "@/utils/votePersistence";
import { commentLikePersistence } from "@/utils/commentLikePersistence";

interface DareInteractionState {
  // View counts keyed by dareId
  viewCounts: Record<string, number>;
  // Comment counts keyed by dareId
  commentCounts: Record<string, number>;
  // Full comments keyed by dareId
  comments: Record<string, DareComment[]>;
  // Vote data keyed by dareId
  voteData: Record<string, DareVoteData>;
  // Loading states
  loadingComments: Record<string, boolean>;
  loadingVotes: Record<string, boolean>;
  // Active subscriptions (not serialized)
  _viewSubs: Record<string, Unsubscribe>;
  _commentCountSubs: Record<string, Unsubscribe>;
  _commentSubs: Record<string, Unsubscribe>;
  _voteSubs: Record<string, Unsubscribe>;

  // Actions
  recordView: (dareId: string, userId: string) => void;
  loadViewCounts: (dareIds: string[]) => Promise<void>;
  loadCommentCounts: (dareIds: string[]) => Promise<void>;
  subscribeToViewCount: (dareId: string) => void;
  subscribeToCommentCount: (dareId: string) => void;
  unsubscribeFromViewCount: (dareId: string) => void;
  unsubscribeFromCommentCount: (dareId: string) => void;
  subscribeToComments: (dareId: string) => void;
  unsubscribeFromComments: (dareId: string) => void;
  unsubscribeAll: () => void;
  addComment: (
    dareId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    text: string,
    parentId?: string | null,
  ) => Promise<DareComment | null>;
  likeComment: (commentId: string) => void;
  recordVote: (
    dareId: string,
    voterId: string,
    vote: "REAL" | "FAKE",
  ) => Promise<void>;
  subscribeToVotes: (dareId: string, currentUserId: string) => void;
  unsubscribeFromVotes: (dareId: string) => void;
  // Persistent vote methods
  getUserVote: (dareId: string) => DareVote | null;
  setUserVote: (dareId: string, vote: DareVote) => void;
  clearUserVote: (dareId: string) => void;
  shareDareToDM: (
    senderId: string,
    recipientId: string,
    dareId: string,
    dareDescription: string,
    challengerName: string,
    receiverName: string,
  ) => Promise<boolean>;
}

export const useDareInteractionStore = create<DareInteractionState>(
  (set, get) => ({
    viewCounts: {},
    commentCounts: {},
    comments: {},
    voteData: {},
    loadingComments: {},
    loadingVotes: {},
    _viewSubs: {},
    _commentCountSubs: {},
    _commentSubs: {},
    _voteSubs: {},

    // Record a view (fire-and-forget)
    recordView: (dareId: string, userId: string) => {
      dareInteractionsService.recordView(dareId, userId);
    },

    // Batch load view counts for multiple dares
    loadViewCounts: async (dareIds: string[]) => {
      const counts = await dareInteractionsService.getViewCounts(dareIds);
      set((state) => ({
        viewCounts: { ...state.viewCounts, ...counts },
      }));
    },

    // Batch load comment counts for multiple dares
    loadCommentCounts: async (dareIds: string[]) => {
      const counts = await dareInteractionsService.getCommentCounts(dareIds);
      set((state) => ({
        commentCounts: { ...state.commentCounts, ...counts },
      }));
    },

    // Subscribe to real-time view count for a single dare
    subscribeToViewCount: (dareId: string) => {
      const { _viewSubs } = get();
      if (_viewSubs[dareId]) return; // already subscribed

      const unsub = dareInteractionsService.subscribeToViewCount(
        dareId,
        (count) => {
          set((state) => ({
            viewCounts: { ...state.viewCounts, [dareId]: count },
          }));
        },
      );

      set((state) => ({
        _viewSubs: { ...state._viewSubs, [dareId]: unsub },
      }));
    },

    // Subscribe to real-time comment count for a single dare
    subscribeToCommentCount: (dareId: string) => {
      const { _commentCountSubs } = get();
      if (_commentCountSubs[dareId]) return;

      const unsub = dareInteractionsService.subscribeToCommentCount(
        dareId,
        (count) => {
          set((state) => ({
            commentCounts: { ...state.commentCounts, [dareId]: count },
          }));
        },
      );

      set((state) => ({
        _commentCountSubs: { ...state._commentCountSubs, [dareId]: unsub },
      }));
    },

    unsubscribeFromViewCount: (dareId: string) => {
      const { _viewSubs } = get();
      if (_viewSubs[dareId]) {
        _viewSubs[dareId]();
        const newSubs = { ...get()._viewSubs };
        delete newSubs[dareId];
        set({ _viewSubs: newSubs });
      }
    },

    unsubscribeFromCommentCount: (dareId: string) => {
      const { _commentCountSubs } = get();
      if (_commentCountSubs[dareId]) {
        _commentCountSubs[dareId]();
        const newSubs = { ...get()._commentCountSubs };
        delete newSubs[dareId];
        set({ _commentCountSubs: newSubs });
      }
    },

    // Subscribe to real-time comments list for a dare (used when comments modal is open)
    subscribeToComments: (dareId: string) => {
      const { _commentSubs } = get();
      if (_commentSubs[dareId]) return;

      set((state) => ({
        loadingComments: { ...state.loadingComments, [dareId]: true },
      }));

      const unsub = dareInteractionsService.subscribeToComments(
        dareId,
        (comments) => {
          set((state) => ({
            comments: { ...state.comments, [dareId]: comments },
            // Derive count from the list so the separate subscribeToCommentCount
            // listener is not needed when the full comments subscription is active
            commentCounts: {
              ...state.commentCounts,
              [dareId]: comments.length,
            },
            loadingComments: { ...state.loadingComments, [dareId]: false },
          }));
        },
      );

      set((state) => ({
        _commentSubs: { ...state._commentSubs, [dareId]: unsub },
      }));
    },

    // Unsubscribe from comments list when modal closes
    unsubscribeFromComments: (dareId: string) => {
      const { _commentSubs } = get();
      if (_commentSubs[dareId]) {
        _commentSubs[dareId]();
        const newSubs = { ...get()._commentSubs };
        delete newSubs[dareId];
        set({ _commentSubs: newSubs });
      }
    },

    // Subscribe to real-time vote data for a dare (used when vote modal is open)
    subscribeToVotes: (dareId: string, currentUserId: string) => {
      const { _voteSubs } = get();
      if (_voteSubs[dareId]) return;

      set((state) => ({
        loadingVotes: { ...state.loadingVotes, [dareId]: true },
      }));

      const unsub = dareInteractionsService.subscribeToVotes(
        dareId,
        currentUserId,
        (data) => {
          set((state) => ({
            voteData: { ...state.voteData, [dareId]: data },
            loadingVotes: { ...state.loadingVotes, [dareId]: false },
          }));
        },
      );

      set((state) => ({
        _voteSubs: { ...state._voteSubs, [dareId]: unsub },
      }));
    },

    // Unsubscribe from vote data when modal closes
    unsubscribeFromVotes: (dareId: string) => {
      const { _voteSubs } = get();
      if (_voteSubs[dareId]) {
        _voteSubs[dareId]();
        const newSubs = { ...get()._voteSubs };
        delete newSubs[dareId];
        set({ _voteSubs: newSubs });
      }
    },

    // Record a vote on a dare
    recordVote: async (
      dareId: string,
      voterId: string,
      vote: "REAL" | "FAKE",
    ) => {
      try {
        await dareInteractionsService.recordVote(dareId, voterId, vote);
      } catch (error) {
        console.error("❌ recordVote error:", error);
      }
    },

    // Clean up all subscriptions
    unsubscribeAll: () => {
      const { _viewSubs, _commentCountSubs, _commentSubs, _voteSubs } = get();
      Object.values(_viewSubs).forEach((unsub) => unsub());
      Object.values(_commentCountSubs).forEach((unsub) => unsub());
      Object.values(_commentSubs).forEach((unsub) => unsub());
      Object.values(_voteSubs).forEach((unsub) => unsub());
      set({
        _viewSubs: {},
        _commentCountSubs: {},
        _commentSubs: {},
        _voteSubs: {},
      });
    },

    // Add a comment
    addComment: async (
      dareId: string,
      userId: string,
      username: string,
      displayName: string,
      avatarUrl: string,
      text: string,
      parentId?: string | null,
    ) => {
      try {
        const comment = await dareInteractionsService.addComment(
          dareId,
          userId,
          username,
          displayName,
          avatarUrl,
          text,
          parentId,
        );

        if (comment) {
          try {
            const comments = get().comments[dareId] || [];
            const parentComment = parentId
              ? comments.find(
                  (existingComment) => existingComment.id === parentId,
                )
              : null;
            const { alertService } =
              await import("@/middleware/services/service-factory");
            const { useContentStore } = await import("./useContentStore");
            const darePost = useContentStore
              .getState()
              .darePosts.find((dare) => dare.id === dareId);

            if (parentComment && parentComment.userId !== userId) {
              await alertService.createAlert({
                userId: parentComment.userId,
                type: "COMMENT_REPLY",
                entityId: dareId,
                actorId: userId,
                actorName: displayName,
                actorUsername: username,
                actorAvatar: avatarUrl,
                message: `@${username.replace(/^@/, "")} replied to your comment`,
                metadata: {
                  dareId,
                  commentId: comment.id,
                  parentCommentId: parentId,
                  commentText: text,
                },
              });
            }

            const participantIds = [
              darePost?.challengerId,
              darePost?.receiverId,
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
                  entityId: dareId,
                  actorId: userId,
                  actorName: displayName,
                  actorUsername: username,
                  actorAvatar: avatarUrl,
                  message: `@${username.replace(/^@/, "")} commented on your dare post`,
                  metadata: {
                    dareId,
                    commentId: comment.id,
                    parentCommentId: parentId || null,
                    commentText: text,
                  },
                }),
              ),
            );
          } catch (alertError) {
            console.error("Failed to send dare comment alert:", alertError);
          }
        }

        return comment;
      } catch (error) {
        console.error("❌ addComment error:", error);
        return null;
      }
    },

    // Like a comment
    likeComment: (commentId: string) => {
      const currentUser = authService.getCurrentUser();
      if (!currentUser?.id) return;
      if (commentLikePersistence.hasLiked("dare", currentUser.id, commentId)) {
        return;
      }

      commentLikePersistence.markLiked("dare", currentUser.id, commentId);
      set((state) => ({
        comments: Object.fromEntries(
          Object.entries(state.comments).map(([dareId, dareComments]) => [
            dareId,
            (dareComments as DareComment[]).map((comment) =>
              comment.id === commentId
                ? { ...comment, likes: (comment.likes || 0) + 1 }
                : comment,
            ),
          ]),
        ),
      }));
      dareInteractionsService.likeComment(commentId);
    },

    // Share dare to DM
    shareDareToDM: async (
      senderId: string,
      recipientId: string,
      dareId: string,
      dareDescription: string,
      challengerName: string,
      receiverName: string,
    ) => {
      return dareInteractionsService.shareDareToDM(
        senderId,
        recipientId,
        dareId,
        dareDescription,
        challengerName,
        receiverName,
      );
    },

    // Persistent vote methods
    getUserVote: (dareId: string): DareVote | null => {
      return votePersistence.getDareVote(dareId);
    },

    setUserVote: (dareId: string, vote: DareVote): void => {
      votePersistence.setDareVote(dareId, vote);
    },

    clearUserVote: (dareId: string): void => {
      votePersistence.removeDareVote(dareId);
    },
  }),
);
