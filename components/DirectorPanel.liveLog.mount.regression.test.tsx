import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DirectorPanel } from './DirectorPanel';
import { GameState } from '../types';

// Minimal Mocks
vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

describe('DirectorPanel Mount Regression (Live Log Visibility)', () => {
  const mockState: GameState = {
    showTitle: 'Test Show',
    isGameStarted: true,
    categories: [],
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
      updatedAt: ''
    },
    lastPlays: [],
    events: []
  };

  it('A) VISIBILITY: Live Event Log renders when Analytics tab is selected', () => {
    render(
      <DirectorPanel 
        gameState={mockState} 
        onUpdateState={vi.fn()} 
        emitGameEvent={vi.fn()} 
        addToast={vi.fn()} 
      />
    );

    // Default tab is BOARD. Switch to ANALYTICS.
    const analyticsTab = screen.getByRole('button', { name: /analytics/i });
    fireEvent.click(analyticsTab);

    // Verify Log Component Title is present
    expect(screen.getByText('Live Event Log')).toBeInTheDocument();
    
    // Verify specific Live Feed status dot or terminal icon as proof of component mount
    expect(screen.getByText(/Live Feed/i)).toBeInTheDocument();
  });
});