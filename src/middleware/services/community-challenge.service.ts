import { db } from "@/backend/lib/firebase";
import {
  collection,
  doc,
  documentId,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  CommunityChallenge,
  CommunityJoinPreviewUser,
} from "@/components/screens/communityChallengeData";

export type CommunityChallengeSummary = {
  challengeId: string;
  joinedCount: number;
  activeCount: number;
  completedCount: number;
  eliminatedCount: number;
  joinPreview: CommunityJoinPreviewUser[];
  extraFriends: number;
  batchStatus: "open" | "waiting" | "started";
  minRequiredMembers: number;
  registrationStartedAtMs: number | null;
  registrationEndsAtMs: number | null;
  batchStartedAtMs: number | null;
};

export type CommunityChallengeJoinStatus =
  | "waiting"
  | "active"
  | "submitted"
  | "completed"
  | "eliminated";

export type CommunityChallengeJoin = {
  id: string;
  challengeId: string;
  challengeTitle: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  status: CommunityChallengeJoinStatus;
  currentDay: number;
  totalDays: number;
  proofDueAtMs: number | null;
  joinedAtMs: number;
  lastProofDay: number;
  lastProofAtMs: number | null;
  eliminatedAtMs: number | null;
  completedAtMs: number | null;
  eliminationReason: string;
  officialDare: boolean;
};

type CommunityJoinUser = {
  id: string;
  username?: string;
  displayName?: string;
  avatar?: string;
};

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getJoinDocId = (challengeId: string, userId: string) =>
  `${challengeId}_${userId}`;

const PROOF_WINDOW_HOURS = 24;
const MIN_REQUIRED_MEMBERS = 3;

const normalizeUsername = (username: string | undefined) =>
  (username || "dareuser").replace(/^@/, "").trim().slice(0, 40) ||
  "dareuser";

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime() || null;
  return null;
};

const parseDurationDays = (durationLabel: string | undefined) => {
  const match = String(durationLabel || "").match(/(\d+)/);
  return Math.min(365, Math.max(1, Number(match?.[1] || 7)));
};

const normalizeSummary = (
  challengeId: string,
  data: any,
): CommunityChallengeSummary => {
  const joinPreview = Array.isArray(data?.join_preview)
    ? data.join_preview
        .slice(0, 3)
        .map((entry: any): CommunityJoinPreviewUser => ({
          id: String(entry.user_id || entry.id || ""),
          username: normalizeUsername(entry.username),
          displayName:
            String(entry.display_name || entry.displayName || entry.username || "Dare User")
              .trim()
              .slice(0, 80) || "Dare User",
          avatarUrl: String(entry.avatar_url || entry.avatarUrl || ""),
        }))
        .filter((entry: CommunityJoinPreviewUser) => entry.id)
    : [];

  const joinedCount = Math.max(0, Number(data?.joined_count || 0));
  const rawBatchStatus = String(data?.batch_status || "");
  const batchStatus =
    rawBatchStatus === "started"
      ? "started"
      : joinedCount > 0
        ? "waiting"
        : "open";

  return {
    challengeId,
    joinedCount,
    activeCount: Math.max(
      0,
      batchStatus === "started"
        ? Number(data?.active_count ?? joinedCount - Number(data?.eliminated_count || 0))
        : Number(data?.active_count ?? 0),
    ),
    completedCount: Math.max(0, Number(data?.completed_count || 0)),
    eliminatedCount: Math.max(0, Number(data?.eliminated_count || 0)),
    joinPreview,
    extraFriends: Math.max(
      0,
      Number(data?.extra_count ?? joinedCount - joinPreview.length),
    ),
    batchStatus,
    minRequiredMembers: Math.max(
      1,
      Number(data?.min_required_members || MIN_REQUIRED_MEMBERS),
    ),
    registrationStartedAtMs: toMillis(data?.registration_started_at),
    registrationEndsAtMs: toMillis(data?.registration_ends_at),
    batchStartedAtMs: toMillis(data?.batch_started_at),
  };
};

