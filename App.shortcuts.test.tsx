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
    
    // Create Template
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    
    const templateTitle = screen.getByPlaceholderText(/e.g. Science Night 2024/i);
    fireEvent.change(templateTitle, { target: { value: 'Test Template' } });
    
    fireEvent.click(screen.getByText('Start Building'));
    
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
    await waitFor(() => screen.getByText(/Board View settings/i));

    // Change Font Scale to XL (Scale 1.35)
    const scaleXL = screen.getByText('XL');
    fireEvent.click(scaleXL);

    // Switch back to Board
    fireEvent.click(screen.getByText(/Board/i, { selector: 'button' }));
    
    // Verify CSS variables on GameBoard container
    const boardContainer = document.querySelector('.font-roboto');
    expect(boardContainer).toHaveStyle('--board-font-scale: 1.35');
  });

  test('2) Reveal Answer Styling: Roboto font and full-screen classes applied', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // Open a question
    const qBtn = screen.getAllByText('100')[0];
    fireEvent.click(qBtn);
    
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    
    const modalRoot = screen.getByText(/Reveal Answer/i).closest('.fixed');
    expect(modalRoot).toHaveClass('font-roboto');
    expect(modalRoot).toHaveClass('font-bold');
    expect(modalRoot).toHaveClass('inset-0');
  });

  test('3) Reveal Answer Logic: Buttons locked until reveal', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // Open a question
    const qBtn = screen.getAllByText('100')[0];
    fireEvent.click(qBtn);
    
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    
    // Buttons should NOT be visible yet (only Reveal Answer button is shown initially in current UI structure)
    expect(screen.queryByText(/Award/i)).not.toBeInTheDocument();
    
    // Space to reveal
    fireEvent.keyDown(window, { code: 'Space' });
    
    // Buttons should now be visible
    await waitFor(() => screen.getByText(/Award \(ENTER\)/i));
    expect(screen.getByText(/Award \(ENTER\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Steal \(S\)/i)).toBeInTheDocument();
  });

  test('4) Arrow Shortcuts: Player Selection works', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    fireEvent.keyDown(window, { code: 'ArrowDown', key: 'ArrowDown' });
    expect(soundService.playSelect).toHaveBeenCalled();
  });
});