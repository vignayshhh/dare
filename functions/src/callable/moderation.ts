/**
 * Moderation execution (§2.1, §2.10).
 *
 * Reports are created freely by signed-in users via Firestore rules.
 * Actually *executing* a ban / takedown requires server privilege,
 * which this callable provides. Callers must have the `admin: true`
 * custom claim (set via `setAdminRole` below or offline with the
 * scripts/set-admin.ts helper).
 *
 * Supported actions:
 *   - ban_user: set users/{uid}.is_banned=true, disable auth user
 *   - unban_user
 *   - delete_post: delete posts/{id}
 *   - delete_comment: delete post_comments/{id}
 *   - delete_dare / delete_truth
 *   - mute_user (N hours): set users/{uid}.muted_until timestamp
 *   - resolve_report: set reports/{id}.status='resolved'
 */
import { onCall, HttpsError } from "firebase-functions/https";
import { logger } from "firebase-functions";
import { adminDb, adminAuth, FieldValue } from "../lib/admin";

const REGION = "asia-south1";

type Action =
  | "ban_user"
  | "unban_user"
  | "delete_post"
  | "delete_comment"
  | "delete_dare"
  | "delete_truth"
  | "mute_user"
  | "resolve_report";

interface ActionPayload {
  action: Action;
  targetUserId?: string;
  targetContentId?: string;
  reportId?: string;
  reason?: string;
  muteHours?: number;
}

function requireAdmin(ctxAuth: { token: Record<string, unknown> } | undefined) {
  if (!ctxAuth) throw new HttpsError("unauthenticated", "Sign-in required");
  if (ctxAuth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
}

async function recordAction(
  adminUid: string,
  payload: ActionPayload,
): Promise<void> {
  await adminDb.collection("moderation_actions").add({
    admin_id: adminUid,
    action: payload.action,
    target_user_id: payload.targetUserId ?? null,
    target_content_id: payload.targetContentId ?? null,
    report_id: payload.reportId ?? null,
    reason: (payload.reason ?? "").slice(0, 2000),
    created_at: FieldValue.serverTimestamp(),
  });
}

export const moderationAction = onCall({ region: REGION }, async (req) => {
  requireAdmin(req.auth as unknown as { token: Record<string, unknown> });
  const adminUid = req.auth!.uid;
  const p = req.data;

  switch (p.action) {
    case "ban_user": {
      if (!p.targetUserId)
        throw new HttpsError("invalid-argument", "targetUserId required");
      await adminDb
        .collection("users")
        .doc(p.targetUserId)
        .set(
          {
            is_banned: true,
            banned_at: FieldValue.serverTimestamp(),
            banned_by: adminUid,
          },
          { merge: true },
        );
      await adminAuth.updateUser(p.targetUserId, { disabled: true });
      // Revoke all refresh tokens so they're signed out immediately.
      await adminAuth.revokeRefreshTokens(p.targetUserId);
      break;
    }
    case "unban_user": {
      if (!p.targetUserId)
        throw new HttpsError("invalid-argument", "targetUserId required");
      await adminDb
        .collection("users")
        .doc(p.targetUserId)
        .set(
          { is_banned: false, banned_at: FieldValue.delete() },
          { merge: true },
        );
      await adminAuth.updateUser(p.targetUserId, { disabled: false });
      break;
    }
    case "mute_user": {
      if (!p.targetUserId)
        throw new HttpsError("invalid-argument", "targetUserId required");
      const hours = Math.max(1, Math.min(24 * 30, p.muteHours ?? 24));
      const until = Date.now() + hours * 3600 * 1000;
      await adminDb
        .collection("users")
        .doc(p.targetUserId)
        .set({ muted_until: until }, { merge: true });
      break;
    }
    case "delete_post":
    case "delete_comment":
    case "delete_dare":
    case "delete_truth": {
      if (!p.targetContentId)
        throw new HttpsError("invalid-argument", "targetContentId required");
      const coll =
        p.action === "delete_post"
          ? "posts"
          : p.action === "delete_comment"
            ? "post_comments"
            : p.action === "delete_dare"
              ? "dares"
              : "truths";
      await adminDb.collection(coll).doc(p.targetContentId).delete();
      break;
    }
    case "resolve_report": {
      if (!p.reportId)
        throw new HttpsError("invalid-argument", "reportId required");
      await adminDb
        .collection("reports")
        .doc(p.reportId)
        .set(
          {
            status: "resolved",
            resolved_by: adminUid,
            resolved_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      break;
    }
    default:
      throw new HttpsError("invalid-argument", `Unknown action ${p.action}`);
  }

  await recordAction(adminUid, p);
  logger.info("moderation action executed", {
    admin: adminUid,
    action: p.action,
  });
  return { success: true };
});

// ─── Bootstrap: set the admin custom claim on a user. ────────────────
// Only an existing admin may call this. Bootstrap the FIRST admin with
// `scripts/set-admin.ts` running under a service account key.
export const setAdminRole = onCall({ region: REGION }, async (req) => {
  requireAdmin(req.auth as unknown as { token: Record<string, unknown> });
  const { targetUserId, admin } = req.data;
  if (!targetUserId)
    throw new HttpsError("invalid-argument", "targetUserId required");
  await adminAuth.setCustomUserClaims(targetUserId, { admin: !!admin });
  await adminAuth.revokeRefreshTokens(targetUserId);
  return { success: true };
});
