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
  const finalize = (str: string) => {
    let s = str.trim();
    if (!s) return `An event occurred: ${type}.`;
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!s.endsWith('.')) s += '.';
    return s;
  };

  let sentence = '';

  switch (type) {
    case 'POINTS_AWARDED':
      sentence = `Director awarded ${points} points to ${pName}.`;
      break;

    case 'POINTS_STOLEN': {
      const victimMatch = context.note?.match(/from (.*)/);
      const victimName = victimMatch ? victimMatch[1] : 'another player';
      // Distinguish attempt/success/fail if possible via note, default to success per event type
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

    // Special Moves Support
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