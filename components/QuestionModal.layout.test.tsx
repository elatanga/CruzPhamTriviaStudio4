
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionModal } from './QuestionModal';
import { Question, Player, GameTimer } from '../types';

// Mock types for tests
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
// Fix: Declare require for dynamic module loading in tests to fix "Cannot find name 'require'"
declare const require: any;

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

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', score: 0, color: '#fff' },
  { id: 'p2', name: 'Bob', score: 0, color: '#fff' },
];

const mockTimer: GameTimer = {
  duration: 30,
  endTime: null,
  isRunning: false,
};

const setupModal = (questionOverrides: Partial<Question> = {}) => {
  const mockQuestion: Question = {
    id: 'q1',
    text: 'Standard Question?',
    points: 100,
    answer: 'Standard Answer',
    isRevealed: false,
    isAnswered: false,
    isDoubleOrNothing: false,
    ...questionOverrides
  };

  return render(
    <QuestionModal
      question={mockQuestion}
      categoryTitle="General"
      players={mockPlayers}
      selectedPlayerId="p1"
      timer={mockTimer}
      onClose={jest.fn()}
      onReveal={jest.fn()}
    />
  );
};

describe('QuestionModal: Layout & Reveal UI Health (Card 1)', () => {
  beforeEach(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    jest.clearAllMocks();
  });

  test('A) LAYOUT: Root uses fixed position and overflow-hidden', () => {
    setupModal();
    const root = screen.getByTestId('reveal-root');
    expect(root).toHaveClass('fixed');
    expect(root).toHaveClass('inset-0');
    expect(root).toHaveClass('overflow-hidden');
  });

  test('B) CONTAINER: Reveal content is wrapped in a luxury card (Card 1)', () => {
    setupModal();
    const container = screen.getByTestId('luxury-container');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('max-w-7xl');
    expect(container).toHaveClass('backdrop-blur-2xl');
    expect(container).toHaveClass('rounded-[2.5rem]');
  });

  test('C) TYPOGRAPHY: Question text uses Roboto Bold clamp sizing', () => {
    setupModal();
    const qText = screen.getByTestId('question-text');
    expect(qText).toHaveClass('font-roboto-bold');
    expect(qText).toHaveStyle('font-size: clamp(28px, 4.5vw, 86px)');
  });

  test('D) VISIBILITY: Actions row is inside the luxury container', () => {
    setupModal();
    const container = screen.getByTestId('luxury-container');
    const actions = screen.getByTestId('reveal-actions');
    expect(container).toContainElement(actions);
  });

  test('E) LONG QUESTION STRESS: Container remains centered without scrolling', () => {
    const longText = 'LOOOOONG '.repeat(100);
    setupModal({ text: longText, isRevealed: true });

    const container = screen.getByTestId('luxury-container');
    expect(container).toHaveClass('flex-col');
    expect(container).not.toHaveClass('overflow-auto');
    expect(container).toHaveClass('overflow-hidden');
  });

  test('F) LOGGING: Logs reveal UI render event', () => {
    setupModal();
    // Fix: Using the declared require to access logger from the mock context
    const { logger } = require('../services/logger');
    expect(logger.info).toHaveBeenCalledWith(
      "reveal_ui_rendered",
      expect.objectContaining({ tileId: 'q1', ts: expect.any(String) })
    );
  });
});
