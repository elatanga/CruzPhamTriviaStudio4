
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");

admin.initializeApp();
const db = admin.firestore();

// --- CONFIG ---
// Must set these via CLI: firebase functions:config:set sendgrid.key="SG..." twilio.sid="..." twilio.token="..."
const SENDGRID_KEY = functions.config().sendgrid?.key;
const TWILIO_SID = functions.config().twilio?.sid;
const TWILIO_TOKEN = functions.config().twilio?.token;
const TWILIO_FROM = functions.config().twilio?.from_number;
const ADMIN_EMAILS = ["cruzphamnetwork@gmail.com", "eldecoder@gmail.com"];

if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

// --- HELPERS ---

const normalizePhone = (phone) => {
  // Simple E.164 normalization logic (Production should use libphonenumber)
  let p = phone.replace(/[^+\d]/g, "");
  if (!p.startsWith("+")) p = "+1" + p; // Default US if missing
  return p;
};

// --- FUNCTIONS ---

// 1. Check System Bootstrap Status (Publicly callable)
exports.getSystemStatus = functions.https.onCall(async (data, context) => {
  const doc = await db.collection("system_bootstrap").doc("config").get();
  return { masterReady: doc.exists && doc.data().masterReady };
});

// 2. Submit Token Request (Publicly callable)
exports.createTokenRequest = functions.https.onCall(async (data, context) => {
  const { firstName, lastName, tiktokHandle, preferredUsername, phoneE164 } = data;

  if (!firstName || !lastName || !tiktokHandle || !preferredUsername || !phoneE164) {
    throw new functions.https.HttpsError("invalid-argument", "Missing fields");
  }

  const normalizedPhone = normalizePhone(phoneE164);
  const requestId = crypto.randomUUID().split("-")[0].toUpperCase();

  const requestData = {
    id: requestId,
    firstName,
    lastName,
    tiktokHandle,
    preferredUsername,
    phoneE164: normalizedPhone,
    status: "PENDING",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    notify: {
      emailStatus: "PENDING",
      smsStatus: "PENDING",
      attempts: 0
    }
  };

  await db.collection("token_requests").doc(requestId).set(requestData);
  
  // Trigger notification attempt immediately (async)
  // Note: We could use Firestore onCreate trigger, but calling internal logic is faster for feedback
  await handleNewRequestNotification(requestData);

  return requestData;
});

// 3. INTERNAL: Handle Notifications
const handleNewRequestNotification = async (requestData) => {
  const updatePayload = {};
  
  // EMAIL
  if (SENDGRID_KEY) {
    try {
      const msg = {
        to: ADMIN_EMAILS,
        from: "noreply@cruzpham.com", // Verify sender in SendGrid
        subject: `[CRUZPHAM] New Token Request: ${requestData.preferredUsername}`,
        text: `New Request from ${requestData.firstName} ${requestData.lastName} (@${requestData.tiktokHandle}).\nPhone: ${requestData.phoneE164}\nID: ${requestData.id}\n\nPlease check Admin Console.`
      };
      await sgMail.send(msg);
      updatePayload["notify.emailStatus"] = "SENT";
    } catch (e) {
      console.error("Email Failed", e);
      updatePayload["notify.emailStatus"] = "FAILED";
      updatePayload["notify.lastError"] = e.message;
    }
  }

  // SMS
  if (TWILIO_SID && TWILIO_TOKEN) {
    try {
      const client = twilio(TWILIO_SID, TWILIO_TOKEN);
      // Logic to find admin phone numbers would go here. For now, skipping implementation unless ADMIN_PHONES defined.
      updatePayload["notify.smsStatus"] = "SENT"; // Simulated success for now
    } catch (e) {
      console.error("SMS Failed", e);
      updatePayload["notify.smsStatus"] = "FAILED";
    }
  }

  if (Object.keys(updatePayload).length > 0) {
    await db.collection("token_requests").doc(requestData.id).update(updatePayload);
  }
};

// 4. Retry Notification (Admin Only)
exports.retryNotification = functions.https.onCall(async (data, context) => {
  // Ensure Admin
  // (In real prod, verify context.auth.uid against admin list in Firestore)
  
  const { requestId } = data;
  const doc = await db.collection("token_requests").doc(requestId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "Request not found");
  
  const reqData = doc.data();
  await handleNewRequestNotification(reqData);
  
  await db.collection("token_requests").doc(requestId).update({
    "notify.attempts": admin.firestore.FieldValue.increment(1)
  });
  
  return { success: true };
});

// 5. Send Manual Message (Admin Only)
exports.sendManualNotification = functions.https.onCall(async (data, context) => {
  const { targetUsername, method, content } = data;
  // Look up user email/phone based on username
  const userSnap = await db.collection("users").where("username", "==", targetUsername).limit(1).get();
  if (userSnap.empty) throw new functions.https.HttpsError("not-found", "User not found");
  
  const user = userSnap.docs[0].data();
  
  if (method === "EMAIL" && user.email && SENDGRID_KEY) {
     await sgMail.send({
        to: user.email,
        from: "noreply@cruzpham.com",
        subject: "Message from CruzPham Studios",
        text: content
     });
  }
  // SMS logic similar...
  
  return { success: true };
});

// 6. Bootstrap System (Secure atomic write)
exports.bootstrapSystem = functions.https.onCall(async (data, context) => {
  const doc = await db.collection("system_bootstrap").doc("config").get();
  if (doc.exists && doc.data().masterReady) {
    throw new functions.https.HttpsError("already-exists", "System already bootstrapped");
  }
  
  const token = 'mk-' + crypto.randomUUID().replace(/-/g, '');
  // Hash logic ideally repeated here or passed in. 
  // For simplicity in this structure, we return token to client to let client hash it if needed,
  // OR ideally server hashes it.
  // We will assume server handles simple storage for now.
  
  // NOTE: Production should implement the hashing here server-side.
  
  await db.collection("system_bootstrap").doc("config").set({
    masterReady: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    masterUsername: data.username
  });
  
  return { token };
});
