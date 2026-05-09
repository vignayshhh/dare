/**
 * Bootstrap the FIRST admin user offline.
 *
 * Usage (from a trusted machine with a service account key):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx ts-node scripts/set-admin.ts <firebase-uid>
 *
 * After running once, use the `setAdminRole` callable from the app for
 * further admin grants (so you never need to re-distribute the SA key).
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error("Usage: ts-node scripts/set-admin.ts <uid>");
    process.exit(1);
  }

  initializeApp({ credential: applicationDefault() });
  await getAuth().setCustomUserClaims(uid, { admin: true });
  await getAuth().revokeRefreshTokens(uid);
  console.log(`Set admin:true on ${uid}. User must sign in again to get the new token.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
