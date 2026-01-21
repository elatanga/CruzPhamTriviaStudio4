
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

// --- MOCKS ---

jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));

jest.mock('./services/firebase', () => ({
  db: {},
  functions: {},
  firebaseConfigError: false,
  firebaseConfig: { projectId: 'test-project' }
}));

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

jest.mock('./services/geminiService', () => ({
  generateTriviaGame: jest.fn().mockResolvedValue([]),
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' })
}));

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
      
      localStorage.setItem('cruzpham_active_session_id', 'sess-1');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('test_prod')).toBeInTheDocument(); 
        expect(screen.queryByText(/Studio Access/i)).not.toBeInTheDocument();
      });
    });
  });
});
