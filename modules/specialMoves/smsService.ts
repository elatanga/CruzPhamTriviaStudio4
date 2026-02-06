
import { db, functions } from '../../services/firebase';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { SMSState, SMSType } from './types';
import { logger } from '../../services/logger';

class SMSService {
  /**
   * Listen for real-time arming updates for a show.
   */
  subscribeToShow(showId: string, onUpdate: (state: SMSState) => void) {
    if (!db) return () => {};
    
    const docRef = doc(db, 'special_moves', showId);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as SMSState);
      } else {
        onUpdate({ deployments: {}, isLive: true, lastUpdate: Date.now() });
      }
    }, (err) => {
      logger.error('SMS_SNAPSHOT_FAIL', { showId, error: err.message });
    });
  }

  /**
   * Command: Arm a tile with a move.
   * Dispatched via Cloud Function for authority/validation.
   */
  async armTile(showId: string, tileId: string, moveType: SMSType, userId: string) {
    if (!functions) return;
    const armMove = httpsCallable(functions, 'armSpecialMove');
    try {
      await armMove({ showId, tileId, moveType, userId, correlationId: logger.getCorrelationId() });
      logger.info('SMS_ARM_SUCCESS', { tileId, moveType });
    } catch (e: any) {
      logger.error('SMS_ARM_FAIL', { message: e.message });
      throw e;
    }
  }
}

export const smsService = new SMSService();
