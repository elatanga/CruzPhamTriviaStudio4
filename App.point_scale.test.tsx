import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { authService } from './services/authService';
import { soundService } from './services/soundService';
import { dataService } from './services/dataService';

// --- MOCKS ---

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const beforeEach: any;
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
window.confirm = jest.fn(() => true);
window.alert = jest.fn();
window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
window.URL.revokeObjectURL = jest.fn();

describe('CRUZPHAM TRIVIA - Point Scale Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const setupAuthenticatedApp = async () => {
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
    const utils = render(<App />);
    
    // Create Show
    await waitFor(() => screen.getByText(/Select Production/i));
    fireEvent.change(screen.getByPlaceholderText(/New Show Title/i), { target: { value: 'Scale Test Show' } });
    fireEvent.click(screen.getByText(/Create/i));
    await waitFor(() => screen.getByText(/Template Library/i));
    
    return utils;
  };

  test('1) Unit: Point Generation - Scale Logic & Constraints', async () => {
    await setupAuthenticatedApp();

    // Open Template Creator
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/New Template Configuration/i));
    
    // 1a. Test Scale = 10
    fireEvent.click(screen.getByText('10', { selector: 'button' }));
    
    // Verify Range Text Update
    expect(screen.getByText(/Range: 10 - 50/i)).toBeInTheDocument(); // Default 5 rows
    
    // 1b. Test Scale = 25
    fireEvent.click(screen.getByText('25', { selector: 'button' }));
    expect(screen.getByText(/Range: 25 - 125/i)).toBeInTheDocument();

    // 1c. Test Scale = 50
    fireEvent.click(screen.getByText('50', { selector: 'button' }));
    expect(screen.getByText(/Range: 50 - 250/i)).toBeInTheDocument();

    // 1d. Test Row Constraint (Max 10)
    // Click '+' on Rows until max (starting at 5, need 5 more clicks)
    // Based on TemplateBuilder.tsx order: Categories is first +, Rows is second.
    const rowPlus = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-plus'))[1];
    for(let i=0; i<5; i++) fireEvent.click(rowPlus);
    
    // Verify range updates for 10 rows with 50 increment
    expect(screen.getByText(/Range: 50 - 500/i)).toBeInTheDocument();
    
    // Set Scale 20
    fireEvent.click(screen.getByText('20', { selector: 'button' }));
    
    // Enter Title
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Scale 20 Test' } });
    
    // Create
    fireEvent.click(screen.getByText('Start Building', { selector: 'button' }));
    
    // Check Board Values: 20, 40, 60, 80, 100, 120, 140, 160, 180, 200 (10 rows)
    await waitFor(() => screen.getByText('20'));
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  test('2) Unit: Backward Compatibility - Legacy Template Defaults', async () => {
    // Inject legacy template (no pointScale)
    const legacyTemplate = {
      id: 'legacy-1',
      showId: 'show-1',
      topic: 'Legacy Game',
      config: { 
        playerCount: 2, 
        categoryCount: 2, 
        rowCount: 3 
        // Missing pointScale
      },
      categories: [
        {
           id: 'c1', title: 'Cat 1', 
           questions: [
             { id: 'q1', points: 100, text: 'Q1', answer: 'A1', isRevealed: false, isAnswered: false },
             { id: 'q2', points: 200, text: 'Q2', answer: 'A2', isRevealed: false, isAnswered: false },
             { id: 'q3', points: 300, text: 'Q3', answer: 'A3', isRevealed: false, isAnswered: false }
           ]
        }
      ],
      createdAt: new Date().toISOString()
    };
    
    const show = { id: 'show-1', userId: 'admin', title: 'Legacy Show', createdAt: new Date().toISOString() };
    
    localStorage.setItem('cruzpham_db_shows', JSON.stringify([show]));
    localStorage.setItem('cruzpham_db_templates', JSON.stringify([legacyTemplate]));
    
    // Boot App
    const token = await authService.bootstrapMasterAdmin('admin');
    await authService.login('admin', token);
    render(<App />);
    
    await waitFor(() => screen.getByText('Legacy Show'));
    fireEvent.click(screen.getByText('Legacy Show'));
    
    // Check Dashboard
    await waitFor(() => screen.getByText('Legacy Game'));
    
    fireEvent.click(screen.getByText('Play Show'));
    
    await waitFor(() => screen.getByText(/End Show/i));
    
    // Verify points rendered correctly
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
  });

  test('3) Integration: Template Creation with Scale 50', async () => {
    await setupAuthenticatedApp();

    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/Configuration/i));

    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Fifty Scale' } });
    fireEvent.click(screen.getByText('50', { selector: 'button' }));
    
    fireEvent.click(screen.getByText('Start Building'));
    
    // Verify Builder View
    await waitFor(() => screen.getByText('Fifty Scale'));
    
    // Check points
    expect(screen.getAllByText('50').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('150').length).toBeGreaterThan(0);
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('250').length).toBeGreaterThan(0);

    // Save
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => screen.getByText('Template saved successfully.'));
  });

  test('4) Integration: Upload preserves pointScale of 50', async () => {
    await setupAuthenticatedApp();
    
    const templateWithScale50 = {
      id: 't-scale-50',
      showId: (JSON.parse(localStorage.getItem('cruzpham_db_shows') || '[]')[0] || {}).id,
      topic: 'Scale 50 Import',
      config: { playerCount: 2, categoryCount: 1, rowCount: 2, pointScale: 50 },
      categories: [{
        id: 'c1', title: 'Trivia',
        questions: [
          { id: 'q1', points: 50, text: '50 pts', answer: 'A', isRevealed: false, isAnswered: false },
          { id: 'q2', points: 100, text: '100 pts', answer: 'B', isRevealed: false, isAnswered: false }
        ]
      }],
      createdAt: new Date().toISOString()
    };

    const shows = JSON.parse(localStorage.getItem('cruzpham_db_shows') || '[]');
    templateWithScale50.showId = shows[0].id;

    const fileContent = JSON.stringify(templateWithScale50);
    
    act(() => {
      dataService.importTemplate(templateWithScale50.showId, fileContent);
    });

    fireEvent.click(screen.getByText(/Switch Show/i));
    fireEvent.click(screen.getByText(/Scale Test Show/i));

    await waitFor(() => screen.getByText('Scale 50 Import (Imported)'));
    
    const playBtns = screen.getAllByText(/Play Show/i);
    fireEvent.click(playBtns[playBtns.length - 1]);

    await waitFor(() => screen.getByText('50'));
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  test('5) Smoke: Gameplay with Scale 50', async () => {
    await setupAuthenticatedApp();
    
    fireEvent.click(screen.getByText(/New Template/i));
    await waitFor(() => screen.getByText(/Configuration/i));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Science Night 2024/i), { target: { value: 'Game 50' } });
    fireEvent.click(screen.getByText('50', { selector: 'button' }));
    fireEvent.click(screen.getByText('Start Building'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => screen.getByText('Play Show'));
    fireEvent.click(screen.getByText('Play Show'));

    await waitFor(() => screen.getByText(/End Show/i));
    
    fireEvent.click(screen.getByText('Player 1'));
    
    const q50 = screen.getAllByText('50')[0];
    fireEvent.click(q50);
    
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.keyDown(window, { code: 'Enter' });
    
    await waitFor(() => {
       const score = screen.getByText(/Player 1/i).closest('div')?.querySelector('.font-mono')?.textContent;
       expect(score).toMatch(/^(50|100)$/); 
    });
  });
});