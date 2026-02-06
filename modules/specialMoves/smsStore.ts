
import { db } from '../../services/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  Timestamp, 
  runTransaction,
  CollectionReference
} from 'firebase/firestore';
import { SMSRequestDoc, SMSOverlayDoc } from './firestoreTypes';
import { logger } from '../../services/logger';

export class SMSStore {
  /**
   * Dispatches a move request using the idempotencyKey as the document ID.
   * This prevents duplicate submissions if the network retries the write.
   */
  static async submitRequest(gameId: string, request: Omit<SMSRequestDoc, 'id'>) {
    if (!db) return;
    
    const requestPath = `games/${gameId}/specialMoves_requests`;
    const docRef = doc(db, requestPath, request.idempotencyKey);
    
    try {
      await setDoc(docRef, {
        ...request,
        id: request.idempotencyKey,
        createdAt: Date.now()
      }, { merge: false }); // merge: false ensures we don't overwrite if ID exists
      
      logger.info('SMS_REQUEST_SUBMITTED', { 
        gameId, 
        move: request.moveType, 
        key: request.idempotencyKey 
      });
    } catch (e: any) {
      logger.error('SMS_REQUEST_FAILED', { error: e.message, key: request.idempotencyKey });
      throw e;
    }
  }

  /**
   * Subscribes to the projection overlay for real-time UI updates.
   * Fail-open: if snapshot fails, returns an empty default state.
   */
  static subscribeToOverlay(gameId: string, onUpdate: (data: SMSOverlayDoc) => void) {
    if (!db) return () => {};

    const docRef = doc(db, `games/${gameId}/specialMoves_overlay`, 'current');
    
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as SMSOverlayDoc);
      } else {
        onUpdate({
          deploymentsByTileId: {},
          activeByTargetId: {},
          updatedAt: Date.now(),
          version: 1
        });
      }
    }, (err) => {
      logger.warn('SMS_OVERLAY_SYNC_LOST', { gameId, error: err.message });
    });
  }
}
