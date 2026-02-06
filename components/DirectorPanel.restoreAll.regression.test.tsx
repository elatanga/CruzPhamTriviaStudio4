import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test-id' }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

describe('DirectorPanel: Restore All Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const baseState: GameState = {
    showTitle: 'Bulk Restore',
    isGameStarted: true,
    categories: [
      {
        id: 'c1', title: 'CAT 1',
        questions: [
          { id: 'q1', text: 'T1', answer: 'A1', points: 100, isAnswered: true, isRevealed: true },
          { id: 'q2', text: 'T2', answer: 'A2', points: 200, isAnswered: false, isRevealed: false }
        ]
      },
      {
        id: 'c2', title: 'CAT 2',
        questions: [
          // Added missing isRevealed property to satisfy Question interface
          { id: 'q3', text: 'T3', answer: 'A3', points: 100, isAnswered: false, isVoided: true, isRevealed: false },
          { id: 'q4', text: 'T4', answer: 'A4', points: 200, isAnswered: false, isRevealed: false }
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
    vi.stubGlobal('confirm', () => true);
    vi.clearAllMocks();
  });

  it('1) FLOW: Clicking Restore All resets all played tiles and emits count', async () => {
    render(<DirectorPanel gameState={baseState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const restoreAllBtn = screen.getByRole('button', { name: /Restore All Tiles/i });
    fireEvent.click(restoreAllBtn);

    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;

    // Verify all 4 tiles are now active
    const allQs = nextState.categories.flatMap(c => c.questions);
    expect(allQs.every(q => !q.isAnswered && !q.isVoided && !q.isRevealed)).toBe(true);

    // Verify unanswered tiles (q2, q4) references are unchanged/correct
    expect(allQs.find(q => q.id === 'q2')?.text).toBe('T2');

    // Telemetry
    expect(mockEmitGameEvent).toHaveBeenCalledWith('BOARD_RESTORED_ALL', expect.objectContaining({
      context: expect.objectContaining({ restoredCount: 2 }) // q1 (answered) and q3 (voided)
    }));
  });

  it('2) UI LOCK: Board Operations toolbar matches layout spec', () => {
    render(<DirectorPanel gameState={baseState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    const toolbar = screen.getByText(/Board Operations/i).closest('.bg-zinc-900\\/40');
    expect(toolbar).toMatchSnapshot();
  });
});