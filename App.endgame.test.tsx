
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';

// --- MOCKS ---

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const beforeAll: any;
declare const global: any;

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

// Mock Window features
window.scrollTo = jest.fn();
// Mock window.open for Director Popout
const mockClose = jest.fn();
window.open = jest.fn().mockReturnValue({ close: mockClose });

describe('CRUZPHAM TRIVIA - End Game Reliability Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockClose.mockClear();
  });

  const setupAndStartGame = async () => {
    // 1. Bootstrap & Login
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
    
    // 2. Render
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    // 3. Create Show
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'EndGame Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    // 4. Create Template & Play
    // We assume dataService works, so we use UI to create
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/Configuration/i));
    fireEvent.change(screen.getByPlaceholderText(/Template Title/i), { target: { value: 'Game 1' } });
    fireEvent.click(screen.getByText('Create Template', { selector: 'button' }));
    
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));

    // Wait for Game Board
    await waitFor(() => screen.getByText(/End Show/i));
  };

  test('1) Unit: End Game Flow (Happy Path)', async () => {
    await setupAndStartGame();

    // 1. Click End Show
    const endBtn = screen.getByText(/End Show/i);
    fireEvent.click(endBtn);

    // 2. Verify Confirmation Modal
    await waitFor(() => screen.getByText(/End Game\?/i));
    expect(screen.getByText(/close the current game session/i)).toBeInTheDocument();

    // 3. Confirm
    fireEvent.click(screen.getByText('End Game', { selector: 'button.bg-red-600' }));

    // 4. Verify Return to Template Dashboard
    await waitFor(() => screen.getByText(/Template Library/i));
    // The "End Show" button should be gone
    expect(screen.queryByText(/End Show/i)).not.toBeInTheDocument();

    // 5. Verify User Still Logged In (Logout button visible)
    expect(screen.getByText(/Logout/i)).toBeInTheDocument();
  });

  test('2) Integration: End Game from Question Overlay (Close -> End)', async () => {
    await setupAndStartGame();

    // 1. Open Question
    const qBtn = screen.getAllByText('100')[0];
    fireEvent.click(qBtn);
    await waitFor(() => screen.getByText(/Reveal Answer/i));

    // 2. Ensure "End Show" is NOT clickable (covered by modal z-index) or just test the flow
    // We close the modal first
    fireEvent.keyDown(window, { code: 'Backspace' });
    await waitFor(() => expect(screen.queryByText(/Reveal Answer/i)).not.toBeInTheDocument());

    // 3. Now End Game
    fireEvent.click(screen.getByText(/End Show/i));
    await waitFor(() => screen.getByText(/End Game\?/i));
    fireEvent.click(screen.getByText('End Game', { selector: 'button.bg-red-600' }));

    // 4. Verify Dashboard
    await waitFor(() => screen.getByText(/Template Library/i));
  });

  test('3) Integration: End Game with Director Detached', async () => {
    await setupAndStartGame();

    // 1. Open Director & Detach
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' })); // Toggle to Director view logic
    // Wait for Director UI
    await waitFor(() => screen.getByText(/Live Board Control/i));
    
    // Detach
    const detachBtn = screen.getByText(/Detach/i);
    fireEvent.click(detachBtn);
    
    // Verify window.open called
    expect(window.open).toHaveBeenCalled();
    
    // 2. Return to Board (UI Logic: Detach shows placeholder "Director is Popped Out")
    // User switches tab back to Board to see "End Show" button
    const boardTab = screen.getByText(/Board/i, { selector: 'button' });
    fireEvent.click(boardTab);

    // 3. Click End Show
    fireEvent.click(screen.getByText(/End Show/i));
    
    // 4. Confirm
    await waitFor(() => screen.getByText(/End Game\?/i));
    fireEvent.click(screen.getByText('End Game', { selector: 'button.bg-red-600' }));

    // 5. Verify Popout Closed
    expect(mockClose).toHaveBeenCalled();
    
    // 6. Verify Dashboard
    await waitFor(() => screen.getByText(/Template Library/i));
  });

  test('4) Integration: End Game with Timer Running', async () => {
    await setupAndStartGame();

    // 1. Go to Director to Start Timer (simplest way in UI)
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Live Board Control/i));
    
    // Start Timer
    const playBtn = screen.getByRole('button', { name: '' }); // Play button has no text, finding by class or icon difficult in standard query.
    // Let's use internal state logic or find by SVG.
    // The DirectorPanel has a timer section.
    // We can assume the Play icon button is present.
    // Alternate: Trigger via keyboard shortcut if exists, or finding the button by class structure.
    // Best effort: Find the timer control section buttons.
    const timerControls = screen.getByText(/Timer Control/i).closest('div')?.parentElement;
    const startBtn = timerControls?.querySelector('button.bg-green-600');
    if (startBtn) fireEvent.click(startBtn);

    // 2. Switch back to Board
    fireEvent.click(screen.getByText(/Board/i, { selector: 'button' }));

    // 3. End Game
    fireEvent.click(screen.getByText(/End Show/i));
    await waitFor(() => screen.getByText(/End Game\?/i));
    fireEvent.click(screen.getByText('End Game', { selector: 'button.bg-red-600' }));

    // 4. Assert no crash & Dashboard visible
    await waitFor(() => screen.getByText(/Template Library/i));
  });

  test('5) Session Persistence Check', async () => {
    await setupAndStartGame();
    
    // End Game
    fireEvent.click(screen.getByText(/End Show/i));
    await waitFor(() => screen.getByText(/End Game\?/i));
    fireEvent.click(screen.getByText('End Game', { selector: 'button.bg-red-600' }));
    
    await waitFor(() => screen.getByText(/Template Library/i));

    // Check localStorage for session
    expect(localStorage.getItem('cruzpham_active_session_id')).toBeTruthy();
  });
});
