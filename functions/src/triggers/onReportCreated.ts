/**
 * Auto-moderation hook for reports.
 *
 * When N unique users report the same content within a short window,
 * automatically flag it (set `auto_flagged: true`) and surface it to
 * the admin review queue. Actual takedown still requires an admin
 * clicking through the moderation callable.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { adminDb, FieldValue } from "../lib/admin";

const REGION = "asia-south1";
const AUTO_FLAG_THRESHOLD = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const onReportCreated = onDocumentCreated(
  { document: "reports/{reportId}", region: REGION },
  async (event) => {
    const data = event.data?.data();
    if (!data?.content_id || !data?.content_type) return;

    const cutoff = new Date(Date.now() - WINDOW_MS);
    const recent = await adminDb
      .collection("reports")
      .where("content_id", "==", data.content_id)
      .where("content_type", "==", data.content_type)
      .where("created_at", ">=", cutoff)
      .get();

    const uniqueReporters = new Set(
      recent.docs.map((d) => d.get("reporter_id")).filter(Boolean),
    );

    if (uniqueReporters.size >= AUTO_FLAG_THRESHOLD) {
      const coll = data.content_type === "post" ? "posts"
                 : data.content_type === "comment" ? "post_comments"
                 : data.content_type === "dare" ? "dares"
                 : data.content_type === "truth" ? "truths"
                 : null;
      if (coll) {
        await adminDb
          .collection(coll)
          .doc(data.content_id)
          .set(
            { auto_flagged: true, auto_flagged_at: FieldValue.serverTimestamp() },
            { merge: true },
          );
        logger.warn("content auto-flagged", {
          coll,
          id: data.content_id,
          reporters: uniqueReporters.size,
        });
      }
    }
  },
);
