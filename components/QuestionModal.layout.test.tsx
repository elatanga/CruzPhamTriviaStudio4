import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QuestionModal } from './QuestionModal';
import { Question, Player, GameTimer } from '../types';

// Mock types for tests
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

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

  test('A) LAYOUT: Root uses fixed grid with overflow-hidden', () => {
    setupModal();
    const root = screen.getByTestId('reveal-root');
    expect(root).toHaveClass('fixed');
    expect(root).toHaveClass('inset-0');
    expect(root).toHaveClass('overflow-hidden');
    expect(root).toHaveClass('grid');
    expect(root).toHaveClass('grid-rows-[auto_1fr_auto]');
  });

  test('B) VISIBILITY: Actions container exists and is always in DOM', () => {
    setupModal();
    const actions = screen.getByTestId('reveal-actions');
    expect(actions).toBeInTheDocument();
    expect(actions).toBeVisible();
  });

  test('C) REGRESSION: Award button disabled before reveal', () => {
    setupModal({ isRevealed: false });
    const awardBtn = screen.getByTitle(/Award Points/i);
    expect(awardBtn).toBeDisabled();
  });

  test('D) INTERACTION: Reveal icon button triggers reveal', () => {
    const onReveal = jest.fn();
    render(
      <QuestionModal
        question={{ id: 'q1', text: 'Q', points: 100, answer: 'A', isRevealed: false, isAnswered: false }}
        categoryTitle="Cat"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={jest.fn()}
        onReveal={onReveal}
      />
    );

    const revealBtn = screen.getByTitle(/Reveal Answer/i);
    fireEvent.click(revealBtn);
    expect(onReveal).toHaveBeenCalled();
  });

  test('E) LONG QUESTION STRESS: Actions remain visible without scroll', () => {
    const longText = 'LOOOOONG '.repeat(100);
    setupModal({ text: longText, isRevealed: true });

    // Actions should still be visible at the bottom
    const actions = screen.getByTestId('reveal-actions');
    expect(actions).toBeVisible();

    // Answer should be visible
    const answer = screen.getByTestId('answer-text');
    expect(answer).toBeVisible();

    // Check that question text container is squashed but not causing scroll
    const questionContainer = screen.getByTestId('question-text').parentElement;
    expect(questionContainer).toHaveClass('flex-1');
    expect(questionContainer).toHaveClass('min-h-0');
    expect(questionContainer).toHaveClass('overflow-hidden');
  });

  test('F) SAFE AREA: Footer has safe bottom padding style', () => {
    setupModal();
    const root = screen.getByTestId('reveal-root');
    expect(root).toHaveStyle('padding-bottom: env(safe-area-inset-bottom)');
  });
});
