import { User, Session, TokenRequest, AuthResponse, AuditLogEntry, UserRole, AppError, AuditAction, DeliveryLog, UserSource, UserProfile } from '../types';
import { logger } from './logger';

const STORAGE_KEYS = {
  USERS: 'cruzpham_db_users',
  SESSIONS: 'cruzpham_db_sessions',
  REQUESTS: 'cruzpham_db_requests',
  AUDIT: 'cruzpham_db_audit_logs',
};

// Rate Limiting Map: ActorID -> timestamps[]
const rateLimits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

// --- CRYPTO HELPERS ---

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- MOCK DELIVERY PROVIDERS ---

async function simulateEmailProvider(to: string, subject: string, body: string): Promise<{ success: boolean; id?: string; error?: string }> {
  // Simulate SendGrid/Mailgun
  logger.info(`[SendGrid] Dispatching to ${to}`, { subject }); 
  await new Promise(r => setTimeout(r, 800)); // Network latency
  
  if (Math.random() < 0.1) {
    logger.error(`[SendGrid] Failed to send to ${to}`);
    return { success: false, error: 'Provider Internal Error (Simulated)' };
  }
  return { success: true, id: `sg_${Math.random().toString(36).substr(2, 12)}` };
}

async function simulateSmsProvider(to: string, message: string): Promise<{ success: boolean; id?: string; error?: string }> {
  // Simulate Twilio
  logger.info(`[Twilio] Dispatching to ${to}`); 
  await new Promise(r => setTimeout(r, 800));
  
  if (Math.random() < 0.1) {
    logger.error(`[Twilio] Failed to send to ${to}`);
    return { success: false, error: 'Carrier Blocked (Simulated)' };
  }
  return { success: true, id: `sm_${Math.random().toString(36).substr(2, 12)}` };
}

// --- BACKEND SERVICE ---

class AuthService {
  constructor() {
    // No auto-seed. Rely on bootstrap.
  }

  // --- PRIVATE HELPERS ---

  private checkRateLimit(actorId: string) {
    const now = Date.now();
    const timestamps = rateLimits.get(actorId) || [];
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new AppError('ERR_RATE_LIMIT', 'Too many requests. Please slow down.', logger.getCorrelationId());
    }
    
