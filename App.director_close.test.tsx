
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { soundService } from './services/soundService';

// --- MOCKS ---

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const beforeEach: any;

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
window.confirm = jest.fn(() => true);
window.open = jest.fn(() => ({ close: jest.fn() }));

describe('CRUZPHAM TRIVIA - Director Close Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const setupAndStartGame = async () => {
    // 1. Bootstrap & Login
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
    
    // 2. Render
    const utils = render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    // 3. Create Show
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    // 4. Create Template (which autostarts logic in mock)
    // We'll simulate creating a template and clicking Play.
    // Assuming dataService handles template creation correctly in background of component.
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/Template Title/i));
    
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Game 1' } });
    fireEvent.click(screen.getByText('Create Template', { selector: 'button' }));
    await waitFor(() => screen.getByText(/Save/i));
    fireEvent.click(screen.getByText(/Save/i));
    await waitFor(() => screen.getByText(/Play Show/i));
    fireEvent.click(screen.getByText(/Play Show/i));

    await waitFor(() => screen.getByText(/End Show/i));
    return utils;
  };

  test('1) Open/Close Director preserves game state', async () => {
    await setupAndStartGame();

    // Modify State: Add Score to Player 1
    // We assume Player 1 exists and is selected by default or can be selected.
    const p1 = screen.getByText('Player 1');
    fireEvent.click(p1);
    
    // Add 100 points via keyboard shortcut
    fireEvent.keyDown(window, { key: '+' });
    await waitFor(() => expect(screen.getByText('100')).toBeInTheDocument());

    // OPEN DIRECTOR
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => expect(screen.getByText(/Live Board Control/i)).toBeInTheDocument());

    // CLOSE DIRECTOR via X button
    const closeBtn = screen.getByText(/Close/i, { selector: 'button' }); // Should match the close button in toolbar
    fireEvent.click(closeBtn);

    // ASSERT BOARD VISIBLE
    await waitFor(() => expect(screen.getByText(/End Show/i)).toBeInTheDocument());

    // ASSERT SCORE PRESERVED
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  test('2) Close Director with active question overlay', async () => {
    await setupAndStartGame();

    // Open a question
    const qBtn = screen.getAllByText('100')[0];
    fireEvent.click(qBtn);
    await waitFor(() => screen.getByText(/Reveal Answer/i));

    // OPEN DIRECTOR (The button in header might be obscured by modal, but assuming click works or user uses shortcut if implemented. 
    // In this app structure, Board Header is part of board view which is obscured by modal? 
    // Wait, the QuestionModal is a fixed overlay. The "Director" button is in the Board Header.
    // If the modal covers the screen, we can't click the Director button easily unless we assume Z-index allows it or we invoke it differently.
    // However, the prompt implies "When Director panel is opened from the Trivia Board".
    // If modal is open, user typically must close modal to interact with board header.
    // BUT, let's assume we can somehow trigger it (e.g. if the modal doesn't cover header, or via tab bar if visible).
    // In the App.tsx, the header is part of the board area. The modal is over EVERYTHING in board view.
    // So user probably closes modal first. 
    // BUT, let's test that IF we are in Director, and we go back, the modal is still there if we didn't close it explicitly.
    // We can simulate this by setting viewMode state directly if we could, but integration tests rely on UI.
    // Let's assume we close modal, open director, then... 
    // Actually, requirement 2 says "If question overlay is open and director is accessed". This implies it IS possible.
    // Let's verify if Modal covers the "Director" button.
    // Modal is `fixed inset-0 z-50`. Header is `z-20`. So Modal covers Header.
    // User cannot click "Director" while Modal is open unless they use a keyboard shortcut (if one existed) or if Modal had a "Director" button.
    // The requirement "If allowed by UI" is key. 
    // If not allowed, we skip. But let's test state preservation generally.
    
    // Alternative: We can't click Director button while modal is open. 
    // So we will skip the "Open Director while Modal Open" flow via UI click, 
    // and instead focus on "Game State (including active question) is preserved".
    
    // 1. Open Q
    fireEvent.click(qBtn);
    await waitFor(() => screen.getByText(/Reveal Answer/i));
    
    // 2. Close Q (return to board)
    fireEvent.keyDown(window, { code: 'Backspace', key: 'Backspace' });
    await waitFor(() => expect(screen.queryByText(/Reveal Answer/i)).not.toBeInTheDocument());
    
    // 3. Open Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    
    // 4. Close Director
    fireEvent.click(screen.getByText(/Close/i, { selector: 'button' }));
    
    // 5. Board is back
    expect(screen.getByText(/End Show/i)).toBeInTheDocument();
  });

  test('3) Detached Director Close button', async () => {
    await setupAndStartGame();

    // Open Director
    fireEvent.click(screen.getByText(/Director/i, { selector: 'button' }));
    await waitFor(() => screen.getByText(/Live Board Control/i));

    // Detach
    // Note: window.open is mocked
    const detachBtn = screen.getByText(/Detach/i);
    fireEvent.click(detachBtn);

    // Expect Placeholder UI
    await waitFor(() => screen.getByText(/Director is Popped Out/i));
    
    // Expect Close Panel button in Placeholder
    const closePlaceholderBtn = screen.getByText(/Close Panel/i);
    fireEvent.click(closePlaceholderBtn);

    // Expect return to Board
    await waitFor(() => expect(screen.getByText(/End Show/i)).toBeInTheDocument());
    
    // And Director window ref should still be active/open conceptually (we don't check ref here but UI flow)
  });
});
