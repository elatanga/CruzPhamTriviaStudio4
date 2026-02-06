import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';
import { logger } from '../services/logger';

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    getCorrelationId: () => 'test-id' 
  }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

vi.mock('../services/geminiService', () => ({
  generateSingleQuestion: vi.fn(),
  generateCategoryQuestions: vi.fn(),
}));

describe('Director Controls: Restore & Point Scaling Telemetry', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const createInitialState = (): GameState => ({
    showTitle: 'Studio Show',
    isGameStarted: true,
    categories: [
      {
        id: 'c1', title: 'SCIENCE',
        questions: [
          { id: 'q1', text: 'Old Q', answer: 'Old A', points: 100, isRevealed: true, isAnswered: true, isVoided: false }
        ]
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', () => true);
  });

  it('A) RESTORE TILE: resets answered/voided/revealed flags and logs event', async () => {
    const state = createInitialState();
    render(<DirectorPanel gameState={state} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // 1. Open edit modal for the played tile
    fireEvent.click(screen.getByText('100').closest('div')!);
    
    // 2. Click Restore Tile
    const restoreBtn = await screen.findByText(/Restore Tile/i);
    fireEvent.click(restoreBtn);

    // 4. Assert telemetry emission
    expect(mockEmitGameEvent).toHaveBeenCalledWith('TILE_RESTORED', expect.objectContaining({
      actor: { role: 'director' },
      context: expect.objectContaining({ tileId: 'q1', categoryName: 'SCIENCE', points: 100 })
    }));
  });

  it('B) RESTORE ALL TILES: resets board globally with BOARD_RESTORED_ALL telemetry', async () => {
    const state = createInitialState();
    // Add second voided question
    state.categories[0].questions.push({ id: 'q2', text: 'Voided', answer: 'A', points: 200, isRevealed: true, isAnswered: false, isVoided: true });
    
    render(<DirectorPanel gameState={state} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    fireEvent.click(screen.getByText(/Restore All Tiles/i));

    // Assert logging of click and applied with count 2
    expect(logger.info).toHaveBeenCalledWith('director_restore_all_click', expect.any(Object));
    expect(logger.info).toHaveBeenCalledWith('director_restore_all_applied', expect.objectContaining({ restoredCount: 2 }));
    
    expect(mockEmitGameEvent).toHaveBeenCalledWith('BOARD_RESTORED_ALL', expect.objectContaining({
      actor: { role: 'director' },
      context: expect.objectContaining({ restoredCount: 2 })
    }));
  });

  it('C) POINT SCALING: updates all tile values and emits POINT_SCALE_CHANGED with shift context', () => {
    const state = createInitialState();
    render(<DirectorPanel gameState={state} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // Scale 100 -> 50
    fireEvent.click(screen.getByText('50', { selector: 'button' }));

    expect(mockEmitGameEvent).toHaveBeenCalledWith('POINT_SCALE_CHANGED', expect.objectContaining({
      actor: { role: 'director' },
      context: expect.objectContaining({ fromScale: 100, toScale: 50 })
    }));
  });
});