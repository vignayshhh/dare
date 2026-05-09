/**
 * Server-side half of the double-submit CSRF check. The edge
 * middleware already blocks cross-origin POSTs; API handlers add this
 * second layer so even a same-origin XSS still can't forge state
 * changes (it would need to read the cookie AND echo it — which is
 * SameSite=strict locked — and evade the token check).
 */
import "server-only";

export function verifyCsrf(req: Request): boolean {
  const header = req.headers.get("x-csrf-token");
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  const cookieToken = match ? decodeURIComponent(match[1]!) : null;
  if (!header || !cookieToken) return false;
  return header === cookieToken;
}
