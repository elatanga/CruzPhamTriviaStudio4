import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { authService } from '../services/authService';

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    getCorrelationId: () => 'privacy-id',
    maskPII: (v: any) => v
  }
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playSelect: vi.fn(),
    playReveal: vi.fn(),
    playAward: vi.fn(),
    playSteal: vi.fn(),
    playVoid: vi.fn(),
    playClick: vi.fn(),
    playToast: vi.fn(),
    getMute: () => false,
    getVolume: () => 0.5,
  }
}));

// Mock window interactions
vi.stubGlobal('confirm', () => true);
vi.stubGlobal('scrollTo', vi.fn());

describe('Unified Telemetry Pipeline Lock', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();

    const initialState = {
      showTitle: 'Unified Telemetry Show',
      isGameStarted: true,
      categories: [{ id: 'c1', title: 'SCIENCE', questions: [{ id: 'q1', points: 100, text: 'WHAT IS WATER?', answer: 'H2O', isRevealed: false, isAnswered: false }] }],
      players: [{ id: 'p1', name: 'ALICE', score: 0, color: '#fff' }],
      activeQuestionId: null,
      activeCategoryId: null,
      selectedPlayerId: 'p1',
      history: [],
      timer: { duration: 30, endTime: null, isRunning: false },
      viewSettings: { categoryTitleScale: 'M', playerNameScale: 'M', tileScale: 'M', scoreboardScale: 1.0, tilePaddingScale: 1.0, updatedAt: '' },
      lastPlays: [],
      events: []
    };

    localStorage.setItem('cruzpham_gamestate', JSON.stringify(initialState));
    localStorage.setItem('cruzpham_active_session_id', 'sess-telemetry');

    vi.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: true });
    vi.spyOn(authService, 'restoreSession').mockResolvedValue({
      success: true,
      session: { id: 'sess-telemetry', username: 'director', role: 'MASTER_ADMIN', createdAt: Date.now(), userAgent: 'test' }
    });
  });

  it('A) TELEMETRY: Tile open emits TILE_OPENED event', async () => {
    render(<App />);

    const tile = await screen.findByText('100');
    fireEvent.click(tile);

    const state = JSON.parse(localStorage.getItem('cruzpham_gamestate')!);
    const lastEvent = state.events[state.events.length - 1];
    expect(lastEvent.type).toBe('TILE_OPENED');
    expect(lastEvent.context.categoryName).toBe('SCIENCE');
  });

  it('B) TELEMETRY: Reveal answer emits ANSWER_REVEALED event', async () => {
    render(<App />);

    const tile = await screen.findByText('100');
    fireEvent.click(tile);

    const revealBtn = await screen.findByTitle(/Reveal Answer/i);
    fireEvent.click(revealBtn);

    const state = JSON.parse(localStorage.getItem('cruzpham_gamestate')!);
    const lastEvent = state.events[state.events.length - 1];
    expect(lastEvent.type).toBe('ANSWER_REVEALED');
  });

  it('C) TELEMETRY: Awarding points emits POINTS_AWARDED event', async () => {
    render(<App />);

    const tile = await screen.findByText('100');
    fireEvent.click(tile);

    fireEvent.click(await screen.findByTitle(/Reveal Answer/i));
    fireEvent.click(await screen.findByTitle(/Award/i));

    const state = JSON.parse(localStorage.getItem('cruzpham_gamestate')!);
    const lastEvent = state.events[state.events.length - 1];
    expect(lastEvent.type).toBe('POINTS_AWARDED');
    expect(lastEvent.context.playerName).toBe('ALICE');
  });
});