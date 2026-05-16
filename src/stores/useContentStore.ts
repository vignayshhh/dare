// UseContentStore - Single source of truth for all content data
// Uses service factory and follows architecture contract strictly
// UI components only interact with this store - never directly with services

import { create } from "zustand";
import {
  dareService,
  truthService,
} from "@/middleware/services/service-factory";
import { db } from "@/backend/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { TruthPost, DarePost } from "@/middleware/adapters/data-adapters";
import { useAuthStore } from "./useAuthStore-v2";
import { TruthEntity } from "@/backend/domain/entities/Truth";
import { resolveUserProfile } from "@/utils/profileResolver";

interface ContentState {
  truthPosts: TruthPost[];
  darePosts: DarePost[];
  loadingTruth: boolean;
  loadingDares: boolean;
  hasLoadedTruth: boolean;
  hasLoadedDares: boolean;
  truthPostsUserId: string | null;
  darePostsUserId: string | null;
  truthPostsScope: "feed" | "profile" | null;
  darePostsScope: "feed" | "profile" | null;
  refreshing: boolean;
  truthError: string | null;
  dareError: string | null;
  hasMoreTruth: boolean;
  hasMoreDares: boolean;
  loadTruthPosts: (refresh?: boolean, scope?: "feed" | "profile") => Promise<void>;
  loadDarePosts: (refresh?: boolean, scope?: "feed" | "profile") => Promise<void>;
  addDarePost: (dare: DarePost) => void;
  addTruthPost: (truth: TruthPost) => void;
  voteOnDare: (dareId: string, vote: "real" | "fake") => Promise<void>;
  voteOnTruth: (truthId: string, vote: "truth" | "lie") => Promise<void>;
  refreshContent: () => Promise<void>;
  clearErrors: () => void;
}

// ─── Profile cache (one Firestore read per userId per session) ────────────────
const profileCache = new Map<string, any>();

// ─── fetchProfile ─────────────────────────────────────────────────────────────
// Strategy 1: getProfileByUserIdForContent(userId)
//   → UserRepository.getProfileByUserId → doc(db,"users",userId)
//   Works when Firestore doc ID === userId on dare/truth records.
//
// Strategy 2: query where("user_id","==",userId)
//   Works when doc IDs are Auth UIDs but stored userId values differ (e.g. "user8").
//   Manually maps snake_case → camelCase to match UserProfileEntity shape.
async function fetchProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  if (profileCache.has(userId)) return profileCache.get(userId);

  // Strategy 1
  try {
    const resolvedProfile = await resolveUserProfile(userId);
    if (resolvedProfile) {
      profileCache.set(userId, resolvedProfile);
      return resolvedProfile;
    }
  } catch (_e) {
    /* fall through */
  }

  // Strategy 2 — direct Firestore query by user_id field
  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("user_id", "==", userId)),
    );
    if (!snap.empty) {
      const data = snap.docs[0].data();
      const docId = snap.docs[0].id;
      const profile = {
        id: data.user_id || docId,
        userId: data.user_id || docId,
        displayName: data.display_name,
        username: data.username,
        nickname: data.display_name || data.nickname,
        avatarUrl: data.avatar_url,
        visibility: data.visibility,
      };
      profileCache.set(userId, profile);
      return profile;
    }
  } catch (_e) {
    /* fall through */
  }

  profileCache.set(userId, null);
  return null;
}

// ─── extractName ─────────────────────────────────────────────────────────────
// UserProfileEntity has camelCase fields (mapped by UserRepository.mapToUserProfile).
function extractName(profile: any, userId: string): string {
  if (profile && typeof profile === "object") {
    const name =
      profile.displayName ||
      profile.username ||
      profile.nickname ||
      profile.display_name; // raw Firestore safety net
    if (name && typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }
  }
  return userId ?? "Unknown";
}

// ─── extractAvatar ────────────────────────────────────────────────────────────
function extractAvatar(profile: any): string {
  if (profile && typeof profile === "object") {
    const url = profile.avatarUrl || profile.avatar_url || profile.photoURL;
    if (url && typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }
  return "/default-avatar.png";
}

// ─── buildTruthPost ───────────────────────────────────────────────────────────
// Each card is built in full isolation — one failure never blocks the others.
async function buildTruthPost(truth: TruthEntity): Promise<TruthPost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(truth.challengerId),
      fetchProfile(truth.receiverId),
    ]);

    const challengerName = extractName(challengerProfile, truth.challengerId);
    const receiverName = extractName(receiverProfile, truth.receiverId);

    if (
      challengerName === receiverName &&
      truth.challengerId !== truth.receiverId
    ) {
      console.warn(
        `[buildTruthPost] Same name "${challengerName}" for both sides on truth ${truth.id}. ` +
          `challengerId=${truth.challengerId} receiverId=${truth.receiverId}`,
      );
    }

    return {
      id: truth.id,
      challengerId: truth.challengerId,
      receiverId: truth.receiverId,
      challenger: {
        nickname: challengerName,
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: receiverName,
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      question: truth.question,
      state: truth.state as TruthPost["state"],
      createdAt: truth.createdAt,
      answer: truth.answer,
    };
  } catch (error) {
    console.error(`[buildTruthPost] Failed for truth ${truth.id}:`, error);
    return null;
  }
}

