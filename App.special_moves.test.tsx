
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { authService } from './services/authService';
import { specialMovesClient } from './modules/specialMoves/client/specialMovesClient';

// --- MOCKS ---

vi.mock('./services/logger', () => ({
  logger: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    getCorrelationId: () => 'test-id',
    maskPII: (v: any) => v
  }
}));

vi.mock('./services/soundService', () => ({
  soundService: {
    playSelect: vi.fn(),
    playReveal: vi.fn(),
    playAward: vi.fn(),
    playSteal: vi.fn(),
    playVoid: vi.fn(),
    playClick: vi.fn(),
    playToast: vi.fn(),
  }
}));

vi.mock('./modules/specialMoves/client/specialMovesClient', () => {
  let mockOverlayHandler: (data: any) => void = () => {};
  return {
    specialMovesClient: {
      getHealth: vi.fn(() => 'HEALTHY'),
      requestArmTile: vi.fn(async () => ({ success: true, id: 'req_1' })),
      clearArmory: vi.fn(async () => ({ success: true, clearedCount: 1 })),
      subscribeOverlay: vi.fn(({ onOverlay }) => {
        mockOverlayHandler = onOverlay;
        onOverlay({ deploymentsByTileId: {}, activeByTargetId: {}, updatedAt: Date.now(), version: 1 });
        return () => {};
      }),
      // Helper for testing to trigger updates
      __triggerUpdate: (data: any) => mockOverlayHandler(data)
    }
  };
});

describe('Special Moves Feature Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    
    // Set up a game session
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const setupAndPlay = async () => {
    render(<App />);
    // Create Show
    const showInput = await screen.findByPlaceholderText(/New Show Title/i);
    fireEvent.change(showInput, { target: { value: 'SMS Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    
    // Create & Play Template
    fireEvent.click(await screen.findByText(/Create Template/i));
    fireEvent.change(await screen.findByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'SMS Test Game' } });
    fireEvent.click(screen.getByText(/Start Manual Studio Building/i));
    fireEvent.click(await screen.findByText(/Save Template/i));
    fireEvent.click(await screen.findByText(/Play Show/i));
    
    return await screen.findByText(/End Show/i);
  };

  it('A) DEPLOYMENT: Director can select a move and arm a tile', async () => {
    await setupAndPlay();

    // 1. Open Director -> Moves Tab
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(await screen.findByText('MOVES'));

    // 2. Select DOUBLE TROUBLE
    const moveBtn = await screen.findByText('DOUBLE TROUBLE');
    fireEvent.click(moveBtn);

    // 3. Click first 100pt tile
    const tileBtn = screen.getAllByText('100')[0];
    fireEvent.click(tileBtn);

    // 4. Verify client call
    expect(specialMovesClient.requestArmTile).toHaveBeenCalledWith(expect.objectContaining({
      moveType: 'DOUBLE_TROUBLE'
    }));

    // 5. Verify success toast
    expect(screen.getByText(/MOVE DEPLOYED/i)).toBeInTheDocument();
  });

  it('B) BOARD SYNC: GameBoard renders Zap icon when a tile is ARMED via overlay', async () => {
    await setupAndPlay();

    // Find the tile ID for the first 100pt question
    const state = JSON.parse(localStorage.getItem('cruzpham_gamestate') || '{}');
    const firstTileId = state.categories[0].questions[0].id;

    // Simulate an overlay update from Firestore
    await act(async () => {
      (specialMovesClient as any).__triggerUpdate({
        deploymentsByTileId: {
          [firstTileId]: { status: 'ARMED', moveType: 'DOUBLE_TROUBLE', updatedAt: Date.now() }
        },
        activeByTargetId: {},
        updatedAt: Date.now(),
        version: 1
      });
    });

    // Verify the board tile shows the Zap icon
    const tile = screen.getAllByRole('button').find(b => b.textContent === '100');
    expect(tile?.querySelector('.lucide-zap')).toBeInTheDocument();
    expect(tile).toHaveClass('animate-pulse');
  });

  it('C) CLEAR ARMORY: Director can wipe all armed moves', async () => {
    window.confirm = vi.fn(() => true);
    await setupAndPlay();

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(await screen.findByText('MOVES'));

    const clearBtn = await screen.findByText(/Wipe All Armed Tiles/i);
    fireEvent.click(clearBtn);

    expect(specialMovesClient.clearArmory).toHaveBeenCalled();
    expect(screen.getByText(/ARMORY CLEARED/i)).toBeInTheDocument();
  });

  it('D) REGRESSION: Scoreboard behaves normally when overlay is empty', async () => {
    await setupAndPlay();
    
    // Add points to Player 1 manually
    const p1 = screen.getByText('PLAYER 1');
    fireEvent.click(p1);
    
    const plusBtn = screen.getAllByRole('button').find(b => b.querySelector('.lucide-plus'))!;
    fireEvent.click(plusBtn);

    // Score should be 100, no badges should be visible
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /zap/i })).not.toBeInTheDocument();
  });
});