const normalizeJoin = (id: string, data: any): CommunityChallengeJoin => {
  const status = [
    "waiting",
    "active",
    "submitted",
    "completed",
    "eliminated",
  ].includes(data?.status)
    ? (data.status as CommunityChallengeJoinStatus)
    : "active";
  const currentDay = Math.max(1, Number(data?.current_day || 1));
  const totalDays = Math.max(currentDay, Number(data?.total_days || 7));
  const displayName =
    String(data?.display_name || data?.username || "Dare User")
      .trim()
      .slice(0, 80) || "Dare User";
  const joinedAtMs = toMillis(data?.joined_at || data?.created_at) || Date.now();
  const proofDueAtMs =
    status === "waiting"
      ? null
      : toMillis(data?.proof_due_at) ||
        joinedAtMs + PROOF_WINDOW_HOURS * 60 * 60 * 1000;

  return {
    id,
    challengeId: String(data?.challenge_id || ""),
    challengeTitle: String(data?.challenge_title || "Community Dare"),
    userId: String(data?.user_id || ""),
    username: normalizeUsername(data?.username),
    displayName,
    avatarUrl: String(data?.avatar_url || ""),
    status,
    currentDay,
    totalDays,
    proofDueAtMs,
    joinedAtMs,
    lastProofDay: Math.max(0, Number(data?.last_proof_day || 0)),
    lastProofAtMs: toMillis(data?.last_proof_at),
    eliminatedAtMs: toMillis(data?.eliminated_at),
    completedAtMs: toMillis(data?.completed_at),
    eliminationReason: String(
      data?.elimination_reason || "Missed the 24-hour proof window.",
    ),
    officialDare: data?.official_dare !== false,
  };
};

