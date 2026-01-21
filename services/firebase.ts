
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { logger } from './logger';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let firebaseConfigError = false;

// Strict Validation: Check if ANY required key is missing or is a placeholder
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const isMissingKeys = requiredKeys.some(key => !firebaseConfig[key as keyof typeof firebaseConfig]);
const isPlaceholder = firebaseConfig.apiKey?.includes('INSERT_KEY') || firebaseConfig.apiKey?.includes('DummyKey');

if (isMissingKeys || isPlaceholder) {
  firebaseConfigError = true;
  logger.error('Firebase Config Missing or Invalid', { config: firebaseConfig });
  // We do NOT initialize app here to prevent "Permission Denied" loops on startup
} else {
  try {
    app = initializeApp(firebaseConfig as any);
    db = getFirestore(app);
    functions = getFunctions(app);
    logger.info('Firebase Initialized Successfully', { projectId: firebaseConfig.projectId });
  } catch (e: any) {
    logger.error('Firebase Initialization Crashed', { error: e.message });
    firebaseConfigError = true;
  }
}

export { app, db, functions, firebaseConfigError, firebaseConfig };
