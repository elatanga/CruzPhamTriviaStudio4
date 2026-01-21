
import { User, Session, TokenRequest, AuthResponse, AuditLogEntry, UserRole, AppError, AuditAction, DeliveryLog, UserSource, UserProfile } from '../types';
import { logger } from './logger';

const STORAGE_KEYS = {
  USERS: 'cruzpham_db_users',
  SESSIONS: 'cruzpham_db_sessions',
  REQUESTS: 'cruzpham_db_requests',
  AUDIT: 'cruzpham_db_audit_logs',
  BOOTSTRAP: 'cruzpham_sys_bootstrap',
};

// Rate Limiting Map: ActorID -> timestamps[]
const userRateLimits = new Map<string, number[]>();
const destinationRateLimits = new Map<string, number[]>();

const USER_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const USER_RATE_LIMIT_MAX = 10; 

const DEST_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const DEST_RATE_LIMIT_MAX = 3; // Max 3 messages per destination per minute

// --- TOKEN & PHONE UTILS ---

/**
 * Normalizes token for comparison and hashing.
 * Removes spaces, dashes, newlines to ensure "pk-123-456" works as "pk123456".
 */
export function normalizeTokenInput(token: string): string {
  if (!token) return '';
  return token.trim().replace(/[\s-]/g, '');
}

/**
 * Validates and formats phone number to E.164 strictly.
 * Throws error if invalid.
 */
function validateAndNormalizePhone(phone: string): string {
  // 1. Strip common separators
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // 2. Heuristic: If 10 digits (US standard without code), assume +1
  if (/^[2-9]\d{9}$/.test(cleaned)) {
    cleaned = '+1' + cleaned;
  } 
  // 3. Heuristic: If 11 digits starting with 1 (US with code but no +), add +
  else if (/^1[2-9]\d{9}$/.test(cleaned)) {
    cleaned = '+' + cleaned;
  }
  // 4. Ensure it starts with + if user omitted it but included country code
  else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  // 5. Strict E.164 Regex Check
  // Pattern: "+" followed by 1-15 digits. 
  // (In practice, country codes are 1-3 digits, total length rarely exceeds 15).
  // We enforce at least a reasonable length (e.g. +1415...) -> min 8 chars
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  
  if (!e164Regex.test(cleaned)) {
    throw new Error('Invalid E.164 format');
  }

  return cleaned;
}

