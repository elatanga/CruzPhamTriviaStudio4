
const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.armSpecialMove = functions.https.onCall(async (data, context) => {
  const { showId, tileId, moveType, userId, correlationId } = data;
  
  if (!showId || !tileId || !moveType) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required SMS parameters");
  }

  const db = admin.firestore();
  const showRef = db.collection("special_moves").doc(showId);

  return db.runTransaction(async (t) => {
    const snap = await t.get(showRef);
    const state = snap.exists ? snap.data() : { deployments: {} };

    // Authority Check: Don't arm if already triggered or tile invalid
    // In a full implementation, we'd check the show's game state document here too.

    state.deployments[tileId] = {
      type: moveType,
      armedAt: new Date().toISOString(),
      armedBy: userId
    };

    t.set(showRef, {
      ...state,
      lastUpdate: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true };
  });
});
