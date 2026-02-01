import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { logger } from './services/logger';

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

describe('CARD 3: "Last 4 Plays" Real-Time Logs', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Auth setup to bypass bootstrap and login
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const setupGame = async () => {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/New Show Title/i));
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Logs Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Create Template/i));
    fireEvent.click(screen.getByText(/Create Template/i));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Logs Game' } });
    fireEvent.click(screen.getByText('Start Building'));
    
    // Wait for builder grid
    await waitFor(() => screen.getByText(/Save Template/i));
    fireEvent.click(screen.getByText(/Save Template/i));
    
    // Wait for dashboard and play
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    
    // Wait for Board
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('A) appendPlayEvent ring buffer: only last 4 kept, newest first', async () => {
    await setupGame();

    // Trigger 5 award actions
    for (let i = 1; i <= 5; i++) {
      const tiles = screen.getAllByText('100');
      fireEvent.click(tiles[0]); 
      await waitFor(() => screen.getByText(/Reveal Answer/i));
      fireEvent.click(screen.getByText(/Reveal Answer/i));
      await waitFor(() => screen.getByText(/Award/i));
      fireEvent.click(screen.getByText(/Award/i));
      await waitFor(() => screen.queryByText(/Reveal Answer/i) === null);
    }

    // Go to Stats
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    // Count log entries in the list container
    await waitFor(() => {
      const logItems = document.querySelectorAll('.divide-zinc-900 > div');
      expect(logItems.length).toBe(4);
    });
  });

  test('B) Event shape includes timestamps (atIso, atMs)', async () => {
    await setupGame();
    
    fireEvent.click(screen.getAllByText('100')[0]);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    await waitFor(() => screen.getByText(/Award/i));
    fireEvent.click(screen.getByText(/Award/i));

    await waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('game_play_event', expect.objectContaining({
        atIso: expect.any(String),
        atMs: expect.any(Number),
        action: 'AWARD'
      }));
    });
  });

  test('C) Integration: Award creates correct play log entry UI', async () => {
    await setupGame();
    
    fireEvent.click(screen.getAllByText('100')[0]);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    await waitFor(() => screen.getByText(/Award/i));
    fireEvent.click(screen.getByText(/Award/i));

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('AWARD')).toBeInTheDocument();
      expect(screen.getByText(/Player 1/i)).toBeInTheDocument();
      expect(screen.getByText(/\+100/)).toBeInTheDocument();
    });
  });

  test('D) Integration: Steal creates entry with stealer + victim context', async () => {
    await setupGame();
    
    fireEvent.click(screen.getAllByText('100')[0]);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    await waitFor(() => screen.getByText(/Steal/i));
    fireEvent.click(screen.getByText(/Steal/i));
    
    await waitFor(() => screen.getByText('Player 2'));
    fireEvent.click(screen.getByText('Player 2').closest('button')!);

    await waitFor(() => screen.queryByText(/Reveal Answer/i) === null);
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('STEAL')).toBeInTheDocument();
      expect(screen.getByText(/Player 2/i)).toBeInTheDocument();
      expect(screen.getByText(/\(from Player 1\)/i)).toBeInTheDocument();
    });

    expect(logger.info).toHaveBeenCalledWith('game_play_event', expect.objectContaining({
      action: 'STEAL',
      stealerPlayerName: 'Player 2',
      attemptedPlayerName: 'Player 1'
    }));
  });

  test('E) Integration: Void creates entry and shows context', async () => {
    await setupGame();
    
    fireEvent.click(screen.getAllByText('100')[0]);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    await waitFor(() => screen.getByText(/Void/i));
    fireEvent.click(screen.getByText(/Void/i));

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Stats/i, { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('VOID')).toBeInTheDocument();
      expect(screen.getByText(/tile disabled/i)).toBeInTheDocument();
    });
  });

  test('F) Regression: Logging failure does not block gameplay', async () => {
    await setupGame();

    // Force a failure during timestamp generation
    const spy = jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
        throw new Error('Logger Crash');
    });

    fireEvent.click(screen.getAllByText('100')[0]);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    await waitFor(() => screen.getByText(/Award/i));
    
    // Action should succeed despite logging error
    fireEvent.click(screen.getByText(/Award/i));

    await waitFor(() => {
       expect(screen.getByText('100')).toBeInTheDocument();
       expect(screen.queryByText(/Reveal Answer/i)).not.toBeInTheDocument();
    });

    spy.mockRestore();
  });
});
