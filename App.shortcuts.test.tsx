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

describe('CRUZPHAM TRIVIA - Shortcuts & Logic Tests', () => {
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

  test('1) Director Icon/Tab: Switches view without data loss', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // Verify on Board
    expect(screen.getByText(/End Show/i)).toBeInTheDocument();

    // Click Director (Embedded)
    const directorBtn = screen.getByText(/Director/i, { selector: 'button' }); // The tab or the header button
    fireEvent.click(directorBtn);

    // Check Director View
    await waitFor(() => expect(screen.getByText(/Live Board Control/i)).toBeInTheDocument());

    // Switch back to Board
    fireEvent.click(screen.getByText(/Board/i, { selector: 'button' }));
    await waitFor(() => expect(screen.getByText(/End Show/i)).toBeInTheDocument());

    // Verify Players still exist (Game state preserved)
    expect(screen.getByText('Player 1')).toBeInTheDocument();
  });

  test('2) Arrow Shortcuts: Player Selection & Focus Guards', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // Initial State: Player 1 should be selected (based on default logic)
    // We check via Scoreboard class or just check logic update
    // Let's assume Player 1 is first.
    
    // Press ArrowDown -> Should select Player 2
    fireEvent.keyDown(window, { code: 'ArrowDown', key: 'ArrowDown' });
    // Need a way to verify selection. The scoreboard highlights selected player.
    // We can check if soundService.playSelect was called
    expect(soundService.playSelect).toHaveBeenCalled();

    // Test Wrap Around
    // Default 4 players. 
    // Down (P2), Down (P3), Down (P4), Down (P1)
    (soundService.playSelect as any).mockClear();
    fireEvent.keyDown(window, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyDown(window, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyDown(window, { code: 'ArrowDown', key: 'ArrowDown' }); 
    expect(soundService.playSelect).toHaveBeenCalledTimes(3);

    // Test Focus Guard
    const input = screen.getByPlaceholderText('ADD NAME');
    input.focus();
    (soundService.playSelect as any).mockClear();
    
    fireEvent.keyDown(input, { code: 'ArrowDown', key: 'ArrowDown' });
    // Should NOT trigger selection change
    expect(soundService.playSelect).not.toHaveBeenCalled();
    
    input.blur();
  });

  test('3) Void Flow: Logic & UI Updates', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // 1. Open a Question (Points: 100)
    const qBtn = screen.getByText('100', { selector: 'button' });
    fireEvent.click(qBtn);
    
    // Verify Modal Open
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    
    // 2. Pre-reveal: Check Void button presence (Should be hidden or effectively strictly guarded)
    // The UI currently renders Void button only in Phase 2 (post-reveal) in the updated code.
    expect(screen.queryByText(/Void \(ESC\)/i)).not.toBeInTheDocument();

    // 3. Reveal
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    
    // 4. Post-reveal: Void button visible
    await waitFor(() => screen.getByText(/Void \(ESC\)/i));
    
    // 5. Click Void -> Cancel Confirm
    mockConfirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByText(/Void \(ESC\)/i));
    // Should stay open
    expect(screen.getByText(/Void \(ESC\)/i)).toBeInTheDocument();
    
    // 6. Click Void -> Confirm Yes
    mockConfirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByText(/Void \(ESC\)/i));
    
    // 7. Modal Closed?
    await waitFor(() => expect(screen.queryByText(/Void \(ESC\)/i)).not.toBeInTheDocument());
    
    // 8. Board Update: Tile should be VOID
    expect(screen.getByText(/VOID/i)).toBeInTheDocument();
    
    // 9. Verify clicking voided tile does nothing (or disabled)
    const voidTile = screen.getByText(/VOID/i).closest('button');
    expect(voidTile).toBeDisabled();
  });

  test('4) Regression: Existing Shortcuts & Score Adjust', async () => {
    await setupAuthenticatedApp();
    await createAndPlayShow();

    // --- SCORE ADJUST ---
    // Select Player 1 (Ensure selection)
    fireEvent.click(screen.getByText('Player 1')); 
    
    // Press '+' key
    fireEvent.keyDown(window, { key: '+' });
    expect(soundService.playClick).toHaveBeenCalled();
    // Verify Score text updates (0 -> 100)
    await waitFor(() => expect(screen.getByText('100')).toBeInTheDocument());
    
    // Press '-' key
    fireEvent.keyDown(window, { key: '-' });
    await waitFor(() => expect(screen.getAllByText('0').length).toBeGreaterThan(0));

    // --- GAME SHORTCUTS ---
    // Open Question
    const qBtn = screen.getAllByText('200')[0]; // 200 pts
    fireEvent.click(qBtn);
    
    // SPACE to Reveal
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(soundService.playReveal).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Award \(ENTER\)/i)).toBeInTheDocument());
    
    // S to Steal (UI Check)
    fireEvent.keyDown(window, { code: 'KeyS', key: 's' });
    expect(soundService.playSteal).toHaveBeenCalled();
    expect(screen.getByText(/Select Player to Steal/i)).toBeInTheDocument();
    
    // BACKSPACE to Return (from steal menu -> closes steal menu)
    fireEvent.keyDown(window, { code: 'Backspace', key: 'Backspace' });
    expect(screen.queryByText(/Select Player to Steal/i)).not.toBeInTheDocument();
    
    // ENTER to Award
    fireEvent.keyDown(window, { code: 'Enter', key: 'Enter' });
    expect(soundService.playAward).toHaveBeenCalled();
    
    // Verify modal closed (returned to board)
    await waitFor(() => expect(screen.queryByText(/Award \(ENTER\)/i)).not.toBeInTheDocument());
  });
});