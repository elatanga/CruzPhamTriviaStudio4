
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

// --- TYPE DECLARATIONS ---
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

// --- MOCKS ---
jest.mock('./services/logger', () => ({
  logger: { 
    info: jest.fn(), 
    error: jest.fn(), 
    warn: jest.fn(), 
    getCorrelationId: () => 'test-id', 
    maskPII: (v: any) => v 
  }
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
  generateSingleQuestion: jest.fn().mockResolvedValue({ text: 'AI Q', answer: 'AI A' }),
  generateCategoryQuestions: jest.fn().mockResolvedValue([])
}));

// Mock window interactions
window.scrollTo = jest.fn();
window.confirm = jest.fn(() => true);

describe('Director Panel: Delete Player (Fix Verification)', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Auth setup
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const setupActiveGame = async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Delete Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    // Create Template with 2 players
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    fireEvent.change(screen.getByPlaceholderText(/Show or Game Topic/i), { target: { value: 'Delete Game' } });
    
    // Use Start Building to initialize with default players
    fireEvent.click(screen.getByText('Start Building'));
    await waitFor(() => screen.getByText(/Save Template/i));
    fireEvent.click(screen.getByText(/Save Template/i));
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('A) UNIT: Delete Player filters list and updates canonical state', async () => {
    await setupActiveGame();

    // 1. Enter Director -> Players
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // 2. Identify Player 1
    const p1Input = screen.getByDisplayValue('PLAYER 1');
    const deleteBtn = p1Input.closest('tr')?.querySelector('.lucide-trash2')?.closest('button');
    
    // 3. Delete Player 1
    fireEvent.click(deleteBtn!);

    // 4. Assert local storage / canonical state updated
    const state = JSON.parse(localStorage.getItem('cruzpham_gamestate') || '{}');
    // Default is 4 players
    expect(state.players).toHaveLength(3);
    expect(state.players.find((p: any) => p.name === 'PLAYER 1')).toBeUndefined();
  });

  test('B) UI SYNC: Director delete instantly removes player from list and scoreboard', async () => {
    await setupActiveGame();

    // Verify Scoreboard initially shows players
    expect(screen.getByText('PLAYER 1')).toBeInTheDocument();

    // Enter Director -> Players
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // Delete Player 1
    const p1Input = screen.getByDisplayValue('PLAYER 1');
    const deleteBtn = p1Input.closest('tr')?.querySelector('.lucide-trash2')?.closest('button');
    fireEvent.click(deleteBtn!);

    // Verify Director List updated
    await waitFor(() => {
        expect(screen.queryByDisplayValue('PLAYER 1')).not.toBeInTheDocument();
    });

    // Close Director and Verify Scoreboard
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));
    await waitFor(() => {
        expect(screen.queryByText('PLAYER 1')).not.toBeInTheDocument();
    });
  });

  test('C) SELECTION SAFETY: Deleting active player resets selection safely', async () => {
    await setupActiveGame();

    // Ensure Player 1 is selected
    fireEvent.click(screen.getByText('PLAYER 1'));

    // Open Director -> Players
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // Delete Player 1 (The selected one)
    const p1Input = screen.getByDisplayValue('PLAYER 1');
    const deleteBtn = p1Input.closest('tr')?.querySelector('.lucide-trash2')?.closest('button');
    fireEvent.click(deleteBtn!);

    // Verify state updated selection
    const state = JSON.parse(localStorage.getItem('cruzpham_gamestate') || '{}');
    expect(state.selectedPlayerId).not.toBe(state.players.find((p: any) => p.name === 'PLAYER 1')?.id);
  });
});
