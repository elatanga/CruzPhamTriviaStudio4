
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURATION ---
const {
  SENDGRID_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  ADMIN_EMAILS: ENV_ADMIN_EMAILS,
  ADMIN_PHONES: ENV_ADMIN_PHONES
} = process.env;

const ADMIN_EMAILS = (ENV_ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
const ADMIN_PHONES = (ENV_ADMIN_PHONES || "").split(",").map(p => p.trim()).filter(Boolean);

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);
const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// --- STRUCTURED LOGGING HELPERS ---

const maskPII = (data) => {
  if (typeof data === 'string') {
    let text = data;
    // Email
    text = text.replace(/([a-zA-Z0-9._-]+)(@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, (match, user, domain) => `${user.substring(0, 2)}***${domain}`);
    // Phone
    text = text.replace(/(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, (match) => `${match.substring(0, 3)}****${match.substring(match.length - 2)}`);
    // Tokens/Keys
    text = text.replace(/([smakp]k-[a-zA-Z0-9]{3})[a-zA-Z0-9]+/g, '$1********');
    text = text.replace(/(AIza[a-zA-Z0-9_-]{5})[a-zA-Z0-9_-]+/g, '$1********');
    return text;
  }
  if (data instanceof Error) {
    return { message: maskPII(data.message), stack: maskPII(data.stack) };
  }
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) return data.map(maskPII);
    const masked = {};
    for (const key in data) {
      if (key.match(/token|password|secret|key/i)) masked[key] = '********';
      else masked[key] = maskPII(data[key]);
    }
    return masked;
  }
  return data;
};

/**
 * Logs a message to Cloud Logging in structured JSON format.
 */
const log = (severity, category, message, correlationId, data = {}) => {
  const safeData = maskPII(data);
  const entry = {
    severity,
    message: `[${category}] ${maskPII(message)}`,
    category,
    correlationId: correlationId || 'unknown',
    component: 'cloud-functions',
    timestamp: new Date().toISOString(),
    ...safeData
  };
  console.log(JSON.stringify(entry));
};

const normalizePhone = (phone) => {
  if (!phone) return "";
  let p = phone.replace(/[^+\d]/g, "");
  if (!p.startsWith("+")) p = "+1" + p; 
  return p;
};

const executeWithRetry = async (operation, context = "Operation", correlationId, maxRetries = 3) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      const isLastAttempt = attempt === maxRetries;
      
      log("WARNING", "NETWORK", `${context} failed (Attempt ${attempt}/${maxRetries})`, correlationId, { error });

      if (isLastAttempt) throw error;
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// --- NOTIFICATIONS ---

const sendEmail = async (to, subject, text, correlationId) => {
  if (!SENDGRID_API_KEY) {
    log("WARNING", "CONFIG", "SendGrid API Key missing. Email skipped.", correlationId);
    return { status: "SKIPPED" };
  }

  const msg = { to, from: "noreply@cruzpham.com", subject, text };
  await executeWithRetry(() => sgMail.send(msg), "SendGrid Email", correlationId);
  return { status: "SENT", provider: "sendgrid", timestamp: new Date().toISOString() };
};

const sendSms = async (to, body, correlationId) => {
  if (!twilioClient) {
    log("WARNING", "CONFIG", "Twilio credentials missing. SMS skipped.", correlationId);
    return { status: "SKIPPED" };
  }

  await executeWithRetry(() => twilioClient.messages.create({
    body, from: TWILIO_FROM_NUMBER, to
  }), "Twilio SMS", correlationId);
  return { status: "SENT", provider: "twilio", timestamp: new Date().toISOString() };
};

