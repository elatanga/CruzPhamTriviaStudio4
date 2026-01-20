
import { authService, normalizeTokenInput } from './services/authService';
import { AppError } from './types';

// --- MOCKS ---

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const global: any;

jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));

// Mock Crypto for Auth Hashing in JSDOM
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
    subtle: {
      digest: async (_algo: string, data: Uint8Array) => {
        // Simple identity 'hash' for testing
        return new Uint8Array(data).buffer; 
      }
    }
  },
  writable: true
});

describe('API Contract Tests (Auth Service)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // 1) Bootstrap Contract
  describe('GET /system/bootstrap-status & POST /admin/bootstrap-master', () => {
    test('Bootstrap flow is stable and locks after success', async () => {
      // 1. Check initial status
      const initial = await authService.getBootstrapStatus();
      expect(initial.masterReady).toBe(false);

      // 2. Perform Bootstrap
      const token = await authService.bootstrapMasterAdmin('master_user');
      expect(token).toMatch(/^mk-/);

      // 3. Verify Locked Status
      const final = await authService.getBootstrapStatus();
      expect(final.masterReady).toBe(true);

      // 4. Verify Second Attempt Fails with Correct Code
      await expect(authService.bootstrapMasterAdmin('hack_user'))
        .rejects
        .toMatchObject({ code: 'ERR_BOOTSTRAP_COMPLETE' });
    });
  });

  // 2) Login Contract
  describe('POST /auth/login', () => {
    test('Login returns valid session structure and normalized token validation', async () => {
      // Setup
      const token = await authService.bootstrapMasterAdmin('admin');
      
      // 1. Success Login
      const res = await authService.login('admin', token);
      expect(res.success).toBe(true);
      expect(res.session).toBeDefined();
      expect(res.session?.role).toBe('MASTER_ADMIN');
      expect(res.session?.username).toBe('admin');
      expect(res.session?.id).toBeDefined();

      // 2. Token Normalization (Spaces/Hyphens)
      const dirtyToken = ` ${token.replace('-', ' - ')} \n`;
      const res2 = await authService.login('admin', dirtyToken);
      expect(res2.success).toBe(true);
    });

    test('Login failures return stable error codes', async () => {
      await authService.bootstrapMasterAdmin('admin');

      // Invalid User
      const r1 = await authService.login('ghost', 'any-token');
      expect(r1.success).toBe(false);
      expect(r1.code).toBe('ERR_INVALID_CREDENTIALS');

      // Invalid Token
      const r2 = await authService.login('admin', 'wrong-token');
      expect(r2.success).toBe(false);
      expect(r2.code).toBe('ERR_INVALID_CREDENTIALS');
    });

    test('Login does not mutate token or create new users', async () => {
      const token = await authService.bootstrapMasterAdmin('admin');
      const usersBefore = JSON.parse(localStorage.getItem('cruzpham_db_users') || '[]');
      
      await authService.login('admin', token);
      
      const usersAfter = JSON.parse(localStorage.getItem('cruzpham_db_users') || '[]');
      
      expect(usersAfter.length).toBe(usersBefore.length);
      expect(usersAfter[0].tokenHash).toBe(usersBefore[0].tokenHash);
    });
  });

  // 3) Restore Contract
  describe('POST /auth/restore', () => {
    test('Restore returns session without auth call if valid', async () => {
      const token = await authService.bootstrapMasterAdmin('admin');
      const login = await authService.login('admin', token);
      const sessionId = login.session!.id;

      const restore = await authService.restoreSession(sessionId);
      expect(restore.success).toBe(true);
      expect(restore.session?.username).toBe('admin');
    });

    test('Restore returns ERR_SESSION_EXPIRED for invalid ID', async () => {
      await authService.bootstrapMasterAdmin('admin');
      const restore = await authService.restoreSession('bad-id');
      expect(restore.success).toBe(false);
      expect(restore.code).toBe('ERR_SESSION_EXPIRED');
    });
  });

  // 4) Request Creation Contract
  describe('POST /requests/create', () => {
    test('Creates request with ID and Pending status', async () => {
      await authService.bootstrapMasterAdmin('admin');
      
      const req = await authService.submitTokenRequest({
        firstName: 'John', lastName: 'Doe', tiktokHandle: 'jd', preferredUsername: 'johnny', phoneE164: '+15550001111'
      });
      
      expect(req.id).toBeTruthy();
      expect(req.status).toBe('PENDING');
      expect(req.adminNotifyStatus).toBeDefined(); // Should have triggered async notify

      const stored = authService.getRequests().find(r => r.id === req.id);
      expect(stored).toBeDefined();
    });

    test('Validates E.164 Strictness', async () => {
      await expect(authService.submitTokenRequest({
        firstName: 'Bad', lastName: 'Number', tiktokHandle: 'x', preferredUsername: 'x', phoneE164: '123'
      })).rejects.toMatchObject({ code: 'ERR_VALIDATION' });
    });
  });

  // 5) Approval & Rejection (Security & Logic)
  describe('POST /admin/requests/approve & reject', () => {
    let adminToken: string;
    let reqId: string;

    beforeEach(async () => {
      adminToken = await authService.bootstrapMasterAdmin('master');
      // Create a PRODUCER user to test RBAC failure
      await authService.createUser('master', { username: 'producer' }, 'PRODUCER');
      
      const req = await authService.submitTokenRequest({
        firstName: 'A', lastName: 'B', tiktokHandle: 't', preferredUsername: 'applicant', phoneE164: '+15559990000'
      });
      reqId = req.id;
    });

    test('RBAC: Non-admin CANNOT approve requests', async () => {
      await expect(authService.approveRequest('producer', reqId))
        .rejects
        .toMatchObject({ code: 'ERR_FORBIDDEN' });
    });

    test('RBAC: Non-admin CANNOT reject requests', async () => {
      await expect(authService.rejectRequest('producer', reqId))
        .rejects
        .toMatchObject({ code: 'ERR_FORBIDDEN' });
    });

    test('Admin approval creates user and updates request', async () => {
      const result = await authService.approveRequest('master', reqId);
      
      expect(result.rawToken).toMatch(/^pk-/);
      expect(result.user.role).toBe('PRODUCER');

      const req = authService.getRequests().find(r => r.id === reqId);
      expect(req?.status).toBe('APPROVED');
      expect(req?.userId).toBe(result.user.id);
    });

    test('Double approval fails with ERR_REQUEST_ALREADY_PROCESSED', async () => {
      await authService.approveRequest('master', reqId);
      await expect(authService.approveRequest('master', reqId))
        .rejects
        .toMatchObject({ code: 'ERR_REQUEST_ALREADY_PROCESSED' });
    });

    test('Rejection logic updates status only', async () => {
      await authService.rejectRequest('master', reqId);
      
      const req = authService.getRequests().find(r => r.id === reqId);
      expect(req?.status).toBe('REJECTED');
      
      // Ensure no user created
      const users = authService.getAllUsers();
      expect(users.find(u => u.username === 'applicant')).toBeUndefined();
    });

     test('Rejection of non-existent request returns ERR_REQUEST_NOT_FOUND', async () => {
      await expect(authService.rejectRequest('master', 'fake-id'))
        .rejects
        .toMatchObject({ code: 'ERR_REQUEST_NOT_FOUND' });
    });
  });

  // 6) Security: Token Normalization
  test('Token Normalization Helper Correctness', () => {
      expect(normalizeTokenInput(' pk-123 ')).toBe('pk123');
      expect(normalizeTokenInput('pk 123')).toBe('pk123');
      expect(normalizeTokenInput('pk\n123')).toBe('pk123');
  });
});