    recent.push(now);
    rateLimits.set(actorId, recent);
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
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUESTS) || '[]'); } catch { return []; }
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

  // --- BOOTSTRAP ---

  isConfigured(): boolean {
    const users = this.getUsers();
    return users.some(u => u.role === 'MASTER_ADMIN');
  }

  async bootstrapMasterAdmin(username: string): Promise<string> {
    if (this.isConfigured()) throw new AppError('ERR_FORBIDDEN', 'System already configured', logger.getCorrelationId());
    
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
    await this.logAction('SYSTEM', 'BOOTSTRAP', 'Master Admin created');
    
    return rawToken;
  }

  // --- AUTH ---

  async login(username: string, token: string): Promise<AuthResponse> {
    await new Promise(r => setTimeout(r, 400)); // Latency

    const users = this.getUsers();
    const targetUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

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

    // Invalidate old sessions
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
    const sessions = this.getSessions();
    const session = sessions[sessionId];
    if (!session) return { success: false, message: 'Session expired', code: 'ERR_SESSION_EXPIRED' };
    
    const users = this.getUsers();
    const user = users.find(u => u.username === session.username);
    if (!user || user.status === 'REVOKED') return { success: false, message: 'User invalid', code: 'ERR_INVALID_CREDENTIALS' };

    return { success: true, session };
  }

  // --- ADMIN USER MANAGEMENT ---

  getAllUsers(): User[] {
    return this.getUsers();
  }

  async createUser(actorUsername: string, userData: Partial<User> & { profile?: Partial<UserProfile> }, role: UserRole, durationMinutes?: number): Promise<string> {
    this.checkRateLimit(actorUsername);
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    
    if (!actor) throw new AppError('ERR_FORBIDDEN', 'Actor not found', logger.getCorrelationId());
    if (actor.role !== 'MASTER_ADMIN' && role === 'ADMIN') {
      throw new AppError('ERR_FORBIDDEN', 'Only Master Admin can create Admins', logger.getCorrelationId());
    }

    if (users.find(u => u.username === userData.username)) {
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
      
      // Full Profile Persistence
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
    await this.logAction(actor, 'TOKEN_ISSUED', 'Initial token generated', null, newUser.username);

    return rawToken;
  }

  async refreshToken(actorUsername: string, targetUsername: string): Promise<string> {
    this.checkRateLimit(actorUsername);
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    const targetIdx = users.findIndex(u => u.username === targetUsername);
    
    if (targetIdx === -1) throw new AppError('ERR_UNKNOWN', 'User not found', logger.getCorrelationId());
    const target = users[targetIdx];

    // Permission Check
    if (target.role === 'MASTER_ADMIN' && actor?.role !== 'MASTER_ADMIN') {
      throw new AppError('ERR_FORBIDDEN', 'Cannot modify Master Admin', logger.getCorrelationId());
    }

    const rawToken = (target.role === 'ADMIN' ? 'ak-' : 'pk-') + crypto.randomUUID().replace(/-/g, '').substr(0, 16);
    const hash = await hashToken(rawToken);

    // Rotate Token
    target.tokenHash = hash;
    target.updatedAt = new Date().toISOString();
    
    // Revoke old sessions implicitly by changing token hash logic in login/session check
    // but explicit session flush is safer:
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
      // Kill sessions
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
    
    // Cleanup sessions
    const sessions = this.getSessions();
    Object.keys(sessions).forEach(k => {
      if (sessions[k].username === targetUsername) delete sessions[k];
    });
    this.saveSessions(sessions);

    await this.logAction(actor!, 'USER_DELETED', `Deleted user ${targetUsername}`, { role: target.role }, targetUsername);
  }

  // --- DELIVERY SYSTEM ---

  async sendMessage(actorUsername: string, targetUsername: string, method: 'EMAIL' | 'SMS', content: string) {
    this.checkRateLimit(actorUsername);
    const users = this.getUsers();
    const actor = users.find(u => u.username === actorUsername);
    const targetIdx = users.findIndex(u => u.username === targetUsername);
    
    if (targetIdx === -1) throw new AppError('ERR_UNKNOWN', 'User not found', logger.getCorrelationId());
    const target = users[targetIdx];

    let result: { success: boolean; id?: string; error?: string };
    
    if (method === 'EMAIL') {
      if (!target.email) throw new AppError('ERR_UNKNOWN', 'User has no email', logger.getCorrelationId());
      result = await simulateEmailProvider(target.email, 'CRUZPHAM ACCESS', content);
    } else {
      if (!target.phone) throw new AppError('ERR_UNKNOWN', 'User has no phone', logger.getCorrelationId());
      result = await simulateSmsProvider(target.phone, content);
    }

    // Update Delivery Log
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
  
  async submitTokenRequest(data: Omit<TokenRequest, 'id' | 'status' | 'timestamp' | 'emailDeliveryStatus' | 'smsDeliveryStatus'>): Promise<TokenRequest> {
    const newRequest: TokenRequest = {
      id: crypto.randomUUID().split('-')[0].toUpperCase(),
      ...data,
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      emailDeliveryStatus: 'PENDING',
      smsDeliveryStatus: 'PENDING'
    };
    const requests = this.getRequests();
    requests.unshift(newRequest);
    this.saveRequests(requests);
    return newRequest;
  }

  async approveRequest(actorUsername: string, reqId: string, durationMinutes?: number, notifyMethods: ('EMAIL'|'SMS')[] = []): Promise<string> {
    const requests = this.getRequests();
    const reqIndex = requests.findIndex(r => r.id === reqId);
    if (reqIndex === -1) throw new AppError('ERR_UNKNOWN', 'Request not found', logger.getCorrelationId());
    const req = requests[reqIndex];

    const rawToken = await this.createUser(actorUsername, {
      username: req.preferredUsername,
      email: `user_${reqId}@example.com`, // Simulated or req.email if available
      phone: req.phone,
      profile: {
        firstName: req.firstName,
        lastName: req.lastName,
        tiktokHandle: req.tiktokHandle,
        source: 'REQUEST_APPROVAL' as UserSource,
        originalRequestId: req.id
      }
    }, 'PRODUCER', durationMinutes);

    req.status = 'APPROVED';
    requests[reqIndex] = req;
    this.saveRequests(requests);

    const message = `Welcome to CruzPham Studios! Your access token is: ${rawToken}`;
    const users = this.getUsers(); // Reload to get newly created user
    const newUser = users.find(u => u.username === req.preferredUsername);

    if (newUser) {
      if (notifyMethods.includes('EMAIL')) {
        try { await this.sendMessage(actorUsername, newUser.username, 'EMAIL', message); req.emailDeliveryStatus = 'SENT'; } 
        catch { req.emailDeliveryStatus = 'FAILED'; }
      }
      if (notifyMethods.includes('SMS')) {
        try { await this.sendMessage(actorUsername, newUser.username, 'SMS', message); req.smsDeliveryStatus = 'SENT'; } 
        catch { req.smsDeliveryStatus = 'FAILED'; }
      }
    }
    
    this.saveRequests(requests);
    await this.logAction(actorUsername, 'REQUEST_APPROVED', `Approved request ${reqId}`, null, newUser?.username);

    return rawToken;
  }

  async rejectRequest(actor: string, reqId: string) {
    const requests = this.getRequests();
    const req = requests.find(r => r.id === reqId);
    if (req) {
      req.status = 'REJECTED';
      this.saveRequests(requests);
      await this.logAction(actor, 'REQUEST_REJECTED', `Rejected request ${reqId}`);
    }
  }
}

export const authService = new AuthService();