class CommunityChallengeService {
  subscribeToSummaries(
    challengeIds: string[],
    callback: (summaries: Record<string, CommunityChallengeSummary>) => void,
  ): Unsubscribe {
    const uniqueIds = Array.from(new Set(challengeIds)).filter(Boolean);
    if (uniqueIds.length === 0) {
      callback({});
      return () => {};
    }

    const chunkSummaries: Record<string, CommunityChallengeSummary>[] = [];
    const unsubscribes = chunk(uniqueIds, 30).map((idChunk, index) => {
      chunkSummaries[index] = {};
      const summariesQuery = query(
        collection(db, "community_challenge_summaries"),
        where(documentId(), "in", idChunk),
      );

      return onSnapshot(
        summariesQuery,
        (snapshot) => {
          const next: Record<string, CommunityChallengeSummary> = {};
          snapshot.docs.forEach((summaryDoc) => {
            next[summaryDoc.id] = normalizeSummary(
              summaryDoc.id,
              summaryDoc.data(),
            );
          });
          chunkSummaries[index] = next;
          callback(Object.assign({}, ...chunkSummaries));
        },
        (error: FirestoreError) => {
          console.warn("Community challenge summaries unavailable:", error.code);
        },
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  subscribeToJoinedChallengeIds(
    userId: string | undefined,
    callback: (joinedChallengeIds: Set<string>) => void,
  ): Unsubscribe {
    if (!userId) {
      callback(new Set());
      return () => {};
    }

    const joinsQuery = query(
      collection(db, "community_challenge_joins"),
      where("user_id", "==", userId),
    );

    return onSnapshot(
      joinsQuery,
      (snapshot) => {
        callback(
          new Set(
            snapshot.docs
              .map((joinDoc) => String(joinDoc.data().challenge_id || ""))
              .filter(Boolean),
          ),
        );
      },
      (error: FirestoreError) => {
        console.warn("Community challenge joins unavailable:", error.code);
      },
    );
  }

  subscribeToJoinedChallenges(
    userId: string | undefined,
    callback: (joins: CommunityChallengeJoin[]) => void,
  ): Unsubscribe {
    if (!userId) {
      callback([]);
      return () => {};
    }

    const joinsQuery = query(
      collection(db, "community_challenge_joins"),
      where("user_id", "==", userId),
    );

    return onSnapshot(
      joinsQuery,
      (snapshot) => {
        callback(
          snapshot.docs
            .map((joinDoc) => normalizeJoin(joinDoc.id, joinDoc.data()))
            .filter((join) => join.challengeId && join.status !== "waiting")
            .sort((a, b) => b.joinedAtMs - a.joinedAtMs),
        );
      },
      (error: FirestoreError) => {
        console.warn("Community challenge joined runs unavailable:", error.code);
      },
    );
  }

  subscribeToChallengeJoin(
    userId: string | undefined,
    challengeId: string | undefined,
    callback: (join: CommunityChallengeJoin | null) => void,
  ): Unsubscribe {
    if (!userId || !challengeId) {
      callback(null);
      return () => {};
    }

    const joinRef = doc(
      db,
      "community_challenge_joins",
      getJoinDocId(challengeId, userId),
    );

    return onSnapshot(
      joinRef,
      (snapshot) => {
        callback(snapshot.exists() ? normalizeJoin(snapshot.id, snapshot.data()) : null);
      },
      (error: FirestoreError) => {
        console.warn("Community challenge run unavailable:", error.code);
      },
    );
  }

  async joinChallenge(
    challenge: Pick<
      CommunityChallenge,
      | "id"
      | "titleTop"
      | "titleAccent"
      | "durationLabel"
      | "creatorUsername"
      | "sponsoredByDare"
      | "batchStatus"
    >,
    user: CommunityJoinUser,
  ) {
    if (!user.id) {
      return { success: false, error: "You must be signed in to join." };
    }
    if (challenge.batchStatus === "started") {
      return {
        success: false,
        error: "This community dare already started. Wait for the next batch.",
      };
    }

    try {
      const joinRef = doc(
        db,
        "community_challenge_joins",
        getJoinDocId(challenge.id, user.id),
      );
      const existingJoin = await getDoc(joinRef);
      if (existingJoin.exists()) {
        return { success: true };
      }

      await setDoc(
        joinRef,
        {
          challenge_id: challenge.id,
          challenge_title: `${challenge.titleTop} ${challenge.titleAccent}`.trim(),
          user_id: user.id,
          username: normalizeUsername(user.username),
          display_name:
            (user.displayName || user.username || "Dare User").trim().slice(0, 80) ||
            "Dare User",
          avatar_url: user.avatar || "",
          status: "waiting",
          current_day: 1,
          total_days: parseDurationDays(challenge.durationLabel),
          proof_due_at: null,
          proof_window_hours: PROOF_WINDOW_HOURS,
          last_proof_day: 0,
          last_proof_at: null,
          eliminated_at: null,
          completed_at: null,
          elimination_reason: "",
          official_dare:
            challenge.creatorUsername === "dare" &&
            challenge.sponsoredByDare === true,
          joined_at: serverTimestamp(),
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
      );

      return { success: true };
    } catch (error) {
      console.warn("Failed to join community challenge:", error);
      return { success: false, error: "Unable to join this community dare." };
    }
  }

  hydrateChallenges(
    challenges: CommunityChallenge[],
    summaries: Record<string, CommunityChallengeSummary>,
  ): CommunityChallenge[] {
    return challenges.map((challenge) => {
      const summary = summaries[challenge.id];
      if (!summary) return challenge;

      return {
        ...challenge,
        joinedCount: summary.joinedCount,
        joinPreview: summary.joinPreview,
        friendNames: summary.joinPreview.map((entry) => entry.displayName),
        extraFriends: summary.extraFriends,
        survivors: summary.activeCount,
        eliminated: summary.eliminatedCount,
        batchStatus: summary.batchStatus,
        minRequiredMembers: summary.minRequiredMembers,
        registrationEndsAtMs: summary.registrationEndsAtMs,
        batchStartedAtMs: summary.batchStartedAtMs,
      };
    });
  }
}

export const communityChallengeService = new CommunityChallengeService();
