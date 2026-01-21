
import { User, Session, TokenRequest, AuthResponse, AuditLogEntry, UserRole, AppError, AuditAction, DeliveryLog, UserSource, UserProfile } from '../types';
import { logger } from './logger';
import { db, functions } from './firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, 
  query, where, orderBy, limit, serverTimestamp, onSnapshot, 
  Timestamp, deleteDoc 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const COLLECTIONS = {
  USERS: 'users',
  REQUESTS: 'token_requests',
  AUDIT: 'audit_logs',
  BOOTSTRAP: 'system_bootstrap'
};

// --- TOKEN UTILS ---

export function normalizeTokenInput(token: string): string {
  if (!token) return '';
  return token.trim().replace(/[\s-]/g, '');
}

async function hashToken(token: string): Promise<string> {
  const normalized = normalizeTokenInput(token);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- BACKEND SERVICE ---

class AuthService {
  private _reqUnsub: (() => void) | null = null;
  private _auditUnsub: (() => void) | null = null;

  private checkDb() {
    if (!db) throw new AppError('ERR_FIREBASE_CONFIG', 'Database connection unavailable', logger.getCorrelationId());
    return db;
  }

  private checkFunctions() {
    if (!functions) throw new AppError('ERR_FIREBASE_CONFIG', 'Cloud Functions unavailable', logger.getCorrelationId());
    return functions;
  }

  // --- BOOTSTRAP SYSTEM ---

  async getBootstrapStatus(): Promise<{ masterReady: boolean }> {
    const _db = this.checkDb();
    
    // Strategy: Try Cloud Function first (Correct way), fallback to Direct Read (Fast/Offline way)
    try {
      const fns = this.checkFunctions();
      const getStatus = httpsCallable<{ }, { masterReady: boolean }>(fns, 'getSystemStatus');
      const result = await getStatus({});
      return result.data;
    } catch (fnError: any) {
      logger.warn('CONFIG', 'Bootstrap Function Failed - Attempting Direct Read', { error: fnError.message });
      
      try {
        // Fallback: Check Firestore directly
        const docRef = doc(_db, COLLECTIONS.BOOTSTRAP, 'config');
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
          return { masterReady: snap.data().masterReady === true };
        }
        // If doc doesn't exist, system is NOT ready
        return { masterReady: false };
      } catch (dbError: any) {
        // Detailed error reporting for debugging permission issues
        logger.error('CONFIG', 'Bootstrap Critical Failure', { 
           fnError: fnError.message, 
           dbError: dbError.message,
           code: dbError.code 
        });

        if (dbError.code === 'permission-denied') {
          throw new AppError('ERR_FORBIDDEN', 'Access to System Config Denied. Check Firestore Rules.', logger.getCorrelationId());
        }
        if (dbError.code === 'unavailable') {
           throw new AppError('ERR_NETWORK', 'Database Unreachable.', logger.getCorrelationId());
        }
        
        throw dbError; 
      }
    }
  }

  async bootstrapMasterAdmin(username: string): Promise<string> {
    const fns = this.checkFunctions();
    const bootstrapFn = httpsCallable<{ username: string, correlationId: string }, { token: string }>(fns, 'bootstrapSystem');
    
    try {
      const result = await bootstrapFn({ username, correlationId: logger.getCorrelationId() });
      return result.data.token;
    } catch (e: any) {
      throw new AppError('ERR_BOOTSTRAP_COMPLETE', e.message, logger.getCorrelationId());
    }
  }

  // --- AUTH ---

  async login(username: string, token: string): Promise<AuthResponse> {
    const _db = this.checkDb();
    
    try {
      const q = query(collection(_db, COLLECTIONS.USERS), where("username", "==", username));
      const snap = await getDocs(q);

      if (snap.empty) {
        return { success: false, message: 'Invalid credentials.', code: 'ERR_INVALID_CREDENTIALS' };
      }

      const userDoc = snap.docs[0];
      const user = userDoc.data() as User;

      if (user.status === 'REVOKED') {
        return { success: false, message: 'Account access revoked.', code: 'ERR_FORBIDDEN' };
      }

      const inputHash = await hashToken(token);
      if (inputHash !== user.tokenHash) {
        logger.warn('AUTH', `Failed login attempt for ${username}`);
        return { success: false, message: 'Invalid credentials.', code: 'ERR_INVALID_CREDENTIALS' };
      }

      await this.logAction(user, 'LOGIN', 'User logged in', { userAgent: navigator.userAgent });
      
      return { 
        success: true, 
        session: {
          id: crypto.randomUUID(),
          username: user.username,
          role: user.role,
          createdAt: Date.now(),
          userAgent: navigator.userAgent
        }
      };
    } catch (e: any) {
      if (e.code === 'permission-denied') {
        logger.error('AUTH', 'Login Permission Denied - Check Firestore Rules for /users');
        return { success: false, message: 'System Permission Error', code: 'ERR_FORBIDDEN' };
      }
      throw e;
    }
  }

  async logout(sessionId: string): Promise<void> {
    logger.info('AUTH', 'User logout', { sessionId });
  }

  /**
   * Revalidates a user session. 
   * Includes Offline Fallback: If network is down, trust the session.
   */
  async restoreSession(username: string): Promise<AuthResponse> {
    const _db = this.checkDb();
    
    try {
      const q = query(collection(_db, COLLECTIONS.USERS), where("username", "==", username));
      const snap = await getDocs(q);

      if (snap.empty) {
        return { success: false, message: 'User not found' };
      }

      const user = snap.docs[0].data() as User;
      
      if (user.status === 'REVOKED') {
         return { success: false, message: 'Access Revoked' };
      }
      
      // Return a reconstructed session object
      return { 
        success: true,
        session: {
            id: 'restored', 
            username: user.username, 
            role: user.role, 
            createdAt: Date.now(), 
            userAgent: navigator.userAgent 
        }
      };
    } catch (e: any) {
       // OFFLINE SUPPORT: If we can't reach Firebase, assume session is valid to prevent lockout
       if (e.code === 'unavailable' || e.message.includes('offline')) {
           logger.warn('AUTH', 'Restoring session in OFFLINE mode');
           return { success: true, message: 'Offline Mode' };
       }
       logger.error('AUTH', 'Session restore failed', e);
       return { success: false, message: e.message };
    }
  }

  // --- ADMIN & USER MANAGEMENT ---

  async getAllUsers(): Promise<User[]> {
    const _db = this.checkDb();
    const snap = await getDocs(query(collection(_db, COLLECTIONS.USERS), orderBy('username')));
    return snap.docs.map(d => d.data() as User);
  }

  async createUser(actorUsername: string, userData: Partial<User> & { profile?: Partial<UserProfile> }, role: UserRole, durationMinutes?: number): Promise<string> {
    const _db = this.checkDb();
    const rawToken = (role === 'ADMIN' ? 'ak-' : 'pk-') + crypto.randomUUID().replace(/-/g, '').substr(0, 16);
    const hash = await hashToken(rawToken);

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
      expiresAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60000).toISOString() : null,
      createdBy: actorUsername
    };

    await setDoc(doc(_db, COLLECTIONS.USERS, newUser.id), newUser);
    await this.logAction(actorUsername, role === 'ADMIN' ? 'ADMIN_CREATED' : 'USER_CREATED', `Created ${role} ${newUser.username}`, null, newUser.username);
    return rawToken;
  }

  // --- REAL-TIME LISTENERS ---

  subscribeToRequests(callback: (reqs: TokenRequest[]) => void): () => void {
    const _db = this.checkDb();
    const q = query(collection(_db, COLLECTIONS.REQUESTS), orderBy('createdAt', 'desc'), limit(100));
    
    this._reqUnsub = onSnapshot(q, (snap) => {
      const reqs = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          approvedAt: data.approvedAt?.toDate?.()?.toISOString(),
          rejectedAt: data.rejectedAt?.toDate?.()?.toISOString(),
        } as TokenRequest;
      });
      callback(reqs);
    }, (err) => {
      logger.error('FIRESTORE', 'Requests Listener Error', err);
    });

    return this._reqUnsub;
  }
  
  subscribeToAudit(callback: (logs: AuditLogEntry[]) => void): () => void {
    const _db = this.checkDb();
    const q = query(collection(_db, COLLECTIONS.AUDIT), orderBy('timestamp', 'desc'), limit(100));
    
    this._auditUnsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => d.data() as AuditLogEntry);
      callback(logs);
    }, (err) => {
       logger.warn('FIRESTORE', 'Audit Log Access Denied', err);
    });
    return this._auditUnsub;
  }

  unsubscribeAll() {
    if (this._reqUnsub) this._reqUnsub();
    if (this._auditUnsub) this._auditUnsub();
  }

  async getRequests(): Promise<TokenRequest[]> {
    const _db = this.checkDb();
    const q = query(collection(_db, COLLECTIONS.REQUESTS), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      } as TokenRequest;
    });
  }

  // --- REQUEST MANAGEMENT (Via Cloud Function) ---
  
  async submitTokenRequest(data: Omit<TokenRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'notify' | 'approvedAt' | 'rejectedAt'>): Promise<TokenRequest> {
    const fns = this.checkFunctions();
    const createReq = httpsCallable<any, TokenRequest>(fns, 'createTokenRequest');
    
    try {
      const result = await createReq({ ...data, correlationId: logger.getCorrelationId() });
      return result.data;
    } catch (e: any) {
      throw new AppError('ERR_NETWORK', 'Failed to submit request: ' + e.message, logger.getCorrelationId());
    }
  }

  // --- ACTIONS (Server-Side Triggered via Client) ---

  async retryAdminNotification(reqId: string) {
    const fns = this.checkFunctions();
    const retryFn = httpsCallable(fns, 'retryNotification');
    try {
      await retryFn({ requestId: reqId, correlationId: logger.getCorrelationId() });
      await this.logAction('ADMIN', 'RETRY_NOTIFY', `Retried notification for ${reqId}`);
    } catch (e: any) {
      throw new AppError('ERR_PROVIDER_DOWN', e.message, logger.getCorrelationId());
    }
  }

  async approveRequest(actorUsername: string, reqId: string, customUsername?: string): Promise<{ rawToken: string, user: User }> {
    const _db = this.checkDb();
    const reqRef = doc(_db, COLLECTIONS.REQUESTS, reqId);
    const reqSnap = await getDoc(reqRef);
    
    if (!reqSnap.exists()) throw new AppError('ERR_REQUEST_NOT_FOUND', 'Request not found', logger.getCorrelationId());
    const req = reqSnap.data() as TokenRequest;

    if (req.status !== 'PENDING') throw new AppError('ERR_REQUEST_ALREADY_PROCESSED', 'Request not pending', logger.getCorrelationId());

    const finalUsername = customUsername || req.preferredUsername;

    const rawToken = await this.createUser(actorUsername, {
      username: finalUsername,
      email: `user_${reqId}@cruzpham.com`, 
      phone: req.phoneE164,
      profile: {
        firstName: req.firstName,
        lastName: req.lastName,
        tiktokHandle: req.tiktokHandle,
        source: 'REQUEST_APPROVAL',
        originalRequestId: reqId
      }
    }, 'PRODUCER');

    await updateDoc(reqRef, {
      status: 'APPROVED',
      updatedAt: serverTimestamp(),
      approvedAt: serverTimestamp(),
      userId: (await getDocs(query(collection(_db, COLLECTIONS.USERS), where('username', '==', finalUsername)))).docs[0].id
    });

    return { rawToken, user: (await getDocs(query(collection(_db, COLLECTIONS.USERS), where('username', '==', finalUsername)))).docs[0].data() as User };
  }

  async rejectRequest(actorUsername: string, reqId: string) {
    const _db = this.checkDb();
    const reqRef = doc(_db, COLLECTIONS.REQUESTS, reqId);
    await updateDoc(reqRef, {
      status: 'REJECTED',
      updatedAt: serverTimestamp(),
      rejectedAt: serverTimestamp()
    });
    await this.logAction(actorUsername, 'REQUEST_REJECTED', `Rejected request ${reqId}`);
  }
  
  async deleteUser(actorUsername: string, targetUsername: string) {
    const _db = this.checkDb();
    const q = query(collection(_db, COLLECTIONS.USERS), where('username', '==', targetUsername));
    const snap = await getDocs(q);
    if (!snap.empty) {
        await deleteDoc(snap.docs[0].ref);
        await this.logAction(actorUsername, 'USER_DELETED', `Deleted user ${targetUsername}`);
    }
  }

  async toggleAccess(actorUsername: string, targetUsername: string, revoke: boolean) {
    const _db = this.checkDb();
    const q = query(collection(_db, COLLECTIONS.USERS), where('username', '==', targetUsername));
    const snap = await getDocs(q);
    if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { status: revoke ? 'REVOKED' : 'ACTIVE', updatedAt: new Date().toISOString() });
        await this.logAction(actorUsername, revoke ? 'ACCESS_REVOKED' : 'ACCESS_GRANTED', `${revoke ? 'Revoked' : 'Granted'} ${targetUsername}`);
    }
  }
  
  async refreshToken(actorUsername: string, targetUsername: string): Promise<string> {
      const _db = this.checkDb();
      const q = query(collection(_db, COLLECTIONS.USERS), where('username', '==', targetUsername));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error('User not found');
      
      const user = snap.docs[0].data() as User;
      const rawToken = (user.role === 'ADMIN' ? 'ak-' : 'pk-') + crypto.randomUUID().replace(/-/g, '').substr(0, 16);
      const hash = await hashToken(rawToken);
      
      await updateDoc(snap.docs[0].ref, { tokenHash: hash, updatedAt: new Date().toISOString() });
      await this.logAction(actorUsername, 'TOKEN_REFRESHED', `Rotated token for ${targetUsername}`);
      return rawToken;
  }
  
  async sendMessage(actorUsername: string, targetUsername: string, method: 'EMAIL' | 'SMS', content: string) {
    const fns = this.checkFunctions();
    const sendFn = httpsCallable(fns, 'sendManualNotification');
    try {
        await sendFn({ targetUsername, method, content, correlationId: logger.getCorrelationId() });
        await this.logAction(actorUsername, method === 'EMAIL' ? 'MESSAGE_SENT_EMAIL' : 'MESSAGE_SENT_SMS', `Sent ${method} to ${targetUsername}`);
    } catch (e: any) {
        throw new AppError('ERR_PROVIDER_DOWN', e.message, logger.getCorrelationId());
    }
  }

  // --- LOGGING ---

  async logAction(actor: User | string, action: AuditAction, details: string, metadata?: any, targetId?: string) {
    try {
      const _db = this.checkDb();
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
      // Fire-and-forget log, but catch error so app doesn't crash
      addDoc(collection(_db, COLLECTIONS.AUDIT), { ...entry, timestamp: serverTimestamp() }).catch(e => {
        logger.warn('FIRESTORE', 'Failed to write audit log', e);
      });
      logger.info('AUTH', `[Audit] ${action}: ${details}`, { ...metadata, actorId });
    } catch (e) {
      // ignore log failures
    }
  }
}

export const authService = new AuthService();
