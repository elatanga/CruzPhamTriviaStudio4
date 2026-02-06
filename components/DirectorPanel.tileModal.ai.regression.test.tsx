import React from 'react';
/* Fix: Added 'act' to the imports from @testing-library/react */
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';
import * as geminiService from '../services/geminiService';

// --- MOCKS ---

vi.mock('../services/geminiService', () => ({
  generateSingleQuestion: vi.fn(),
  generateCategoryQuestions: vi.fn(),
}));

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
  },
}));

describe('DirectorPanel: Edit Tile Modal AI Regression', () => {
  const mockOnUpdateState = vi.fn();
  const mockEmitGameEvent = vi.fn();
  const mockAddToast = vi.fn();

  // Deterministic Game State for precision testing
  const goldenState: GameState = {
    showTitle: 'Studio Regression',
    isGameStarted: true,
    categories: [
      {
        id: 'cat-0',
        title: 'Science',
        questions: [
          { 
            id: 'q-stable-id', 
            text: 'Original Question Text', 
            answer: 'Original Answer', 
            points: 500, 
            isRevealed: false, 
            isAnswered: true, 
            isDoubleOrNothing: true 
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
    vi.stubGlobal('crypto', { randomUUID: () => 'gen-123' });
    // For confirmation dialogs
    vi.stubGlobal('confirm', () => true);
  });

  const openTileModal = () => {
    render(
      <DirectorPanel 
        gameState={goldenState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );
    // Find the tile by its points in the Board tab (default tab)
    const tile = screen.getByText('500').closest('div');
    fireEvent.click(tile!);
  };

  it('1) VISIBILITY: Modal renders the "AI Regen Tile" section with all difficulty options', () => {
    openTileModal();

    // Verify modal is open and contains section
    const modal = screen.getByRole('heading', { name: /Science \/\/ 500/i }).closest('div')?.parentElement;
    expect(within(modal!).getByText(/AI Regen Tile/i)).toBeInTheDocument();

    // Verify difficulty buttons
    expect(within(modal!).getByText('easy')).toBeInTheDocument();
    expect(within(modal!).getByText('medium')).toBeInTheDocument();
    expect(within(modal!).getByText('hard')).toBeInTheDocument();
    expect(within(modal!).getByText('mixed')).toBeInTheDocument();

    // Verify Regen action button
    expect(within(modal!).getByRole('button', { name: /regen/i })).toBeInTheDocument();
  });

  it('2) CONTRACT: Changing difficulty and clicking regen calls service with correct parameters', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({ 
      text: 'New AI Q', 
      answer: 'New AI A' 
    });

    openTileModal();

    // Select 'hard'
    const hardBtn = screen.getByText('hard');
    fireEvent.click(hardBtn);

    // Click Regen
    const regenBtn = screen.getByRole('button', { name: /regen/i });
    fireEvent.click(regenBtn);

    expect(geminiService.generateSingleQuestion).toHaveBeenCalledWith(
      'Studio Regression', // Topic
      500,                 // Points
      'Science',           // Category
      'hard',              // Difficulty (Selected)
      'gen-123'            // correlation/genId
    );
  });

  it('3) SUCCESS: Applies update while strictly preserving ID, points, and status flags', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({ 
      text: 'SUCCESSFUL AI QUESTION', 
      answer: 'SUCCESSFUL AI ANSWER' 
    });

    openTileModal();
    fireEvent.click(screen.getByRole('button', { name: /regen/i }));

    await waitFor(() => {
      expect(mockOnUpdateState).toHaveBeenCalledTimes(1);
      const nextState = mockOnUpdateState.mock.calls[0][0] as GameState;
      const q = nextState.categories[0].questions[0];

      // Content updated
      expect(q.text).toBe('SUCCESSFUL AI QUESTION');
      expect(q.answer).toBe('SUCCESSFUL AI ANSWER');

      // Meta LOCK (Strict preservation)
      expect(q.id).toBe('q-stable-id');
      expect(q.points).toBe(500);
      expect(q.isAnswered).toBe(true);
      expect(q.isDoubleOrNothing).toBe(true);
    });

    expect(mockAddToast).toHaveBeenCalledWith('success', expect.stringContaining('Question generated'));
  });

  it('4) FAILURE: Shows error toast and prevents state mutation (Snapshot Rollback)', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockRejectedValue(new Error('AI_TIMEOUT'));

    openTileModal();
    fireEvent.click(screen.getByRole('button', { name: /regen/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringContaining('Failed to generate'));
      // onUpdateState must NOT be called to avoid corrupted state
      expect(mockOnUpdateState).not.toHaveBeenCalled();
    });
  });

  it('5) LOADING: Regen button is disabled during the generation lifecycle', async () => {
    let resolveAi: any;
    const aiPromise = new Promise((resolve) => { resolveAi = resolve; });
    vi.mocked(geminiService.generateSingleQuestion).mockReturnValue(aiPromise as any);

    openTileModal();
    const regenBtn = screen.getByRole('button', { name: /regen/i });
    
    fireEvent.click(regenBtn);

    // Button should be locked
    expect(regenBtn).toBeDisabled();

    // Resolve and check unlock
    await act(async () => {
      resolveAi({ text: 'Done', answer: 'Done' });
    });

    await waitFor(() => {
      expect(regenBtn).not.toBeDisabled();
    });
  });

  it('6) UI SYNC: Textareas refresh content after AI update (via key prop check)', async () => {
    vi.mocked(geminiService.generateSingleQuestion).mockResolvedValue({ 
      text: 'UI SYNC TEXT', 
      answer: 'UI SYNC ANSWER' 
    });

    const { rerender } = render(
      <DirectorPanel 
        gameState={goldenState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    // Open modal
    fireEvent.click(screen.getByText('500').closest('div')!);
    
    // Trigger AI
    fireEvent.click(screen.getByRole('button', { name: /regen/i }));

    await waitFor(() => expect(mockOnUpdateState).toHaveBeenCalled());

    // Update the rendered component with the "new" state to verify textarea defaultValue update
    const updatedState = mockOnUpdateState.mock.calls[0][0];
    rerender(
      <DirectorPanel 
        gameState={updatedState} 
        onUpdateState={mockOnUpdateState} 
        emitGameEvent={mockEmitGameEvent} 
        addToast={mockAddToast} 
      />
    );

    // Check if textareas now display the AI results
    expect(screen.getByDisplayValue('UI SYNC TEXT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('UI SYNC ANSWER')).toBeInTheDocument();
  });

  /**
   * FOCUSED SNAPSHOT TEST
   * Rationale: Snapshots only the specific "AI Regen Tile" section to prevent
   * noisy diffs from other parts of the panel or full-page layout changes.
   */
  it('7) UI LOCK: AI section visually matches the design specification', () => {
    openTileModal();

    // Find the specific AI section container by its title
    const aiSection = screen.getByText(/AI Regen Tile/i).closest('.bg-purple-900\\/10');
    
    // Snapshot the sub-tree containing difficulty controls and the regen button
    expect(aiSection).toMatchSnapshot();
  });
});