import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb, FieldValue } from "../lib/admin";

const PROOF_WINDOW_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_BATCH_MEMBERS = 3;
const REGION = "asia-south1";

const joinPreviewFromData = (data: DocumentData) => ({
  user_id: String(data.user_id || ""),
  username: String(data.username || "dareuser").replace(/^@/, "").slice(0, 40),
  display_name: String(data.display_name || data.username || "Dare User").slice(
    0,
    80,
  ),
  avatar_url: String(data.avatar_url || "").slice(0, 2000),
});

const getJoinDocId = (challengeId: string, userId: string) =>
  `${challengeId}_${userId}`;

const getNextProofDueAt = () => Timestamp.fromMillis(Date.now() + PROOF_WINDOW_MS);

const getProofDueAtFrom = (startMs: number) =>
  Timestamp.fromMillis(startMs + PROOF_WINDOW_MS);

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  return null;
};

const getStatus = (data: DocumentData) => {
  const status = String(data.status || "active");
  return ["waiting", "active", "submitted", "completed", "eliminated"].includes(status)
    ? status
    : "active";
};

const startCommunityChallengeBatch = async (
  challengeId: string,
  batchStartedAtMs: number,
) => {
  const waitingSnap = await adminDb
    .collection("community_challenge_joins")
    .where("challenge_id", "==", challengeId)
    .where("status", "==", "waiting")
    .get();

  if (waitingSnap.empty) return;

  const proofDueAt = getProofDueAtFrom(batchStartedAtMs);
  const batch = adminDb.batch();
  waitingSnap.docs.forEach((joinDoc) => {
    const data = joinDoc.data();
    batch.set(
      joinDoc.ref,
      {
        status: "active",
        current_day: Math.max(1, Number(data.current_day || 1)),
        total_days: Math.max(1, Number(data.total_days || 7)),
        proof_due_at: proofDueAt,
        proof_window_hours: 24,
        batch_started_at: Timestamp.fromMillis(batchStartedAtMs),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};

export const onCommunityChallengeJoinCreated = onDocumentCreated(
  "community_challenge_joins/{joinId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (!data?.challenge_id || !data?.user_id) return;

    const challengeId = String(data.challenge_id);
    const summaryRef = adminDb
      .collection("community_challenge_summaries")
      .doc(challengeId);
    const joinRef = snap.ref;

    let shouldStartBatch = false;
    let batchStartedAtMs = Date.now();

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(summaryRef);
      const current = snap.exists ? snap.data() || {} : {};
      const batchAlreadyStarted = current.batch_status === "started";
      const currentPreview = Array.isArray(current.join_preview)
        ? current.join_preview
        : [];
      const previewWithoutUser = currentPreview.filter(
        (entry: any) => entry?.user_id !== data.user_id,
      );
      const nextPreview = [
        joinPreviewFromData(data),
        ...previewWithoutUser,
      ].slice(0, 3);
      const nextCount = Math.max(0, Number(current.joined_count || 0) + 1);
      const registrationStartedAtMs =
        toMillis(current.registration_started_at) || Date.now();
      const registrationEndsAtMs =
        toMillis(current.registration_ends_at) ||
        registrationStartedAtMs + REGISTRATION_WINDOW_MS;
      shouldStartBatch = !batchAlreadyStarted && nextCount >= MIN_BATCH_MEMBERS;
      batchStartedAtMs = shouldStartBatch
        ? Date.now()
        : toMillis(current.batch_started_at) || Date.now();
      const nextBatchStatus =
        batchAlreadyStarted || shouldStartBatch
          ? "started"
          : nextCount > 0
            ? "waiting"
            : "open";
      const nextActiveCount =
        nextBatchStatus === "started"
          ? Math.max(nextCount, Number(current.active_count || 0))
          : 0;

      tx.set(
        joinRef,
        {
          status: shouldStartBatch || batchAlreadyStarted ? "active" : "waiting",
          current_day: Math.max(1, Number(data.current_day || 1)),
          total_days: Math.max(1, Number(data.total_days || 7)),
          proof_due_at:
            shouldStartBatch || batchAlreadyStarted
              ? getProofDueAtFrom(batchStartedAtMs)
              : null,
          proof_window_hours: 24,
          last_proof_day: Math.max(0, Number(data.last_proof_day || 0)),
          official_dare: data.official_dare !== false,
          batch_started_at:
            shouldStartBatch || batchAlreadyStarted
              ? Timestamp.fromMillis(batchStartedAtMs)
              : null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(
        summaryRef,
        {
          challenge_id: challengeId,
          challenge_title: data.challenge_title || "",
          joined_count: nextCount,
          active_count: nextActiveCount,
          completed_count: Math.max(0, Number(current.completed_count || 0)),
          eliminated_count: Math.max(0, Number(current.eliminated_count || 0)),
          join_preview: nextPreview,
          extra_count: Math.max(0, nextCount - nextPreview.length),
          batch_status: nextBatchStatus,
          min_required_members: MIN_BATCH_MEMBERS,
          registration_window_hours: 48,
          registration_started_at:
            nextBatchStatus === "open"
              ? null
              : Timestamp.fromMillis(registrationStartedAtMs),
          registration_ends_at:
            nextBatchStatus === "open"
              ? null
              : Timestamp.fromMillis(registrationEndsAtMs),
          batch_started_at:
            shouldStartBatch || batchAlreadyStarted
              ? Timestamp.fromMillis(batchStartedAtMs)
              : null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    if (shouldStartBatch) {
      await startCommunityChallengeBatch(challengeId, batchStartedAtMs);
    }

    logger.info("community challenge summary incremented", { challengeId });
  },
);

export const onCommunityChallengeJoinDeleted = onDocumentDeleted(
  "community_challenge_joins/{joinId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.challenge_id || !data?.user_id) return;

    const challengeId = String(data.challenge_id);
    const summaryRef = adminDb
      .collection("community_challenge_summaries")
      .doc(challengeId);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(summaryRef);
      if (!snap.exists) return;
      const current = snap.data() || {};
      const currentPreview = Array.isArray(current.join_preview)
        ? current.join_preview
        : [];
      const nextPreview = currentPreview.filter(
        (entry: any) => entry?.user_id !== data.user_id,
      );
      const nextCount = Math.max(0, Number(current.joined_count || 0) - 1);
      const status = getStatus(data);
      const activeDelta =
        status === "active" || status === "submitted" ? -1 : 0;
      const completedDelta = status === "completed" ? -1 : 0;
      const eliminatedDelta = status === "eliminated" ? -1 : 0;
      const nextBatchStatus =
        nextCount <= 0
          ? "open"
          : current.batch_status === "started"
            ? "started"
            : "waiting";

      tx.set(
        summaryRef,
        {
          joined_count: nextCount,
          active_count: Math.max(0, Number(current.active_count || 0) + activeDelta),
          completed_count: Math.max(
            0,
            Number(current.completed_count || 0) + completedDelta,
          ),
          eliminated_count: Math.max(
            0,
            Number(current.eliminated_count || 0) + eliminatedDelta,
          ),
          join_preview: nextPreview,
          extra_count: Math.max(0, nextCount - nextPreview.length),
          batch_status: nextBatchStatus,
          registration_started_at:
            nextBatchStatus === "open" ? null : current.registration_started_at || null,
          registration_ends_at:
            nextBatchStatus === "open" ? null : current.registration_ends_at || null,
          batch_started_at:
            nextBatchStatus === "started" ? current.batch_started_at || null : null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    logger.info("community challenge summary decremented", { challengeId });
  },
);

export const onChallengeRoomProofCreated = onDocumentCreated(
  "challenge_room_proofs/{proofId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.challenge_id || !data?.submitter_id) return;

    const challengeId = String(data.challenge_id);
    const userId = String(data.submitter_id);
    const proofDay = Math.max(1, Number(data.day || 1));
    const joinRef = adminDb
      .collection("community_challenge_joins")
      .doc(getJoinDocId(challengeId, userId));

    await adminDb.runTransaction(async (tx) => {
      const joinSnap = await tx.get(joinRef);
      if (!joinSnap.exists) return;

      const join = joinSnap.data() || {};
      const status = getStatus(join);
      const currentDay = Math.max(1, Number(join.current_day || 1));
      const totalDays = Math.max(currentDay, Number(join.total_days || 7));

      if (
        join.official_dare === false ||
        status === "completed" ||
        status === "eliminated" ||
        proofDay !== currentDay
      ) {
        return;
      }

      tx.set(
        joinRef,
        {
          status: "submitted",
          last_proof_day: proofDay,
          last_proof_at: FieldValue.serverTimestamp(),
          total_days: totalDays,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    logger.info("community challenge proof accepted", {
      challengeId,
      userId,
      proofDay,
    });
  },
);

export const processCommunityChallengeDeadlines = onSchedule(
  { schedule: "every 15 minutes", region: REGION },
  async () => {
    const now = Timestamp.now();
    const dueSnap = await adminDb
      .collection("community_challenge_joins")
      .where("proof_due_at", "<=", now)
      .limit(250)
      .get();

    let eliminated = 0;
    let advanced = 0;
    let completed = 0;

    for (const joinDoc of dueSnap.docs) {
      await adminDb.runTransaction(async (tx) => {
        const joinSnap = await tx.get(joinDoc.ref);
        if (!joinSnap.exists) return;

        const join = joinSnap.data() || {};
        if (join.official_dare === false) return;

        const status = getStatus(join);
        if (status === "completed" || status === "eliminated") {
          tx.set(
            joinDoc.ref,
            { proof_due_at: null, updated_at: FieldValue.serverTimestamp() },
            { merge: true },
          );
          return;
        }

        const challengeId = String(join.challenge_id || "");
        const userId = String(join.user_id || "");
        const currentDay = Math.max(1, Number(join.current_day || 1));
        const totalDays = Math.max(currentDay, Number(join.total_days || 7));
        const lastProofDay = Math.max(0, Number(join.last_proof_day || 0));
        const summaryRef = adminDb
          .collection("community_challenge_summaries")
          .doc(challengeId);
        const summarySnap = await tx.get(summaryRef);
        const summary = summarySnap.exists ? summarySnap.data() || {} : {};
        const currentPreview = Array.isArray(summary.join_preview)
          ? summary.join_preview
          : [];

        if (status === "submitted" && lastProofDay >= currentDay) {
          if (currentDay >= totalDays) {
            tx.set(
              joinDoc.ref,
              {
                status: "completed",
                proof_due_at: null,
                completed_at: FieldValue.serverTimestamp(),
                updated_at: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            tx.set(
              summaryRef,
              {
                active_count: Math.max(0, Number(summary.active_count || 0) - 1),
                completed_count: Math.max(
                  0,
                  Number(summary.completed_count || 0) + 1,
                ),
                updated_at: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            completed += 1;
            return;
          }

          tx.set(
            joinDoc.ref,
            {
              status: "active",
              current_day: currentDay + 1,
              proof_due_at: getNextProofDueAt(),
              updated_at: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          advanced += 1;
          return;
        }

        tx.set(
          joinDoc.ref,
          {
            status: "eliminated",
            proof_due_at: null,
            eliminated_at: FieldValue.serverTimestamp(),
            elimination_reason: "Missed the 24-hour proof window.",
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        tx.set(
          summaryRef,
          {
            active_count: Math.max(0, Number(summary.active_count || 0) - 1),
            eliminated_count: Math.max(
              0,
              Number(summary.eliminated_count || 0) + 1,
            ),
            join_preview: currentPreview.filter(
              (entry: any) => entry?.user_id !== userId,
            ),
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        eliminated += 1;
      });
    }

    logger.info("community challenge deadlines processed", {
      checked: dueSnap.size,
      advanced,
      completed,
      eliminated,
    });

    const expiredWaitingSummaries = await adminDb
      .collection("community_challenge_summaries")
      .where("batch_status", "==", "waiting")
      .where("registration_ends_at", "<=", now)
      .limit(100)
      .get();

    let resetBatches = 0;
    for (const summaryDoc of expiredWaitingSummaries.docs) {
      const summary = summaryDoc.data() || {};
      const joinedCount = Math.max(0, Number(summary.joined_count || 0));
      if (joinedCount >= MIN_BATCH_MEMBERS) continue;

      const waitingSnap = await adminDb
        .collection("community_challenge_joins")
        .where("challenge_id", "==", summaryDoc.id)
        .where("status", "==", "waiting")
        .get();
      const batch = adminDb.batch();
      waitingSnap.docs.forEach((joinDoc) => batch.delete(joinDoc.ref));
      batch.set(
        summaryDoc.ref,
        {
          joined_count: 0,
          active_count: 0,
          completed_count: 0,
          eliminated_count: 0,
          join_preview: [],
          extra_count: 0,
          batch_status: "open",
          registration_started_at: null,
          registration_ends_at: null,
          batch_started_at: null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();
      resetBatches += 1;
    }

    if (resetBatches > 0) {
      logger.info("community challenge waiting batches reset", {
        resetBatches,
      });
    }
  },
);
