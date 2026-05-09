/**
 * Scheduled cleanup jobs.
 *   - rate_limits: prune expired docs.
 *   - stories: delete expired stories (server-side authoritative).
 *   - ephemeral_events: prune > 7 days.
 */
import { onSchedule } from "firebase-functions";
import { logger } from "firebase-functions";
import { adminDb } from "../lib/admin";

const REGION = "asia-south1";

const BATCH = 300;

async function deleteQueryBatch(
  query: FirebaseFirestore.Query,
  label: string,
): Promise<number> {
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await query.limit(BATCH).get();
    if (snap.empty) break;
    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH) break;
  }
  logger.info(`${label}: pruned ${total} docs`);
  return total;
}

// Hourly: drop rate_limits whose window ended > 2 windows ago.
export const pruneRateLimits = onSchedule("every 1 hours", async () => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const q = adminDb
    .collection("rate_limits")
    .where("window_start", "<", new Date(twoHoursAgo));
  await deleteQueryBatch(q, "rate_limits");
});

// Every 15 min: delete expired stories.
export const pruneExpiredStories = onSchedule("every 15 minutes", async () => {
  const q = adminDb.collection("stories").where("expiresAt", "<", Date.now());
  await deleteQueryBatch(q, "stories");
});

// Daily: drop old feed/screenshot/message events we don't need forever.
export const pruneOldEvents = onSchedule("every 24 hours", async () => {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(sevenDaysAgo);
  await deleteQueryBatch(
    adminDb.collection("feed_events").where("created_at", "<", cutoff),
    "feed_events",
  );
  await deleteQueryBatch(
    adminDb.collection("screenshot_events").where("created_at", "<", cutoff),
    "screenshot_events",
  );
  await deleteQueryBatch(
    adminDb.collection("message_events").where("created_at", "<", cutoff),
    "message_events",
  );
});
