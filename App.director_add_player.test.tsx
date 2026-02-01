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

describe('Director Panel: Add Player Feature', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const setupAndStartGame = async (playerCount = 4) => {
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
    render(<App />);
    
    // Create Show
    await waitFor(() => screen.getByText(/Select Production/i));
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Add Player Test' } });
    fireEvent.click(screen.getByText(/Create/i));
    
    // Create Template
    await waitFor(() => screen.getByText(/Template Library/i));
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Add Game' } });
    
    // Adjust player count if needed (default is 4)
    // Rows and columns logic...
    
    fireEvent.click(screen.getByText('Start Building'));
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('Director can add a new player successfully', async () => {
    await setupAndStartGame(2); // Start with some players

    // 1. Open Director & Players Tab
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Players/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // 2. Click Add Player
    const addBtn = screen.getByText(/Add Player/i);
    fireEvent.click(addBtn);

    // 3. Fill Name
    const input = screen.getByPlaceholderText(/PLAYER NAME/i);
    fireEvent.change(input, { target: { value: 'New Contestant' } });
    
    // 4. Submit
    const confirmBtn = screen.getByRole('button', { name: /check/i }); // Using icon name or better selector
    fireEvent.click(confirmBtn);

    // 5. Verify UI
    await waitFor(() => {
        expect(screen.getByDisplayValue('New Contestant')).toBeInTheDocument();
    });

    // 6. Verify Scoreboard
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));
    await waitFor(() => {
        expect(screen.getByText('New Contestant')).toBeInTheDocument();
    });
  });

  test('Director cannot add more than 8 players', async () => {
    // Start with 7 players to quickly reach limit
    // (Simulated by starting game and adding manually)
    await setupAndStartGame();
    
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Players/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // Add until 8
    const addPlayerToLimit = async (name: string) => {
        fireEvent.click(screen.getByText(/Add Player/i));
        fireEvent.change(screen.getByPlaceholderText(/PLAYER NAME/i), { target: { value: name } });
        fireEvent.click(screen.getByRole('button', { name: /check/i }));
        await waitFor(() => expect(screen.queryByPlaceholderText(/PLAYER NAME/i)).not.toBeInTheDocument());
    };

    // Assuming 4 default players from setupAndStartGame
    await addPlayerToLimit('P5');
    await addPlayerToLimit('P6');
    await addPlayerToLimit('P7');
    await addPlayerToLimit('P8');

    // Button should be disabled now
    const addBtn = screen.getByText(/Add Player/i);
    expect(addBtn).toBeDisabled();
  });

  test('Adding player handles duplicate names with auto-suffix', async () => {
    await setupAndStartGame();

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));

    // Player 1 already exists
    fireEvent.click(screen.getByText(/Add Player/i));
    fireEvent.change(screen.getByPlaceholderText(/PLAYER NAME/i), { target: { value: 'Player 1' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    // Should result in "Player 1 2"
    await waitFor(() => {
        expect(screen.getByDisplayValue('Player 1 2')).toBeInTheDocument();
    });
  });
});