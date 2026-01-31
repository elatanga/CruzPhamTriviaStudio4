
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

// Mock window interactions
window.scrollTo = jest.fn();
window.confirm = jest.fn(() => true);

describe('Wildcard Feature Tests', () => {
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
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Wildcard Test' } });
    fireEvent.click(screen.getByText(/Create/i));
    
    // Create Template
    await waitFor(() => screen.getByText(/Template Library/i));
    fireEvent.click(screen.getByText(/New Template/i));
    
    await waitFor(() => screen.getByText(/Template Title/i));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Wild Game' } });
    fireEvent.click(screen.getByText('Start Building'));
    
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('Director Panel: Wildcard button increments usage correctly', async () => {
    await setupAndStartGame();

    // Open Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Players/i, { selector: 'button' }));
    
    // Switch to Players Tab
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    
    // Find Wildcard Button for Player 1 (assume first row)
    const useBtn = screen.getAllByTitle(/Increment Wildcard Usage/i)[0];
    
    // Initial State: 0/4 used
    expect(screen.getByText('0/4')).toBeInTheDocument();
    
    // 1. Click Use (Increment to 1)
    fireEvent.click(useBtn);
    await waitFor(() => expect(screen.getByText('1/4')).toBeInTheDocument());
    
    // 2. Click Use again (Increment to 2)
    fireEvent.click(useBtn);
    await waitFor(() => expect(screen.getByText('2/4')).toBeInTheDocument());
  });

  test('Director Panel: Limit Enforcement (Max 4)', async () => {
    await setupAndStartGame();
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    
    const useBtn = screen.getAllByTitle(/Increment Wildcard Usage/i)[0];
    
    // Use up to limit
    for (let i = 0; i < 4; i++) {
      fireEvent.click(useBtn);
    }
    
    // Now count should be MAX USED
    await waitFor(() => expect(screen.getByText('MAX 4 USED')).toBeInTheDocument());
    
    // Toggle should be disabled
    expect(useBtn).toBeDisabled();
  });

  test('Scoreboard: Visual Indicators (Star Count + Colors + Name Color Preservation)', async () => {
    await setupAndStartGame();
    
    // 1. Initially normal
    const pName = screen.getByText('Player 1');
    expect(pName).not.toHaveClass('text-red-500'); // Ensure no red text on name
    expect(screen.queryByText('★')).not.toBeInTheDocument();
    
    // 2. Enable Wildcard in Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    const useBtn = screen.getAllByTitle(/Increment Wildcard Usage/i)[0];
    
    // 3. Increment 1 (Orange Star)
    fireEvent.click(useBtn);
    
    // 4. Close Director to check Board
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));
    
    // 5. Assert 1 Star, Orange
    await waitFor(() => expect(screen.getByText('★')).toBeInTheDocument());
    const star1 = screen.getByText('★');
    expect(star1).toHaveStyle('color: #FF8A00');
    
    // Check name color did NOT change
    const pNameAfter1 = screen.getByText('Player 1');
    expect(pNameAfter1).toHaveClass('text-zinc-400'); // Assuming not selected, if selected text-white. Should NOT be red.

    // 6. Go back and increment to 4
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    const useBtn2 = screen.getAllByTitle(/Increment Wildcard Usage/i)[0];
    fireEvent.click(useBtn2); // 2
    fireEvent.click(useBtn2); // 3
    fireEvent.click(useBtn2); // 4
    
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));

    // 7. Assert 4 Stars, Yellow
    await waitFor(() => expect(screen.getByText('★★★★')).toBeInTheDocument());
    const star4 = screen.getByText('★★★★');
    expect(star4).toHaveStyle('color: #FFD400');
  });
});
