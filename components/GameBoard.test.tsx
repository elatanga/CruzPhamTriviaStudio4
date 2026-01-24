import React from 'react';
import { render, screen } from '@testing-library/react';
import { GameBoard } from './GameBoard';
import { Category, BoardViewSettings } from '../types';

// Global declarations for Jest
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;

// Mock sound service
jest.mock('../services/soundService', () => ({
  soundService: {
    playSelect: jest.fn(),
  },
}));

const mockCategories: Category[] = [
  {
    id: 'c1',
    title: 'Science',
    questions: [
      { id: 'q1', text: 'Q1', answer: 'A1', points: 100, isRevealed: false, isAnswered: false, isDoubleOrNothing: true },
      { id: 'q2', text: 'Q2', answer: 'A2', points: 200, isRevealed: false, isAnswered: false, isDoubleOrNothing: false },
    ],
  },
];

const mockViewSettings: BoardViewSettings = {
  boardFontScale: 1.0,
  tileScale: 1.0,
  scoreboardScale: 1.0,
  updatedAt: new Date().toISOString(),
};

describe('GameBoard Component Visibility', () => {
  test('A) UI TEST: Tiles do not show "2X", "x2", or "double" markers', () => {
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
    
    // Ensure no red badge (bg-red-600) exists which was used for the marker
    const redBadges = document.querySelectorAll('.bg-red-600');
    expect(redBadges.length).toBe(0);
  });
});