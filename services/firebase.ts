
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { logger } from './logger';

const runtimeConfig = (window as any).__RUNTIME_CONFIG__;

if (!runtimeConfig) {
  throw new Error("Runtime configuration missing");
}

const firebaseConfig = {
  apiKey: runtimeConfig.REACT_APP_FIREBASE_API_KEY,
  authDomain: runtimeConfig.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: runtimeConfig.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: runtimeConfig.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: runtimeConfig.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: runtimeConfig.REACT_APP_FIREBASE_APP_ID,
};


let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;

// 2. Validation Logic
const requiredKeys = [
  'apiKey', 
  'authDomain', 
  'projectId', 
  'storageBucket', 
  'messagingSenderId', 
  'appId'
];

const missingKeys = requiredKeys.filter(key => {
  const val = firebaseConfig[key as keyof typeof firebaseConfig];
  return !val || val.includes('INSERT_KEY') || val.includes('DummyKey');
});

const firebaseConfigError = missingKeys.length > 0;

if (firebaseConfigError) {
  // 3. Fail Fast - Do NOT initialize
  logger.error('firebaseConfigMissing', { 
    missingKeys, 
    correlationId: logger.getCorrelationId(),
    buildVersion: process.env.REACT_APP_VERSION || 'unknown'
  });
} else {
  try {
    // 4. Initialize exactly once
    app = initializeApp(firebaseConfig as any);
    db = getFirestore(app);
    functions = getFunctions(app);
    logger.info('Firebase Initialized Successfully', { projectId: firebaseConfig.projectId });
  } catch (e: any) {
    logger.error('Firebase Initialization Crashed', { error: e.message });
    // If init crashes despite valid keys (e.g. duplicate app), treat as config error to be safe
    // However, usually we'd want to just log it. For this app's safety constraints:
    console.error("Critical Firebase Init Error", e);
  }
}

export { app, db, functions, firebaseConfigError, missingKeys, firebaseConfig };
