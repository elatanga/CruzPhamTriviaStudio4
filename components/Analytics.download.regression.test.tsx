import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectorAnalytics } from './DirectorAnalytics';
import { GameState } from '../types';

/**
 * Fix: Add global declarations for Vitest/JSDOM environment.
 */
declare const global: any;

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), maskPII: (v: any) => v }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() }
}));

const mockObjectURL = 'blob:cruzpham-telemetry-dump';
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => mockObjectURL),
  revokeObjectURL: vi.fn(),
});

describe('Analytics Download Regression', () => {
  const mockAddToast = vi.fn();
  const fixedTime = new Date('2024-05-20T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createGameState = (): GameState => ({
    showTitle: 'Export Show',
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
    events: [{
      id: 'ev-1',
      ts: fixedTime.getTime(),
      iso: fixedTime.toISOString(),
      type: 'SESSION_STARTED',
      actor: { role: 'director' },
      context: { note: 'Initial test' }
    }]
  });

  it('1) Triggering download creates anchor and cleans up correctly', () => {
    const linkSpy = {
      click: vi.fn(),
      setAttribute: vi.fn(),
      remove: vi.fn(),
      href: '',
      download: '',
      style: {}
    };
    
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return linkSpy as any;
      return document.createElement.call(document, tag);
    });

    vi.spyOn(document.body, 'appendChild').mockImplementation(() => ({} as any));
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as any));

    render(<DirectorAnalytics gameState={createGameState()} addToast={mockAddToast} />);
    
    const downloadBtn = screen.getByTitle(/Download Session Script/i);
    fireEvent.click(downloadBtn);

    expect(linkSpy.download).toContain('cruzpham-analytics-');
    expect(linkSpy.click).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
  });
});