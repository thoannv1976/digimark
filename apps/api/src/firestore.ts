import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** Uses FIRESTORE_EMULATOR_HOST automatically when it is set. */
export function openFirestore(projectId: string, databaseId: string): Firestore {
  const app = getApps()[0] ?? initializeApp({ projectId });
  const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() can only be called once per instance (tests reuse it).
  }
  return db;
}
