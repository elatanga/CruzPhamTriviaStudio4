import { User, Session, TokenRequest, AuthResponse, AuditLogEntry, UserRole, AppError } from '../types';
import { logger } from './logger';

const STORAGE_KEYS = {
  USERS: 'cruzpham_db_users',
  SESSIONS: 'cruzpham_db_sessions',
  REQUESTS: 'cruzpham_db_requests',
  AUDIT: 'cruzpham_db_audit_logs',
};

// --- CRYPTO HELPERS ---

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- MOCK DELIVERY PROVIDERS ---

async function simulateEmailProvider(to: string, subject: string, body: string): Promise<{ success: boolean; id?: string }> {
  // Simulate SendGrid/Mailgun
  // Log strictly sanitized
  logger.info(`[SendGrid] Sending email`, { to, subject }); 
  await new Promise(r => setTimeout(r, 600));
  if (Math.random() < 0.05) return { success: false };
  return { success: true, id: `sg_${Math.random().toString(36).substr(2)}` };
}

async function simulateSmsProvider(to: string, message: string): Promise<{ success: boolean; id?: string }> {
  // Simulate Twilio
  logger.info(`[Twilio] Sending SMS`, { to }); 
  await new Promise(r => setTimeout(r, 600));
  if (Math.random() < 0.05) return { success: false };
  return { success: true, id: `sm_${Math.random().toString(36).substr(2)}` };
}

// --- BACKEND SERVICE ---

class AuthService {
  constructor() {
    // No auto-seed. Rely on bootstrap.
  }

  // --- STATE ACCESSORS ---

