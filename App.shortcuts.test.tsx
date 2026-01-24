import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { soundService } from './services/soundService';

// --- MOCKS ---

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const beforeAll: any;

// Mock Logger
jest.mock('./services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), getCorrelationId: () => 'test-id', maskPII: (v:any) => v }
}));

// Mock SoundService
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

// Mock Gemini
jest.mock('./services/geminiService', () => ({
  generateTriviaGame: jest.fn().mockResolvedValue([]),
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' })
}));

// Mock window.confirm
const originalConfirm = window.confirm;
const mockConfirm = jest.fn();

describe('CRUZPHAM TRIVIA - Shortcuts & Styling Tests', () => {
  beforeAll(() => {
    window.confirm = mockConfirm;
    // Mock ScrollTo
    window.scrollTo = jest.fn();
  });

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockConfirm.mockReturnValue(true); // Default Yes
  });

  const setupAuthenticatedApp = async () => {
    // 1. Bootstrap
    const token = await authService.bootstrapMasterAdmin('admin');
    // 2. Login
    const loginRes = await authService.login('admin', token);
    localStorage.setItem('cruzpham_active_session_id', loginRes.session!.id);
    
    // 3. Render
    const utils = render(<App />);
    
    // 4. Wait for Dashboard
    await waitFor(() => screen.getByText(/Select Production/i));
    
    return utils;
  };

  const createAndPlayShow = async () => {
    // Create Show
    const titleInput = screen.getByPlaceholderText(/New Show Title/i);
    fireEvent.change(titleInput, { target: { value: 'Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    
    await waitFor(() => screen.getByText(/Template Library/i));
    
    // Create Template (Simulate clicks)
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByPlaceholderText(/e.g. Science Night 2024/i));
    
    // Fill Config
    const templateTitle = screen.getByPlaceholderText(/e.g. Science Night 2024/i);
    fireEvent.change(templateTitle, { target: { value: 'Test Template' } });
    
    // Click "Create Template" (initializes board)
    fireEvent.click(screen.getByText('Create Template', { selector: 'button' }));
    
    // Save
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    
    // Play
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    
    // Wait for Board
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('1) Board View Settings: Director scaling updates GameBoard CSS variables', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // Switch to Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Board View Settings/i));

    // Change Font Scale to XL (Scale 1.35)
    const scaleL = screen.getByText('L');
    fireEvent.click(scaleL);

    // Switch back to Board
    fireEvent.click(screen.getByText(/Board/i, { selector: 'button' }));
    
    // Verify CSS variables on GameBoard container
    const boardContainer = screen.getByText('Test Template').parentElement?.parentElement?.querySelector('.font-roboto');
    expect(boardContainer).toHaveStyle('--board-font-scale: 1.35');
  });

  test('2) Roboto Font: Ensure font-roboto class is applied to board', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    const board = screen.getByText('Test Template').closest('div');
    expect(board).toHaveClass('font-roboto');
    expect(board).toHaveClass('font-bold');
  });

  test('3) Arrow Shortcuts: Player Selection & Focus Guards', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    fireEvent.keyDown(window, { code: 'ArrowDown', key: 'ArrowDown' });
    expect(soundService.playSelect).toHaveBeenCalled();
  });

  test('4) Void Flow: Logic & UI Updates', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    const qBtn = screen.getAllByText('100')[0];
    fireEvent.click(qBtn);
    
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    
    await waitFor(() => screen.getByText(/Void \(ESC\)/i));
    fireEvent.click(screen.getByText(/Void \(ESC\)/i));
    
    await waitFor(() => expect(screen.queryByText(/VOID/i)).toBeInTheDocument());
  });
});