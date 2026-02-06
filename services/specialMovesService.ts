
import { SpecialMoveType, SpecialMovesState, SMSDeployment, SMSActiveMoveContext, Question } from '../types';
import { logger } from './logger';

export class SpecialMovesService {
  private static INITIAL_STATE: SpecialMovesState = {
    version: '1.0.0',
    deployments: {},
    activeMove: null,
    updatedAt: Date.now()
  };

  static createInitialState(): SpecialMovesState {
    return { ...this.INITIAL_STATE };
  }

  static arm(state: SpecialMovesState, tileId: string, moveType: SpecialMoveType, userId: string, question: Question): { ok: boolean, nextState?: SpecialMovesState, message?: string } {
    const correlationId = crypto.randomUUID();
    logger.info('move_arm_attempt', { correlationId, tileId, moveType, userId });

    if (question.isAnswered || question.isVoided) {
      logger.warn('move_arm_rejected', { correlationId, reason: 'tile_already_played' });
      return { ok: false, message: 'Tile already played or voided.' };
    }

    if (state.deployments[tileId]?.status === 'ARMED') {
      logger.warn('move_arm_rejected', { correlationId, reason: 'tile_already_armed' });
      return { ok: false, message: 'Tile already armed.' };
    }

    const nextDeployments = { ...state.deployments };
    nextDeployments[tileId] = {
      moveType,
      status: 'ARMED',
      armedBy: userId,
      armedAt: Date.now()
    };

    const nextState: SpecialMovesState = {
      ...state,
      deployments: nextDeployments,
      updatedAt: Date.now()
    };

    logger.info('move_arm_applied', { correlationId, moveType, tileId });
    return { ok: true, nextState };
  }

  static trigger(state: SpecialMovesState, tileId: string): { nextState: SpecialMovesState, activeMove: SMSActiveMoveContext | null } {
    const correlationId = crypto.randomUUID();
    const deployment = state.deployments[tileId];

    if (!deployment || deployment.status !== 'ARMED') {
      return { nextState: state, activeMove: null };
    }

    const activeMove: SMSActiveMoveContext = {
      tileId,
      moveType: deployment.moveType,
      appliedAt: Date.now(),
      restrictions: {
        stealAllowed: deployment.moveType === 'MEGA_STEAL' || deployment.moveType === 'SABOTAGE' || deployment.moveType === 'DOUBLE_TROUBLE' || deployment.moveType === 'TRIPLE_THREAT',
        failAllowed: true
      }
    };

    const nextDeployments = { ...state.deployments };
    nextDeployments[tileId] = { ...deployment, status: 'TRIGGERED', triggeredAt: Date.now() };

    const nextState: SpecialMovesState = {
      ...state,
      deployments: nextDeployments,
      activeMove,
      updatedAt: Date.now()
    };

    logger.info('move_triggered', { correlationId, moveType: deployment.moveType, tileId });
    return { nextState, activeMove };
  }

  static clearDeployments(state: SpecialMovesState): SpecialMovesState {
    return {
      ...state,
      deployments: {},
      activeMove: null,
      updatedAt: Date.now()
    };
  }

  static resolve(activeMove: SMSActiveMoveContext, outcome: 'AWARD' | 'STEAL' | 'FAIL', basePoints: number): { delta: number, note?: string } {
    const correlationId = crypto.randomUUID();
    let delta = 0;

    switch (activeMove.moveType) {
      case 'DOUBLE_TROUBLE':
        if (outcome === 'AWARD' || outcome === 'STEAL') delta = basePoints * 2;
        else if (outcome === 'FAIL') delta = -basePoints;
        break;
      case 'TRIPLE_THREAT':
        if (outcome === 'AWARD' || outcome === 'STEAL') delta = basePoints * 3;
        else if (outcome === 'FAIL') delta = -(basePoints + Math.round(basePoints * 0.3));
        break;
      case 'SABOTAGE':
        if (outcome === 'AWARD' || outcome === 'STEAL') delta = basePoints;
        else if (outcome === 'FAIL') delta = -Math.round(basePoints * 0.5);
        break;
      case 'MEGA_STEAL':
        if (outcome === 'STEAL') delta = basePoints * 2;
        else if (outcome === 'AWARD') delta = 0; // Standard award on mega steal tile = 0 pts
        break;
    }

    logger.info(`move_resolve_${outcome.toLowerCase()}`, { correlationId, moveType: activeMove.moveType, delta });
    return { delta, note: activeMove.moveType.replace('_', ' ') };
  }
}
