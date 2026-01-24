import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
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

// Mock Logger to suppress noise
jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));

// Mock SoundService (pure side effects)
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

// Mock Gemini (AI generation)
jest.mock('./services/geminiService', () => ({
  generateTriviaGame: jest.fn().mockResolvedValue([]),
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' })
}));

describe('CRUZPHAM STUDIOS Core Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // --- 1. BOOTSTRAP LOCK TESTS ---
  
  describe('BOOTSTRAP LOCK (UNIT)', () => {
    test('UI renders Bootstrap Screen when masterReady == false', async () => {
      // Clean slate -> masterReady is false
      render(<App />);
      
      // Should find the bootstrap header
      await waitFor(() => {
        expect(screen.getByText(/SYSTEM BOOTSTRAP/i)).toBeInTheDocument();
      });
      // Should not see Login
      expect(screen.queryByText(/Studio Access/i)).not.toBeInTheDocument();
    });

    test('UI skips Bootstrap and shows Login when masterReady == true', async () => {
      // Pre-seed bootstrap state
      const bootstrapState = { masterReady: true, createdAt: new Date().toISOString() };
      localStorage.setItem('cruzpham_sys_bootstrap', JSON.stringify(bootstrapState));
      
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText(/SYSTEM BOOTSTRAP/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Studio Access/i)).toBeInTheDocument();
      });
    });
  });

  // --- 2. DOUBLE OR NOTHING SCORING LOGIC ---
  
  describe('SCORING LOGIC: DOUBLE OR NOTHING', () => {
    test('Points are doubled when awarding a Double Or Nothing tile', async () => {
      // Setup authenticated state with a pre-defined game
      await authService.bootstrapMasterAdmin('admin');
      const token = await authService.login('admin', 'mk-placeholder'); // Mocked login
      
      const mockGameState = {
        showTitle: 'Test Show',
        isGameStarted: true,
        activeQuestionId: 'q1',
        activeCategoryId: 'c1',
        selectedPlayerId: 'p1',
        categories: [
          {
            id: 'c1', title: 'Cat 1',
            questions: [{ id: 'q1', points: 100, text: 'Q', answer: 'A', isRevealed: true, isAnswered: false, isDoubleOrNothing: true }]
          }
        ],
        players: [{ id: 'p1', name: 'Alice', score: 0, color: '#fff' }],
        history: [],
        timer: { duration: 30, endTime: null, isRunning: false },
        viewSettings: { boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0, updatedAt: '' }
      };
      
      localStorage.setItem('cruzpham_gamestate', JSON.stringify(mockGameState));
      localStorage.setItem('cruzpham_active_session_id', 'sess-123');
      
      render(<App />);
      
      await waitFor(() => screen.getByText(/Alice/i));
      
      // Modal should be open due to activeQuestionId
      await waitFor(() => screen.getByText(/Award/i));
      
      // Award to Alice
      const awardBtn = screen.getByText(/Award/i).closest('button');
      fireEvent.click(awardBtn!);
      
      // Assert Alice has 200 points (100 * 2)
      await waitFor(() => {
        const score = screen.getByText('200');
        expect(score).toBeInTheDocument();
      });
    });

    test('Points are NOT doubled when awarding a normal tile', async () => {
        await authService.bootstrapMasterAdmin('admin');
        
        const mockGameState = {
          showTitle: 'Test Show',
          isGameStarted: true,
          activeQuestionId: 'q1',
          activeCategoryId: 'c1',
          selectedPlayerId: 'p1',
          categories: [
            {
              id: 'c1', title: 'Cat 1',
              questions: [{ id: 'q1', points: 100, text: 'Q', answer: 'A', isRevealed: true, isAnswered: false, isDoubleOrNothing: false }]
            }
          ],
          players: [{ id: 'p1', name: 'Alice', score: 0, color: '#fff' }],
          history: [],
          timer: { duration: 30, endTime: null, isRunning: false },
          viewSettings: { boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0, updatedAt: '' }
        };
        
        localStorage.setItem('cruzpham_gamestate', JSON.stringify(mockGameState));
        localStorage.setItem('cruzpham_active_session_id', 'sess-123');
        
        render(<App />);
        
        await waitFor(() => screen.getByText(/Award/i));
        fireEvent.click(screen.getByText(/Award/i).closest('button')!);
        
        await waitFor(() => {
          expect(screen.getByText('100')).toBeInTheDocument();
          expect(screen.queryByText('200')).not.toBeInTheDocument();
        });
      });
  });
});