async function hashToken(token: string): Promise<string> {
  const normalized = normalizeTokenInput(token);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- MOCK DELIVERY PROVIDERS ---

async function simulateEmailProvider(to: string, subject: string, body: string): Promise<{ success: boolean; id?: string; error?: string }> {
  logger.info('emailSendAttempt', { to });
  await new Promise(r => setTimeout(r, 600)); // Network latency
  
  // Simulate Secret Manager / API Key check
  // if (!process.env.SENDGRID_API_KEY) ... 
  
  if (Math.random() < 0.05) { // 5% fail rate simulation
    logger.error('emailSendFail', { to, reason: 'Provider Internal Error' });
    return { success: false, error: 'Provider Internal Error (Simulated)' };
  }
  
  logger.info('emailSendSuccess', { to });
  return { success: true, id: `sg_${Math.random().toString(36).substr(2, 12)}` };
}

async function simulateSmsProvider(to: string, message: string): Promise<{ success: boolean; id?: string; error?: string }> {
  logger.info('smsSendAttempt', { to }); 
  await new Promise(r => setTimeout(r, 600));
  
  if (Math.random() < 0.05) { // 5% fail rate
    logger.error('smsSendFail', { to, reason: 'Carrier Blocked' });
    return { success: false, error: 'Carrier Blocked (Simulated)' };
  }
  
  logger.info('smsSendSuccess', { to });
  return { success: true, id: `sm_${Math.random().toString(36).substr(2, 12)}` };
}

// --- BACKEND SERVICE ---

class AuthService {
  constructor() {
    // No auto-seed. Rely on bootstrap.
  }

  // --- PRIVATE HELPERS ---

  private checkUserRateLimit(actorId: string) {
    const now = Date.now();
    const timestamps = userRateLimits.get(actorId) || [];
    const recent = timestamps.filter(t => now - t < USER_RATE_LIMIT_WINDOW);
    
    if (recent.length >= USER_RATE_LIMIT_MAX) {
      throw new AppError('ERR_RATE_LIMIT', 'Too many requests from user. Please slow down.', logger.getCorrelationId());
    }
    
    recent.push(now);
    userRateLimits.set(actorId, recent);
  }

  private checkDestinationRateLimit(destination: string) {
    const now = Date.now();
    const timestamps = destinationRateLimits.get(destination) || [];
    const recent = timestamps.filter(t => now - t < DEST_RATE_LIMIT_WINDOW);
    
    if (recent.length >= DEST_RATE_LIMIT_MAX) {
      throw new AppError('ERR_RATE_LIMIT', 'Too many messages to this destination. Try again later.', logger.getCorrelationId());
    }
    
    recent.push(now);
    destinationRateLimits.set(destination, recent);
  }

  private getUsers(): User[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]'); } catch { return []; }
  }
  private saveUsers(users: User[]) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
  private getSessions(): Record<string, Session> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '{}'); } catch { return {}; }
  }
  private saveSessions(sessions: Record<string, Session>) {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }
  getRequests(): TokenRequest[] {
    try { 
      const reqs = JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUESTS) || '[]'); 
      return reqs.sort((a: TokenRequest, b: TokenRequest) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch { return []; }
  }
  private saveRequests(reqs: TokenRequest[]) {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(reqs));
  }
  getAuditLogs(): AuditLogEntry[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT) || '[]'); } catch { return []; }
  }
  private saveAuditLog(logs: AuditLogEntry[]) {
    localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(logs));
  }

  private async logAction(actor: User | string, action: AuditAction, details: string, metadata?: any, targetId?: string) {
    const logs = this.getAuditLogs();
    const actorId = typeof actor === 'string' ? actor : actor.username;
    const actorRole = typeof actor === 'object' ? actor.role : 'SYSTEM';
    
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorId,
      actorRole,
      targetId,
      action,
      details,
      metadata
    };
    logs.unshift(entry);
    this.saveAuditLog(logs);
    logger.info(`[Audit] ${action}: ${details}`, { ...metadata, actorId, targetId });
  }

  // --- BOOTSTRAP SYSTEM ---

  async getBootstrapStatus(): Promise<{ masterReady: boolean }> {
    logger.info('bootstrapStatusCheck');
    await new Promise(r => setTimeout(r, 150));
    
    const raw = localStorage.getItem(STORAGE_KEYS.BOOTSTRAP);
    if (!raw) return { masterReady: false };
    
    try {
      const doc = JSON.parse(raw);
      return { masterReady: !!doc.masterReady };
    } catch {
      return { masterReady: false };
    }
  }

  async bootstrapMasterAdmin(username: string): Promise<string> {
    logger.info('bootstrapAttempt', { username });

    const currentStatus = await this.getBootstrapStatus();
    if (currentStatus.masterReady) {
      throw new AppError('ERR_BOOTSTRAP_COMPLETE', 'System already bootstrapped', logger.getCorrelationId());
    }

    if (localStorage.getItem(STORAGE_KEYS.BOOTSTRAP)) {
      throw new AppError('ERR_BOOTSTRAP_COMPLETE', 'System already bootstrapped', logger.getCorrelationId());
    }
    
    const rawToken = 'mk-' + crypto.randomUUID().replace(/-/g, '');
    const hash = await hashToken(rawToken);

    const master: User = {
      id: crypto.randomUUID(),
      username,
      tokenHash: hash,
      role: 'MASTER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM',
      profile: {
        source: 'MANUAL_CREATE',
        firstName: 'System',
        lastName: 'Admin'
      }
    };

    this.saveUsers([master]);
    
    const bootstrapDoc = {
      masterReady: true,
      createdAt: new Date().toISOString(),
      masterAdminId: master.id
    };
    localStorage.setItem(STORAGE_KEYS.BOOTSTRAP, JSON.stringify(bootstrapDoc));

    await this.logAction('SYSTEM', 'BOOTSTRAP', 'Master Admin created');
    logger.info('bootstrapSuccess');
    
    return rawToken;
  }

  // --- AUTH ---

  async login(username: string, token: string): Promise<AuthResponse> {
    await new Promise(r => setTimeout(r, 400)); // Latency

    const users = this.getUsers();
    const targetUser = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

    if (!targetUser) {
      return { success: false, message: 'Invalid credentials.', code: 'ERR_INVALID_CREDENTIALS' };
    }

    if (targetUser.status === 'REVOKED') {
      return { success: false, message: 'Account access revoked.', code: 'ERR_FORBIDDEN' };
    }

    const inputHash = await hashToken(token);
    if (inputHash !== targetUser.tokenHash) {
      logger.warn(`Failed login attempt for ${username}`);
      return { success: false, message: 'Invalid credentials.', code: 'ERR_INVALID_CREDENTIALS' };
    }

    if (targetUser.expiresAt && Date.now() > new Date(targetUser.expiresAt).getTime()) {
      return { success: false, message: 'Access token expired.', code: 'ERR_SESSION_EXPIRED' };
    }

    const allSessions = this.getSessions();
    Object.keys(allSessions).forEach(key => {
      if (allSessions[key].username === targetUser.username) delete allSessions[key];
    });

    const sessionId = crypto.randomUUID();
    const newSession: Session = {
      id: sessionId,
      username: targetUser.username,
      role: targetUser.role,
      createdAt: Date.now(),
      userAgent: navigator.userAgent
    };

    allSessions[sessionId] = newSession;
    this.saveSessions(allSessions);

    await this.logAction(targetUser, 'LOGIN', 'User logged in', { userAgent: navigator.userAgent });
    return { success: true, session: newSession };
  }

  async logout(sessionId: string): Promise<void> {
    const sessions = this.getSessions();
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      this.saveSessions(sessions);
    }
  }

  async restoreSession(sessionId: string): Promise<AuthResponse> {
    const bsStatus = await this.getBootstrapStatus();
    if (!bsStatus.masterReady) {
      return { success: false, code: 'ERR_UNKNOWN' };
    }

    const sessions = this.getSessions();
    const session = sessions[sessionId];
    if (!session) {
      return { success: false, message: 'Session expired', code: 'ERR_SESSION_EXPIRED' };
    }
    
    const users = this.getUsers();
    const user = users.find(u => u.username === session.username);
    if (!user) {
      return { success: false, message: 'User invalid', code: 'ERR_INVALID_CREDENTIALS' };
    }

    if (user.status === 'REVOKED') {
      return { success: false, message: 'Access revoked', code: 'ERR_FORBIDDEN' };
    }

    return { success: true, session };
  }

  // --- ADMIN USER MANAGEMENT ---

  getAllUsers(): User[] {
    return this.getUsers();
  }

  async createUser(actorUsername: string, userData: Partial<User> & { profile?: Partial<UserProfile> }, role: UserRole, durationMinutes?: number): Promise<string> {
    this.checkUserRateLimit(actorUsername);
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    
    if (!actor) throw new AppError('ERR_FORBIDDEN', 'Actor not found', logger.getCorrelationId());
    
    // Security check for role creation
    if (actor.role !== 'MASTER_ADMIN' && role === 'ADMIN') {
      throw new AppError('ERR_FORBIDDEN', 'Only Master Admin can create Admins', logger.getCorrelationId());
    }

    if (users.find(u => u.username.toLowerCase() === userData.username?.toLowerCase())) {
      throw new AppError('ERR_FORBIDDEN', 'Username taken', logger.getCorrelationId());
    }

    const rawToken = (role === 'ADMIN' ? 'ak-' : 'pk-') + crypto.randomUUID().replace(/-/g, '').substr(0, 16);
    const hash = await hashToken(rawToken);

    let expiresAt: string | null = null;
    if (durationMinutes) {
      expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      username: userData.username!,
      tokenHash: hash,
      role,
      status: 'ACTIVE',
      email: userData.email,
      phone: userData.phone,
      
      profile: {
        firstName: userData.profile?.firstName,
        lastName: userData.profile?.lastName,
        tiktokHandle: userData.profile?.tiktokHandle,
        source: userData.profile?.source || ('MANUAL_CREATE' as UserSource),
        originalRequestId: userData.profile?.originalRequestId
      },

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt,
      createdBy: actor.username
    };

    users.push(newUser);
    this.saveUsers(users);
    
    const actionType = role === 'ADMIN' ? 'ADMIN_CREATED' : 'USER_CREATED';
    await this.logAction(actor, actionType, `Created ${role} ${newUser.username}`, { role, expiresAt }, newUser.username);

    return rawToken;
  }

  async refreshToken(actorUsername: string, targetUsername: string): Promise<string> {
    this.checkUserRateLimit(actorUsername);
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    const targetIdx = users.findIndex(u => u.username === targetUsername);
    
    if (targetIdx === -1) throw new AppError('ERR_UNKNOWN', 'User not found', logger.getCorrelationId());
    const target = users[targetIdx];

    if (target.role === 'MASTER_ADMIN' && actor?.role !== 'MASTER_ADMIN') {
      throw new AppError('ERR_FORBIDDEN', 'Cannot modify Master Admin', logger.getCorrelationId());
    }

    const rawToken = (target.role === 'ADMIN' ? 'ak-' : 'pk-') + crypto.randomUUID().replace(/-/g, '').substr(0, 16);
    const hash = await hashToken(rawToken);

    target.tokenHash = hash;
    target.updatedAt = new Date().toISOString();
    
    const sessions = this.getSessions();
    Object.keys(sessions).forEach(k => {
      if (sessions[k].username === targetUsername) delete sessions[k];
    });
    this.saveSessions(sessions);

    users[targetIdx] = target;
    this.saveUsers(users);

    await this.logAction(actor!, 'TOKEN_REFRESHED', `Rotated token for ${targetUsername}`, { action: 'ROTATE' }, targetUsername);
    return rawToken;
  }

  async toggleAccess(actorUsername: string, targetUsername: string, revoke: boolean) {
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    const targetIdx = users.findIndex(u => u.username === targetUsername);
    if (targetIdx === -1) return;
    const target = users[targetIdx];

    if (target.role === 'MASTER_ADMIN') throw new AppError('ERR_FORBIDDEN', 'Cannot revoke Master Admin', logger.getCorrelationId());
    if (target.role === 'ADMIN' && actor?.role !== 'MASTER_ADMIN') {
       throw new AppError('ERR_FORBIDDEN', 'Only Master Admin can modify Admins', logger.getCorrelationId());
    }

    target.status = revoke ? 'REVOKED' : 'ACTIVE';
    target.updatedAt = new Date().toISOString();
    
    if (revoke) {
      const sessions = this.getSessions();
      Object.keys(sessions).forEach(k => {
        if (sessions[k].username === targetUsername) delete sessions[k];
      });
      this.saveSessions(sessions);
    }

    users[targetIdx] = target;
    this.saveUsers(users);

    const action = revoke ? 'ACCESS_REVOKED' : 'ACCESS_GRANTED';
    await this.logAction(actor!, action, `${revoke ? 'Revoked' : 'Granted'} access for ${targetUsername}`, null, targetUsername);
  }

  async deleteUser(actorUsername: string, targetUsername: string) {
    let users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    const target = users.find(u => u.username === targetUsername);
    if (!target) return;

    if (target.role === 'MASTER_ADMIN') throw new AppError('ERR_FORBIDDEN', 'Cannot delete Master Admin', logger.getCorrelationId());
    if (target.role === 'ADMIN' && actor?.role !== 'MASTER_ADMIN') {
      throw new AppError('ERR_FORBIDDEN', 'Only Master Admin can delete Admins', logger.getCorrelationId());
    }

    users = users.filter(u => u.username !== targetUsername);
    this.saveUsers(users);
    
    const sessions = this.getSessions();
    Object.keys(sessions).forEach(k => {
      if (sessions[k].username === targetUsername) delete sessions[k];
    });
    this.saveSessions(sessions);

    await this.logAction(actor!, 'USER_DELETED', `Deleted user ${targetUsername}`, { role: target.role }, targetUsername);
  }

  // --- DELIVERY SYSTEM ---

  async sendMessage(actorUsername: string, targetUsername: string, method: 'EMAIL' | 'SMS', content: string) {
    this.checkUserRateLimit(actorUsername);
    
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    const targetIdx = users.findIndex(u => u.username === targetUsername);
    
    if (targetIdx === -1) throw new AppError('ERR_UNKNOWN', 'User not found', logger.getCorrelationId());
    const target = users[targetIdx];

    const destination = method === 'EMAIL' ? target.email : target.phone;
    if (!destination) {
        throw new AppError('ERR_VALIDATION', `User has no ${method === 'EMAIL' ? 'email' : 'phone'} on file`, logger.getCorrelationId());
    }

    // Rate Limit Destination
    this.checkDestinationRateLimit(destination);

    let result: { success: boolean; id?: string; error?: string };
    
    if (method === 'EMAIL') {
      result = await simulateEmailProvider(destination, 'CRUZPHAM ACCESS', content);
    } else {
      result = await simulateSmsProvider(destination, content);
    }

    const log: DeliveryLog = {
      id: crypto.randomUUID(),
      method,
      status: result.success ? 'SENT' : 'FAILED',
      timestamp: new Date().toISOString(),
      providerId: result.id,
      error: result.error
    };
    
    target.lastDelivery = log;
    users[targetIdx] = target;
    this.saveUsers(users);

    const action = method === 'EMAIL' ? 'MESSAGE_SENT_EMAIL' : 'MESSAGE_SENT_SMS';
    await this.logAction(actor!, action, `Sent ${method} to ${targetUsername}`, { status: log.status, error: log.error }, targetUsername);

    if (!result.success) throw new AppError('ERR_PROVIDER_DOWN', result.error || 'Sending failed', logger.getCorrelationId());
    return log;
  }

  // --- REQUEST MANAGEMENT ---
  
  async submitTokenRequest(data: Omit<TokenRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'adminNotifyStatus' | 'userNotifyStatus' | 'adminNotifyError'>): Promise<TokenRequest> {
    const timestamp = new Date().toISOString();
    
    // Validate Phone strictly E.164
    let e164: string;
    try {
      e164 = validateAndNormalizePhone(data.phoneE164);
      logger.info('phoneNormalizeSuccess', { input: data.phoneE164, output: e164 });
    } catch (e: any) {
      logger.warn('phoneNormalizeFail', { input: data.phoneE164, error: e.message });
      throw new AppError('ERR_VALIDATION', 'Please enter a valid phone number (include country code).', logger.getCorrelationId());
    }

    // 1. Persist IMMEDIATELY
    const newRequest: TokenRequest = {
      id: crypto.randomUUID().split('-')[0].toUpperCase(),
      ...data,
      phoneE164: e164,
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp,
      adminNotifyStatus: 'PENDING',
      userNotifyStatus: 'PENDING'
    };
    
    logger.info('requestCreateAttempt', { reqId: newRequest.id });

    const requests = this.getRequests();
    requests.unshift(newRequest);
    this.saveRequests(requests);

    await this.logAction('SYSTEM', 'REQUEST_SUBMITTED', `New request from ${data.firstName}`, null, newRequest.id);

    // 2. Trigger Async Email Notification
    this.notifyAdmins(newRequest.id).catch(err => {
        logger.error('Background notifyAdmins failed', err);
    });

    return newRequest;
  }

  async notifyAdmins(reqId: string) {
    logger.info('notifyAdminsAttempt', { reqId });
    
    const requests = this.getRequests();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx === -1) return;

    const req = requests[idx];
    const recipients = ['cruzphamnetwork@gmail.com', 'eldecoder@gmail.com'];
    
    try {
        const subject = `[ACTION REQUIRED] New Token Request: ${req.preferredUsername}`;
        const body = `User: ${req.firstName} ${req.lastName}\nTikTok: ${req.tiktokHandle}\nPhone: ${req.phoneE164}\n\nPlease review in Admin Console.`;
        
        let successCount = 0;
        for (const email of recipients) {
            const res = await simulateEmailProvider(email, subject, body);
            if (res.success) successCount++;
        }

        if (successCount > 0) {
            req.adminNotifyStatus = 'SENT';
            req.adminNotifyError = undefined;
            await this.logAction('SYSTEM', 'ADMIN_NOTIFIED', `Admins notified for ${reqId}`);
        } else {
             throw new Error("All provider attempts failed");
        }
    } catch (e: any) {
        req.adminNotifyStatus = 'FAILED';
        req.adminNotifyError = e.message || "Provider Error";
        logger.error('notifyAdminsFail', { error: e });
    }

    requests[idx] = req;
    this.saveRequests(requests);
  }

  async retryAdminNotification(reqId: string) {
      return this.notifyAdmins(reqId);
  }

  // APPROVAL WORKFLOW
  async approveRequest(actorUsername: string, reqId: string, customUsername?: string): Promise<{ rawToken: string, user: User }> {
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    
    // RBAC Security Check
    if (!actor || (actor.role !== 'ADMIN' && actor.role !== 'MASTER_ADMIN')) {
      throw new AppError('ERR_FORBIDDEN', 'Insufficient permissions to approve requests', logger.getCorrelationId());
    }

    const requests = this.getRequests();
    const reqIndex = requests.findIndex(r => r.id === reqId);
    if (reqIndex === -1) throw new AppError('ERR_REQUEST_NOT_FOUND', 'Request not found', logger.getCorrelationId());
    const req = requests[reqIndex];

    if (req.status !== 'PENDING') {
       throw new AppError('ERR_REQUEST_ALREADY_PROCESSED', 'Request is not pending', logger.getCorrelationId());
    }

    const finalUsername = customUsername || req.preferredUsername;

    // 1. Create User
    const rawToken = await this.createUser(actorUsername, {
      username: finalUsername,
      email: `user_${reqId}@example.com`,
      phone: req.phoneE164,
      profile: {
        firstName: req.firstName,
        lastName: req.lastName,
        tiktokHandle: req.tiktokHandle,
        source: 'REQUEST_APPROVAL',
        originalRequestId: req.id
      }
    }, 'PRODUCER');

    // Reload users after creation
    const updatedUsers = this.getUsers();
    const newUser = updatedUsers.find(u => u.username === finalUsername)!;

    // 2. Update Request Status & Link
    req.status = 'APPROVED';
    req.updatedAt = new Date().toISOString();
    req.approvedAt = new Date().toISOString();
    req.userId = newUser.id;
    
    // 3. User Notification
    const message = `APPROVED. Welcome to CruzPham Studios. Token: ${rawToken} . Login at studio.cruzpham.com`;
    let notifySuccess = false;

    if (req.phoneE164) {
      try {
        await this.sendMessage(actorUsername, newUser.username, 'SMS', message);
        notifySuccess = true;
      } catch (e) {
        logger.warn('Approval SMS failed', e);
        req.userNotifyError = 'SMS Failed';
      }
    }
    
    req.userNotifyStatus = notifySuccess ? 'SENT' : 'FAILED';
    requests[reqIndex] = req;
    this.saveRequests(requests);
    
    await this.logAction(actorUsername, 'REQUEST_APPROVED', `Approved ${reqId}. User ${finalUsername} created.`, null, newUser.id);

    return { rawToken, user: newUser };
  }

  // REJECTION WORKFLOW
  async rejectRequest(actorUsername: string, reqId: string) {
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    
    // RBAC Security Check
    if (!actor || (actor.role !== 'ADMIN' && actor.role !== 'MASTER_ADMIN')) {
      throw new AppError('ERR_FORBIDDEN', 'Insufficient permissions to reject requests', logger.getCorrelationId());
    }

    const requests = this.getRequests();
    const req = requests.find(r => r.id === reqId);
    if (req) {
      if (req.status !== 'PENDING') {
         throw new AppError('ERR_REQUEST_ALREADY_PROCESSED', 'Request is not pending', logger.getCorrelationId());
      }
      req.status = 'REJECTED';
      req.updatedAt = new Date().toISOString();
      req.rejectedAt = new Date().toISOString();
      this.saveRequests(requests);
      await this.logAction(actorUsername, 'REQUEST_REJECTED', `Rejected request ${reqId}`);
    } else {
      throw new AppError('ERR_REQUEST_NOT_FOUND', 'Request not found', logger.getCorrelationId());
    }
  }
}

export const authService = new AuthService();
