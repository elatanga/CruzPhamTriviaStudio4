
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { dataService } from './services/dataService';

// --- TYPE DECLARATIONS ---
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const beforeAll: any;

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

describe('CARD 2: Template Builder UI & scaling Reliability', () => {
  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Auth setup to bypass bootstrap and login
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
  });

  const navigateToBuilder = async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    
    // 1. Create a show
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    // 2. Open Template Config
    fireEvent.click(screen.getByText(/Create Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));

    // 3. Move to Builder Preview
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Builder Test' } });
    fireEvent.click(screen.getByText(/Manually Create Board Structure/i));
    await waitFor(() => screen.getByText(/Live Builder Preview/i));
  };

  test('A) UI TEST — Save button placement under Logout', async () => {
    await navigateToBuilder();

    const logoutBtn = screen.getByText(/Logout Producer/i);
    const saveBtn = screen.getByText(/Save Template/i);
    
    // Assert they are in the same action cluster
    const actionCluster = logoutBtn.closest('.flex-col');
    expect(actionCluster).toContainElement(saveBtn);
    expect(actionCluster).toHaveClass('items-end'); // Right aligned
    
    // Assert ordering: Logout appears BEFORE Save (stacked vertically)
    const children = Array.from(actionCluster!.children);
    const logoutIndex = children.indexOf(logoutBtn);
    const saveIndex = children.indexOf(saveBtn);
    
    expect(logoutIndex).toBeLessThan(saveIndex);
    expect(saveBtn).toHaveClass('font-roboto');
    expect(saveBtn).toHaveClass('font-bold');
  });

  test('B) UI TEST — Save button not overlapping categories grid (structural guarantee)', async () => {
    await navigateToBuilder();

    // The main content area should have padding-top to clear the absolute/fixed action stack in the header
    const mainContainer = screen.getByRole('main');
    
    // Based on implementation: pt-12 (mobile) and lg:pt-8 (desktop)
    expect(mainContainer).toHaveClass('pt-12');
    expect(mainContainer).toHaveClass('lg:pt-8');
  });

  test('C) INTEGRATION TEST — Point increment updates tile labels immediately', async () => {
    await navigateToBuilder();

    // Default increment is usually 100.
    // Check first tile (Row 1)
    const firstRowTiles = screen.getAllByText('100');
    expect(firstRowTiles.length).toBeGreaterThan(0);

    // Locate the increment dropdown in the sidebar
    const select = screen.getByRole('combobox');
    
    // 1. Change to 50
    fireEvent.change(select, { target: { value: '50' } });
    
    // Assert tiles update immediately
    await waitFor(() => {
        expect(screen.getAllByText('50').length).toBeGreaterThan(0);
        expect(screen.getAllByText('100').length).toBeGreaterThan(0); // Row 2
    });

    // 2. Change to 25
    fireEvent.change(select, { target: { value: '25' } });
    
    await waitFor(() => {
        expect(screen.getAllByText('25').length).toBeGreaterThan(0);
        expect(screen.getAllByText('50').length).toBeGreaterThan(0); // Row 2
    });
  });

  test('E) REGRESSION TEST — Save button triggers existing save handler with increment', async () => {
    await navigateToBuilder();
    
    const spy = jest.spyOn(dataService, 'createTemplate');
    
    // Select increment 50
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '50' } });

    await act(async () => {
      fireEvent.click(screen.getByText(/Save Template/i));
    });

    // Verify correct payload including pointScale
    expect(spy).toHaveBeenCalledWith(
        expect.any(String), 
        'Builder Test', 
        expect.objectContaining({
            pointScale: 50,
            rowCount: 5,
            categoryCount: 4
        }),
        expect.any(Array)
    );
  });

  test('F) REGRESSION TEST — Config screen still renders all fields correctly', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/Select Production/i));
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Regression Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    fireEvent.click(screen.getByText(/Create Template/i));
    
    await waitFor(() => screen.getByText(/New Template Configuration/i));

    // Players
    expect(screen.getByText(/Contestants/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Player 1')).toBeInTheDocument();

    // Dimensions
    expect(screen.getByText(/Categories/i)).toBeInTheDocument();
    expect(screen.getByText(/Rows/i)).toBeInTheDocument();

    // AI
    expect(screen.getByText(/AI Magic Studio/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter topic/i)).toBeInTheDocument();
  });
});
