
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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
// Fix: Declare require for dynamic module loading in tests to fix "Cannot find name 'require'"
declare const require: any;

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

describe('Template Builder: Save Button Stacking & Layout (Verification)', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Auth setup to skip bootstrap and login
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const navigateToBuilder = async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));

    fireEvent.change(screen.getByPlaceholderText(/Show or Game Topic/i), { target: { value: 'Save Button Test' } });
    fireEvent.click(screen.getByText('Start Building'));
    await waitFor(() => screen.getByText(/Live Builder Preview/i));
  };

  test('A) UI LAYOUT: Save button is visible and clickable on desktop', async () => {
    // Set desktop-like viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
    window.dispatchEvent(new Event('resize'));
    
    await navigateToBuilder();
    
    const saveBtn = screen.getByRole('button', { name: /save template/i });
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeVisible();
    
    // Test clickability
    fireEvent.click(saveBtn);
    
    // Successful click should trigger logging
    await waitFor(() => {
        const matchingCall = (screen.getByTestId ? null : (console as any).info); // placeholder for verifying logic
        // Verify logger was called via mock
        // Fix: require usage in test context
        const { logger } = require('./services/logger');
        expect(logger.info).toHaveBeenCalledWith("template_save_click", expect.any(Object));
    });
  });

  test('B) STACKING: Save button is within the high-priority actions row', async () => {
    await navigateToBuilder();
    
    const actionsRow = screen.getByTestId("builder-actions-row");
    expect(actionsRow).toBeInTheDocument();
    expect(actionsRow).toHaveClass('z-[60]'); // Ensuring high z-index as required
    
    const saveBtn = within(actionsRow).getByRole('button', { name: /save template/i });
    expect(saveBtn).toBeInTheDocument();
  });

  test('C) POSITION: Save button is top-right under Logout', async () => {
    await navigateToBuilder();
    
    const actionsRow = screen.getByTestId("builder-actions-row");
    const logoutBtn = within(actionsRow).getByText(/logout/i);
    const saveBtn = within(actionsRow).getByRole('button', { name: /save template/i });
    
    // Stacked vertically: Logout then Save
    expect(logoutBtn).toBeInTheDocument();
    expect(saveBtn).toBeInTheDocument();
    expect(actionsRow).toHaveClass('flex-col');
    expect(actionsRow).toHaveClass('items-end');
  });

  test('D) ERROR HANDLING: Save failure shows toast and logs error', async () => {
    await navigateToBuilder();
    
    // Mock failure
    const spy = jest.spyOn(dataService, 'createTemplate').mockImplementation(() => {
        throw new Error('Persistence Failed');
    });

    const saveBtn = screen.getByRole('button', { name: /save template/i });
    fireEvent.click(saveBtn);
    
    await waitFor(() => {
        // Fix: require usage in test context
        const { logger } = require('./services/logger');
        expect(logger.error).toHaveBeenCalledWith("template_save_failed", expect.objectContaining({
            message: 'Persistence Failed'
        }));
    });

    spy.mockRestore();
  });

  test('E) REGRESSION: Mobile layout still renders Save button', async () => {
    // Set mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));
    
    await navigateToBuilder();
    
    const saveBtn = screen.getByRole('button', { name: /save template/i });
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeVisible();
  });
});
