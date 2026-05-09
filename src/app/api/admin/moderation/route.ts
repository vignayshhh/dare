/**
 * POST /api/admin/moderation — admin-only moderation executor.
 *
 * This is a thin HTTP wrapper around the `moderationAction` Cloud
 * Function's behaviour (implemented here with the Admin SDK directly
 * for sites that prefer not to deploy Cloud Functions). It requires
 * the admin custom claim on the caller.
 *
 * Body: same shape as the Cloud Function's `ActionPayload`.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { adminDb, adminAuth, FieldValue } from "../../_lib/admin";
import { LIMITS } from "../../_lib/rateLimit";

type Action =
  | "ban_user"
  | "unban_user"
  | "delete_post"
  | "delete_comment"
  | "delete_dare"
  | "delete_truth"
  | "mute_user"
  | "resolve_report";

interface Payload {
  action: Action;
  targetUserId?: string;
  targetContentId?: string;
  reportId?: string;
  reason?: string;
  muteHours?: number;
}

export const POST = withSecurity(
  { rateLimit: LIMITS.MODERATION, requireAdmin: true },
  async (req, ctx) => {
    let p: Payload;
    try {
      p = (await req.json()) as Payload;
    } catch {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }

    switch (p.action) {
      case "ban_user": {
        if (!p.targetUserId) return NextResponse.json({ error: "targetUserId" }, { status: 400 });
        await adminDb.collection("users").doc(p.targetUserId).set(
          { is_banned: true, banned_at: FieldValue.serverTimestamp(), banned_by: ctx.uid },
          { merge: true },
        );
        await adminAuth.updateUser(p.targetUserId, { disabled: true });
        await adminAuth.revokeRefreshTokens(p.targetUserId);
        break;
      }
      case "unban_user": {
        if (!p.targetUserId) return NextResponse.json({ error: "targetUserId" }, { status: 400 });
        await adminDb.collection("users").doc(p.targetUserId).set(
          { is_banned: false, banned_at: FieldValue.delete() },
          { merge: true },
        );
        await adminAuth.updateUser(p.targetUserId, { disabled: false });
        break;
      }
      case "mute_user": {
        if (!p.targetUserId) return NextResponse.json({ error: "targetUserId" }, { status: 400 });
        const hours = Math.max(1, Math.min(24 * 30, p.muteHours ?? 24));
        await adminDb.collection("users").doc(p.targetUserId).set(
          { muted_until: Date.now() + hours * 3600_000 },
          { merge: true },
        );
        break;
      }
      case "delete_post":
      case "delete_comment":
      case "delete_dare":
      case "delete_truth": {
        if (!p.targetContentId) return NextResponse.json({ error: "targetContentId" }, { status: 400 });
        const coll =
          p.action === "delete_post" ? "posts"
          : p.action === "delete_comment" ? "post_comments"
          : p.action === "delete_dare" ? "dares" : "truths";
        await adminDb.collection(coll).doc(p.targetContentId).delete();
        break;
      }
      case "resolve_report": {
        if (!p.reportId) return NextResponse.json({ error: "reportId" }, { status: 400 });
        await adminDb.collection("reports").doc(p.reportId).set(
          { status: "resolved", resolved_by: ctx.uid, resolved_at: FieldValue.serverTimestamp() },
          { merge: true },
        );
        break;
      }
      default:
        return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }

    await adminDb.collection("moderation_actions").add({
      admin_id: ctx.uid,
      action: p.action,
      target_user_id: p.targetUserId ?? null,
      target_content_id: p.targetContentId ?? null,
      report_id: p.reportId ?? null,
      reason: (p.reason ?? "").slice(0, 2000),
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  },
);
