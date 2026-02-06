
import { useState, useEffect } from 'react';
import { specialMovesClient } from '../modules/specialMoves/client/specialMovesClient';
import { SMSOverlayDoc } from '../modules/specialMoves/firestoreTypes';
import { logger } from '../services/logger';

/**
 * useSpecialMovesOverlay
 * Decouples the board's awareness of special moves from the main game state.
 * Returns the current projection document or a fallback empty state.
 */
export function useSpecialMovesOverlay(gameId?: string) {
  const [overlay, setOverlay] = useState<SMSOverlayDoc | null>(null);

  useEffect(() => {
    if (!gameId) {
      setOverlay(null);
      return;
    }

    logger.info('SMS_BOARD_SUBSCRIBE', { gameId });

    const unsubscribe = specialMovesClient.subscribeOverlay({
      gameId,
      onOverlay: (data) => {
        setOverlay(data);
      },
      onError: (err) => {
        logger.warn('SMS_BOARD_SYNC_ERROR', { error: err.message });
      }
    });

    return () => {
      logger.info('SMS_BOARD_UNSUBSCRIBE', { gameId });
      unsubscribe();
    };
  }, [gameId]);

  return overlay;
}
