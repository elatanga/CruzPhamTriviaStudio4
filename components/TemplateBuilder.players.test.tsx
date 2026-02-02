
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplateBuilder } from './TemplateBuilder';
import { logger } from '../services/logger';

// --- MOCKS ---
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

jest.mock('../services/logger', () => ({
  logger: { 
    info: jest.fn(), 
    error: jest.fn(), 
    warn: jest.fn(), 
    getCorrelationId: () => 'test-id' 
  }
}));

jest.mock('../services/soundService', () => ({
  soundService: { playClick: jest.fn() }
}));

const mockProps = {
  showId: 'show-1',
  onClose: jest.fn(),
  onSave: jest.fn(),
  addToast: jest.fn(),
};

describe('TemplateBuilder: Player Configuration & Visibility (Card 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('A) Renders all 8 player inputs visible without scroll (Card 1)', async () => {
    const players8 = Array.from({length: 8}).map((_, i) => `CONTESTANT ${i + 1}`);
    const template8: any = {
      topic: 'Full Roster',
      config: { playerCount: 8, playerNames: players8 },
      categories: [],
    };
    
    render(<TemplateBuilder {...mockProps} initialTemplate={template8} />);
    
    // Assert all 8 are in DOM
    const inputs = screen.getAllByPlaceholderText('ENTER NAME');
    expect(inputs.length).toBe(8);
    
    // Assert layout uses 2-column grid as requested
    const gridContainer = inputs[0].closest('.grid');
    expect(gridContainer).toHaveClass('grid-cols-2');
    
    // Assert all inputs are visible (not hidden by overflow)
    inputs.forEach(input => {
      expect(input).toBeVisible();
    });
  });

  test('B) MAX PLAYERS: Cannot add more than 8 players', async () => {
    render(<TemplateBuilder {...mockProps} />);
    
    // Default is 4 players. Add 4 more.
    const addBtn = screen.getByText(/ADD PLAYER/i);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(addBtn);
    }
    
    // Attempt 9th
    fireEvent.click(addBtn);
    
    // Assert warning logged and toast triggered
    expect(logger.warn).toHaveBeenCalledWith("template_players_add_blocked_max", expect.any(Object));
  });

  test('C) CLAMPING: Clamps >8 players on initial load with error log', () => {
    const legacyTemplate: any = {
      topic: 'Legacy',
      config: { playerCount: 10, playerNames: Array.from({length: 10}).map((_, i) => `P${i}`) },
      categories: [],
    };
    
    render(<TemplateBuilder {...mockProps} initialTemplate={legacyTemplate} />);
    
    const inputs = screen.getAllByPlaceholderText('ENTER NAME');
    expect(inputs.length).toBe(8);
    expect(logger.error).toHaveBeenCalledWith("template_players_over_max_clamped", expect.any(Object));
  });

  test('D) DELETION: Delete icon removes specific player by stable ID', () => {
    render(<TemplateBuilder {...mockProps} />);
    
    const inputs = screen.getAllByPlaceholderText('ENTER NAME') as HTMLInputElement[];
    fireEvent.change(inputs[1], { target: { value: 'TARGET DELETE' } });
    fireEvent.change(inputs[2], { target: { value: 'KEEP ME' } });

    // Use querySelector for specific icon as it might not have text
    const deleteBtns = document.querySelectorAll('.lucide-trash2');
    fireEvent.click(deleteBtns[1].parentElement!);

    expect(screen.queryByDisplayValue('TARGET DELETE')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('KEEP ME')).toBeInTheDocument();
  });
});
