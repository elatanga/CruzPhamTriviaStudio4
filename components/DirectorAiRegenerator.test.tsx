
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

describe('DirectorAiRegenerator: Core Generation Logic', () => {
  const mockOnUpdateState = vi.fn();
  const mockAddToast = vi.fn();

  const baseState: GameState = {
    showTitle: 'Old Show',
    isGameStarted: true,
    categories: [
      {
        id: 'cat-id-1', title: 'Old Cat',
        questions: [
          { id: 'q-id-1', points: 50, text: 'Old Q', answer: 'Old A', isAnswered: true, isRevealed: true }
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

  it('A) SUCCESS: Preserves IDs and points while updating content', async () => {
    const aiResult = [{
      id: 'new-ai-cat', title: 'New Science',
      questions: [{ id: 'new-ai-q', text: 'New AI Question', answer: 'New AI Answer', points: 1000, isRevealed: false, isAnswered: false, isDoubleOrNothing: false }]
    }];
    vi.mocked(geminiService.generateTriviaGame).mockResolvedValue(aiResult);

    render(<DirectorAiRegenerator gameState={baseState} onUpdateState={mockOnUpdateState} addToast={mockAddToast} />);

    fireEvent.change(screen.getByPlaceholderText(/Global Topic/i), { target: { value: 'New Topic' } });
    fireEvent.click(screen.getByText('Regenerate All'));

    await waitFor(() => {
      const newState = mockOnUpdateState.mock.calls[0][0] as GameState;
      const cat = newState.categories[0];
      const q = cat.questions[0];

      // ID and Points must be preserved from baseState
      expect(cat.id).toBe('cat-id-1');
      expect(q.id).toBe('q-id-1');
      expect(q.points).toBe(50);
      
      // Content must be updated from AI
      expect(cat.title).toBe('New Science');
      expect(q.text).toBe('New AI Question');
      
      // State flags must be preserved
      expect(q.isAnswered).toBe(true);
    });
  });

  it('B) FAILURE: Rolls back and shows non-blocking error toast', async () => {
    vi.mocked(geminiService.generateTriviaGame).mockRejectedValue(new Error('AI Service Down'));

    render(<DirectorAiRegenerator gameState={baseState} onUpdateState={mockOnUpdateState} addToast={mockAddToast} />);

    fireEvent.change(screen.getByPlaceholderText(/Global Topic/i), { target: { value: 'Fail Test' } });
    fireEvent.click(screen.getByText('Regenerate All'));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringContaining('AI Service Down'));
      expect(mockOnUpdateState).not.toHaveBeenCalled();
      expect(screen.queryByText(/Working/i)).not.toBeInTheDocument();
    });
  });

  it('C) UX: Disables input and shows loading during generation', async () => {
    let resolveAi: any;
    const aiPromise = new Promise((res) => { resolveAi = res; });
    vi.mocked(geminiService.generateTriviaGame).mockReturnValue(aiPromise as any);

    render(<DirectorAiRegenerator gameState={baseState} onUpdateState={mockOnUpdateState} addToast={mockAddToast} />);

    fireEvent.change(screen.getByPlaceholderText(/Global Topic/i), { target: { value: 'Science' } });
    fireEvent.click(screen.getByText('Regenerate All'));

    expect(screen.getByPlaceholderText(/Global Topic/i)).toBeDisabled();
    expect(screen.getByText('Regenerate All')).toBeDisabled();
    
    // Cleanup
    resolveAi([]);
  });
});
