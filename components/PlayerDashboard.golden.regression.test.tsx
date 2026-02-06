import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { authService } from '../services/authService';

/**
 * GOLDEN PATH REGRESSION TEST
 * Feature: Wildcards & Steals
 * 
 * Rationale: 
 * This test simulates the authoritative gameplay flow for producers.
 * It ensures that UI controls for Wildcards (Director) and Steals (Question Overlay)
 * are functionally linked to the Scoreboard sync logic.
 * 
 * MUST FAIL IF:
 * 1. Wildcard button is removed from Director Panel.
 * 2. Steal button is removed from Question Modal.
 * 3. Point transfer or count increment logic is altered.
 * 4. Scoreboard visual indicators (★, STEALS badge) are missing.
 */

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    getCorrelationId: () => 'golden-id' 
  },
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
    playSelect: vi.fn(),
    playReveal: vi.fn(),
    playAward: vi.fn(),
    playSteal: vi.fn(),
    playToast: vi.fn(),
    playDoubleOrNothing: vi.fn(),
    playTimerTick: vi.fn(),
    playTimerAlarm: vi.fn(),
    getMute: () => false,
    getVolume: () => 0.5,
    setMute: vi.fn(),
    setVolume: vi.fn(),
  },
}));

vi.mock('../services/geminiService', () => ({
  generateTriviaGame: vi.fn(),
  generateSingleQuestion: vi.fn(),
  generateCategoryQuestions: vi.fn(),
}));

// Mock window interactions
vi.stubGlobal('confirm', () => true);
vi.stubGlobal('scrollTo', vi.fn());

// Fix: Add global declaration to resolve "Cannot find name 'global'" error in Vitest/JSDOM environment.
declare const global: any;

// Polyfill crypto.randomUUID for JSDOM
if (!global.crypto) {
  // @ts-ignore
  global.crypto = {
    randomUUID: () => 'test-' + Math.random().toString(36).substr(2, 9)
  };
}

describe('Golden Path: Wildcard & Steals Logic Lock', () => {
  
  // FIXTURE DATA: Strict baseline for verification
  const GOLDEN_FIXTURE = {
    showTitle: 'GOLDEN REGRESSION SHOW',
    points: 500,
    players: [
      { id: 'p-A', name: 'ALICE', expectedScore: 0, expectedWildcards: 1, expectedSteals: 0 },
      { id: 'p-B', name: 'BOB', expectedScore: 500, expectedWildcards: 0, expectedSteals: 1 }
    ]
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // 1. Seed Initial Game State
    const initialState = {
      showTitle: GOLDEN_FIXTURE.showTitle,
      isGameStarted: true,
      categories: [
        {
          id: 'c1', title: 'TRIVIA',
          questions: [
            { 
              id: 'q1', 
              text: 'Regression Question?', 
              answer: 'Strict Answer', 
              points: GOLDEN_FIXTURE.points, 
              isRevealed: false, 
              isAnswered: false 
            }
          ]
        }
      ],
      players: [
        { id: 'p-A', name: 'ALICE', score: 0, color: '#fff', wildcardsUsed: 0, stealsCount: 0 },
        { id: 'p-B', name: 'BOB', score: 0, color: '#fff', wildcardsUsed: 0, stealsCount: 0 }
      ],
      activeQuestionId: null,
      activeCategoryId: null,
      selectedPlayerId: 'p-A',
      history: [],
      timer: { duration: 30, endTime: null, isRunning: false },
      viewSettings: { 
        categoryTitleScale: 'M', 
        playerNameScale: 'M', 
        tileScale: 'M', 
        scoreboardScale: 1.0, 
        tilePaddingScale: 1.0, 
        updatedAt: '' 
      },
      lastPlays: [],
      events: []
    };

    localStorage.setItem('cruzpham_gamestate', JSON.stringify(initialState));
    localStorage.setItem('cruzpham_active_session_id', 'sess-golden');

    // 2. Mock Auth State
    vi.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: true });
    vi.spyOn(authService, 'restoreSession').mockResolvedValue({
      success: true,
      session: { 
        id: 'sess-golden', 
        username: 'director', 
        role: 'MASTER_ADMIN', 
        createdAt: Date.now(), 
        userAgent: 'test' 
      }
    });
  });

  it('Successfully executes the Golden Path: Alice Wildcard -> Bob Steal -> Scoreboard Validation', async () => {
    // A) BOOTSTRAP APP
    await act(async () => {
      render(<App />);
    });

    // B) STEP 1: ALICE USES WILDCARD
    // Open Director -> Players
    const directorBtn = await screen.findByRole('button', { name: /director/i });
    fireEvent.click(directorBtn);

    const playersTab = await screen.findByRole('button', { name: /players/i });
    fireEvent.click(playersTab);

    // Trigger wildcard for Alice
    const aliceRow = screen.getByDisplayValue('ALICE').closest('tr');
    const wildcardBtn = within(aliceRow!).getByTitle(/Increment Wildcard Usage/i);
    fireEvent.click(wildcardBtn);

    // Verify UI reflects change locally
    expect(within(wildcardBtn).getByText('1/4')).toBeInTheDocument();

    // Close Director
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    // C) STEP 2: BOB STEALS TILE FROM ALICE
    // Open the 500pt tile (Alice is selected player by default)
    const tile = await screen.findByText('500');
    fireEvent.click(tile);

    // Reveal Answer
    const revealBtn = await screen.findByTitle(/Reveal Answer/i);
    fireEvent.click(revealBtn);

    // Trigger Steal
    const stealBtn = await screen.findByTitle(/Steal/i);
    fireEvent.click(stealBtn);

    // Select Bob as the Stealer
    const bobStealAction = await screen.findByRole('button', { name: 'BOB' });
    fireEvent.click(bobStealAction);

    // D) FINAL VALIDATION: SCOREBOARD SYNC
    await waitFor(() => {
      const scoreboard = screen.getByTestId('scoreboard-root');
      
      // 1. Verify Alice has 1 star (Wildcard)
      const aliceItem = within(scoreboard).getByText('ALICE').closest('div')?.parentElement;
      expect(within(aliceItem!).getByText('★')).toBeInTheDocument();
      expect(within(aliceItem!).getByText('★')).toHaveStyle('color: #FF8A00');
      
      // 2. Verify Bob has Steals Badge and Points
      const bobItem = within(scoreboard).getByText('BOB').closest('div')?.parentElement;
      expect(within(bobScoreCard(bobItem!)).getByText('STEALS: 1')).toBeInTheDocument();
      expect(within(bobItem!).getByText('500')).toBeInTheDocument();
    });

    // Helper to find score card content correctly
    function bobScoreCard(el: HTMLElement) {
       return el;
    }

    // E) PERSISTENCE LOCK: Verify underlying JSON state against fixture
    const finalState = JSON.parse(localStorage.getItem('cruzpham_gamestate')!);
    
    GOLDEN_FIXTURE.players.forEach(expected => {
      const actual = finalState.players.find((p: any) => p.id === expected.id);
      expect(actual.score).toBe(expected.expectedScore);
      expect(actual.wildcardsUsed).toBe(expected.expectedWildcards);
      expect(actual.stealsCount).toBe(expected.expectedSteals);
    });

    console.log('Golden Path Regression: SUCCESS');
  });
});