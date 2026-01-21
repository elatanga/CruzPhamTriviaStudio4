
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { soundService } from './services/soundService';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const beforeEach: any;

// --- MOCKS ---

// Mock Logger
jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));

// Mock Firebase
jest.mock('./services/firebase', () => ({
  db: {},
  functions: {}
}));

// Mock SoundService
jest.mock('./services/soundService', () => ({
  soundService: {
    playSelect: jest.fn(), playReveal: jest.fn(), playAward: jest.fn(),
    playSteal: jest.fn(), playVoid: jest.fn(), playDoubleOrNothing: jest.fn(),
    playClick: jest.fn(), playTimerTick: jest.fn(), playTimerAlarm: jest.fn(),
    playToast: jest.fn(),
    setMute: jest.fn(), getMute: jest.fn().mockReturnValue(false),
    setVolume: jest.fn(), getVolume: jest.fn().mockReturnValue(0.5)
  }
}));

// Mock Gemini
jest.mock('./services/geminiService', () => ({
  generateTriviaGame: jest.fn().mockResolvedValue([]),
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' })
}));

// Mock authService methods explicitly to avoid dealing with complex Firestore mocks in JSDOM
// We are testing the UI logic, so we trust the service contract (which has its own mocks in integration tests).
// However, since authService is a singleton instance exported, we need to spyOn/mock implementation.

describe('CRUZPHAM STUDIOS Core Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default Mock Implementations
    jest.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: false });
    jest.spyOn(authService, 'restoreSession').mockResolvedValue({ success: false });
    jest.spyOn(authService, 'subscribeToRequests').mockReturnValue(() => {});
  });

  // --- 1. BOOTSTRAP LOCK TESTS ---
  
  describe('BOOTSTRAP LOCK (UNIT)', () => {
    test('UI renders Bootstrap Screen when masterReady == false', async () => {
      // Mock masterReady false (default)
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText(/SYSTEM BOOTSTRAP/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Studio Access/i)).not.toBeInTheDocument();
    });

    test('UI skips Bootstrap and shows Login when masterReady == true', async () => {
      jest.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: true });
      
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/SYSTEM BOOTSTRAP/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Studio Access/i)).toBeInTheDocument();
      });
    });
  });

  // --- 2. SESSION PERSISTENCE TESTS ---

  describe('SESSION PERSISTENCE (UNIT)', () => {
    test('Restoring valid session hydrates user state', async () => {
      jest.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: true });
      jest.spyOn(authService, 'restoreSession').mockResolvedValue({ 
        success: true, 
        session: { id: 'sess-1', username: 'test_prod', role: 'PRODUCER', createdAt: Date.now(), userAgent: 'test' } 
      });
      
      // Inject fake session ID into storage
      localStorage.setItem('cruzpham_active_session_id', 'sess-1');

      render(<App />);

      await waitFor(() => {
        // "PRODUCER: test_prod" appears in header
        expect(screen.getByText('test_prod')).toBeInTheDocument(); 
        expect(screen.queryByText(/Studio Access/i)).not.toBeInTheDocument();
      });
    });

    test('Invalid session ID triggers Login UI', async () => {
      jest.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: true });
      jest.spyOn(authService, 'restoreSession').mockResolvedValue({ success: false, code: 'ERR_SESSION_EXPIRED' });
      
      localStorage.setItem('cruzpham_active_session_id', 'fake-session-123');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/Studio Access/i)).toBeInTheDocument();
      });
    });
  });
});
