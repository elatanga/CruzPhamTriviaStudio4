
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { logger } from './logger';

// Default config placeholder - User must provide real keys
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCq7E_cSTsohY6NlOHR6cBtH0or7W6C3bY",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "cruzpham-trivia-prod.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "cruzpham-trivia-prod",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "cruzpham-trivia-prod.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "453431707957",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:453431707957:web:15301432304863dd9c247c",
  measurementId: "G-F4G0T4YYY9"
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let functions: Functions | undefined;

// Check if config is using valid keys (not placeholders)
const isConfigValid = firebaseConfig.apiKey && 
                      !firebaseConfig.apiKey.includes('DummyKey') && 
                      !firebaseConfig.apiKey.includes('PLEASE_CONFIGURE');

if (isConfigValid) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    functions = getFunctions(app);
    logger.info('Firebase Initialized', { projectId: firebaseConfig.projectId });
  } catch (e: any) {
    logger.error('Firebase Init Failed', { error: e.message });
    console.warn('CRUZPHAM STUDIOS: Firebase Configuration Missing or Invalid. Backend features will not work.');
  }
} else {
  logger.warn('CRUZPHAM STUDIOS: Firebase dummy config detected. Backend features disabled to prevent connection errors.');
}

export { app, db, functions };
