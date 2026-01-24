
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionModal } from './QuestionModal';
import { Question, Player, GameTimer } from '../types';

// Fix: Add global declarations for Jest variables
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

const mockQuestion: Question = {
  id: 'q1',
  text: 'What is the capital of France?',
  points: 100,
  answer: 'Paris',
  isRevealed: false,
  isAnswered: false,
  isDoubleOrNothing: false,
};

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', score: 0, color: '#fff' },
];

const mockTimer: GameTimer = {
  duration: 30,
  endTime: null,
  isRunning: false,
};

describe('QuestionModal Component', () => {
  test('A) STYLE / TYPOGRAPHY TESTS: Question text uses Roboto Bold and Extra Large Sizing', () => {
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

    const questionText = screen.getByTestId('question-text');
    expect(questionText).toHaveClass('font-roboto');
    expect(questionText).toHaveClass('font-bold');
    expect(questionText).toHaveStyle('font-size: clamp(34px, 4.8vw, 96px)');
  });

  test('B) FULL-SCREEN LAYOUT SAFETY TEST: Root is full-screen and action buttons exist', () => {
    render(
      <QuestionModal
        question={{ ...mockQuestion, isRevealed: true }}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={jest.fn()}
        onReveal={jest.fn()}
      />
    );

    const root = screen.getByTestId('question-modal-root');
    expect(root).toHaveClass('fixed');
    expect(root).toHaveClass('inset-0');
    expect(root).toHaveClass('overflow-hidden');

    const actionButtons = screen.getByTestId('action-buttons-container');
    expect(actionButtons).toBeInTheDocument();
  });

  test('C) REGRESSION FLOW TESTS: Reveal enables buttons and fires callbacks', () => {
    const onReveal = jest.fn();
    const { rerender } = render(
      <QuestionModal
        question={mockQuestion}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={jest.fn()}
        onReveal={onReveal}
      />
    );

    // Action buttons should not be present before reveal (per existing behavior)
    expect(screen.queryByTestId('action-buttons-container')).not.toBeInTheDocument();

    // Trigger reveal via button
    const revealBtn = screen.getByText(/Reveal Answer/i);
    fireEvent.click(revealBtn);
    expect(onReveal).toHaveBeenCalled();

    // Re-render with revealed state
    rerender(
      <QuestionModal
        question={{ ...mockQuestion, isRevealed: true }}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={jest.fn()}
        onReveal={onReveal}
      />
    );

    // Action buttons should now be present
    expect(screen.getByTestId('action-buttons-container')).toBeInTheDocument();
    expect(screen.getByText(/Award/i).closest('button')).not.toBeDisabled();
  });
});
