
const admin = require("firebase-admin");

/**
 * Structured Logging Helper
 */
const logSMS = (event, context, metadata = {}) => {
  console.log(JSON.stringify({
    service: "specialMoves",
    event,
    gameId: context.gameId,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
    timestamp: new Date().toISOString(),
    ...metadata
  }));
};

/**
 * Handler: Arm a Tile
 */
exports.requestArm = async (data, context) => {
  const { gameId, tileId, moveType, actorId, idempotencyKey, correlationId } = data;
  const db = admin.firestore();

  if (!gameId || !tileId || !moveType || !idempotencyKey) {
    logSMS("ARM_REJECTED", { gameId, correlationId, idempotencyKey }, { reason: "MISSING_ARGS" });
    throw new Error("INVALID_ARGUMENT: Missing required fields");
  }

  logSMS("ARM_REQUEST_RECEIVED", { gameId, correlationId, idempotencyKey }, { moveType, tileId });

  const requestRef = db.collection(`games/${gameId}/specialMoves_requests`).doc(idempotencyKey);
  const activeCol = db.collection(`games/${gameId}/specialMoves_active`);

  return db.runTransaction(async (transaction) => {
    const existingReq = await transaction.get(requestRef);
    if (existingReq.exists) {
      logSMS("ARM_REQUEST_IDEMPOTENT", { gameId, correlationId, idempotencyKey });
      return { success: true, status: "ALREADY_EXISTS", id: idempotencyKey };
    }

    const conflictSnap = await transaction.get(activeCol.where("tileId", "==", tileId).limit(1));
    if (!conflictSnap.empty) {
      logSMS("ARM_REQUEST_CONFLICT", { gameId, correlationId, idempotencyKey }, { tileId });
      throw new Error("CONFLICT: Tile is already affected by an active move");
    }

    const requestDoc = {
      state: "REQUESTED",
      moveType,
      scope: "TILE",
      tileId,
      actorId,
      actorRole: "director",
      createdAt: Date.now(),
      idempotencyKey,
      correlationId
    };

    transaction.set(requestRef, requestDoc);
    logSMS("ARM_REQUEST_COMMITTED", { gameId, correlationId, idempotencyKey });
    return { success: true, id: idempotencyKey };
  });
};

/**
 * Handler: Approve Move
 */
exports.approveMove = async (data, context) => {
  const { gameId, requestId, correlationId } = data;
  const db = admin.firestore();

  logSMS("APPROVE_REQUEST_RECEIVED", { gameId, correlationId }, { requestId });

  const requestRef = db.collection(`games/${gameId}/specialMoves_requests`).doc(requestId);
  const activeRef = db.collection(`games/${gameId}/specialMoves_active`).doc();
  const auditRef = db.collection(`games/${gameId}/specialMoves_audit`).doc();

  return db.runTransaction(async (transaction) => {
    const reqSnap = await transaction.get(requestRef);
    if (!reqSnap.exists) throw new Error("NOT_FOUND: Request does not exist");
    
    const req = reqSnap.data();
    if (req.state !== "REQUESTED") throw new Error("PRECONDITION_FAILED: Request is not in REQUESTED state");

    transaction.update(requestRef, { state: "APPROVED", updatedAt: Date.now() });

    const activeDoc = {
      moveType: req.moveType,
      scope: req.scope,
      targetId: req.targetId || null,
      tileId: req.tileId || null,
      appliedAt: Date.now(),
      expiresAt: Date.now() + (req.ttlMs || 3600000),
      requestId: requestId,
      correlationId: correlationId
    };
    transaction.set(activeRef, activeDoc);

    transaction.set(auditRef, {
      eventType: "MOVE_APPROVED",
      summary: `Approved ${req.moveType} for ${req.tileId || req.targetId}`,
      createdAt: Date.now(),
      correlationId,
      idempotencyKey: `audit_${requestId}`
    });

    logSMS("MOVE_ACTIVATED", { gameId, correlationId }, { requestId, activeId: activeRef.id });
    return { success: true, activeId: activeRef.id };
  });
};

/**
 * Handler: Clear Armory
 */
exports.clearArmory = async (data, context) => {
  const { gameId, correlationId } = data;
  const db = admin.firestore();
  const activeCol = db.collection(`games/${gameId}/specialMoves_active`);

  logSMS("CLEAR_ARMORY_REQUESTED", { gameId, correlationId });

  const snapshots = await activeCol.where("scope", "==", "TILE").get();
  const batch = db.batch();

  snapshots.forEach(doc => batch.delete(doc.ref));
  
  const auditRef = db.collection(`games/${gameId}/specialMoves_audit`).doc();
  batch.set(auditRef, {
    eventType: "ARMORY_CLEARED",
    summary: `Director cleared all armed tiles`,
    createdAt: Date.now(),
    correlationId,
    idempotencyKey: `clear_${Date.now()}`
  });

  await batch.commit();
  logSMS("ARMORY_CLEARED", { gameId, correlationId }, { count: snapshots.size });
  return { success: true, clearedCount: snapshots.size };
};
