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
});