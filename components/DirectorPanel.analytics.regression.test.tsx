import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorAnalytics } from './DirectorAnalytics';
import { GameState, GameAnalyticsEvent } from '../types';

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    getCorrelationId: () => 'test-id',
    maskPII: (v: any) => v // Identity mock for testing
  }
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
  }
}));

// Mock window/Blob APIs for download buttons
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:test-url'),
  revokeObjectURL: vi.fn(),
});

describe('Director Analytics Regression Suite', () => {
  const mockAddToast = vi.fn();

  const createEvent = (id: string, type: any = 'POINTS_AWARDED', text: string = 'Test Context'): GameAnalyticsEvent => ({
    id,
    ts: Date.now(),
    iso: new Date().toISOString(),
    type,
    actor: { role: 'director', playerName: 'PRODUCER' },
    context: { message: text }
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

  it('1) RENDERING: Analytics panel renders with correct telemetry headers', () => {
    render(<DirectorAnalytics gameState={createMockGameState()} addToast={mockAddToast} />);
    
    expect(screen.getByText(/Real-time telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for production activity/i)).toBeInTheDocument();
  });

  it('2) INGESTION: Updates in real-time when new events are added to state', () => {
    const initialEvents = [createEvent('ev-1', 'SESSION_STARTED')];
    const { rerender } = render(<DirectorAnalytics gameState={createMockGameState(initialEvents)} addToast={mockAddToast} />);

    expect(screen.getByText(/SESSION STARTED/i)).toBeInTheDocument();

    const updatedEvents = [...initialEvents, createEvent('ev-2', 'POINTS_AWARDED', 'User scored 100')];
    rerender(<DirectorAnalytics gameState={createMockGameState(updatedEvents)} addToast={mockAddToast} />);

    expect(screen.getByText(/POINTS AWARDED/i)).toBeInTheDocument();
    expect(screen.getByText(/"User scored 100"/i)).toBeInTheDocument();
  });

  it('3) SEARCH FILTER: Narrows visible results based on context or type', () => {
    const events = [
      createEvent('ev-1', 'POINTS_AWARDED', 'Alice scored'),
      createEvent('ev-2', 'PLAYER_ADDED', 'Bob joined'),
      createEvent('ev-3', 'TIMER_STARTED', 'Clock ticking')
    ];
    render(<DirectorAnalytics gameState={createMockGameState(events)} addToast={mockAddToast} />);

    const searchInput = screen.getByPlaceholderText(/Search events/i);
    
    // Filter for Alice
    fireEvent.change(searchInput, { target: { value: 'Alice' } });
    expect(screen.getByText(/Alice scored/i)).toBeInTheDocument();
    expect(screen.queryByText(/Bob joined/i)).not.toBeInTheDocument();

    // Filter for Bob
    fireEvent.change(searchInput, { target: { value: 'Bob' } });
    expect(screen.queryByText(/Alice scored/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Bob joined/i)).toBeInTheDocument();
  });

  it('4) TYPE FILTER: Narrows results using bucket buttons', () => {
    const events = [
      createEvent('ev-1', 'POINTS_AWARDED', 'Score up'),
      createEvent('ev-2', 'AI_BOARD_REGEN_START', 'AI working'),
      createEvent('ev-3', 'PLAYER_ADDED', 'New human')
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

  it('5) PAUSE MECHANICS: Freezes UI while allowing the background buffer to grow', () => {
    const initialEvents = [createEvent('ev-1', 'SESSION_STARTED')];
    const { rerender } = render(<DirectorAnalytics gameState={createMockGameState(initialEvents)} addToast={mockAddToast} />);

    // Click Pause
    fireEvent.click(screen.getByTitle(/Pause Live Feed/i));
    expect(screen.getByText(/Snapshot Buffer/i)).toBeInTheDocument();

    // Add new event to state
    const updatedEvents = [...initialEvents, createEvent('ev-2', 'POINTS_AWARDED', 'Frozen event')];
    rerender(<DirectorAnalytics gameState={createMockGameState(updatedEvents)} addToast={mockAddToast} />);

    // Frozen UI should NOT show ev-2
    expect(screen.queryByText(/Frozen event/i)).not.toBeInTheDocument();

    // Resume
    fireEvent.click(screen.getByTitle(/Resume Live Feed/i));
    expect(screen.getByText(/Real-time telemetry/i)).toBeInTheDocument();

    // Now it should appear
    expect(screen.getByText(/Frozen event/i)).toBeInTheDocument();
  });

  it('6) REGRESSION LOCK: Snapshot of the Analytics panel subtree', () => {
    const events = [
      createEvent('ev-1', 'SESSION_STARTED'),
      createEvent('ev-2', 'POINTS_AWARDED', 'Alice +100')
    ];
    const { container } = render(<DirectorAnalytics gameState={createMockGameState(events)} addToast={mockAddToast} />);
    
    // Snapshot the entire component's root div
    expect(container.firstChild).toMatchSnapshot();
  });
});