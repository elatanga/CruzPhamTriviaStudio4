
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionModal } from './QuestionModal';
import { Question, Player, GameTimer } from '../types';

// Global declarations for Jest variables
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;

// Mock sound service
jest.mock('../services/soundService', () => ({
  soundService: {
    playClick: jest.fn(),
    playReveal: jest.fn(),
    playAward: jest.fn(),
    playSteal: jest.fn(),
    playVoid: jest.fn(),
    playDoubleOrNothing: jest.fn(),
    playTimerTick: jest.fn(),
    playTimerAlarm: jest.fn(),
  },
}));

// Mock logger
jest.mock('../services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockConfirm = jest.fn(() => true);
window.confirm = mockConfirm;

const mockQuestion: Question = {
  id: 'q1',
  text: 'What is the capital of France?',
  points: 100,
  answer: 'Paris',
  isRevealed: false,
  isAnswered: false,
  isDoubleOrNothing: false,
};

const mockDoubleQuestion: Question = {
  ...mockQuestion,
  isDoubleOrNothing: true,
};

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', score: 0, color: '#fff' },
];

const mockTimer: GameTimer = {
  duration: 30,
  endTime: null,
  isRunning: false,
};

describe('QuestionModal Component Logic', () => {
  test('A) DOUBLE OR NOTHING LABEL: Displays full text in uppercase (Card 1)', () => {
    render(
      <QuestionModal
        question={mockDoubleQuestion}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={jest.fn()}
        onReveal={jest.fn()}
      />
    );

    const label = screen.getByTestId('double-label');
    expect(label).toBeInTheDocument();
    expect(label.textContent).toBe('DOUBLE OR NOTHING');
    expect(label).toHaveClass('uppercase');
  });

  test('B) NORMAL TILE: Does NOT display Double Or Nothing label', () => {
    render(
      <QuestionModal
        question={mockQuestion}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={jest.fn()}
        onReveal={jest.fn()}
      />
    );
    expect(screen.queryByTestId('double-label')).not.toBeInTheDocument();
  });
});
