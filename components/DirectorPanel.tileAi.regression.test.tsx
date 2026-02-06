import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';
import * as geminiService from '../services/geminiService';

vi.mock('../services/geminiService', () => ({
  generateSingleQuestion: vi.fn(),
  generateCategoryQuestions: vi.fn(),
}));

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test' },
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() },
}));

describe('Director Panel: Tile AI Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const baseGameState: GameState = {
    showTitle: 'Studio Show',
    isGameStarted: true,
    categories: [
      {
        id: 'cat-1', title: 'Art',
        questions: [{ id: 'q-stable-id', text: 'Old Q', answer: 'Old A', points: 100, isRevealed: false, isAnswered: true }]
      }
    ],
    players: [],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: null,
    history: [],
    timer: { duration: 30, endTime: null, isRunning: false },
    viewSettings: { categoryTitleScale: 'M', playerNameScale: 'M', tileScale: 'M', scoreboardScale: 1.0, tilePaddingScale: 1.0, updatedAt: '' },
    lastPlays: [],
    events: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LOCK: Per-tile AI regeneration preserves point values, stable IDs, and flags', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({
      text: 'New AI Q',
      answer: 'New AI A'
    });

    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // Board tab is active by default
    const regenBtn = screen.getByTitle(/Quick AI Generate/i);
    fireEvent.click(regenBtn);

    await waitFor(() => {
      const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
      const q = nextState.categories[0].questions[0];

      expect(q.points).toBe(100); // MUST remain 100
      expect(q.id).toBe('q-stable-id'); // MUST remain stable
      expect(q.isAnswered).toBe(true); // Flag must persist
      expect(q.text).toBe('New AI Q'); 
      expect(q.answer).toBe('New AI A');
    });
  });

  it('LOCK: AI regeneration failures do not mutate board state', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockRejectedValue(new Error('API Down'));

    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    fireEvent.click(screen.getByTitle(/Quick AI Generate/i));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringContaining('AI Failed'));
      expect(mockOnUpdateState).not.toHaveBeenCalled();
    });
  });
});