  private getUsers(): User[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    } catch { return []; }
  }
  private saveUsers(users: User[]) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
  private getSessions(): Record<string, Session> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '{}');
    } catch { return {}; }
  }
  private saveSessions(sessions: Record<string, Session>) {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }
  getRequests(): TokenRequest[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUESTS) || '[]');
    } catch { return []; }
  }
  private saveRequests(reqs: TokenRequest[]) {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(reqs));
  }
  getAuditLogs(): AuditLogEntry[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT) || '[]');
    } catch { return []; }
  }
  private saveAuditLog(logs: AuditLogEntry[]) {
    localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(logs));
  }

  private async logAction(actorId: string, action: AuditLogEntry['action'], details: string, metadata?: any) {
    const logs = this.getAuditLogs();
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorId,
      action,
      details,
      metadata
    };
    logs.unshift(entry); // Newest first
    this.saveAuditLog(logs);
    logger.info(`[Audit] ${action}: ${details}`, metadata);
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
      createdAt: new Date().toISOString(),
      createdBy: 'SYSTEM'
    };

    this.saveUsers([master]);
    await this.logAction('SYSTEM', 'BOOTSTRAP', 'Master Admin created');
    
    return rawToken;
  }

  // --- AUTH ---

  async login(username: string, token: string): Promise<AuthResponse> {
    // Latency sim
    await new Promise(r => setTimeout(r, 400));

    const users = this.getUsers();
    const targetUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!targetUser) {
      return { success: false, message: 'Invalid credentials.', code: 'ERR_INVALID_CREDENTIALS' };
    }

    const inputHash = await hashToken(token);
    if (inputHash !== targetUser.tokenHash) {
      // Log failed attempt without full token
      logger.warn(`Failed login attempt for ${username}`);
      return { success: false, message: 'Invalid credentials.', code: 'ERR_INVALID_CREDENTIALS' };
    }

    // Expiry Check
    if (targetUser.expiresAt) {
      const expiry = new Date(targetUser.expiresAt).getTime();
      if (Date.now() > expiry) {
        return { success: false, message: 'Access token expired.', code: 'ERR_SESSION_EXPIRED' };
      }
    }

    // Invalidate old sessions for this user (Single Session Policy)
    const allSessions = this.getSessions();
    Object.keys(allSessions).forEach(key => {
      if (allSessions[key].username === targetUser.username) {
        delete allSessions[key];
      }
    });

    // Create Session
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

    await this.logAction(targetUser.username, 'LOGIN', 'User logged in', { userAgent: navigator.userAgent });
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
    
    // Check if user still exists/valid
    const users = this.getUsers();
    const user = users.find(u => u.username === session.username);
    if (!user) return { success: false, message: 'User invalid', code: 'ERR_INVALID_CREDENTIALS' };

    return { success: true, session };
  }

  // --- USER MANAGEMENT ---

  getAllUsers(): User[] {
    return this.getUsers();
  }

  async createUser(actor: string, userData: Partial<User>, role: UserRole, durationMinutes?: number): Promise<string> {
    const users = this.getUsers();
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
      email: userData.email,
      phone: userData.phone,
      firstName: userData.firstName,
      lastName: userData.lastName,
      tiktokHandle: userData.tiktokHandle,
      createdAt: new Date().toISOString(),
      expiresAt,
      createdBy: actor
    };

    users.push(newUser);
    this.saveUsers(users);
    await this.logAction(actor, role === 'ADMIN' ? 'ADMIN_CREATED' : 'TOKEN_ISSUED', `Created user ${newUser.username}`, { role, expiresAt });

    return rawToken;
  }

  async deleteUser(actor: string, targetUsername: string) {
    let users = this.getUsers();
    const target = users.find(u => u.username === targetUsername);
    if (!target) return;

    // Protection: Only Master can delete Admins
    if (target.role === 'MASTER_ADMIN') throw new AppError('ERR_FORBIDDEN', 'Cannot delete Master Admin', logger.getCorrelationId());
    const actorUser = users.find(u => u.username === actor);
    if (target.role === 'ADMIN' && actorUser?.role !== 'MASTER_ADMIN') {
      throw new AppError('ERR_FORBIDDEN', 'Only Master Admin can delete Admins', logger.getCorrelationId());
    }

    users = users.filter(u => u.username !== targetUsername);
    this.saveUsers(users);
    await this.logAction(actor, 'USER_DELETED', `Deleted user ${targetUsername}`);
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
    
    // Simulate notification to admin
    await simulateEmailProvider('admins@cruzpham.com', 'New Token Request', 'New request received');
    
    return newRequest;
  }

  async approveRequest(actor: string, reqId: string, durationMinutes?: number, notifyMethods: ('EMAIL'|'SMS')[] = []): Promise<string> {
    const requests = this.getRequests();
    const reqIndex = requests.findIndex(r => r.id === reqId);
    if (reqIndex === -1) throw new AppError('ERR_UNKNOWN', 'Request not found', logger.getCorrelationId());

    const req = requests[reqIndex];
    if (req.status !== 'PENDING') throw new AppError('ERR_FORBIDDEN', 'Request already processed', logger.getCorrelationId());

    // Create User
    const rawToken = await this.createUser(actor, {
      username: req.preferredUsername,
      firstName: req.firstName,
      lastName: req.lastName,
      email: `user_${reqId}@example.com`,
      phone: req.phone,
      tiktokHandle: req.tiktokHandle
    }, 'PRODUCER', durationMinutes);

    // Update Request
    req.status = 'APPROVED';
    
    // Notifications
    const message = `Welcome to CruzPham Studios! Your access token is: ${rawToken}`;
    
    if (notifyMethods.includes('EMAIL')) {
      const res = await simulateEmailProvider('user@example.com', 'Your Access Token', message);
      req.emailDeliveryStatus = res.success ? 'SENT' : 'FAILED';
    }

    if (notifyMethods.includes('SMS') && req.phone) {
      const res = await simulateSmsProvider(req.phone, message);
      req.smsDeliveryStatus = res.success ? 'SENT' : 'FAILED';
    }

    if (notifyMethods.length > 0) {
      await this.logAction(actor, 'MESSAGE_SENT', `Sent credentials to ${req.preferredUsername}`, { methods: notifyMethods });
    }

    requests[reqIndex] = req;
    this.saveRequests(requests);
    await this.logAction(actor, 'REQUEST_APPROVED', `Approved request ${reqId}`);

    return rawToken;
  }

  async rejectRequest(actor: string, reqId: string) {
    const requests = this.getRequests();
    const req = requests.find(r => r.id === reqId);
    if (req) {
      req.status = 'REJECTED';
      this.saveRequests(requests);
      await this.logAction(actor, 'REQUEST_APPROVED', `Rejected request ${reqId}`);
    }
  }
}

export const authService = new AuthService();