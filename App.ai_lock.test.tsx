
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import * as geminiService from './services/geminiService';

// --- TYPE DECLARATIONS ---
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterAll: any;

// --- MOCKS ---

jest.mock('./services/logger', () => ({
  logger: { 
    info: jest.fn(), 
    error: jest.fn(), 
    warn: jest.fn(), 
    getCorrelationId: () => 'test-id', 
    maskPII: (v:any) => v 
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

const mockGenerateTriviaGame = jest.spyOn(geminiService, 'generateTriviaGame');

describe('AI Generation Locks & Atomic Updates', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const setupBuilder = async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'AI Lock Test' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'AI Test Board' } });
  };

  test('UI Locks user mutations while allowing internal AI apply', async () => {
    await setupBuilder();
    
    let resolveGen: (value: any) => void;
    const genPromise = new Promise((resolve) => { resolveGen = resolve; });
    mockGenerateTriviaGame.mockReturnValue(genPromise);

    fireEvent.click(screen.getByText(/AI Generate/i));
    fireEvent.change(screen.getByPlaceholderText(/Topic for board.../i), { target: { value: 'Science' } });
    fireEvent.click(screen.getByRole('button', { name: /wand2/i }));

    await waitFor(() => expect(screen.getByText(/AI Studio Working/i)).toBeInTheDocument());
    
    // Fix: Cast HTMLElement to HTMLInputElement to access .value property
    const titleInput = screen.getByPlaceholderText(/Template Title/i) as HTMLInputElement;
    expect(titleInput).toBeDisabled();
    
    fireEvent.change(titleInput, { target: { value: 'User Hack' } });
    expect(titleInput.value).toBe('Science'); 

    const mockResult = [
      { id: 'cat-1', title: 'Physics', questions: [{ id: 'q-1', text: 'Gravity?', answer: 'Yes', points: 100, isRevealed: false, isAnswered: false, isDoubleOrNothing: false }] }
    ];
    
    await act(async () => {
      resolveGen!(mockResult);
    });

    await waitFor(() => expect(screen.queryByText(/AI Studio Working/i)).not.toBeInTheDocument());
    expect(screen.getByText('Physics')).toBeInTheDocument();
    expect(titleInput).not.toBeDisabled();
  });

  test('Stale generation results are discarded via currentGenIdRef', async () => {
    await setupBuilder();
    
    let resolveA: (value: any) => void;
    const promiseA = new Promise((resolve) => { resolveA = resolve; });
    
    let resolveB: (value: any) => void;
    const promiseB = new Promise((resolve) => { resolveB = resolve; });

    mockGenerateTriviaGame.mockReturnValueOnce(promiseA);
    fireEvent.click(screen.getByText(/AI Generate/i));
    fireEvent.change(screen.getByPlaceholderText(/Topic for board.../i), { target: { value: 'Biology' } });
    fireEvent.click(screen.getByRole('button', { name: /wand2/i }));
    
    await waitFor(() => expect(screen.getByText(/AI Studio Working/i)).toBeInTheDocument());

    mockGenerateTriviaGame.mockReturnValueOnce(promiseB);
    
    await act(async () => {
      resolveA!([{ id: 'old', title: 'Old Cat', questions: [] }]);
    });

    expect(screen.queryByText('Old Cat')).not.toBeInTheDocument();
    
    await act(async () => {
      resolveB!([{ id: 'new', title: 'New Cat', questions: [] }]);
    });
    
    await waitFor(() => expect(screen.getByText('New Cat')).toBeInTheDocument());
  });

  test('Parser robustness: extracts JSON from markdown', async () => {
    await setupBuilder();
    
    const markdownResponse = "Here is your JSON: \n```json\n[{\n  \"categoryName\": \"Markdown Cat\",\n  \"questions\": []\n}]\n```";
    mockGenerateTriviaGame.mockResolvedValueOnce([
        { id: 'cat-md', title: 'Markdown Cat', questions: [] }
    ]);

    fireEvent.click(screen.getByText(/AI Generate/i));
    fireEvent.change(screen.getByPlaceholderText(/Topic for board.../i), { target: { value: 'Markdown' } });
    fireEvent.click(screen.getByRole('button', { name: /wand2/i }));

    await waitFor(() => expect(screen.getByText('Markdown Cat')).toBeInTheDocument());
    expect(screen.queryByText(/AI Studio Working/i)).not.toBeInTheDocument();
  });

  test('Rollback on failure restores snapshot', async () => {
    await setupBuilder();
    
    fireEvent.click(screen.getByText('Start Building'));
    await waitFor(() => screen.getByText('Category 1'));
    
    let rejectGen: (error: any) => void;
    const genPromise = new Promise((_, reject) => { rejectGen = reject; });
    mockGenerateTriviaGame.mockReturnValue(genPromise);
    
    fireEvent.click(screen.getByText(/AI Generate/i));
    fireEvent.change(screen.getByPlaceholderText(/Topic for board.../i), { target: { value: 'Failure' } });
    fireEvent.click(screen.getByRole('button', { name: /wand2/i }));
    
    await waitFor(() => expect(screen.getByText(/AI Studio Working/i)).toBeInTheDocument());
    
    await act(async () => {
      rejectGen!(new Error('AI Crashed'));
    });
    
    await waitFor(() => expect(screen.queryByText(/AI Studio Working/i)).not.toBeInTheDocument());
    expect(screen.getByText('Category 1')).toBeInTheDocument();
  });
});
