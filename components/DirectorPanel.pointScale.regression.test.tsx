import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test-id' }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

describe('DirectorPanel: Point Scale Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const baseState: GameState = {
    showTitle: 'Scaling Test',
    isGameStarted: true,
    categories: [
      {
        id: 'c1', title: 'CAT 1',
        questions: [
          // Added missing isRevealed properties to satisfy Question interface
          { id: 'q1', text: 'Q1', answer: 'A1', points: 100, isAnswered: true, isRevealed: true },
          { id: 'q2', text: 'Q2', answer: 'A2', points: 200, isAnswered: false, isRevealed: false }
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
    vi.clearAllMocks();
  });

  it('1) FLOW: Changing scale to 50 applies rowIndex * 50 to all tiles', async () => {
    render(<DirectorPanel gameState={baseState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const scale50Btn = screen.getByRole('button', { name: '50' });
    fireEvent.click(scale50Btn);

    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
    const qs = nextState.categories[0].questions;

    // Verified Math
    expect(qs[0].points).toBe(50);  // (0+1) * 50
    expect(qs[1].points).toBe(100); // (1+1) * 50

    // Integrity
    expect(qs[0].text).toBe('Q1');
    expect(qs[0].isAnswered).toBe(true);

    // Telemetry
    expect(mockEmitGameEvent).toHaveBeenCalledWith('POINT_SCALE_CHANGED', expect.objectContaining({
      context: expect.objectContaining({ fromScale: 100, toScale: 50 })
    }));
  });

  it('2) UI LOCK: Point Scale control section matches design spec', () => {
    render(<DirectorPanel gameState={baseState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const scaleControl = screen.getByText(/Point Scale/i).closest('div');
    expect(scaleControl).toMatchSnapshot();
  });
});