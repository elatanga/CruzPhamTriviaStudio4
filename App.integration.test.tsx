import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

// --- TYPE DECLARATIONS ---
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const beforeEach: any;
declare const global: any;

// --- MOCKS ---

jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));

jest.mock('./services/soundService', () => ({
  soundService: {
    playSelect: jest.fn(), playReveal: jest.fn(), playAward: jest.fn(),
    playSteal: jest.fn(), playVoid: jest.fn(), playDoubleOrNothing: jest.fn(),
    playClick: jest.fn(), playTimerTick: jest.fn(), playTimerAlarm: jest.fn(),
    playToast: jest.fn(),
    setMute: jest.fn(), getMute: jest.fn().mockReturnValue(false),
    setVolume: jest.fn(), getVolume: jest.fn().mockReturnValue(0.5)
  }
}));

jest.mock('./services/geminiService', () => ({
  generateTriviaGame: jest.fn().mockResolvedValue([]),
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' })
}));

// Mock Crypto for Auth Hashing in JSDOM
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
    subtle: {
      digest: async (_algo: string, data: Uint8Array) => {
        // Simple identity 'hash' for testing to avoid actual crypto complexity in JSDOM
        return new Uint8Array(data).buffer; 
      }
    }
  },
  writable: true
});

// Mock window.scrollTo
window.scrollTo = jest.fn();

// Mock alert/confirm
window.alert = jest.fn();
window.confirm = jest.fn(() => true);