const handleNewRequestNotification = async (requestData, correlationId) => {
  const updates = {};
  
  if (ADMIN_EMAILS.length > 0) {
    try {
      await sendEmail(
        ADMIN_EMAILS,
        `[CRUZPHAM] New Token Request: ${requestData.preferredUsername}`,
        `New Request from ${requestData.firstName} ${requestData.lastName} (@${requestData.tiktokHandle}).\nPhone: ${requestData.phoneE164}\nID: ${requestData.id}\n\nPlease check Admin Console.`,
        correlationId
      );
      updates["notify.emailStatus"] = "SENT";
      updates["notify.emailProviderId"] = "sendgrid";
    } catch (e) {
      log("ERROR", "NETWORK", "Email Notification Failed", correlationId, { error: e });
      updates["notify.emailStatus"] = "FAILED";
      updates["notify.lastError"] = e.message;
    }
  } else {
    updates["notify.emailStatus"] = "SKIPPED";
  }

  if (ADMIN_PHONES.length > 0) {
    let anySuccess = false;
    let errors = [];

    const results = await Promise.allSettled(
      ADMIN_PHONES.map(phone => 
        sendSms(phone, `[CRUZPHAM] Request: ${requestData.preferredUsername} (${requestData.firstName})`, correlationId)
      )
    );

    results.forEach(res => {
      if (res.status === 'fulfilled' && res.value.status === 'SENT') anySuccess = true;
      if (res.status === 'rejected') errors.push(res.reason.message);
    });

    if (anySuccess) {
      updates["notify.smsStatus"] = "SENT";
      updates["notify.smsProviderId"] = "twilio";
    } else if (ADMIN_PHONES.length > 0 && !twilioClient) {
       updates["notify.smsStatus"] = "SKIPPED";
    } else {
      updates["notify.smsStatus"] = "FAILED";
      if (errors.length > 0) log("ERROR", "NETWORK", "All SMS Failed", correlationId, { errors });
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.collection("token_requests").doc(requestData.id).update(updates);
  }
};

// --- EXPORTED CALLABLES ---

exports.getSystemStatus = functions.https.onCall(async (data, context) => {
  const doc = await db.collection("system_bootstrap").doc("config").get();
  return { masterReady: doc.exists && doc.data().masterReady };
});

exports.createTokenRequest = functions.https.onCall(async (data, context) => {
  const { firstName, lastName, tiktokHandle, preferredUsername, phoneE164, correlationId } = data;
  
  log("INFO", "AUTH", `Received Token Request for ${preferredUsername}`, correlationId);

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
  await handleNewRequestNotification(requestData, correlationId);
  return requestData;
});

exports.retryNotification = functions.https.onCall(async (data, context) => {
  const { requestId, correlationId } = data;
  log("INFO", "SYSTEM", `Retrying notification for ${requestId}`, correlationId);
  
  const doc = await db.collection("token_requests").doc(requestId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "Request not found");
  
  const reqData = doc.data();
  await handleNewRequestNotification(reqData, correlationId);
  
  await db.collection("token_requests").doc(requestId).update({
    "notify.attempts": admin.firestore.FieldValue.increment(1)
  });
  
  return { success: true };
});

exports.sendManualNotification = functions.https.onCall(async (data, context) => {
  const { targetUsername, method, content, correlationId } = data;
  log("INFO", "SYSTEM", `Manual Notification to ${targetUsername} via ${method}`, correlationId);
  
  const userSnap = await db.collection("users").where("username", "==", targetUsername).limit(1).get();
  if (userSnap.empty) throw new functions.https.HttpsError("not-found", "User not found");
  
  const user = userSnap.docs[0].data();
  
  try {
    if (method === "EMAIL") {
      if (!user.email) throw new functions.https.HttpsError("failed-precondition", "User has no email");
      await sendEmail(user.email, "Message from CruzPham Studios", content, correlationId);
    } else if (method === "SMS") {
      if (!user.phone) throw new functions.https.HttpsError("failed-precondition", "User has no phone");
      await sendSms(user.phone, content, correlationId);
    }
    return { success: true };
  } catch (e) {
    log("ERROR", "NETWORK", "Manual Send Failed", correlationId, { error: e });
    throw new functions.https.HttpsError("internal", "Delivery failed: " + e.message);
  }
});

exports.bootstrapSystem = functions.https.onCall(async (data, context) => {
  const { username, correlationId } = data;
  log("INFO", "CONFIG", "Bootstrap Initiated", correlationId);
  
  return db.runTransaction(async (t) => {
    const configRef = db.collection("system_bootstrap").doc("config");
    const doc = await t.get(configRef);

    if (doc.exists && doc.data().masterReady) {
      log("WARNING", "CONFIG", "Bootstrap blocked: Already exists", correlationId);
      throw new functions.https.HttpsError("already-exists", "System already bootstrapped");
    }

    const rawToken = 'mk-' + crypto.randomUUID().replace(/-/g, '');
    const normalizeToken = (tok) => tok.trim().replace(/[\s-]/g, '');
    const tokenHash = crypto.createHash('sha256').update(normalizeToken(rawToken)).digest('hex');

    t.set(configRef, {
      masterReady: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      masterUsername: username
    });

    const userId = crypto.randomUUID();
    const userRef = db.collection("users").doc(userId);
    
    const newUser = {
      id: userId,
      username: username || 'admin',
      tokenHash: tokenHash,
      role: 'MASTER_ADMIN',
      status: 'ACTIVE',
      profile: {
        source: 'BOOTSTRAP',
        firstName: 'Master',
        lastName: 'Admin'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    t.set(userRef, newUser);
    log("INFO", "CONFIG", "Bootstrap Complete", correlationId);

    return { token: rawToken };
  });
});
