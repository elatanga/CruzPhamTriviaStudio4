
const functions = require("firebase-functions");
const admin = require("firebase-admin");

/**
 * Triggered whenever a document in 'specialMoves_active' is created, updated, or deleted.
 * Performs opportunistic cleanup of expired moves during the re-computation.
 */
exports.syncSMSOverlay = functions.firestore
  .document("games/{gameId}/specialMoves_active/{activeId}")
  .onWrite(async (change, context) => {
    const { gameId } = context.params;
    const db = admin.firestore();
    const now = Date.now();

    const activeCol = db.collection(`games/${gameId}/specialMoves_active`);
    const overlayRef = db.collection(`games/${gameId}/specialMoves_overlay`).doc("current");

    return db.runTransaction(async (transaction) => {
      const activeSnap = await transaction.get(activeCol);
      
      const deploymentsByTileId = {};
      const activeByTargetId = {};
      const expiredDocIds = [];

      activeSnap.forEach(doc => {
        const data = doc.data();
        
        // Opportunistic Cleanup: Mark for deletion if expired
        if (data.expiresAt < now) {
          expiredDocIds.push(doc.id);
          return;
        }

        // Map to Tile View
        if (data.tileId) {
          deploymentsByTileId[data.tileId] = {
            status: "ARMED",
            moveType: data.moveType,
            updatedAt: data.appliedAt
          };
        }

        // Map to Player/Category View
        if (data.targetId) {
          if (!activeByTargetId[data.targetId]) activeByTargetId[data.targetId] = [];
          activeByTargetId[data.targetId].push({
            moveType: data.moveType,
            expiresAt: data.expiresAt
          });
        }
      });

      // Commit Overlay Update
      transaction.set(overlayRef, {
        deploymentsByTileId,
        activeByTargetId,
        updatedAt: now,
        version: 1
      });

      // Cleanup expired docs found during pass
      expiredDocIds.forEach(id => {
        transaction.delete(activeCol.doc(id));
      });

      console.log(`Overlay updated for game ${gameId}. Cleaned up ${expiredDocIds.length} expired moves.`);
    });
  });