// ─── buildDarePost ────────────────────────────────────────────────────────────
// Each card is built in full isolation — one failure never blocks the others.
async function buildDarePost(dare: any): Promise<DarePost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(dare.challengerId),
      fetchProfile(dare.receiverId),
    ]);

    const challengerName = extractName(challengerProfile, dare.challengerId);
    const receiverName = extractName(receiverProfile, dare.receiverId);

    if (
      challengerName === receiverName &&
      dare.challengerId !== dare.receiverId
    ) {
      console.warn(
        `[buildDarePost] Same name "${challengerName}" for both sides on dare ${dare.id}. ` +
          `challengerId=${dare.challengerId} receiverId=${dare.receiverId}`,
      );
    }

    return {
      id: dare.id,
      challengerId: dare.challengerId,
      receiverId: dare.receiverId,
      challenger: {
        nickname: challengerName,
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: receiverName,
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      description: dare.description,
      proof: dare.proofMediaUrl
        ? {
            type: (dare.proofMediaType === "VIDEO" ? "video" : "image") as
              | "video"
              | "image",
            url: dare.proofMediaUrl,
            thumbnail: dare.proofThumbnailUrl || dare.proofMediaUrl,
          }
        : undefined,
      state: dare.state as DarePost["state"],
      createdAt: dare.createdAt,
    };
  } catch (error) {
    console.error(`[buildDarePost] Failed for dare ${dare.id}:`, error);
    return null;
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useContentStore = create<ContentState>((set, get) => ({
  truthPosts: [],
  darePosts: [],
  loadingTruth: false,
  loadingDares: false,
  hasLoadedTruth: false,
  hasLoadedDares: false,
  truthPostsUserId: null,
  darePostsUserId: null,
  truthPostsScope: null,
  darePostsScope: null,
  refreshing: false,
  truthError: null,
  dareError: null,
  hasMoreTruth: true,
  hasMoreDares: true,

  // ── Load truth posts ──────────────────────────────────────────────────────
  // getUserTruths returns ALL truths the user is involved in (sent + received).
  // This is the correct source for the Truth feed — friends' truths involving
  // the current user show up here naturally.
  loadTruthPosts: async (refresh = false, scope = "profile") => {
    const { loadingTruth } = get();
    if (loadingTruth && !refresh) return;
    const currentUser = useAuthStore.getState().user;

    set({ loadingTruth: true, truthError: null, refreshing: refresh });

    try {
      if (!currentUser) throw new Error("User not authenticated");

      const response =
        scope === "feed"
          ? await truthService.getFriendsTruths(currentUser.id)
          : await truthService.getUserTruths(currentUser.id, "all");

      // getUserTruths returns { success: false } when user has no truths at all
      // — treat that as an empty list, not a hard error
      if (!response.success) {
        console.warn(
          "[useContentStore] getUserTruths returned failure:",
          response.error,
        );
        set({
          truthPosts: [],
          loadingTruth: false,
          hasLoadedTruth: true,
          truthPostsUserId: currentUser.id,
          truthPostsScope: scope,
          refreshing: false,
          hasMoreTruth: false,
        });
        return;
      }

      const rawTruths = response.truths ?? [];

      // Deduplicate by ID
      const seen = new Set<string>();
      const uniqueTruths = rawTruths.filter((t: TruthEntity) => {
        if (!t?.id || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      // Build each card in isolation — one bad card never blocks the rest
      const results = await Promise.all(uniqueTruths.map(buildTruthPost));
      const truthPosts = results.filter((p): p is TruthPost => p !== null);

      set({
        truthPosts,
        loadingTruth: false,
        hasLoadedTruth: true,
        truthPostsUserId: currentUser.id,
        truthPostsScope: scope,
        refreshing: false,
        hasMoreTruth: truthPosts.length > 0,
      });
    } catch (error) {
      console.error("[useContentStore] loadTruthPosts error:", error);
      set({
        truthError:
          error instanceof Error ? error.message : "Failed to load truth posts",
        loadingTruth: false, // ← always cleared — prevents infinite loading
        hasLoadedTruth: true,
        truthPostsUserId: currentUser?.id ?? null,
        truthPostsScope: scope,
        refreshing: false,
      });
    }
  },

  // ── Load dare posts ───────────────────────────────────────────────────────
  // For profile screen: only load dares the user is involved in (sent + received).
  // Uses getDaresForUser which returns the user's own sent/received dares.
  loadDarePosts: async (refresh = false, scope = "profile") => {
    const { loadingDares } = get();
    if (loadingDares && !refresh) return;
    const currentUser = useAuthStore.getState().user;

    set({ loadingDares: true, dareError: null, refreshing: refresh });

    try {
      if (!currentUser) throw new Error("User not authenticated");

      // Only load dares the current user is involved in (as challenger or receiver)
      const response =
        scope === "feed"
          ? await dareService.getFriendsDares(currentUser.id)
          : await dareService.getDaresForUser(currentUser.id);

      if (!response.success || !response.dares || response.dares.length === 0) {
        set({
          darePosts: [],
          loadingDares: false,
          hasLoadedDares: true,
          darePostsUserId: currentUser.id,
          darePostsScope: scope,
          refreshing: false,
          hasMoreDares: false,
        });
        return;
      }

      const rawDares = response.dares;

      // Deduplicate by ID
      const seen = new Set<string>();
      const uniqueDares = rawDares.filter((d: any) => {
        if (!d?.id || seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      // Sort newest first
      uniqueDares.sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Build each card in isolation — one bad card never blocks the rest
      const results = await Promise.all(uniqueDares.map(buildDarePost));
      const darePosts = results.filter((p): p is DarePost => p !== null);

      set({
        darePosts,
        loadingDares: false,
        hasLoadedDares: true,
        darePostsUserId: currentUser.id,
        darePostsScope: scope,
        refreshing: false,
        hasMoreDares: darePosts.length > 0,
      });
    } catch (error) {
      console.error("[useContentStore] loadDarePosts error:", error);
      set({
        dareError:
          error instanceof Error ? error.message : "Failed to load dare posts",
        loadingDares: false,
        hasLoadedDares: true,
        darePostsUserId: currentUser?.id ?? null,
        darePostsScope: scope,
        refreshing: false,
      });
    }
  },

  // ── Vote on dare ──────────────────────────────────────────────────────────
  voteOnDare: async (dareId: string, vote: "real" | "fake") => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) throw new Error("User not authenticated");
      const response = await dareService.voteOnDare(
        dareId,
        currentUser.id,
        vote.toUpperCase() as "REAL" | "FAKE",
      );
      if (response.success) {
        await get().loadDarePosts(true);
      } else {
        throw new Error(response.error || "Failed to vote on dare");
      }
    } catch (error) {
      set({
        dareError:
          error instanceof Error ? error.message : "Failed to vote on dare",
      });
    }
  },

  // ── Vote on truth ─────────────────────────────────────────────────────────
  voteOnTruth: async (truthId: string, vote: "truth" | "lie") => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) throw new Error("User not authenticated");
      const response = await truthService.voteOnTruth(
        truthId,
        currentUser.id,
        vote.toUpperCase() as "TRUTH" | "LIE",
      );
      if (response.success) {
        await get().loadTruthPosts(true);
      } else {
        throw new Error(response.error || "Failed to vote on truth");
      }
    } catch (error) {
      set({
        truthError:
          error instanceof Error ? error.message : "Failed to vote on truth",
      });
    }
  },

  // ── Refresh all content ───────────────────────────────────────────────────
  refreshContent: async () => {
    set({ refreshing: true });
    await Promise.all([get().loadTruthPosts(true), get().loadDarePosts(true)]);
    set({ refreshing: false });
  },

  // ── Add a new dare post ───────────────────────────────────────────────────
  addDarePost: (dare: DarePost) => {
    set((state) => {
      const existing = state.darePosts.find((post) => post.id === dare.id);
      const mergedDare: DarePost = existing
        ? {
            ...existing,
            ...dare,
            challenger: {
              ...existing.challenger,
              ...dare.challenger,
              avatar:
                dare.challenger.avatar &&
                dare.challenger.avatar !== "/default-avatar.png"
                  ? dare.challenger.avatar
                  : existing.challenger.avatar,
            },
            receiver: {
              ...existing.receiver,
              ...dare.receiver,
              avatar:
                dare.receiver.avatar &&
                dare.receiver.avatar !== "/default-avatar.png"
                  ? dare.receiver.avatar
                  : existing.receiver.avatar,
            },
            proof: dare.proof || existing.proof,
          }
        : dare;

      return {
        darePosts: [
          mergedDare,
          ...state.darePosts.filter((post) => post.id !== dare.id),
        ],
      };
    });
  },

  // ── Add a new truth post ──────────────────────────────────────────────────
  addTruthPost: (truth: TruthPost) => {
    set((state) => {
      const existing = state.truthPosts.find((post) => post.id === truth.id);
      const mergedTruth: TruthPost = existing
        ? {
            ...existing,
            ...truth,
            challenger: {
              ...existing.challenger,
              ...truth.challenger,
              avatar:
                truth.challenger.avatar &&
                truth.challenger.avatar !== "/default-avatar.png"
                  ? truth.challenger.avatar
                  : existing.challenger.avatar,
            },
            receiver: {
              ...existing.receiver,
              ...truth.receiver,
              avatar:
                truth.receiver.avatar &&
                truth.receiver.avatar !== "/default-avatar.png"
                  ? truth.receiver.avatar
                  : existing.receiver.avatar,
            },
            answer: truth.answer || existing.answer,
          }
        : truth;

      return {
        truthPosts: [
          mergedTruth,
          ...state.truthPosts.filter((post) => post.id !== truth.id),
        ],
      };
    });
  },

  // ── Clear errors ──────────────────────────────────────────────────────────
  clearErrors: () => {
    set({ truthError: null, dareError: null });
  },
}));


