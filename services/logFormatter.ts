import { GameAnalyticsEvent } from '../types';

/**
 * Pure utility to transform raw analytics events into human-readable director logs.
 * Adheres to exact sentence templates provided for production auditing.
 */
export const formatDirectorLogLine = (
  evt: GameAnalyticsEvent, 
  ctx: { playersById: Record<string, string>; categoriesById?: Record<string, string> }
): { tsIso: string; tsLabel: string; sentence: string } => {
  const tsIso = evt.iso;
  const tsLabel = new Date(evt.ts).toLocaleTimeString([], { hour12: false });

  const { type, context } = evt;
  
  const pName = context.playerName || 'Unknown Player';
  const cName = context.categoryName || 'Unknown Category';
  const points = Math.abs(context.points || context.delta || 0);
  const difficulty = context.difficulty || context.after?.difficulty || 'mixed';

  // Helper to ensure sentence format
  const finalize = (s: string) => {
    let finalized = s.trim();
    if (!finalized) return `An event occurred: ${type}.`;
    finalized = finalized.charAt(0).toUpperCase() + finalized.slice(1);
    if (!finalized.endsWith('.')) finalized += '.';
    return finalized;
  };

  let sentence = '';

  switch (type) {
    case 'POINTS_AWARDED':
      sentence = `Director awarded ${points} points to ${pName}.`;
      break;

    case 'POINTS_STOLEN': {
      const victimMatch = context.note?.match(/from (.*)/);
      const victimName = victimMatch ? victimMatch[1] : 'another player';
      if (context.note?.toLowerCase().includes('fail')) {
        sentence = `${pName} failed to steal from ${victimName}.`;
      } else if (context.note?.toLowerCase().includes('attempt')) {
        sentence = `${pName} attempted to steal from ${victimName}.`;
      } else {
        sentence = `${pName} stole ${points} points from ${victimName}.`;
      }
      break;
    }

    case 'TILE_VOIDED':
      sentence = `Director voided the ${points}-point tile in ${cName}.`;
      break;

    case 'TILE_RESTORED':
      sentence = `Director restored the ${points}-point tile in ${cName}.`;
      break;

    case 'BOARD_RESTORED_ALL':
      sentence = `Director restored all ${context.restoredCount || ''} tiles on the board.`;
      break;

    case 'POINT_SCALE_CHANGED': {
      const from = context.fromScale || context.before;
      const to = context.toScale || context.after;
      sentence = `Director shifted point scale from ${from} to ${to}.`;
      break;
    }

    case 'SCORE_ADJUSTED': {
      const isDeduction = (context.delta || 0) < 0;
      sentence = isDeduction 
        ? `Director deducted ${points} points from ${pName}.`
        : `Director awarded ${points} points to ${pName}.`;
      break;
    }

    case 'PLAYER_ADDED':
      sentence = `Director added player ${pName} at ${tsIso}.`;
      break;

    case 'PLAYER_REMOVED':
      sentence = `Director deleted player ${pName} at ${tsIso}.`;
      break;

    case 'AI_TILE_REPLACE_APPLIED':
      sentence = `Director regenerated the question for ${cName} (${points} points) on ${difficulty}.`;
      break;

    case 'AI_CATEGORY_REPLACE_APPLIED':
      sentence = `Director regenerated the entire ${cName} category on ${difficulty}.`;
      break;

    case 'AI_BOARD_REGEN_APPLIED':
      sentence = `Director regenerated the full board on ${difficulty}.`;
      break;

    case 'WILDCARD_USED':
      sentence = `Director armed wildcard on ${cName} (${points} points).`;
      break;

    case 'WILDCARD_RESET':
      sentence = `Director cleared all armed special moves.`;
      break;

    default:
      sentence = `An event occurred: ${type.replace(/_/g, ' ')}.`;
  }

  return {
    tsIso,
    tsLabel,
    sentence: finalize(sentence)
  };
};