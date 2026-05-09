/**
 * Email PII migration trigger (§1.1).
 *
 * When a user document is created, move the `email` field from the
 * publicly-readable `/users/{uid}` document into the owner-only
 * `/users/{uid}/private/contact` subcollection, and scrub it from the
 * main doc. This makes email invisible to other signed-in users while
 * still letting the owner read their own email client-side.
 */
import { onDocumentWritten } from "firebase-functions/firestore";
import { logger } from "firebase-functions";
import { adminDb, FieldValue } from "../lib/admin";

const REGION = "asia-south1";

export const migrateEmailPrivate = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return;
    const email = after.email as string | undefined;
    if (!email || typeof email !== "string") return;

    const uid = event.params.uid;
    const privateRef = adminDb
      .collection("users")
      .doc(uid)
      .collection("private")
      .doc("contact");

    await adminDb.runTransaction(async (tx) => {
      const privSnap = await tx.get(privateRef);
      const currentEmail = privSnap.exists
        ? (privSnap.get("email") as string | undefined)
        : undefined;
      if (currentEmail !== email) {
        tx.set(
          privateRef,
          { email, updated_at: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
      // Remove from public doc. This is the step that actually closes the PII leak.
      tx.update(adminDb.collection("users").doc(uid), {
        email: FieldValue.delete(),
      });
    });

    logger.info("email migrated to private subcollection", { uid });
  },
);
