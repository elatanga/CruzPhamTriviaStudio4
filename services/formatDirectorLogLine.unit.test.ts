import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDirectorLogLine } from './logFormatter';
import { GameAnalyticsEvent } from '../types';

describe('formatDirectorLogLine Unit Regression', () => {
  const mockCtx = {
    playersById: { 'p1': 'ALICE', 'p2': 'BOB' },
    categoriesById: { 'c1': 'HISTORY' }
  };

  const fixedTs = 1716206400000; // 2024-05-20 12:00:00 UTC
  const fixedIso = '2024-05-20T12:00:00.000Z';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedTs));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createEvt = (type: any, context: any): GameAnalyticsEvent => ({
    id: `evt-${Math.random()}`,
    ts: fixedTs,
    iso: fixedIso,
    type,
    actor: { role: 'director' },
    context
  });

  it('LOCK: Validates tsLabel HH:MM:SS format', () => {
    const result = formatDirectorLogLine(createEvt('PLAYER_ADDED', { playerName: 'ALICE' }), mockCtx);
    // HH:MM:SS check (local time depends on test env, but we set it via fake timers)
    expect(result.tsLabel).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('LOCK: GOLDEN STRING - Steal Success', () => {
    const evt = createEvt('POINTS_STOLEN', { playerName: 'ALICE', points: 500, note: 'from BOB' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('ALICE stole 500 points from BOB.');
  });

  it('LOCK: GOLDEN STRING - Steal Attempt', () => {
    const evt = createEvt('POINTS_STOLEN', { playerName: 'ALICE', note: 'attempt from BOB' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('ALICE attempted to steal from BOB.');
  });

  it('LOCK: GOLDEN STRING - Steal Fail', () => {
    const evt = createEvt('POINTS_STOLEN', { playerName: 'ALICE', note: 'fail from BOB' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('ALICE failed to steal from BOB.');
  });

  it('LOCK: GOLDEN STRING - Void Tile', () => {
    const evt = createEvt('TILE_VOIDED', { categoryName: 'HISTORY', points: 200 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director voided the 200-point tile in HISTORY.');
  });

  it('LOCK: GOLDEN STRING - Award Points', () => {
    const evt = createEvt('POINTS_AWARDED', { playerName: 'ALICE', points: 300 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director awarded 300 points to ALICE.');
  });

  it('LOCK: GOLDEN STRING - Deduct Points', () => {
    const evt = createEvt('SCORE_ADJUSTED', { playerName: 'BOB', delta: -150 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director deducted 150 points from BOB.');
  });

  it('LOCK: GOLDEN STRING - Player Added', () => {
    const evt = createEvt('PLAYER_ADDED', { playerName: 'CHARLIE' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe(`Director added player CHARLIE at ${fixedIso}.`);
  });

  it('LOCK: GOLDEN STRING - Player Removed', () => {
    const evt = createEvt('PLAYER_REMOVED', { playerName: 'BOB' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe(`Director deleted player BOB at ${fixedIso}.`);
  });

  it('LOCK: GOLDEN STRING - Single Tile Regeneration', () => {
    const evt = createEvt('AI_TILE_REPLACE_APPLIED', { categoryName: 'HISTORY', points: 400, difficulty: 'hard' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director regenerated the question for HISTORY (400 points) on hard.');
  });

  it('LOCK: GOLDEN STRING - Category Regeneration', () => {
    const evt = createEvt('AI_CATEGORY_REPLACE_APPLIED', { categoryName: 'HISTORY', difficulty: 'easy' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director regenerated the entire HISTORY category on easy.');
  });

  it('LOCK: GOLDEN STRING - Full Board Regeneration', () => {
    const evt = createEvt('AI_BOARD_REGEN_APPLIED', { difficulty: 'medium' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director regenerated the full board on medium.');
  });

  it('LOCK: FALLBACK - Unknown Event', () => {
    const evt = createEvt('MYSTERY_MOVE' as any, {});
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('An event occurred: MYSTERY MOVE.');
  });
});