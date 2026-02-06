
import React from 'react';
import { render, screen } from '@testing-library/react';
import { GameBoard } from './GameBoard';
import { Category, BoardViewSettings } from '../types';

// Global declarations for Jest
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
// Fix: Declare require for dynamic module loading in tests to fix "Cannot find name 'require'"
declare const require: any;

// Mock sound service
jest.mock('../services/soundService', () => ({
  soundService: {
    playSelect: jest.fn(),
  },
}));

// Mock logger to avoid side-effects in tests
jest.mock('../services/logger', () => ({
  logger: { info: jest.fn() }
}));

const mockCategories: Category[] = [
  {
    id: 'c1',
    title: 'Science',
    questions: [
      { id: 'q1', text: 'Q1', answer: 'A1', points: 100, isRevealed: false, isAnswered: false, isDoubleOrNothing: true },
      { id: 'q2', text: 'Q2', answer: 'A2', points: 200, isRevealed: false, isAnswered: false, isDoubleOrNothing: false },
      { id: 'q3', text: 'Q3', answer: 'A3', points: 300, isRevealed: false, isAnswered: true, isDoubleOrNothing: false },
      { id: 'q4', text: 'Q4', answer: 'A4', points: 400, isRevealed: false, isAnswered: false, isVoided: true },
    ],
  },
];

const mockViewSettings: BoardViewSettings = {
  boardFontScale: 1.0,
  tileScale: 1.0,
  scoreboardScale: 1.0,
  categoryFontSizeScale: 1.0,
  tileFontSizeScale: 1.0,
  playerNameFontSizeScale: 1.0,
  tilePaddingScale: 1.0,
  updatedAt: new Date().toISOString(),
};

describe('GameBoard Component Visibility & Theme', () => {
  test('A) UI TEST: Tiles do not show "2X", "x2", or "double" markers (Regression)', () => {
    render(
      <GameBoard 
        categories={mockCategories} 
        onSelectQuestion={jest.fn()} 
        viewSettings={mockViewSettings} 
      />
    );

    // Points should be visible
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();

    // No double markers should be visible
    const bodyText = document.body.textContent || '';
    expect(bodyText).not.toContain('2X');
    expect(bodyText).not.toContain('x2');
    expect(bodyText.toLowerCase()).not.toContain('double');
  });

  test('B) STYLE TEST: Active tiles retain shadow/border separation against light background', () => {
    render(
      <GameBoard 
        categories={mockCategories} 
        onSelectQuestion={jest.fn()} 
        viewSettings={mockViewSettings} 
      />
    );

    const activeTile = screen.getByText('100').closest('button');
    // shadow-xl is required to lift tile off the light ivory floor
    expect(activeTile).toHaveClass('shadow-xl');
    expect(activeTile).toHaveClass('border-gold-600/30');
    expect(activeTile).toHaveClass('bg-zinc-900');
  });

  test('C) UI TEST: Voided tile remains disabled + visually distinguishable (Dark/Muted)', () => {
    render(
      <GameBoard 
        categories={mockCategories} 
        onSelectQuestion={jest.fn()} 
        viewSettings={mockViewSettings} 
      />
    );

    const voidedText = screen.getByText('VOID');
    const voidedTile = voidedText.closest('button');
    
    expect(voidedTile).toBeDisabled();
    expect(voidedTile).toHaveClass('opacity-50');
    expect(voidedTile).toHaveClass('bg-black/80'); // High contrast against ivory
    expect(voidedTile).toHaveClass('cursor-not-allowed');
  });

  test('D) UI TEST: Answered tile is visually recessed (Low Opacity)', () => {
    render(
      <GameBoard 
        categories={mockCategories} 
        onSelectQuestion={jest.fn()} 
        viewSettings={mockViewSettings} 
      />
    );

    // Answered tiles show "---" by current implementation
    const answeredText = screen.getByText('---');
    const answeredTile = answeredText.closest('button');
    
    expect(answeredTile).toBeDisabled();
    expect(answeredTile).toHaveClass('opacity-20');
    expect(answeredTile).toHaveClass('bg-zinc-800/10');
  });

  test('E) LOGGING TEST: Theme update is logged on mount', () => {
    const { logger } = require('../services/logger');
    render(
      <GameBoard 
        categories={mockCategories} 
        onSelectQuestion={jest.fn()} 
        viewSettings={mockViewSettings} 
      />
    );
    expect(logger.info).toHaveBeenCalledWith(
        "trivia_board_theme_updated", 
        expect.objectContaining({ backgroundTheme: "luxury_light" })
    );
  });
});
