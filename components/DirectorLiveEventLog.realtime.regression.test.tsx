import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectorLiveEventLog } from './DirectorLiveEventLog';
import { GameAnalyticsEvent, Player, Category } from '../types';

// Mock Logger
vi.mock('../services/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    maskPII: (v: any) => v
  }
}));

// Mock Sound Service
vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
  }
}));

describe('DirectorLiveEventLog Real-time Regression', () => {
  const fixedTs = 1716206400000;
  
  const mockPlayers: Player[] = [{ id: 'p1', name: 'ALICE', score: 0, color: '#fff' }];
  const mockCategories: Category[] = [{ id: 'c1', title: 'HISTORY', questions: [] }];

  const baseEvent: GameAnalyticsEvent = {
    id: 'evt-1',
    ts: fixedTs,
    iso: '2024-05-20T12:00:00.000Z',
    type: 'PLAYER_ADDED',
    actor: { role: 'director' },
    context: { playerName: 'ALICE' }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedTs));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('A) REAL-TIME: Renders new events without refresh when props update', () => {
    const { rerender } = render(
      <DirectorLiveEventLog events={[baseEvent]} players={mockPlayers} categories={mockCategories} />
    );

    expect(screen.getByText(/Director added player ALICE/i)).toBeInTheDocument();

    const newEvent = { ...baseEvent, id: 'evt-2', type: 'POINTS_AWARDED' as const, context: { ...baseEvent.context, points: 100 } };
    
    rerender(
      <DirectorLiveEventLog events={[baseEvent, newEvent]} players={mockPlayers} categories={mockCategories} />
    );

    expect(screen.getByText(/Director awarded 100 points to ALICE/i)).toBeInTheDocument();
  });

  it('B) DE-DUPE: Does not render duplicate IDs from the stream', () => {
    const events = [baseEvent, { ...baseEvent }]; // Same ID twice
    render(<DirectorLiveEventLog events={events} players={mockPlayers} categories={mockCategories} />);

    const rows = screen.getAllByText(/Director added player ALICE/i);
    expect(rows.length).toBe(1);
  });

  it('C) ORDERING: Renders newest first', () => {
    const event1 = { ...baseEvent, id: 'evt-1', ts: fixedTs };
    const event2 = { ...baseEvent, id: 'evt-2', ts: fixedTs + 1000, type: 'TILE_VOIDED' as const, context: { points: 10, categoryName: 'H' } };
    
    render(<DirectorLiveEventLog events={[event1, event2]} players={mockPlayers} categories={mockCategories} />);

    const logItems = document.querySelectorAll('.divide-zinc-900 > div');
    // The component map-reverses or iterates backwards for newest first
    expect(logItems[0].textContent).toContain('Director voided');
    expect(logItems[1].textContent).toContain('Director added');
  });

  it('D) SNAPSHOT: Matches log row subtree integrity', () => {
    render(<DirectorLiveEventLog events={[baseEvent]} players={mockPlayers} categories={mockCategories} />);
    
    const row = document.querySelector('.divide-zinc-900 > div');
    expect(row).toMatchSnapshot();
  });
});