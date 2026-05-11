/**
 * Firebase Admin SDK singleton for Next.js API routes.
 *
 * Credentials are loaded from `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON
 * string of a service account key). On Vercel set this as a single-line
 * secret. In local dev, put the JSON in `.env.local`.
 *
 * NEVER expose these credentials in client bundles — this file must only
 * be imported from server-only paths (`src/app/api/**`).
 */
import "server-only";
import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const svcProject: string | undefined = parsed.project_id;
      const clientProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      if (svcProject && clientProject && svcProject !== clientProject) {
        // This is the #1 reason for prod-only 401s on every authenticated
        // route: the service account belongs to a different Firebase
        // project than the client, so every ID token's `aud` fails
        // verification. Log loudly so the deploy logs make it obvious.
        // eslint-disable-next-line no-console
        console.error(
          `[firebase-admin] PROJECT MISMATCH: service account project_id="${svcProject}" ` +
            `but NEXT_PUBLIC_FIREBASE_PROJECT_ID="${clientProject}". ` +
            `All verifyIdToken calls will return 401. ` +
            `Fix: replace FIREBASE_SERVICE_ACCOUNT_JSON with a key from project "${clientProject}".`,
        );
      } else if (svcProject) {
        // eslint-disable-next-line no-console
        console.log(`[firebase-admin] initialised for project="${svcProject}"`);
      }
      return initializeApp({
        credential: cert(parsed),
        projectId: svcProject,
      });
    } catch (e) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  // Fallback: GCP / Cloud Run / local `gcloud auth application-default login`.
  try {
    return initializeApp({ credential: applicationDefault() });
  } catch (e) {
    throw new Error(
      "Firebase Admin SDK could not initialize. Set FIREBASE_SERVICE_ACCOUNT_JSON " +
        "in .env.local / .env.development.local to the full JSON of a Firebase service " +
        "account key (Firebase Console → Project Settings → Service accounts → Generate " +
        "new private key). Underlying error: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

const app = getAdminApp();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);

export { FieldValue } from "firebase-admin/firestore";
