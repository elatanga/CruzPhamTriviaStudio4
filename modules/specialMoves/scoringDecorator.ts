
import { SpecialMoveType } from '../../types';
import { resolveSMS } from './logic';
import { SMSType } from './types';
import { logger } from '../../services/logger';

export interface ScoringContext {
  tileId: string;
  moveType?: SpecialMoveType;
  outcome: 'AWARD' | 'STEAL' | 'FAIL';
  isGated?: boolean; 
}

/**
 * applySpecialMovesDecorator
 * Phase 2 Injection Point: Wraps standard point calculations.
 * 
 * DESIGN PRINCIPLES:
 * 1. Fail-Open: If logic errors or move is missing, returns baseDelta.
 * 2. Idempotent: Relies on the caller to provide canonical tile/outcome context.
 * 3. Traceable: Every modification is logged with correlation IDs.
 */
export const applySpecialMovesDecorator = (
  baseDelta: number,
  ctx: ScoringContext
): number => {
  const { tileId, moveType, outcome, isGated = true } = ctx;

  // 1. Guard: Check feature flag
  if (!isGated) return baseDelta;

  // 2. Guard: If no move is present on this tile, pass through
  if (!moveType) return baseDelta;

  try {
    const resolution = resolveSMS(moveType as SMSType, Math.abs(baseDelta), outcome);
    
    logger.info('SMS_SCORING_APPLIED', {
      tileId,
      moveType,
      before: baseDelta,
      after: resolution.points,
      label: resolution.label
    });

    // Return the resolved points (signed correctly based on baseDelta direction)
    return baseDelta < 0 ? -resolution.points : resolution.points;
  } catch (e: any) {
    logger.error('SMS_SCORING_CRASH_RECOVERY', { error: e.message, tileId });
    return baseDelta; // Fail-open
  }
};
