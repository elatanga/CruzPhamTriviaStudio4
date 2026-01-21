
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

// --- MOCKS ---
// We mock the services to test the flow logic, not the backend connection itself here.
// Real backend tests would be in an E2E suite (Cypress/Playwright).

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

// Mock window interactions
window.scrollTo = jest.fn();
window.confirm = jest.fn(() => true);

describe('SYSTEM: Critical Flow Automations', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Default: System is bootstrapped
    jest.spyOn(authService, 'getBootstrapStatus').mockResolvedValue({ masterReady: true });
    // Default: No session
    jest.spyOn(authService, 'restoreSession').mockResolvedValue({ success: false });
    // Default: Empty requests
    jest.spyOn(authService, 'subscribeToRequests').mockImplementation((cb) => { cb([]); return () => {}; });
  });

  // --- FLOW 3: Token Request Persistence ---
  test('FLOW: User can submit token request and it persists', async () => {
    const mockRequestSubmit = jest.spyOn(authService, 'submitTokenRequest').mockResolvedValue({
      id: 'REQ-123',
      firstName: 'Flow', lastName: 'Test', tiktokHandle: 'flow', preferredUsername: 'flowuser', phoneE164: '+15551112222',
      status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      notify: { emailStatus: 'PENDING', smsStatus: 'PENDING', attempts: 0 }
    });

    render(<App />);
    
    // 1. Open Modal
    fireEvent.click(screen.getByText(/Request Access Token/i));
    
    // 2. Fill Data
    fireEvent.change(screen.getByText(/First Name/i).nextSibling as HTMLInputElement, { target: { value: 'Flow' } });
    fireEvent.change(screen.getByText(/Last Name/i).nextSibling as HTMLInputElement, { target: { value: 'Test' } });
    const tiktokInput = screen.getByText(/TikTok Handle/i).nextSibling as HTMLElement;
    fireEvent.change(tiktokInput.querySelector('input')!, { target: { value: 'flow' } });
    const userInput = screen.getByText(/Preferred Username/i).nextSibling as HTMLInputElement;
    fireEvent.change(userInput, { target: { value: 'flowuser' } });
    fireEvent.change(screen.getByPlaceholderText('+12223334444'), { target: { value: '+15551112222' } });

    // 3. Submit
    await act(async () => {
      fireEvent.click(screen.getByText(/Send Request/i));
    });

    // 4. Assert Success UI
    await waitFor(() => {
      expect(screen.getByText('REQ-123')).toBeInTheDocument();
      expect(screen.getByText(/Request Received/i)).toBeInTheDocument();
    });

    // 5. Assert Service Call (Persistence check)
    expect(mockRequestSubmit).toHaveBeenCalledWith({
      firstName: 'Flow',
      lastName: 'Test',
      tiktokHandle: 'flow',
      preferredUsername: 'flowuser',
      phoneE164: '+15551112222'
    });
  });

  // --- FLOW 4: Admin Approval -> Token Generation ---
  test('FLOW: Admin can approve request and generate token', async () => {
    // Setup Admin Session
    jest.spyOn(authService, 'restoreSession').mockResolvedValue({ 
      success: true, 
      session: { id: 'admin-sess', username: 'admin', role: 'MASTER_ADMIN', createdAt: Date.now(), userAgent: 'test' } 
    });
    
    // Setup Pending Request
    const pendingReq: any = {
      id: 'REQ-PENDING', firstName: 'Pending', lastName: 'User', tiktokHandle: 'p', preferredUsername: 'pending_guy', phoneE164: '+111', 
      status: 'PENDING', createdAt: new Date().toISOString()
    };
    
    // Mock Subscription to return the request
    jest.spyOn(authService, 'subscribeToRequests').mockImplementation((cb) => {
      cb([pendingReq]);
      return () => {};
    });

    // Mock Approval Action
    const mockApprove = jest.spyOn(authService, 'approveRequest').mockResolvedValue({
      rawToken: 'pk-newtoken123',
      user: { id: 'u1', username: 'pending_guy', role: 'PRODUCER', status: 'ACTIVE', tokenHash: 'hash', profile: { source: 'REQUEST_APPROVAL' }, createdAt: '', updatedAt: '' }
    });

    render(<App />);
    
    // 1. Go to Admin -> Inbox
    await waitFor(() => screen.getByText(/Admin Console/i)); // Footer button
    fireEvent.click(screen.getByText(/Admin Console/i));
    
    const inboxTab = screen.getByText('INBOX');
    fireEvent.click(inboxTab);

    // 2. See Request
    await waitFor(() => screen.getByText('pending_guy'));
    expect(screen.getByText('REQ-PENDING', { exact: false })).toBeInTheDocument(); // ID might not be shown textually in card, but name is

    // 3. Approve
    fireEvent.click(screen.getByText(/Review & Approve/i));
    
    // 4. Confirm Modal
    await waitFor(() => screen.getByText(/Confirm Approval/i));
    fireEvent.click(screen.getByText(/Create User & Send Token/i));

    // 5. Verify Success & Token Display
    await waitFor(() => {
      expect(screen.getByText('pk-newtoken123')).toBeInTheDocument();
      expect(screen.getByText(/Credentials Generated/i)).toBeInTheDocument();
    });

    // 6. Assert Backend Call
    expect(mockApprove).toHaveBeenCalledWith('admin', 'REQ-PENDING', 'pending_guy');
  });

  // --- FLOW 5: Session Restore on Refresh ---
  test('FLOW: Session is restored automatically on page refresh', async () => {
    // 1. Simulate LocalStorage having a session
    const storedSession = { id: 'sess-123', username: 'restored_user', role: 'PRODUCER', createdAt: Date.now(), userAgent: 'test' };
    localStorage.setItem('cruzpham_user_session', JSON.stringify(storedSession));

    // 2. Mock Service to validate it
    const mockRestore = jest.spyOn(authService, 'restoreSession').mockResolvedValue({
      success: true,
      session: storedSession as any
    });

    // 3. Render App (Simulating refresh)
    render(<App />);

    // 4. Expect to bypass Login and go to Dashboard
    await waitFor(() => {
      expect(screen.queryByText(/Studio Access/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Select Production/i)).toBeInTheDocument(); // Dashboard
    });

    // 5. Verify User Identity in Header
    expect(screen.getByText('restored_user')).toBeInTheDocument();

    // 6. Verify Service Call
    expect(mockRestore).toHaveBeenCalledWith('restored_user');
  });

  test('FAIL: Session is cleared if revoked on server', async () => {
    // 1. LocalStorage has session
    const storedSession = { id: 'sess-bad', username: 'banned_user', role: 'PRODUCER', createdAt: Date.now(), userAgent: 'test' };
    localStorage.setItem('cruzpham_user_session', JSON.stringify(storedSession));

    // 2. Service returns failure
    jest.spyOn(authService, 'restoreSession').mockResolvedValue({
      success: false,
      message: 'Access Revoked'
    });

    render(<App />);

    // 3. Expect Login Screen
    await waitFor(() => {
      expect(screen.getByText(/Studio Access/i)).toBeInTheDocument();
    });

    // 4. Verify LocalStorage cleared
    expect(localStorage.getItem('cruzpham_user_session')).toBeNull();
  });
});
