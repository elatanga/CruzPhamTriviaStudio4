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

describe('Director Stats Dashboard', () => {
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
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Stats Test' } });
    fireEvent.click(screen.getByText(/Create/i));
    
    // Create Template
    await waitFor(() => screen.getByText(/Template Library/i));
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Stats Game' } });
    fireEvent.click(screen.getByText('Start Building'));
    
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('Stats Dashboard displays correct summary metrics', async () => {
    await setupAndStartGame();

    // 1. Open Director & Stats Tab
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Stats/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    // 2. Check Metrics
    // Default template: 4 cats x 5 rows = 20 tiles
    await waitFor(() => expect(screen.getByText('20')).toBeInTheDocument());
    expect(screen.getByText('TILES')).toBeInTheDocument();
    
    // Remaining should be 20 initially
    expect(screen.getByText('20', { selector: '.text-green-500' })).toBeDefined(); // Answered: 0
    expect(screen.getByText('0', { selector: '.text-green-500' })).toBeInTheDocument();
    expect(screen.getByText('0', { selector: '.text-red-500' })).toBeInTheDocument();
  });

  test('Stats Dashboard updates in real-time when tiles are played', async () => {
    await setupAndStartGame();

    // 1. Play a tile
    fireEvent.click(screen.getAllByText('100')[0]);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    await waitFor(() => screen.getByText(/Award/i));
    fireEvent.click(screen.getByText(/Award/i));

    // 2. Open Director & Stats Tab
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    // 3. Verify played count is 1
    await waitFor(() => {
        expect(screen.getByText('1', { selector: '.text-green-500' })).toBeInTheDocument();
        expect(screen.getByText('19', { selector: '.text-zinc-300' })).toBeInTheDocument(); // Remaining
    });
  });

  test('Privacy: Stats board does not reveal specific Double-Or-Nothing tile locations', async () => {
    await setupAndStartGame();

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    // Should show count (default 1 per cat = 4)
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    
    // Ensure no grid or list reveals which cat/row has it
    // Check that we didn't add "Tile A1 is double" text
    const bodyText = document.body.textContent || '';
    expect(bodyText).not.toContain('A1'); // Simple check against coordinate-style leak
  });

  test('Current State panel shows active question info', async () => {
    await setupAndStartGame();

    // 1. Open a question
    const qBtn = screen.getAllByText('100')[0];
    fireEvent.click(qBtn);
    await waitFor(() => screen.getByText(/Reveal Answer/i));

    // 2. Open Director Stats
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    // 3. Verify Active info
    await waitFor(() => {
      expect(screen.getByText(/ACTIVE QUESTION/i)).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });
});