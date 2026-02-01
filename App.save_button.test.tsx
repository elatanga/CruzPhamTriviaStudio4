import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import * as geminiService from './services/geminiService';

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

// Mock window interactions
window.scrollTo = jest.fn();
window.confirm = jest.fn(() => true);

describe('Template Builder: AI & Persistence Logic (CARD 3)', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Auth setup to skip bootstrap and login
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const navigateToConfig = async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/Template Configuration/i));
  };

  test('A) UI: AI Generation section and Difficulty selector are present in Config', async () => {
    await navigateToConfig();
    
    expect(screen.getByText(/AI Magic Studio/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter topic/i)).toBeInTheDocument();
    
    // Assert difficulty options exist
    expect(screen.getByText('easy')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('hard')).toBeInTheDocument();
    expect(screen.getByText('mixed')).toBeInTheDocument();
    
    expect(screen.getByText(/Generate Full Board/i)).toBeInTheDocument();
  });

  test('B) WIRING: Selected difficulty is passed correctly to AI generation call', async () => {
    await navigateToConfig();
    
    const spy = jest.spyOn(geminiService, 'generateTriviaGame').mockResolvedValue([]);
    
    fireEvent.change(screen.getByPlaceholderText(/Enter topic/i), { target: { value: 'Science' } });
    fireEvent.click(screen.getByText('hard'));
    
    await act(async () => {
      fireEvent.click(screen.getByText(/Generate Full Board/i));
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Science'),
      'hard',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(String)
    );
  });

  test('C) APPLY: AI Generation results correctly populate the template draft state', async () => {
    await navigateToConfig();
    
    const mockCategories = [
      {
        id: 'cat-1',
        title: 'Biology',
        questions: [
          { id: 'q-1', text: 'What is DNA?', answer: 'Genetic code', points: 100, isRevealed: false, isAnswered: false, isDoubleOrNothing: false }
        ]
      }
    ];
    
    jest.spyOn(geminiService, 'generateTriviaGame').mockResolvedValue(mockCategories);
    
    fireEvent.change(screen.getByPlaceholderText(/Enter topic/i), { target: { value: 'Bio' } });
    
    await act(async () => {
      fireEvent.click(screen.getByText(/Generate Full Board/i));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Biology')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  test('D) VISIBILITY: Save button is always accessible in the Builder view', async () => {
    await navigateToConfig();
    
    fireEvent.change(screen.getByPlaceholderText(/Show or Game Topic/i), { target: { value: 'Manual Game' } });
    fireEvent.click(screen.getByText(/Manually Create Board Structure/i));
    
    await waitFor(() => {
      const saveBtn = screen.getByText(/Save Template/i);
      expect(saveBtn).toBeVisible();
      // Ensure it is in the sticky toolbar (header or mobile footer)
      expect(saveBtn.closest('div')).toHaveClass('flex');
    });
  });

  test('E) SAVE: Save handler is triggered with the correct payload', async () => {
    await navigateToConfig();
    
    const spy = jest.spyOn(dataService, 'createTemplate');
    
    fireEvent.change(screen.getByPlaceholderText(/Show or Game Topic/i), { target: { value: 'Save Logic Test' } });
    fireEvent.click(screen.getByText(/Manually Create Board Structure/i));
    
    await waitFor(() => screen.getByText(/Save Template/i));
    
    await act(async () => {
      fireEvent.click(screen.getByText(/Save Template/i));
    });

    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      'Save Logic Test',
      expect.objectContaining({
        playerCount: expect.any(Number),
        rowCount: expect.any(Number),
        categoryCount: expect.any(Number)
      }),
      expect.any(Array)
    );
  });

  test('F) ERRORS: AI and Save failures show user-friendly feedback', async () => {
    await navigateToConfig();
    
    // AI Failure
    jest.spyOn(geminiService, 'generateTriviaGame').mockRejectedValue(new Error('AI Service Down'));
    fireEvent.change(screen.getByPlaceholderText(/Enter topic/i), { target: { value: 'FailTopic' } });
    
    await act(async () => {
      fireEvent.click(screen.getByText(/Generate Full Board/i));
    });
    
    await waitFor(() => {
      expect(screen.getByText(/AI Generation failed/i)).toBeInTheDocument();
    });

    // Save Failure
    fireEvent.click(screen.getByText(/Manually Create Board Structure/i));
    jest.spyOn(dataService, 'createTemplate').mockImplementation(() => { throw new Error('DB Error'); });
    
    await waitFor(() => screen.getByText(/Save Template/i));
    
    await act(async () => {
      fireEvent.click(screen.getByText(/Save Template/i));
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
    });
  });

  test('G) REGRESSION: Existing constraints are preserved', async () => {
    await navigateToConfig();
    
    // Check Category Max (8)
    const catPlus = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-plus'))[0];
    // Default is 4, click 5 more times to attempt to go to 9
    for(let i=0; i<6; i++) fireEvent.click(catPlus);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.queryByText('9')).not.toBeInTheDocument();

    // Check Row Max (10)
    const rowPlus = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-plus'))[1];
    // Default is 5, click 6 more times to attempt to go to 11
    for(let i=0; i<6; i++) fireEvent.click(rowPlus);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('11')).not.toBeInTheDocument();
  });
});
