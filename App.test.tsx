import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;

// Mock dependencies
jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));
jest.mock('./services/soundService', () => ({
  soundService: {
    playSelect: jest.fn(), playReveal: jest.fn(), playAward: jest.fn(),
    playSteal: jest.fn(), playVoid: jest.fn(), playDoubleOrNothing: jest.fn(),
    setMute: jest.fn()
  }
}));
jest.mock('./services/geminiService', () => ({
  generateTriviaGame: jest.fn().mockResolvedValue([]),
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' })
}));

describe('App Robustness', () => {
  beforeAll(() => localStorage.clear());

  test('Displays offline indicator when network down', async () => {
    render(<App />);
    
    act(() => {
      // Simulate Offline
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(await screen.findByText('Studio Offline - Reconnecting...')).toBeInTheDocument();

    act(() => {
      // Simulate Online
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText('Studio Offline - Reconnecting...')).not.toBeInTheDocument();
    });
  });

  test('Admin Logic handles duplicate users gracefully', async () => {
    // Setup Master
    await authService.bootstrapMasterAdmin('admin');
    
    // Attempt duplicate
    await expect(authService.createUser('admin', { username: 'testuser' }, 'PRODUCER'))
      .resolves.toBeDefined();
      
    await expect(authService.createUser('admin', { username: 'testuser' }, 'PRODUCER'))
      .rejects.toThrow('Username taken');
  });

  test('Persists Request details to User Profile on approval', async () => {
    // Setup
    await authService.bootstrapMasterAdmin('admin');
    const req = await authService.submitTokenRequest({
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '123',
      tiktokHandle: 'janed',
      preferredUsername: 'jane_prod'
    });

    // Approve
    await authService.approveRequest('admin', req.id);

    // Verify User
    const users = authService.getAllUsers();
    const user = users.find(u => u.username === 'jane_prod');
    expect(user).toBeDefined();
    expect(user?.profile.firstName).toBe('Jane');
    expect(user?.profile.source).toBe('REQUEST_APPROVAL');
    expect(user?.profile.originalRequestId).toBe(req.id);
  });

  test('Token Rotation invalidates old token', async () => {
    // Setup
    await authService.bootstrapMasterAdmin('admin');
    const token1 = await authService.createUser('admin', { username: 'rotator' }, 'PRODUCER');

    // Verify Login
    const login1 = await authService.login('rotator', token1);
    expect(login1.success).toBe(true);

    // Rotate
    const token2 = await authService.refreshToken('admin', 'rotator');
    expect(token1).not.toBe(token2);

    // Verify Old Token Invalid
    const loginOld = await authService.login('rotator', token1);
    expect(loginOld.success).toBe(false);

    // Verify New Token Valid
    const loginNew = await authService.login('rotator', token2);
    expect(loginNew.success).toBe(true);
  });

  test('Revoke Access blocks login immediately', async () => {
    await authService.bootstrapMasterAdmin('admin');
    const token = await authService.createUser('admin', { username: 'bad_actor' }, 'PRODUCER');
    
    // Revoke
    await authService.toggleAccess('admin', 'bad_actor', true);
    
    // Try Login
    const login = await authService.login('bad_actor', token);
    expect(login.success).toBe(false);
    expect(login.code).toBe('ERR_FORBIDDEN');
  });
});