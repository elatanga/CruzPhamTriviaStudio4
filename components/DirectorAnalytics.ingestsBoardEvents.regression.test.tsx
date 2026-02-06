import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorAnalytics } from './DirectorAnalytics';
import { GameState, GameAnalyticsEvent, AnalyticsEventType } from '../types';

// --- MOCKS ---
vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), maskPII: (v: any) => v }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn(), playToast: vi.fn() }
}));

describe('DirectorAnalytics: Board Ingestion Regression', () => {
  // Fix: Added missing 'lastPlays' property to satisfy GameState interface
  const initialState: GameState = {
    showTitle: 'Ingestion Test',
    isGameStarted: true,
    categories: [{ id: 'c1', title: 'Science', questions: [{ id: 'q1', text: 'Q', answer: 'A', points: 300, isRevealed: false, isAnswered: false }] }],
    players: [{ id: 'p1', name: 'Mary', score: 0, color: '#fff' }],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: null,
    history: [],
    timer: { duration: 30, endTime: null, isRunning: false },
    viewSettings: { categoryTitleScale: 'M', playerNameScale: 'M', tileScale: 'M', scoreboardScale: 1.0, tilePaddingScale: 1.0, updatedAt: '' },
    lastPlays: [],
    events: []
  };

  it('A) Live ingestion: UI updates with "Director awarded 300 points to Mary." when event is emitted', async () => {
    const { rerender } = render(<DirectorAnalytics gameState={initialState} addToast={vi.fn()} />);
    
    // Simulate board emitting an event into state
    const newEvent: GameAnalyticsEvent = {
      id: 'evt-1',
      ts: Date.now(),
      iso: new Date().toISOString(),
      type: 'POINTS_AWARDED',
      actor: { role: 'director' },
      context: { playerName: 'Mary', points: 300 }
    };

    const updatedState = { ...initialState, events: [newEvent] };

    await act(async () => {
      rerender(<DirectorAnalytics gameState={updatedState} addToast={vi.fn()} />);
    });

    expect(screen.getByText(/Director awarded 300 points to Mary/i)).toBeInTheDocument();
  });

  it('B) Multiple Sources: Correctly renders mixed board and director actions', async () => {
    const events: GameAnalyticsEvent[] = [
      { id: '1', ts: Date.now() - 1000, iso: '', type: 'PLAYER_ADDED', context: { playerName: 'John' } },
      { id: '2', ts: Date.now(), iso: '', type: 'POINTS_STOLEN', context: { playerName: 'Mary', points: 200, note: 'from John' } }
    ];

    render(<DirectorAnalytics gameState={{ ...initialState, events }} addToast={vi.fn()} />);

    expect(screen.getByText(/Mary stole 200 points from John/i)).toBeInTheDocument();
    expect(screen.getByText(/Director added player John/i)).toBeInTheDocument();
  });
});