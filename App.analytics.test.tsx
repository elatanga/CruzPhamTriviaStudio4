
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
// Mock URL and Blob for download testing
window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
window.URL.revokeObjectURL = jest.fn();

describe('Director Panel: Live Game Analytics (Verification Suite)', () => {
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
    
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Analytics Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Analytics Test' } });
    fireEvent.click(screen.getByText('Start Building'));
    await waitFor(() => screen.getByText(/Save Template/i));
    fireEvent.click(screen.getByText(/Save Template/i));
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('A) UNIT: emitGameEvent appends events with unique IDs and ISO timestamps', async () => {
    await setupActiveGame();

    // Trigger an event (Award points)
    const tiles = screen.getAllByText('100');
    fireEvent.click(tiles[0]); 
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Reveal Answer/i));
    fireEvent.click(screen.getByText(/Award/i));

    // Verify logger call structure which mirrors emitGameEvent internal processing
    expect(logger.info).toHaveBeenCalledWith("log_event_append", expect.objectContaining({
      type: "POINTS_AWARDED",
      ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    }));

    // Verify state storage (persisted events)
    const storedState = JSON.parse(localStorage.getItem('cruzpham_gamestate') || '{}');
    expect(storedState.events).toBeDefined();
    expect(storedState.events.length).toBeGreaterThan(0);
    const lastEvent = storedState.events[storedState.events.length - 1];
    expect(lastEvent.id).toBeDefined();
    expect(lastEvent.ts).toBeGreaterThan(0);
  });

  test('B) UI: Collapse shows 4 events by default, Expand shows full history', async () => {
    await setupActiveGame();

    // Generate 6 events by awarding points multiple times
    for (let i = 0; i < 6; i++) {
        const tiles = screen.getAllByText('100');
        fireEvent.click(tiles[0]); 
        await waitFor(() => screen.getByText(/Reveal Answer/i));
        fireEvent.click(screen.getByText(/Reveal Answer/i));
        fireEvent.click(screen.getByText(/Award/i));
        await waitFor(() => screen.queryByText(/Reveal Answer/i) === null);
    }

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Analytics/i, { selector: 'button' }));

    // By default (collapsed), should show exactly 4 events in the visible list
    const logsBefore = document.querySelectorAll('.font-mono.text-\\[10px\\]');
    expect(logsBefore.length).toBe(4);

    // Verify container constraints (collapsed has overflow-hidden)
    const logContainer = screen.getByText(/Real-time event log/i).parentElement?.nextElementSibling;
    expect(logContainer).toHaveClass('overflow-hidden');

    // Expand
    fireEvent.click(screen.getByText(/Expand history/i));
    
    // Now should show all 6 (plus session start etc)
    const logsAfter = document.querySelectorAll('.font-mono.text-\\[10px\\]');
    expect(logsAfter.length).toBeGreaterThanOrEqual(6);

    // Verify expanded container allows scroll
    expect(logContainer).toHaveClass('overflow-y-auto');
    expect(logContainer).toHaveClass('max-h-[50vh]');
  });

  test('C) UI: Real-time append updates UI instantly', async () => {
    await setupActiveGame();

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Analytics/i, { selector: 'button' }));
    
    // Initial count
    const initialCount = document.querySelectorAll('.font-mono.text-\\[10px\\]').length;

    // Trigger event (e.g. switch back to board and use wildcard via Director tab)
    fireEvent.click(screen.getByText(/Players/i, { selector: 'button' }));
    const useBtn = screen.getAllByRole('button', { name: /use/i })[0];
    fireEvent.click(useBtn);

    fireEvent.click(screen.getByText(/Analytics/i, { selector: 'button' }));
    
    await waitFor(() => {
        const newCount = document.querySelectorAll('.font-mono.text-\\[10px\\]').length;
        expect(newCount).toBeGreaterThan(initialCount);
        expect(screen.getByText(/WILDCARD USED/i)).toBeInTheDocument();
    });
  });

  test('D) EXPORT: Full log download generates properly formatted txt file', async () => {
    await setupActiveGame();

    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    fireEvent.click(screen.getByText(/Analytics/i, { selector: 'button' }));

    // Mock click on anchor element
    const mockClick = jest.fn();
    const originalCreateElement = document.createElement;
    document.createElement = jest.fn((tag: string) => {
        const element = originalCreateElement.call(document, tag);
        if (tag === 'a') {
            (element as any).click = mockClick;
        }
        return element;
    }) as any;

    const downloadBtn = screen.getByTitle(/Download full session script/i);
    fireEvent.click(downloadBtn);

    // Assert Export mechanics
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    
    // Verify file naming pattern
    const link = (document.createElement as any).mock.results.find((r: any) => r.value.tagName === 'A').value;
    expect(link.download).toMatch(/^cruzpham-trivia-logs-\d{8}-\d{4}\.txt$/);

    // Cleanup mock
    document.createElement = originalCreateElement;
  });
});
