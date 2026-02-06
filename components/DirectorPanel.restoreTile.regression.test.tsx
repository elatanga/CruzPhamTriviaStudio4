import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test-id' }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

describe('DirectorPanel: Restore Tile Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const fixedTime = new Date('2024-05-20T12:00:00Z');

  const baseState: GameState = {
    showTitle: 'Restore Test',
    isGameStarted: true,
    categories: [
      {
        id: 'c1', title: 'HISTORY',
        questions: [
          { 
            id: 'q-locked-123', 
            text: 'WHO DISCOVERED RADIUM?', 
            answer: 'MARIE CURIE', 
            points: 500, 
            isRevealed: true, 
            isAnswered: true, 
            isVoided: false 
          }
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
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1) FLOW: Restoring an answered tile resets status but preserves content', async () => {
    render(<DirectorPanel gameState={baseState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // Open Modal
    fireEvent.click(screen.getByText('500').closest('div')!);

    // Click Restore
    const restoreBtn = screen.getByRole('button', { name: /Restore Tile/i });
    fireEvent.click(restoreBtn);

    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
    const q = nextState.categories[0].questions[0];

    // Status Reset
    expect(q.isAnswered).toBe(false);
    expect(q.isRevealed).toBe(false);
    expect(q.isVoided).toBe(false);

    // Content Preservation
    expect(q.id).toBe('q-locked-123');
    expect(q.points).toBe(500);
    expect(q.text).toBe('WHO DISCOVERED RADIUM?');
    expect(q.answer).toBe('MARIE CURIE');

    // Telemetry
    expect(mockEmitGameEvent).toHaveBeenCalledWith('TILE_RESTORED', expect.objectContaining({
      actor: { role: 'director' },
      context: expect.objectContaining({ tileId: 'q-locked-123', points: 500 })
    }));
  });

  it('2) UI LOCK: Restore alert section matches design spec', () => {
    render(<DirectorPanel gameState={baseState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // Open Modal
    fireEvent.click(screen.getByText('500').closest('div')!);

    const restoreAlert = screen.getByText(/Question Played/i).closest('.bg-gold-600\\/10');
    expect(restoreAlert).toMatchSnapshot();
  });
});