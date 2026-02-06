import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DirectorAnalytics } from './DirectorAnalytics';
import { GameState } from '../types';

/**
 * GOLDEN PATH REGRESSION TEST
 * Purpose: Ensures deterministic rendering of log rows and metadata.
 */

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), maskPII: (v: any) => v }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

describe('Analytics Golden Path', () => {
  const mockAddToast = vi.fn();

  const goldenEvents: any[] = [
    {
      id: "evt-001",
      ts: 1716206400000,
      type: "SESSION_STARTED",
      actor: { role: "director" },
      context: { note: "Deterministic Init" }
    },
    {
      id: "evt-002",
      ts: 1716206410000,
      type: "POINTS_AWARDED",
      actor: { role: "director", playerName: "EL DECODER" },
      context: { points: 500, playerName: "CHAMP", categoryName: "TECH" }
    }
  ];

  const goldenState: GameState = {
    showTitle: "GOLDEN RECOVERY SHOW",
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
      updatedAt: '',
    },
    lastPlays: [],
    events: goldenEvents
  };

  it('1) Integrity Lock: Event list renders deterministic set in newest-first order', () => {
    render(<DirectorAnalytics gameState={goldenState} addToast={mockAddToast} />);
    
    const rows = document.querySelectorAll('.divide-zinc-900 > div');
    expect(rows.length).toBe(2);

    // Row 0 should be newest: POINTS_AWARDED
    const row0 = within(rows[0] as HTMLElement);
    expect(row0.getByText(/awarded 500 points to CHAMP/i)).toBeInTheDocument();
    expect(row0.getByText(/EL DECODER/i)).toBeInTheDocument();

    // Row 1 should be oldest: SESSION_STARTED
    const row1 = within(rows[1] as HTMLElement);
    expect(row1.getByText(/Production session initiated/i)).toBeInTheDocument();
  });
});