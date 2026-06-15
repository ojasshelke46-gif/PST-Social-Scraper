import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let _app: App | null = null;
let _db: Firestore | null = null;

/**
 * Lazily initialise the Firebase Admin SDK.
 * Called only inside request handlers — never at module load time —
 * so the build phase never touches it (and empty env vars don't crash the build).
 */
export function getAdminDb(): Firestore {
  if (_db) return _db;

  if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error(
      "Firebase Admin env vars are not set (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)."
    );
  }

  if (getApps().length === 0) {
    _app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Env vars stored in Vercel/CI encode newlines as the literal "\n" — unescape them.
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    _app = getApp();
  }

  _db = getFirestore(_app);
  return _db;
}
