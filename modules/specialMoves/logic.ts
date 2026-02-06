
import { SMSType, SMSResolution } from './types';

/**
 * Resolves the final point value based on the move type and outcome.
 * Pure function, easily testable.
 */
export const resolveSMS = (
  moveType: SMSType | undefined,
  basePoints: number,
  outcome: 'AWARD' | 'STEAL' | 'FAIL'
): SMSResolution => {
  if (!moveType) return { points: basePoints, label: '' };

  switch (moveType) {
    case 'DOUBLE_TROUBLE':
      if (outcome === 'AWARD' || outcome === 'STEAL') return { points: basePoints * 2, label: '2X MULTIPLIER' };
      if (outcome === 'FAIL') return { points: -basePoints, label: 'DOUBLE LOSS' };
      break;

    case 'TRIPLE_THREAT':
      if (outcome === 'AWARD' || outcome === 'STEAL') return { points: basePoints * 3, label: '3X MULTIPLIER' };
      if (outcome === 'FAIL') return { points: -Math.round(basePoints * 1.3), label: 'CRITICAL FAIL' };
      break;

    case 'SABOTAGE':
      if (outcome === 'FAIL') return { points: -Math.round(basePoints * 0.5), label: 'TRAP TRIGGERED' };
      return { points: basePoints, label: 'SABOTAGE AVOIDED' };

    case 'MEGA_STEAL':
      if (outcome === 'STEAL') return { points: basePoints * 2, label: 'MEGA STEAL (2X)' };
      if (outcome === 'AWARD') return { points: 0, label: 'AWARD BLOCKED', isBlocked: true };
      break;
  }

  return { points: basePoints, label: '' };
};

export const getSMSColor = (type: SMSType): string => {
  const colors = {
    DOUBLE_TROUBLE: 'cyan',
    TRIPLE_THREAT: 'gold',
    SABOTAGE: 'red',
    MEGA_STEAL: 'purple'
  };
  return colors[type] || 'gold';
};
