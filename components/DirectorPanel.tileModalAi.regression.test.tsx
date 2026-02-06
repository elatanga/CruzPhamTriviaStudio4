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

describe('Director Panel: Tile Modal AI Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const baseGameState: GameState = {
    showTitle: 'Regression Show',
    isGameStarted: true,
    categories: [
      {
        id: 'cat-1', title: 'Science',
        questions: [{ id: 'q-lock-id', text: 'Old Q', answer: 'Old A', points: 100, isRevealed: false, isAnswered: true }]
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
    vi.stubGlobal('crypto', { randomUUID: () => 'gen-id' });
  });

  it('1) RENDERING: Tile modal includes the "AI Regen Tile" section', () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // Open modal
    const tile = screen.getByText('100');
    fireEvent.click(tile.closest('.cursor-pointer')!);

    expect(screen.getByText(/AI Regen Tile/i)).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
    expect(screen.getByText('hard')).toBeInTheDocument();
  });

  it('2) FUNCTIONAL: Regen button calls generateSingleQuestion with selected difficulty', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({ text: 'New AI Q', answer: 'New AI A' });

    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const tile = screen.getByText('100');
    fireEvent.click(tile.closest('.cursor-pointer')!);

    // Select 'hard'
    const hardBtn = screen.getByText('hard');
    fireEvent.click(hardBtn);

    // Click Regen
    const regenBtn = screen.getByRole('button', { name: /regen/i });
    fireEvent.click(regenBtn);

    expect(geminiService.generateSingleQuestion).toHaveBeenCalledWith(
      'Regression Show',
      100,
      'Science',
      'hard',
      'gen-id'
    );
  });

  it('3) INTEGRITY: AI regen preserves metadata (id, points, flags)', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({ text: 'New Q', answer: 'New A' });

    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    fireEvent.click(screen.getByText('100').closest('.cursor-pointer')!);
    fireEvent.click(screen.getByRole('button', { name: /regen/i }));

    await waitFor(() => {
      expect(mockOnUpdateState).toHaveBeenCalled();
      const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
      const q = nextState.categories[0].questions[0];

      expect(q.id).toBe('q-lock-id');
      expect(q.points).toBe(100);
      expect(q.isAnswered).toBe(true);
    });
  });

  it('4) UI SYNC: Textareas refresh their content after AI regeneration', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({ text: 'AI TEXT UPDATED', answer: 'AI ANSWER UPDATED' });

    const { rerender } = render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    fireEvent.click(screen.getByText('100').closest('.cursor-pointer')!);
    fireEvent.click(screen.getByRole('button', { name: /regen/i }));

    await waitFor(() => expect(mockOnUpdateState).toHaveBeenCalled());

    const updatedState = mockOnUpdateState.mock.calls[0][0];
    rerender(<DirectorPanel gameState={updatedState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);

    expect(screen.getByDisplayValue('AI TEXT UPDATED')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AI ANSWER UPDATED')).toBeInTheDocument();
  });
});