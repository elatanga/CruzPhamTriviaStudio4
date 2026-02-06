import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorAnalytics } from './DirectorAnalytics';
import { GameState, GameAnalyticsEvent } from '../types';

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { 
    info: vi.fn(), 
    error: vi.fn(),
    maskPII: (v: any) => v 
  }
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
  }
}));

// Mock window.URL for download test
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:test-url'),
  revokeObjectURL: vi.fn(),
});

describe('DirectorAnalytics Regression', () => {
  const mockAddToast = vi.fn();

  const createEvent = (id: string, type: any = 'POINTS_AWARDED', text: string = 'Test Context'): GameAnalyticsEvent => ({
    id,
    ts: Date.now(),
    iso: new Date().toISOString(),
    type,
    actor: { role: 'director', playerName: 'PRODUCER' },
    context: { points: 100, playerName: 'PLAYER 1', categoryName: 'HISTORY', message: text }
  });

  const createMockGameState = (events: GameAnalyticsEvent[] = []): GameState => ({
    showTitle: 'Regression Show',
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
    events
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1) RENDER: Analytics panel renders telemetry headers and fallback UI when empty', () => {
    render(<DirectorAnalytics gameState={createMockGameState([])} addToast={mockAddToast} />);
    expect(screen.getByText(/Real-time telemetry stream/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for production activity/i)).toBeInTheDocument();
  });

  it('2) INGESTION: Updates UI instantly when new events are added to gameState', () => {
    const initialEvents = [createEvent('ev-1', 'SESSION_STARTED')];
    const { rerender } = render(<DirectorAnalytics gameState={createMockGameState(initialEvents)} addToast={mockAddToast} />);

    expect(screen.getByText(/Production session initiated/i)).toBeInTheDocument();

    const updatedEvents = [...initialEvents, createEvent('ev-2', 'POINTS_AWARDED')];
    rerender(<DirectorAnalytics gameState={createMockGameState(updatedEvents)} addToast={mockAddToast} />);

    expect(screen.getByText(/awarded 100 points to PLAYER 1/i)).toBeInTheDocument();
  });

  it('3) FORMATTING: Converts event types to readable full sentences', () => {
    const events = [
      createEvent('ev-1', 'PLAYER_ADDED'),
      createEvent('ev-2', 'TILE_VOIDED'),
      createEvent('ev-3', 'TIMER_FINISHED')
    ];
    render(<DirectorAnalytics gameState={createMockGameState(events)} addToast={mockAddToast} />);

    expect(screen.getByText(/New contestant "PLAYER 1" joined the production roster/i)).toBeInTheDocument();
    expect(screen.getByText(/Question in HISTORY was voided and disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Timer reached zero for HISTORY/i)).toBeInTheDocument();
  });

  it('4) SEARCH: Narrows visible results based on sentence content', () => {
    const events = [
      createEvent('ev-1', 'POINTS_AWARDED', 'Specific search term alpha'),
      createEvent('ev-2', 'POINTS_AWARDED', 'Other event beta')
    ];
    render(<DirectorAnalytics gameState={createMockGameState(events)} addToast={mockAddToast} />);

    const searchInput = screen.getByPlaceholderText(/Search events/i);
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    expect(screen.getByText(/Specific search term alpha/i)).toBeInTheDocument();
    expect(screen.queryByText(/Other event beta/i)).not.toBeInTheDocument();
  });

  it('5) FILTER: Bucket buttons correctly filter by event category', () => {
    const events = [
      createEvent('ev-1', 'POINTS_AWARDED'),
      createEvent('ev-2', 'AI_BOARD_REGEN_APPLIED'),
      createEvent('ev-3', 'SESSION_STARTED')
    ];
    render(<DirectorAnalytics gameState={createMockGameState(events)} addToast={mockAddToast} />);

    // Filter by POINTS
    fireEvent.click(screen.getByRole('button', { name: 'POINTS' }));
    expect(screen.getByText(/POINTS AWARDED/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI BOARD REGEN/i)).not.toBeInTheDocument();

    // Filter by AI
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(screen.queryByText(/POINTS AWARDED/i)).not.toBeInTheDocument();
    expect(screen.getByText(/AI BOARD REGEN/i)).toBeInTheDocument();
  });

  it('6) PAUSE: Snapshots current buffer and ignores background updates until resumed', () => {
    const initialEvents = [createEvent('ev-1', 'SESSION_STARTED')];
    const { rerender } = render(<DirectorAnalytics gameState={createMockGameState(initialEvents)} addToast={mockAddToast} />);

    // Click Pause
    fireEvent.click(screen.getByTitle(/Pause feed/i));
    expect(screen.getByText(/Snapshot Buffer/i)).toBeInTheDocument();

    // Add event in background
    const backgroundEvents = [...initialEvents, createEvent('ev-2', 'POINTS_AWARDED')];
    rerender(<DirectorAnalytics gameState={createMockGameState(backgroundEvents)} addToast={mockAddToast} />);

    // UI should NOT show new event yet
    expect(screen.queryByText(/POINTS AWARDED/i)).not.toBeInTheDocument();

    // Resume
    fireEvent.click(screen.getByTitle(/Resume telemetry/i));
    expect(screen.getByText(/POINTS AWARDED/i)).toBeInTheDocument();
  });

  it('7) REGRESSION LOCK: Snapshot verification of the Analytics panel subtree', () => {
    const events = [
      createEvent('ev-1', 'SESSION_STARTED'),
      createEvent('ev-2', 'POINTS_AWARDED')
    ];
    const { container } = render(<DirectorAnalytics gameState={createMockGameState(events)} addToast={mockAddToast} />);
    
    // Snapshot the entire component
    expect(container.firstChild).toMatchSnapshot();
  });
});