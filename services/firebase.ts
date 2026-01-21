
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
  [key: string]: any;
}

// 2. Safe Config Accessor
const getRuntimeConfig = (): RuntimeConfig => {
  if (typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__) {
    return (window as any).__RUNTIME_CONFIG__;
  }
  return {};
};

const runtimeConfig = getRuntimeConfig();

// 3. Strict Validation Logic
// We explicitly check for the FIREBASE_ prefixed keys provided by server.js
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
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('%') && trimmed.endsWith('%')) return true; // Build-time placeholder
  if (trimmed.startsWith('__') && trimmed.endsWith('__')) return true; // Runtime placeholder
  if (trimmed.includes('INSERT_KEY')) return true; // Default template text
  if (trimmed === 'undefined' || trimmed === 'null') return true;
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
  // Log strictly what is missing so it can be debugged in console
  logger.error('CONFIG', 'Firebase Configuration Missing or Invalid', {
    missingKeys,
    configState: 'partial_or_empty',
    correlationId: logger.getCorrelationId()
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

    // Singleton Pattern: Check if app already exists (e.g. fast refresh)
    if (!getApps().length) {
      app = initializeApp(config);
      logger.info('SYSTEM', 'Firebase App Initialized', { projectId });
    } else {
      app = getApps()[0];
      logger.info('SYSTEM', 'Firebase App Re-used', { projectId });
    }

    // Initialize Services
    db = getFirestore(app);
    functions = getFunctions(app);
    auth = getAuth(app);

    // Auto-authenticate anonymously to establish a valid Firebase Context immediately.
    // This prevents "Permission Denied" errors on public reads if rules require 'auth != null'.
    signInAnonymously(auth).catch((err) => {
      logger.warn('AUTH', 'Anonymous Auth Failed', { error: err.message });
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
