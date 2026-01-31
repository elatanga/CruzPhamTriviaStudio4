
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

// Mock sound service
jest.mock('./services/soundService', () => ({
  soundService: {
    playClick: jest.fn(),
    playSelect: jest.fn(),
    playReveal: jest.fn(),
    playAward: jest.fn(),
    playSteal: jest.fn(),
    playVoid: jest.fn(),
    playDoubleOrNothing: jest.fn(),
    playTimerTick: jest.fn(),
    playTimerAlarm: jest.fn(),
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

window.scrollTo = jest.fn();
window.confirm = jest.fn(() => true);

describe('Wildcard Reset Feature Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const setupAndStartGame = async () => {
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
    render(<App />);
    
    // Create Show
    await waitFor(() => screen.getByText(/Select Production/i));
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Wildcard Reset Test' } });
    fireEvent.click(screen.getByText(/Create/i));
    
    // Create Template
    await waitFor(() => screen.getByText(/Template Library/i));
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Reset Game' } });
    fireEvent.click(screen.getByText('Start Building'));
    
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('Director can reset individual player wildcard usage', async () => {
    await setupAndStartGame();

    // 1. Open Director & Players Tab
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Players/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // 2. Add some wildcard usage (Player 1)
    const useBtn = screen.getAllByTitle(/Increment Wildcard Usage/i)[0];
    fireEvent.click(useBtn); // 1
    fireEvent.click(useBtn); // 2
    
    await waitFor(() => expect(screen.getByText('2/4')).toBeInTheDocument());

    // 3. Click Reset for Player 1
    const resetBtn = screen.getAllByTitle(/Reset Wildcards/i)[0];
    fireEvent.click(resetBtn);

    // 4. Verify usage resets to 0/4
    await waitFor(() => expect(screen.getByText('0/4')).toBeInTheDocument());
    
    // 5. Verify reset button becomes disabled
    expect(resetBtn).toBeDisabled();
  });

  test('Director can reset ALL wildcards with confirmation', async () => {
    await setupAndStartGame();

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Players/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // 1. Add usage to multiple players
    const useBtns = screen.getAllByTitle(/Increment Wildcard Usage/i);
    fireEvent.click(useBtns[0]); // Player 1: 1/4
    fireEvent.click(useBtns[1]); // Player 2: 1/4
    fireEvent.click(useBtns[1]); // Player 2: 2/4

    await waitFor(() => expect(screen.getByText('2/4')).toBeInTheDocument());

    // 2. Click Reset All (First click = confirm prompt)
    const resetAllBtn = screen.getByText(/Reset All Wildcards/i);
    fireEvent.click(resetAllBtn);
    
    await waitFor(() => expect(screen.getByText(/Click to Confirm Reset All/i)).toBeInTheDocument());

    // 3. Click Confirmation
    fireEvent.click(screen.getByText(/Click to Confirm/i));

    // 4. Verify all counts reset to 0/4
    await waitFor(() => {
       const counts = screen.getAllByText('0/4');
       // Assuming 4 players default, all should be 0
       expect(counts.length).toBeGreaterThanOrEqual(4); 
    });
  });

  test('Reset works correctly on Scoreboard display (clears stars)', async () => {
    await setupAndStartGame();

    // 1. Add stars via Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    const useBtn = screen.getAllByTitle(/Increment Wildcard Usage/i)[0];
    fireEvent.click(useBtn);
    
    // 2. Check Board for stars
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));
    await waitFor(() => expect(screen.getByText('★')).toBeInTheDocument());

    // 3. Reset via Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    const resetBtn = screen.getAllByTitle(/Reset Wildcards/i)[0];
    fireEvent.click(resetBtn);

    // 4. Check Board for NO stars
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));
    await waitFor(() => expect(screen.queryByText('★')).not.toBeInTheDocument());
  });
});
