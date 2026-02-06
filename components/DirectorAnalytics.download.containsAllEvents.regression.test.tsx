import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectorAnalytics } from './DirectorAnalytics';
import { GameState, GameAnalyticsEvent } from '../types';

// Fix: Declare global for Vitest/JSDOM environment
declare const global: any;

describe('DirectorAnalytics: Export Payload Regression', () => {
  const fixedTime = new Date('2024-05-20T12:00:00.000Z');
  const mockAddToast = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
    
    // Fix: Access global.Blob correctly after declaration
    global.Blob = vi.fn().mockImplementation((content, options) => ({ content, options }));
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A) Golden Payload: JSONL export contains exact required production strings', () => {
    const events: GameAnalyticsEvent[] = [
      {
        id: 'e1', ts: fixedTime.getTime(), iso: fixedTime.toISOString(),
        type: 'POINTS_AWARDED', actor: { role: 'director' }, context: { playerName: 'Mary', points: 300 }
      },
      {
        id: 'e2', ts: fixedTime.getTime() + 1000, iso: fixedTime.toISOString(),
        type: 'POINTS_STOLEN', actor: { role: 'director' }, context: { playerName: 'Mary', points: 200, note: 'from John' }
      },
      {
        id: 'e3', ts: fixedTime.getTime() + 2000, iso: fixedTime.toISOString(),
        type: 'AI_TILE_REPLACE_APPLIED', actor: { role: 'director' }, context: { categoryName: 'Science', points: 300, difficulty: 'mixed' }
      }
    ];

    // Fix: Added missing 'lastPlays' property to satisfy GameState interface
    const state: GameState = {
      showTitle: 'Export Show',
      isGameStarted: true,
      categories: [], players: [], activeQuestionId: null, activeCategoryId: null, selectedPlayerId: null,
      history: [], timer: { duration: 30, endTime: null, isRunning: false },
      viewSettings: { categoryTitleScale: 'M', playerNameScale: 'M', tileScale: 'M', scoreboardScale: 1.0, tilePaddingScale: 1.0, updatedAt: '' },
      lastPlays: [],
      events
    };

    render(<DirectorAnalytics gameState={state} addToast={mockAddToast} />);
    
    const downloadBtn = screen.getByRole('button', { name: /Download Logs/i });
    fireEvent.click(downloadBtn);

    // Fix: Access global.Blob correctly after declaration
    const blobCall = vi.mocked(global.Blob).mock.calls[0];
    const content = blobCall[0][0];
    const lines = content.split('\n').map((l: string) => JSON.parse(l));

    // Assert Golden Strings
    expect(lines[0].sentence).toBe('Director awarded 300 points to Mary.');
    expect(lines[1].sentence).toBe('Mary stole 200 points from John.');
    expect(lines[2].sentence).toBe('Director regenerated the question for Science (300 points) on mixed.');
    
    // Assert structure
    expect(lines[0]).toHaveProperty('tsIso');
    expect(lines[0]).toHaveProperty('type', 'POINTS_AWARDED');
  });
});