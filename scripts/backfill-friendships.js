/*
 * Backfill canonical friendship documents for legacy accepted friendships.
 *
 * Why this exists:
 * Firestore story read rules use deterministic friendship doc IDs:
 *   `${sortedUserIdA}_${sortedUserIdB}`
 * Older app versions created friendship docs with random IDs, which means
 * accepted friends can still fail `isFriend(...)` checks in Firestore rules.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/backfill-friendships.js --dry-run
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/backfill-friendships.js --apply
 */

const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function getCanonicalFriendshipId(userA, userB) {
  return [userA, userB].sort().join("_");
}

function usage() {
  console.log(
    "Usage: node scripts/backfill-friendships.js [--dry-run|--apply]\n" +
      "Requires GOOGLE_APPLICATION_CREDENTIALS to point at a Firebase service account JSON file.",
  );
}

async function main() {
  const mode = process.argv[2] || "--dry-run";
  if (!["--dry-run", "--apply"].includes(mode)) {
    usage();
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is required.",
    );
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }

  const db = getFirestore();
  const friendshipsRef = db.collection("friendships");
  const snapshot = await friendshipsRef.get();

  let scanned = 0;
  let skipped = 0;
  let alreadyCanonical = 0;
  let alreadyBackfilled = 0;
  let needsBackfill = 0;
  let writes = 0;

  for (const docSnap of snapshot.docs) {
    scanned += 1;
    const data = docSnap.data();
    const requesterId = data.requester_id;
    const addresseeId = data.addressee_id;
    const status = data.status;

    if (!requesterId || !addresseeId) {
      skipped += 1;
      console.warn(`Skipping ${docSnap.id}: missing requester_id/addressee_id`);
      continue;
    }

    if (status !== "accepted") {
      skipped += 1;
      continue;
    }

    const canonicalId = getCanonicalFriendshipId(requesterId, addresseeId);

    if (docSnap.id === canonicalId) {
      alreadyCanonical += 1;
      continue;
    }

    const canonicalRef = friendshipsRef.doc(canonicalId);
    const canonicalSnap = await canonicalRef.get();

    if (canonicalSnap.exists) {
      const canonicalData = canonicalSnap.data() || {};
      if (canonicalData.status === "accepted") {
        alreadyBackfilled += 1;
        continue;
      }
    }

    needsBackfill += 1;
    console.log(
      `${mode === "--apply" ? "Backfilling" : "Would backfill"} ${docSnap.id} -> ${canonicalId}`,
    );

    if (mode === "--apply") {
      await canonicalRef.set(
        {
          requester_id: requesterId,
          addressee_id: addresseeId,
          status: "accepted",
          created_at: data.created_at || null,
          accepted_at: data.accepted_at || null,
          updated_at: data.updated_at || null,
        },
        { merge: true },
      );
      writes += 1;
    }
  }

  console.log("");
  console.log("Friendship backfill summary:");
  console.log(`  scanned: ${scanned}`);
  console.log(`  skipped: ${skipped}`);
  console.log(`  already canonical: ${alreadyCanonical}`);
  console.log(`  already backfilled: ${alreadyBackfilled}`);
  console.log(`  needs backfill: ${needsBackfill}`);
  console.log(`  writes performed: ${writes}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