describe('CRUZPHAM TRIVIA - Network Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // 1) Bootstrap Visibility Test
  test('Bootstrap Visibility: UI reflects masterReady state via service calls', async () => {
    // Initial: masterReady is false (localStorage empty)
    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/SYSTEM BOOTSTRAP/i)).toBeInTheDocument();
    });
    
    // Action: Simulate network call to bootstrap
    await authService.bootstrapMasterAdmin('admin');
    
    // Reload App (Unmount + Mount)
    unmount();
    render(<App />);
    
    // Assert: Bootstrap gone, Login present
    await waitFor(() => {
      expect(screen.queryByText(/SYSTEM BOOTSTRAP/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Studio Access/i)).toBeInTheDocument();
    });
  });

  // 2) Session Restore Test
  test('Session Restore: Valid session persists across app reloads', async () => {
    // Setup
    const token = await authService.bootstrapMasterAdmin('admin');
    
    // 1. Initial Render
    const { unmount } = render(<App />);
    
    // 2. Perform Login
    fireEvent.change(screen.getByPlaceholderText(/e.g. producer_one/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText(/Paste your token here/i), { target: { value: token } });
    
    await act(async () => {
      fireEvent.click(screen.getByText(/Login/i));
    });

    // Verify Login Success (Dashboard Visible)
    await waitFor(() => {
      expect(screen.getByText(/Select Production/i)).toBeInTheDocument();
    });

    // 3. Simulate Hard Reload (Unmount -> Remount with same localStorage)
    unmount();
    render(<App />);

    // 4. Assert Restore: Should not see Login, should see Dashboard
    await waitFor(() => {
      expect(screen.queryByText(/Studio Access/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Select Production/i)).toBeInTheDocument();
    });
  });

  // 3) Get Token Request Submission Test
  test('Request Submission: Form data persists to backend and triggers notification', async () => {
    // Setup to skip bootstrap
    await authService.bootstrapMasterAdmin('admin');
    render(<App />);

    // 1. Open Request Modal
    fireEvent.click(screen.getByText(/Get Token/i));

    // 2. Fill Form
    fireEvent.change(screen.getByText(/First Name/i).nextSibling as HTMLInputElement, { target: { value: 'Test' } });
    fireEvent.change(screen.getByText(/Last Name/i).nextSibling as HTMLInputElement, { target: { value: 'User' } });
    
    const tiktokContainer = screen.getByText(/TikTok Handle/i).nextSibling as HTMLElement;
    const tiktokIn = tiktokContainer.querySelector('input')!;
    fireEvent.change(tiktokIn, { target: { value: 'test_tok' } });

    const userContainer = screen.getByText(/Preferred Username/i).nextSibling as HTMLInputElement;
    fireEvent.change(userContainer, { target: { value: 'requester_1' } });

    const phoneInput = screen.getByPlaceholderText('+12223334444');
    fireEvent.change(phoneInput, { target: { value: '+15551234567' } });

    // 3. Submit
    await act(async () => {
       fireEvent.click(screen.getByText(/Send Request/i));
    });

    // 4. Assert UI Confirmation
    await waitFor(() => {
      expect(screen.getByText(/Request Received/i)).toBeInTheDocument();
    });

    // 5. Assert Backend State
    const storedRequests = authService.getRequests();
    expect(storedRequests).toHaveLength(1);
    expect(storedRequests[0].preferredUsername).toBe('requester_1');
    expect(storedRequests[0].status).toBe('PENDING');
  });

  // 4) Approve Request -> User Login Test
  test('E2E: Admin approves request -> User logs in with new token', async () => {
    // 1. Setup: Master Admin & Pre-existing Request
    const adminToken = await authService.bootstrapMasterAdmin('admin');
    await authService.submitTokenRequest({
      firstName: 'Integration', lastName: 'Test', tiktokHandle: 'integ', preferredUsername: 'new_user', phoneE164: '+15559998888'
    });

    render(<App />);

    // 2. Login as Admin
    fireEvent.change(screen.getByPlaceholderText(/e.g. producer_one/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText(/Paste your token here/i), { target: { value: adminToken } });
    fireEvent.click(screen.getByText(/Login/i));

    // 3. Navigate to Admin Console -> Inbox
    await waitFor(() => screen.getByText(/Select Production/i));
    
    // Find the Admin Console button (usually in bottom right or footer)
    await waitFor(() => screen.getByText(/Admin Console/i));
    fireEvent.click(screen.getByText(/Admin Console/i));
    
    fireEvent.click(screen.getByText('INBOX'));
    
    // 4. Approve
    await waitFor(() => screen.getByText('new_user'));
    fireEvent.click(screen.getByText(/Review & Approve/i));
    
    // Confirm in modal
    await waitFor(() => screen.getByText(/Confirm Approval/i));
    fireEvent.click(screen.getByText(/Create User & Send Token/i));

    // 5. Extract Token from Credentials Modal
    await waitFor(() => screen.getByText(/Credentials Generated/i));
    
    const tokenElement = document.querySelector('.text-gold-500.font-mono.text-lg.break-all');
    const newUserToken = tokenElement?.textContent;
    expect(newUserToken).toBeTruthy();

    // 6. Logout Admin
    fireEvent.click(screen.getByText('Done')); // Close modal
    fireEvent.click(screen.getByText(/Logout/i));

    // 7. Login as New User
    await waitFor(() => screen.getByText(/Studio Access/i));
    
    fireEvent.change(screen.getByPlaceholderText(/e.g. producer_one/i), { target: { value: 'new_user' } });
    fireEvent.change(screen.getByPlaceholderText(/Paste your token here/i), { target: { value: newUserToken! } });
    fireEvent.click(screen.getByText(/Login/i));

    // 8. Assert Success
    await waitFor(() => {
       expect(screen.getByText(/PRODUCER:/i)).toBeInTheDocument();
       expect(screen.getByText('new_user')).toBeInTheDocument();
    });
  });

  // 5) Luxury Theme Visibility Test (CARD 2)
  test('Theme: Game Stage applies luxury ivory background when game is active', async () => {
    const adminToken = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', adminToken);
    
    // Simulate active game state in localStorage
    const mockGameState = {
      showTitle: 'Theme Test',
      isGameStarted: true,
      categories: [{ id: 'c1', title: 'Cat 1', questions: [{ id: 'q1', points: 100, text: 'Q', answer: 'A', isRevealed: false, isAnswered: false }] }],
      players: [{ id: 'p1', name: 'Alice', score: 0, color: '#fff' }],
      activeQuestionId: null,
      activeCategoryId: null,
      selectedPlayerId: 'p1',
      history: [],
      timer: { duration: 30, endTime: null, isRunning: false },
      viewSettings: { boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0, updatedAt: '' },
      lastPlays: []
    };
    localStorage.setItem('cruzpham_gamestate', JSON.stringify(mockGameState));
    localStorage.setItem('cruzpham_active_session_id', 'sess-123');

    render(<App />);

    await waitFor(() => screen.getByText(/End Show/i));

    // The container with the luxury ivory gradient background should be present
    const gameStage = document.querySelector('.bg-gradient-to-b.from-\\[\\#F7F3EA\\].to-\\[\\#EFE7D8\\]');
    expect(gameStage).toBeInTheDocument();
    
    // Headers should still be dark navy for anchoring
    const header = screen.getByText('Cat 1').closest('div');
    expect(header).toHaveClass('bg-navy-900');
  });
});