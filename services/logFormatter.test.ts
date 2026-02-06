import { describe, it, expect } from 'vitest';
import { formatDirectorLogLine } from './logFormatter';
import { GameAnalyticsEvent } from '../types';

describe('formatDirectorLogLine Utility - Golden String Verification', () => {
  const mockCtx = {
    playersById: { 'p1': 'ALICE', 'p2': 'BOB' },
    categoriesById: { 'c1': 'HISTORY' }
  };

  const baseEvent = (type: any, context: any): GameAnalyticsEvent => ({
    id: 'test-evt',
    ts: 1716206400000, 
    iso: '2024-05-20T12:00:00.000Z',
    type,
    actor: { role: 'director' },
    context
  });

  it('LOCK: formats POINTS_AWARDED exactly', () => {
    const evt = baseEvent('POINTS_AWARDED', { playerName: 'ALICE', points: 200 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director awarded 200 points to ALICE.');
  });

  it('LOCK: formats BOARD_RESTORED_ALL exactly', () => {
    const evt = baseEvent('BOARD_RESTORED_ALL', { restoredCount: 20 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director restored all 20 tiles on the board.');
  });

  it('LOCK: formats POINT_SCALE_CHANGED with scale context exactly', () => {
    const evt = baseEvent('POINT_SCALE_CHANGED', { fromScale: 100, toScale: 50 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director shifted point scale from 100 to 50.');
  });

  it('LOCK: formats successful POINTS_STOLEN exactly', () => {
    const evt = baseEvent('POINTS_STOLEN', { 
      playerName: 'BOB', 
      points: 500, 
      note: 'from ALICE' 
    });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('BOB stole 500 points from ALICE.');
  });

  it('LOCK: formats TILE_VOIDED exactly', () => {
    const evt = baseEvent('TILE_VOIDED', { categoryName: 'MOVIES', points: 400 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director voided the 400-point tile in MOVIES.');
  });

  it('LOCK: formats SCORE_ADJUSTED (deduction) exactly', () => {
    const evt = baseEvent('SCORE_ADJUSTED', { playerName: 'ALICE', delta: -100 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director deducted 100 points from ALICE.');
  });

  it('LOCK: formats PLAYER_ADDED with full tsIso exactly', () => {
    const evt = baseEvent('PLAYER_ADDED', { playerName: 'CHARLIE' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director added player CHARLIE at 2024-05-20T12:00:00.000Z.');
  });

  it('LOCK: formats AI_TILE_REPLACE_APPLIED exactly', () => {
    const evt = baseEvent('AI_TILE_REPLACE_APPLIED', { categoryName: 'TECH', points: 300, difficulty: 'hard' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director regenerated the question for TECH (300 points) on hard.');
  });

  it('LOCK: formats AI_BOARD_REGEN_APPLIED exactly', () => {
    const evt = baseEvent('AI_BOARD_REGEN_APPLIED', { difficulty: 'easy' });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director regenerated the full board on easy.');
  });

  it('LOCK: formats special move arming (mapping to wildcard usage)', () => {
    const evt = baseEvent('WILDCARD_USED', { categoryName: 'MUSIC', points: 200 });
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('Director armed wildcard on MUSIC (200 points).');
  });

  it('DEGRADE: fallback for unknown event types', () => {
    const evt = baseEvent('MYSTERY_ACTION' as any, {});
    const result = formatDirectorLogLine(evt, mockCtx);
    expect(result.sentence).toBe('An event occurred: MYSTERY ACTION.');
  });
});