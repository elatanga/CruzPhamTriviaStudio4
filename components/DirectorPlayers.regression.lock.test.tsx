import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState, Player } from '../types';

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), getCorrelationId: () => 'test' },
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() },
}));

describe('Director Panel: Players Roster Lock', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const baseGameState: GameState = {
    showTitle: 'Studio Show',
    isGameStarted: true,
    categories: [],
    players: [
      { id: 'p1', name: 'ALICE', score: 500, color: '#fff' }
    ],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: 'p1',
    history: [],
    timer: { duration: 30, endTime: null, isRunning: false },
    viewSettings: { categoryTitleScale: 'M', playerNameScale: 'M', tileScale: 'M', scoreboardScale: 1.0, tilePaddingScale: 1.0, updatedAt: '' },
    lastPlays: [],
    events: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'new-uuid' });
    vi.stubGlobal('confirm', () => true);
  });

  it('LOCK: Renders player list correctly with score', () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    
    // Switch to Players tab
    fireEvent.click(screen.getByText('Players'));
    
    expect(screen.getByDisplayValue('ALICE')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('LOCK: Normalizes player name edits', () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    fireEvent.click(screen.getByText('Players'));

    const input = screen.getByDisplayValue('ALICE');
    fireEvent.change(input, { target: { value: '  bob smith  ' } });

    expect(mockOnUpdateState).toHaveBeenCalledWith(expect.objectContaining({
      players: [expect.objectContaining({ name: 'BOB SMITH' })]
    }));
  });

  it('LOCK: Adjusts player scores via buttons', () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    fireEvent.click(screen.getByText('Players'));

    const plusBtn = screen.getByTitle('Add 100');
    fireEvent.click(plusBtn);

    expect(mockOnUpdateState).toHaveBeenCalledWith(expect.objectContaining({
      players: [expect.objectContaining({ score: 600 })]
    }));
  });

  it('LOCK: Adds new player to roster with UUID', async () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    fireEvent.click(screen.getByText('Players'));

    fireEvent.click(screen.getByText('Add Player'));
    const input = screen.getByPlaceholderText('ENTER PLAYER NAME');
    fireEvent.change(input, { target: { value: 'Charlie' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(mockOnUpdateState).toHaveBeenCalledWith(expect.objectContaining({
      players: expect.arrayContaining([
        expect.objectContaining({ name: 'CHARLIE', id: 'new-uuid' })
      ])
    }));
  });

  it('LOCK: Removes player from roster', () => {
    render(<DirectorPanel gameState={baseGameState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    fireEvent.click(screen.getByText('Players'));

    const deleteBtn = screen.getByTitle('Delete Contestant');
    fireEvent.click(deleteBtn);

    expect(mockOnUpdateState).toHaveBeenCalledWith(expect.objectContaining({
      players: []
    }));
  });

  it('LOCK: Displays fallback when roster is empty', () => {
    const emptyState = { ...baseGameState, players: [] };
    render(<DirectorPanel gameState={emptyState} onUpdateState={mockOnUpdateState} emitGameEvent={mockEmitGameEvent} addToast={mockAddToast} />);
    fireEvent.click(screen.getByText('Players'));

    expect(screen.getByText(/No contestants registered/i)).toBeInTheDocument();
  });
});