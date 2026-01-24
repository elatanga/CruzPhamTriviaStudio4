
import { logger } from './logger';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterAll: any;
// Fix: Declare require for Jest module isolation tests
declare const require: any;

// Mock Logger to prevent noise during test execution
jest.mock('./logger', () => ({
  logger: { 
    info: jest.fn(), 
    error: jest.fn(), 
    warn: jest.fn(), 
    getCorrelationId: () => 'test-id' 
  }
}));

// Mock Firebase SDKs to prevent network calls/errors during init
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
  getApps: jest.fn(() => []),
  FirebaseApp: jest.fn()
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({}))
}));
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({}))
}));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInAnonymously: jest.fn().mockResolvedValue({})
}));

describe('SYSTEM: Configuration & Initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    (window as any).__RUNTIME_CONFIG__ = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('FAIL: Reports error when Runtime Config is missing', () => {
    jest.isolateModules(() => {
      // Fix: require usage in isolated test
      const { firebaseConfigError, missingKeys } = require('./firebase');
      expect(firebaseConfigError).toBe(true);
      expect(missingKeys).toContain('REACT_APP_FIREBASE_API_KEY');
      expect(missingKeys).toContain('REACT_APP_FIREBASE_PROJECT_ID');
    });
  });

  test('FAIL: Reports error when keys are placeholders', () => {
    (window as any).__RUNTIME_CONFIG__ = {
      REACT_APP_FIREBASE_API_KEY: '__REACT_APP_FIREBASE_API_KEY__', // Placeholder
      REACT_APP_FIREBASE_AUTH_DOMAIN: 'valid-domain',
      // ... missing others
    };

    jest.isolateModules(() => {
      // Fix: require usage in isolated test
      const { firebaseConfigError, missingKeys } = require('./firebase');
      expect(firebaseConfigError).toBe(true);
      expect(missingKeys).toContain('REACT_APP_FIREBASE_API_KEY');
    });
  });

  test('SUCCESS: Initializes App when config is valid', () => {
    (window as any).__RUNTIME_CONFIG__ = {
      REACT_APP_FIREBASE_API_KEY: 'AIzaSyTestKey',
      REACT_APP_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      REACT_APP_FIREBASE_PROJECT_ID: 'test-project',
      REACT_APP_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
      REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      REACT_APP_FIREBASE_APP_ID: '1:123456789:web:abcdef'
    };

    jest.isolateModules(() => {
      // Fix: require usage in isolated test
      const { firebaseConfigError, app, projectId } = require('./firebase');
      
      if (firebaseConfigError) {
        throw new Error('Expected valid config but got error');
      }

      expect(firebaseConfigError).toBe(false);
      expect(app).toBeDefined();
      expect(projectId).toBe('test-project');
    });
  });
});
