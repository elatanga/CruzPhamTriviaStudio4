
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';
import * as geminiService from '../services/geminiService';

vi.mock('../services/geminiService', () => ({
  generateCategoryQuestions: vi.fn(),
  generateTriviaGame: vi.fn(),
  generateSingleQuestion: vi.fn(),
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() },
}));

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test' },
}));

describe('Director Panel Regression: AI & Settings (Card 1)', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const baseGameState: GameState = {
    showTitle: 'Custom Scale Show',
    isGameStarted: true,
    categories: [
      {
        id: 'c1', title: 'Science',
        questions: [
          { id: 'q1', text: 'Old Q', answer: 'Old A', points: 50, isRevealed: false, isAnswered: false }
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
      boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0,
      categoryFontSizeScale: 1.0, tileFontSizeScale: 1.0, playerNameFontSizeScale: 1.0, tilePaddingScale: 1.0,
      updatedAt: ''
    },
    lastPlays: [],
    events: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A) BUG FIX: AI Category Rewrite preserves existing point values (Regression)', async () => {
    vi.mocked(geminiService.generateCategoryQuestions).mockResolvedValue([
      { id: 'new-q', text: 'New Q', answer: 'New A', points: 100, isRevealed: false, isAnswered: false }
    ]);

    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const regenBtn = screen.getByTitle(/Regenerate this category/i);
    fireEvent.click(regenBtn);

    await waitFor(() => {
      const call = mockOnUpdateState.mock.calls[0][0];
      const questions = call.categories[0].questions;
      // Should be 50 (from original state), NOT 100 (from AI mock result)
      expect(questions[0].points).toBe(50);
      expect(questions[0].text).toBe('New Q');
    });
  });

  it('B) FEATURE: Settings Tab contains independent granular controls', () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const settingsTab = screen.getByText('Settings');
    fireEvent.click(settingsTab);

    expect(screen.getByText(/Category Titles/i)).toBeInTheDocument();
    expect(screen.getByText(/Contestant Names/i)).toBeInTheDocument();
    expect(screen.getByText(/Tile Density/i)).toBeInTheDocument();
  });

  it('C) FEATURE: Global Board Regeneration preserves layout dimensions', async () => {
    vi.mocked(geminiService.generateTriviaGame).mockResolvedValue([
      { id: 'ai-c1', title: 'AI Cat', questions: [{ id: 'ai-q1', text: 'AI Q', answer: 'AI A', points: 0, isRevealed: false, isAnswered: false }] }
    ]);

    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const boardTab = screen.getByText('Board');
    fireEvent.click(boardTab);

    const promptInput = screen.getByPlaceholderText(/Global Topic/i);
    fireEvent.change(promptInput, { target: { value: 'New World' } });
    
    const regenAllBtn = screen.getByText('Regenerate All');
    fireEvent.click(regenAllBtn);

    await waitFor(() => {
      const call = mockOnUpdateState.mock.calls[0][0];
      expect(call.categories).toHaveLength(1); // Preserved from baseGameState
      expect(call.categories[0].questions[0].points).toBe(50); // Preserved points
      expect(call.showTitle).toBe('New World');
    });
  });
});
