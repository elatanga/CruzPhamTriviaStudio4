
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState, Category } from '../types';
import * as geminiService from '../services/geminiService';

/**
 * DETERMINISTIC STUBS
 */
vi.stubGlobal('crypto', { randomUUID: () => 'stable-id' });

vi.mock('../services/geminiService', () => ({
  generateCategoryQuestions: vi.fn(),
  generateTriviaGame: vi.fn(),
}));

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test-id' },
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() },
}));

describe('Director Panel: Content Logic Lock', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const goldenState: GameState = {
    showTitle: 'Lock Show',
    isGameStarted: true,
    categories: [
      {
        id: 'cat-alpha', title: 'Science',
        questions: [
          // IMPORTANT: Points are 150 (not standard 100) to test preservation
          { id: 'q-fixed-1', text: 'Old Q', answer: 'Old A', points: 150, isRevealed: false, isAnswered: true }
        ]
      }
    ],
    players: [],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: null,
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * WHY THIS FAILS: The AI rewrite logic replaced the manually adjusted '150' pts with '100'.
   * CATEGORY REGEN MUST PRESERVE POINT VALUES AND QUESTION IDs.
   */
  it('LOCK: Category regeneration preserves point values and stable IDs', async () => {
    vi.mocked(geminiService.generateCategoryQuestions).mockResolvedValue([
      { id: 'ai-gen-id', text: 'New AI Q', answer: 'New AI A', points: 100, isRevealed: false, isAnswered: false }
    ] as any);

    render(<DirectorPanel gameState={goldenState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const regenBtn = screen.getByTitle(/Regenerate this category/i);
    fireEvent.click(regenBtn);

    await waitFor(() => {
      const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
      const q = nextState.categories[0].questions[0];

      expect(q.points).toBe(150); // MUST remain 150
      expect(q.id).toBe('q-fixed-1'); // MUST remain q-fixed-1 for react stability
      expect(q.text).toBe('New AI Q'); 
    });
  });

  /**
   * WHY THIS FAILS: The tile was 'Answered' before regen, but became 'Available' after.
   * AI UPDATES MUST NOT RESET THE PROGRESS STATE OF THE TILE.
   */
  it('LOCK: Category regeneration preserves "isAnswered" and "isRevealed" flags', async () => {
    vi.mocked(geminiService.generateCategoryQuestions).mockResolvedValue([
      { id: 'ai-gen-id', text: 'New Content', answer: 'New Ans', points: 100, isRevealed: false, isAnswered: false }
    ] as any);

    render(<DirectorPanel gameState={goldenState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    fireEvent.click(screen.getByTitle(/Regenerate this category/i));

    await waitFor(() => {
      const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
      expect(nextState.categories[0].questions[0].isAnswered).toBe(true); // Flag must persist
    });
  });
});
