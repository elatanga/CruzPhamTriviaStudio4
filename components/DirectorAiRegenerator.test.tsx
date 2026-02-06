
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorAiRegenerator } from './DirectorAiRegenerator';
import { GameState } from '../types';
import * as geminiService from '../services/geminiService';

vi.mock('../services/geminiService', () => ({
  generateTriviaGame: vi.fn(),
}));

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() },
}));

describe('DirectorAiRegenerator: Board-Wide Logic', () => {
  const mockOnUpdateState = vi.fn();
  const mockAddToast = vi.fn();

  const baseState: GameState = {
    showTitle: 'Original',
    isGameStarted: true,
    categories: [
      {
        id: 'cat-1', title: 'Science',
        questions: [
          { id: 'q-1', points: 100, text: 'Old Q', answer: 'Old A', isAnswered: true, isRevealed: false }
        ]
      }
    ],
    players: [],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: null,
    history: [],
    timer: { duration: 30, endTime: null, isRunning: false },
    viewSettings: {} as any,
    lastPlays: [],
    events: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A) ATOMIC ZIP: preserves structure, IDs, and answered status', async () => {
    const aiResult = [{
      id: 'ai-gen-id', title: 'New Science',
      questions: [{ id: 'ai-gen-q', text: 'New AI Q', answer: 'New AI A', points: 5000, isRevealed: false, isAnswered: false, isDoubleOrNothing: false }]
    }];
    vi.mocked(geminiService.generateTriviaGame).mockResolvedValue(aiResult);

    render(<DirectorAiRegenerator gameState={baseState} onUpdateState={mockOnUpdateState} addToast={mockAddToast} />);

    fireEvent.change(screen.getByPlaceholderText(/Global Topic/i), { target: { value: 'New Topic' } });
    fireEvent.click(screen.getByText('Regenerate All'));

    await waitFor(() => {
      const callArgs = mockOnUpdateState.mock.calls[0][0] as GameState;
      const q = callArgs.categories[0].questions[0];

      expect(q.id).toBe('q-1'); // Preserved
      expect(q.points).toBe(100); // Preserved
      expect(q.isAnswered).toBe(true); // Preserved status
      expect(q.text).toBe('New AI Q'); // Updated content
    });
  });

  it('B) ROLLBACK: reverts to previous categories on API failure', async () => {
    vi.mocked(geminiService.generateTriviaGame).mockRejectedValue(new Error('Rate Limit'));

    render(<DirectorAiRegenerator gameState={baseState} onUpdateState={mockOnUpdateState} addToast={mockAddToast} />);
    
    fireEvent.change(screen.getByPlaceholderText(/Global Topic/i), { target: { value: 'Broken' } });
    fireEvent.click(screen.getByText('Regenerate All'));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringContaining('Rate Limit'));
      expect(mockOnUpdateState).not.toHaveBeenCalled(); // No changes applied
    });
  });
});
