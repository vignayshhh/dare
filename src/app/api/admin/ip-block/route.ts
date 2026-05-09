/**
 * Admin IP block management.
 *   GET    /api/admin/ip-block           — list blocked ips
 *   POST   /api/admin/ip-block   { ip }  — block
 *   DELETE /api/admin/ip-block   { ip }  — unblock
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { adminDb, FieldValue } from "../../_lib/admin";
import { blockIp, unblockIp, listBlockedIps } from "../../_lib/ipBlock";
import { LIMITS } from "../../_lib/rateLimit";

const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{3,45}$/;

export const GET = withSecurity(
  { rateLimit: LIMITS.MODERATION, requireAdmin: true, skipCsrf: true },
  async () => NextResponse.json({ ok: true, ips: await listBlockedIps() }),
);

export const POST = withSecurity(
  { rateLimit: LIMITS.MODERATION, requireAdmin: true },
  async (req, ctx) => {
    const { ip, reason } = (await req.json()) as { ip?: string; reason?: string };
    if (!ip || !IP_RE.test(ip)) return NextResponse.json({ error: "bad ip" }, { status: 400 });
    await blockIp(ip, reason);
    await adminDb.collection("ip_blocks").doc(ip).set({
      ip,
      reason: (reason ?? "").slice(0, 500),
      blocked_by: ctx.uid,
      blocked_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = withSecurity(
  { rateLimit: LIMITS.MODERATION, requireAdmin: true },
  async (req) => {
    const { ip } = (await req.json()) as { ip?: string };
    if (!ip || !IP_RE.test(ip)) return NextResponse.json({ error: "bad ip" }, { status: 400 });
    await unblockIp(ip);
    await adminDb.collection("ip_blocks").doc(ip).delete().catch(() => undefined);
    return NextResponse.json({ ok: true });
  },
);
