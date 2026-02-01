
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
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

describe('CARD 2: Verification Suite (Desktop Layout & Visibility)', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Default to Desktop Viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    window.dispatchEvent(new Event('resize'));

    // Auth setup
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const setViewport = (width: number) => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
  };

  const navigateToBuilder = async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));

    fireEvent.change(screen.getByPlaceholderText(/Show or Game Topic/i), { target: { value: 'Builder Test' } });
    fireEvent.click(screen.getByText('Start Building'));
    await waitFor(() => screen.getByText(/Live Builder Preview/i));
  };

  test('A) DESKTOP RENDER: Save button is visible and clickable', async () => {
    setViewport(1440);
    await navigateToBuilder();

    const saveBtn = screen.getByTestId('save-template-button');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeVisible();
    expect(saveBtn).not.toBeDisabled();
    
    // Test clickability
    fireEvent.click(saveBtn);
    expect(logger.info).toHaveBeenCalledWith("template_save_click", expect.objectContaining({
      ts: expect.any(String)
    }));
  });

  test('B) NO OVERLAP: Save button is in the local content toolbar, separate from global header', async () => {
    setViewport(1440);
    await navigateToBuilder();

    const saveBtn = screen.getByTestId('save-template-button');
    const localToolbar = saveBtn.closest('.sticky');
    
    expect(localToolbar).toBeInTheDocument();
    expect(localToolbar).toHaveClass('top-0');
    expect(localToolbar).toHaveClass('z-30');
    
    // Verify it contains "Live Builder Preview" title as requested
    expect(screen.getByText(/Live Builder Preview/i)).toBeInTheDocument();
  });

  test('C) MOBILE REGRESSION: Save button remains accessible on mobile viewport', async () => {
    setViewport(375);
    await navigateToBuilder();

    const saveBtn = screen.getByTestId('save-template-button');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeVisible();
  });

  test('D) STACKING GUARD: Live Builder root has highest z-index to overlay AppShell', async () => {
    setViewport(1440);
    await navigateToBuilder();
    
    const builderRoot = document.querySelector('.template-builder');
    expect(builderRoot).toHaveClass('z-[200]'); // Explicitly higher than AppShell header z-40
  });

  test('E) COMPONENT PRESENCE: Aside panel is visible and stacks correctly', async () => {
    setViewport(1440);
    await navigateToBuilder();
    
    expect(screen.getByText(/Magic Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Parameters/i)).toBeInTheDocument();
    expect(screen.getByText(/Point Increment/i)).toBeInTheDocument();
  });
});
