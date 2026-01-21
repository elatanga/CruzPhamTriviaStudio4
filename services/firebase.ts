
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { getAuth, Auth, signInAnonymously } from 'firebase/auth';
import { logger } from './logger';

// 1. Valid Configuration Interface
interface RuntimeConfig {
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_STORAGE_BUCKET?: string;
  FIREBASE_MESSAGING_SENDER_ID?: string;
  FIREBASE_APP_ID?: string;
  API_KEY?: string; // Gemini
  BUILD_VERSION?: string;
  [key: string]: string | undefined;
}

// 2. Safe Config Accessor
const getRuntimeConfig = (): RuntimeConfig => {
  if (typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__) {
    return (window as any).__RUNTIME_CONFIG__;
  }
  return {};
};

const runtimeConfig = getRuntimeConfig();

// 3. Strict Validation Logic (using clean keys)
const requiredKeys = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID'
] as const;

// Helper: Detect invalid/placeholder values
const isInvalid = (val: string | undefined): boolean => {
  if (!val) return true;
  if (val.startsWith('%') && val.endsWith('%')) return true; // Build-time placeholder left over
  if (val.startsWith('__') && val.endsWith('__')) return true; // Runtime placeholder left over
  if (val.includes('INSERT_KEY')) return true; // Default template text
  return false;
};

// Identify any missing or invalid keys
const missingKeys = requiredKeys.filter(key => isInvalid(runtimeConfig[key]));
const firebaseConfigError = missingKeys.length > 0;

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;
let auth: Auth | undefined;
let projectId: string | undefined;

// 4. Initialization Logic
if (firebaseConfigError) {
  logger.error('CONFIG', 'Firebase Configuration Missing or Invalid', {
    missingKeys,
    correlationId: logger.getCorrelationId(),
    environment: process.env.NODE_ENV
  });
} else {
  try {
    const config = {
      apiKey: runtimeConfig.FIREBASE_API_KEY,
      authDomain: runtimeConfig.FIREBASE_AUTH_DOMAIN,
      projectId: runtimeConfig.FIREBASE_PROJECT_ID,
      storageBucket: runtimeConfig.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: runtimeConfig.FIREBASE_MESSAGING_SENDER_ID,
      appId: runtimeConfig.FIREBASE_APP_ID
    };

    projectId = config.projectId;

    // Ensure singleton instance
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApps()[0];
    }

    db = getFirestore(app);
    functions = getFunctions(app);
    auth = getAuth(app);

    // Auto-authenticate anonymously to establish a valid Firebase Context
    // This helps resolve "Permission Denied" errors that occur when no User object exists
    signInAnonymously(auth).catch((err) => {
      logger.warn('AUTH', 'Anonymous Auth Failed', { error: err.message });
    });
    
    logger.info('SYSTEM', 'Firebase Initialized Successfully', { 
      projectId, 
      authDomain: config.authDomain,
      version: runtimeConfig.BUILD_VERSION,
      correlationId: logger.getCorrelationId()
    });

  } catch (error: any) {
    logger.error('SYSTEM', 'Firebase Critical Failure During Init', {
      message: error.message,
      correlationId: logger.getCorrelationId()
    });
    
    // Invalidate instances if crash occurs to prevent partial state usage
    app = undefined;
    db = undefined;
    functions = undefined;
    auth = undefined;
  }
}

export { app, db, functions, auth, firebaseConfigError, missingKeys, projectId };
