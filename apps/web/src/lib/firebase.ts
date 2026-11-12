import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env;
const useEmulator = env.VITE_USE_EMULATOR === 'true';

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'demo-arena',
  appId: env.VITE_FIREBASE_APP_ID,
});

const databaseId = env.VITE_FIRESTORE_DATABASE ?? '(default)';
export const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
if (useEmulator) connectFirestoreEmulator(db, '127.0.0.1', Number(env.VITE_FIRESTORE_EMULATOR_PORT ?? 8085));
