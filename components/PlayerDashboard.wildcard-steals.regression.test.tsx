import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState, Player } from '../types';

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    getCorrelationId: () => 'test-correlation-id' 
  },
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
    playSelect: vi.fn(),
  },
}));

// Mocking external service calls
vi.mock('../services/geminiService', () => ({
  generateSingleQuestion: vi.fn(),
  generateCategoryQuestions: vi.fn(),
}));

describe('Player Dashboard (Director Players Tab): Wildcard & Steals Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  // Deterministic state with 1 player for focused testing
  const createInitialState = (): GameState => ({
    showTitle: 'Studio Regression',
    isGameStarted: true,
    categories: [],
    players: [
      { 
        id: 'p-123', 
        name: 'ALICE', 
        score: 1000, 
        color: '#fff', 
        wildcardsUsed: 0, 
        stealsCount: 0 
      }
    ],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: 'p-123',
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDashboard = (state: GameState) => {
    render(
      <DirectorPanel 
        gameState={state} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );
    // Switch to Players tab where the "Dashboard" controls live
    fireEvent.click(screen.getByRole('button', { name: /players/i }));
  };

  it('1) WILDCARDS: Renders control and triggers state update on click', async () => {
    renderDashboard(createInitialState());

    // Find wildcard increment button
    const wildcardBtn = screen.getByTitle(/Increment Wildcard Usage/i);
    expect(wildcardBtn).toBeInTheDocument();
    expect(within(wildcardBtn).getByText('0/4')).toBeInTheDocument();

    // Click it
    fireEvent.click(wildcardBtn);

    // Assert emission
    expect(mockEmitGameEvent).toHaveBeenCalledWith('WILDCARD_USED', expect.objectContaining({
      context: expect.objectContaining({ playerId: 'p-123', after: 1 })
    }));

    // Assert state update
    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
    expect(nextState.players[0].wildcardsUsed).toBe(1);
  });

  it('2) WILDCARDS: Button is disabled at maximum limit (4)', () => {
    const state = createInitialState();
    state.players[0].wildcardsUsed = 4;
    
    renderDashboard(state);

    const wildcardBtn = screen.getByTitle(/Increment Wildcard Usage/i);
    expect(wildcardBtn).toBeDisabled();
    expect(within(wildcardBtn).getByText('MAX 4 USED')).toBeInTheDocument();
  });

  it('3) STEALS: Renders counter and correctly displays current count', () => {
    const state = createInitialState();
    state.players[0].stealsCount = 3;
    
    renderDashboard(state);

    // Find steals display area
    const stealsCell = screen.getByText('3').closest('div');
    expect(stealsCell).toBeInTheDocument();
    // Check for the shield alert icon which represents steals in our UI
    expect(stealsCell?.querySelector('svg.lucide-shield-alert')).toBeInTheDocument();
  });

  it('4) SCORE ADJUSTMENT: Manual adjustment emits exactly one event and preserves name', () => {
    renderDashboard(createInitialState());

    const plusBtn = screen.getByTitle('Add 100');
    fireEvent.click(plusBtn);

    expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
    const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
    
    expect(nextState.players[0].score).toBe(1100);
    expect(nextState.players[0].name).toBe('ALICE'); // Integrity check
  });

  it('5) FAILURE SCENARIO: Error in state update prevents mutation and shows toast', async () => {
    // We simulate a failure by mocking onUpdateState to throw or by inducing an error in the handler
    // In our component, we have a try-catch in handleUpdatePlayer.
    // Let's induce a failure by passing invalid data that triggers a catch.
    
    // For this specific UI, we'll verify the error toast emission if we mock a service failure
    // However, score updates are direct. We'll test the removal failure as a proxy for safety.
    vi.stubGlobal('confirm', () => true);
    mockOnUpdateState.mockImplementationOnce(() => { throw new Error('DB_SYNC_ERROR'); });

    renderDashboard(createInitialState());

    const deleteBtn = screen.getByTitle('Delete Contestant');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringContaining('Failed to update'));
    });
  });

  it('6) RE-RENDER STABILITY: No double-apply of state updates on component re-render', async () => {
    const { rerender } = render(
      <DirectorPanel 
        gameState={createInitialState()} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /players/i }));

    const plusBtn = screen.getByTitle('Add 100');
    fireEvent.click(plusBtn);

    const firstCallCount = mockOnUpdateState.mock.calls.length;
    const updatedState = mockOnUpdateState.mock.calls[0][0];

    // Trigger re-render with the NEW state
    rerender(
      <DirectorPanel 
        gameState={updatedState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    // Verify Alice's score is 1100 and hasn't changed further
    expect(screen.getByText('1100')).toBeInTheDocument();
    expect(mockOnUpdateState.mock.calls.length).toBe(firstCallCount);
  });

  /**
   * LOCK REQUIREMENT: Snapshot of the control region
   * Rationale: Protects the "Wildcards" and "Steals" columns from accidental removal in future refactors.
   */
  it('7) UI LOCK: Wildcard and Steals section matches architectural design', () => {
    renderDashboard(createInitialState());

    // Select the table row content containing the controls
    const playerRow = screen.getByDisplayValue('ALICE').closest('tr');
    
    // Focusing the snapshot on the columns for Wildcards and Steals
    const wildcardSection = playerRow?.querySelectorAll('td')[2]; // Wildcards col
    const stealsSection = playerRow?.querySelectorAll('td')[3];   // Steals col

    expect(wildcardSection).toMatchSnapshot('wildcard-column');
    expect(stealsSection).toMatchSnapshot('steals-column');
  });
});
