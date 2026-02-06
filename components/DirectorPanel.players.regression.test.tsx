
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState, Player } from '../types';

// Fix: Declare require to avoid TypeScript error when dynamically loading modules in tests.
declare const require: any;

/**
 * MOCKS
 */
vi.mock('../services/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getCorrelationId: () => 'test-id',
  },
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
  },
}));

// Mocking geminiService as DirectorPanel imports it for other tabs
vi.mock('../services/geminiService', () => ({
  generateSingleQuestion: vi.fn(),
  generateCategoryQuestions: vi.fn(),
}));

describe('DirectorPanel: Players Tab Regression Lock', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  const createMockPlayers = (): Player[] => [
    { id: 'p1', name: 'ALICE', score: 1000, color: '#fff' },
    { id: 'p2', name: 'BOB', score: 500, color: '#fff' },
  ];

  const baseState: GameState = {
    showTitle: 'Regression Show',
    isGameStarted: true,
    categories: [],
    players: createMockPlayers(),
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: 'p1',
    history: [],
    timer: { duration: 30, endTime: null, isRunning: false },
    viewSettings: {
      categoryTitleScale: 'M',
      playerNameScale: 'M',
      tileScale: 'M',
      scoreboardScale: 1.0,
      tilePaddingScale: 1.0,
      updatedAt: '',
    },
    lastPlays: [],
    events: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const switchToPlayersTab = () => {
    const playersBtn = screen.getByRole('button', { name: /players/i });
    fireEvent.click(playersBtn);
  };

  it('1) RENDERING: Players tab displays contestant names and scores', () => {
    render(
      <DirectorPanel 
        gameState={baseState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    switchToPlayersTab();

    // Verify UI is not blank
    expect(screen.getByText(/Contestant Management/i)).toBeInTheDocument();
    
    // Verify specific data presence
    expect(screen.getByDisplayValue('ALICE')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('BOB')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('2) EDIT NAME: Normalizes input and preserves other players', () => {
    render(
      <DirectorPanel 
        gameState={baseState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    switchToPlayersTab();

    const aliceInput = screen.getByDisplayValue('ALICE');
    fireEvent.change(aliceInput, { target: { value: '  alicia  ' } });

    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const updatedState = mockOnUpdateState.mock.calls[0][0] as GameState;
    
    // Normalized check
    const alice = updatedState.players.find(p => p.id === 'p1');
    expect(alice?.name).toBe('ALICIA');

    // Preservation check
    const bob = updatedState.players.find(p => p.id === 'p2');
    expect(bob?.name).toBe('BOB');
    expect(bob?.score).toBe(500);
  });

  it('3) EDIT SCORE: Updates numeric value via increment buttons', () => {
    render(
      <DirectorPanel 
        gameState={baseState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    switchToPlayersTab();

    // Find "Add 100" button for the first player (Alice)
    const addBtns = screen.getAllByTitle(/Add 100/i);
    fireEvent.click(addBtns[0]);

    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const updatedState = mockOnUpdateState.mock.calls[0][0] as GameState;
    
    const alice = updatedState.players.find(p => p.id === 'p1');
    expect(alice?.score).toBe(1100); // 1000 + 100
    expect(alice?.name).toBe('ALICE'); // Name preserved
  });

  it('4) DEFENSIVE: Handles missing players gracefully and logs warning', () => {
    // Fix: Using the declared require to access logger from the mock context
    const { logger } = require('../services/logger');
    const emptyState = { ...baseState, players: [] };
    
    render(
      <DirectorPanel 
        gameState={emptyState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    switchToPlayersTab();

    // Check for fallback UI
    expect(screen.getByText(/No contestants registered/i)).toBeInTheDocument();
    
    // Check audit log
    expect(logger.warn).toHaveBeenCalledWith('director_players_missing', expect.any(Object));
  });

  it('5) LOCK: Snapshot verification of the Players Tab structure', () => {
    const { asFragment } = render(
      <DirectorPanel 
        gameState={baseState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    switchToPlayersTab();

    // Capture only the main content area (where the tab content lives)
    // In our implementation, this is the scrollable container after the tab bar.
    const content = screen.getByText(/Contestant Management/i).closest('.animate-in');
    expect(content).toMatchSnapshot();
  });
});
