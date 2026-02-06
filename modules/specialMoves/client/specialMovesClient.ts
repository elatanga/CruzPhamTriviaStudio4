
import { functions, db } from '../../../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { logger } from '../../../services/logger';
import { SMSOverlayDoc } from '../firestoreTypes';
import { SpecialMoveType } from '../../../types';

export interface RequestArmParams {
  gameId: string;
  tileId: string;
  moveType: SpecialMoveType;
  actorId: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface ClearArmoryParams {
  gameId: string;
  actorId: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface SubscribeParams {
  gameId: string;
  onOverlay: (overlay: SMSOverlayDoc) => void;
  onError?: (error: Error) => void;
}

export type SMSServiceHealth = 'HEALTHY' | 'DEGRADED' | 'OFFLINE';

/**
 * Client-side interface for the Special Moves Microservice.
 */
class SpecialMovesClient {
  private consecutiveFailures = 0;
  private MAX_FAILURES = 3;

  /**
   * Returns current health of the SMS service based on recent interaction history.
   */
  getHealth(): SMSServiceHealth {
    if (this.consecutiveFailures >= this.MAX_FAILURES) return 'OFFLINE';
    if (this.consecutiveFailures > 0) return 'DEGRADED';
    return 'HEALTHY';
  }

  /**
   * Utility: Exponential Backoff Retry
   */
  private async withRetry<T>(
    operation: () => Promise<T>, 
    context: string,
    params: any
  ): Promise<T> {
    let lastError: any;
    const initialDelay = 1000;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await operation();
        this.consecutiveFailures = 0; // Reset health on success
        return result;
      } catch (e: any) {
        lastError = e;
        const isRetryable = e.code === 'unavailable' || e.code === 'deadline-exceeded' || e.code === 'internal';
        
        logger.warn('SMS_CLIENT_ATTEMPT_FAILED', {
          context,
          attempt: attempt + 1,
          isRetryable,
          error: e.message,
          correlationId: params.correlationId
        });

        if (!isRetryable) break;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, initialDelay * Math.pow(2, attempt)));
        }
      }
    }

    this.consecutiveFailures++;
    logger.error(`SMS_CLIENT_CRITICAL_FAILURE`, {
      context,
      finalHealth: this.getHealth(),
      error: lastError.message,
      ...params
    });
    throw lastError;
  }

  /**
   * Dispatches a request to arm a specific board tile.
   */
  async requestArmTile(params: RequestArmParams): Promise<{ success: boolean; id: string }> {
    if (!functions) throw new Error("Firebase Functions not initialized");
    const call = httpsCallable<RequestArmParams, { success: boolean; id: string }>(functions, 'sms_requestArm');
    
    return this.withRetry(
      async () => {
        const result = await call(params);
        return result.data;
      },
      'requestArmTile',
      params
    );
  }

  /**
   * Command: Wipe all currently armed tiles.
   */
  async clearArmory(params: ClearArmoryParams): Promise<{ success: boolean; clearedCount: number }> {
    if (!functions) throw new Error("Firebase Functions not initialized");
    const call = httpsCallable<ClearArmoryParams, { success: boolean; clearedCount: number }>(functions, 'sms_clearArmory');

    return this.withRetry(
      async () => {
        const result = await call(params);
        return result.data;
      },
      'clearArmory',
      params
    );
  }

  /**
   * Subscribes to the board projection overlay.
   */
  subscribeOverlay({ gameId, onOverlay, onError }: SubscribeParams) {
    if (!db) {
      logger.warn('SMS_CLIENT_DB_MISSING', { gameId });
      onOverlay(this.getEmptyOverlay());
      return () => {};
    }

    const docRef = doc(db, `games/${gameId}/specialMoves_overlay`, 'current');

    logger.info('SMS_OVERLAY_SUBSCRIPTION_START', { gameId });

    return onSnapshot(docRef, {
      next: (snap) => {
        if (snap.exists()) {
          onOverlay(snap.data() as SMSOverlayDoc);
        } else {
          onOverlay(this.getEmptyOverlay());
        }
      },
      error: (err) => {
        logger.error('SMS_CLIENT_SNAPSHOT_ERROR', { gameId, error: err.message });
        onOverlay(this.getEmptyOverlay());
        if (onError) onError(err);
      }
    });
  }

  private getEmptyOverlay(): SMSOverlayDoc {
    return {
      deploymentsByTileId: {},
      activeByTargetId: {},
      updatedAt: Date.now(),
      version: 1
    };
  }
}

export const specialMovesClient = new SpecialMovesClient();
