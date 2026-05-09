import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  databaseURL?: string;
};

const requiredFirebaseEnv = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

function getFirebaseConfig(): FirebaseConfig | null {
  // IMPORTANT: Must use direct property access (not bracket notation) so Next.js
  // can inline these NEXT_PUBLIC_ vars into the client bundle at build time.
  const envValues: Record<string, string | undefined> = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missingFirebaseEnv = requiredFirebaseEnv.filter(
    (key) => !envValues[key],
  );

  if (missingFirebaseEnv.length > 0) {
    // In development, allow missing Firebase config for UI testing
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `⚠️ Firebase environment variables missing: ${missingFirebaseEnv.join(", ")}. App will run in mock mode.`,
      );
      return null;
    }
    throw new Error(
      `Missing Firebase environment variables: ${missingFirebaseEnv.join(", ")}`,
    );
  }

  return {
    apiKey: envValues.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: envValues.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: envValues.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: envValues.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: envValues.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: envValues.NEXT_PUBLIC_FIREBASE_APP_ID!,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  };
}

const firebaseConfig = getFirebaseConfig();

let app: any = null;
let auth: any = null;
let db: any = null;
let realtimeDb: any = null;
let storage: any = null;
let firebaseInitialized = false;
let firebaseInitError: Error | null = null;
const appCheckDebugSetting =
  process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG?.trim() || "";

// Lazy initialization function to prevent module-level hanging on mobile
function initializeFirebase() {
  if (firebaseInitialized || !firebaseConfig) {
    return;
  }

  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }

    // SECURITY: Initialize Firebase App Check (reCAPTCHA v3) in the browser only.
    // Enable by setting NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY in your env after
    // configuring App Check in Firebase Console -> App Check -> Register app.
    // Until the env var is set, this is a silent no-op.
    // Skip on mobile to prevent hanging on reCAPTCHA loading (mobile browsers can
    // have issues with reCAPTCHA v3, and the allowedDevOrigins fix in next.config.js
    // resolves the real mobile touch issue)
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );
    if (
      typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY &&
      !isMobile
    ) {
      try {
        // Debug token for local development — set window.FIREBASE_APPCHECK_DEBUG_TOKEN
        // to true before this runs, then copy the token printed in console to the
        // Firebase Console -> App Check -> Debug tokens list.
        if (process.env.NODE_ENV === "development" && appCheckDebugSetting) {
          (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
            appCheckDebugSetting === "true"
              ? true
              : appCheckDebugSetting;
        }
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(
            process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY,
          ),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) {
        console.warn("App Check init failed (continuing without):", e);
      }
    }

    auth = getAuth(app);

    if (typeof window !== "undefined") {
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        db = getFirestore(app);
      }
    } else {
      db = getFirestore(app);
    }

    realtimeDb = getDatabase(app);
    storage = getStorage(app);
    firebaseInitialized = true;
  } catch (error) {
    console.error("Firebase initialization error:", error);
    firebaseInitError = error as Error;
    firebaseInitialized = true; // Mark as initialized even if failed
  }
}

// Initialize Firebase
if (firebaseConfig) {
  initializeFirebase();
} else {
  console.warn("⚠️ Firebase not configured. Running in mock mode.");
  firebaseInitialized = true;
}

export {
  auth,
  db,
  realtimeDb,
  storage,
  app,
  initializeFirebase,
  firebaseInitialized,
  firebaseInitError,
};
export default app;
