
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    text: 'What is the capital of France?',
    points: 100,
    answer: 'Paris',
    isRevealed: false,
    isAnswered: false,
    isDoubleOrNothing: false,
    ...questionOverrides
  };

  return render(
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
};

describe('QuestionModal: Layout & Reveal Logic Verification', () => {
  beforeEach(() => {
    // Reset document styles before each test
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    window.scrollTo(0, 0);
  });

  test('A) SCROLL LOCK: document and body overflow is set to hidden on mount', () => {
    setupModal();
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');
  });

  test('B) FULL-SCREEN OVERLAY: container uses inset-0 and high z-index', () => {
    setupModal();
    const root = screen.getByTestId('question-modal-root');
    expect(root).toHaveClass('fixed');
    expect(root).toHaveClass('inset-0');
    expect(root).toHaveClass('z-[9999]');
  });

  test('C) REVEAL BUTTON: Centered horizontally and below question before reveal', () => {
    setupModal();
    const revealBtn = screen.getByText(/Reveal Answer/i).closest('button');
    const questionText = screen.getByTestId('question-text');

    expect(revealBtn).toBeInTheDocument();
    
    // Check horizontal centering class
    expect(revealBtn?.parentElement).toHaveClass('justify-center');
    
    // In our 4-row logical grid, Row 2 is question, Row 3 is Reveal button.
    // Visual check via position relative to DOM order or container structure.
    expect(questionText.compareDocumentPosition(revealBtn!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test('D) ANSWER VIEWPORT ADHERENCE: Long questions do not push Answer/Actions out of view', async () => {
    const longText = 'This is a very long question. '.repeat(50);
    setupModal({ text: longText, isRevealed: true });

    const answerText = screen.getByTestId('answer-text');
    const actionsContainer = screen.getByTestId('action-buttons-container');

    // Both should be visible
    expect(answerText).toBeVisible();
    expect(actionsContainer).toBeVisible();
    
    // Grid behavior check: The container should have max-height applied
    const questionContainer = screen.getByTestId('question-text').closest('div');
    expect(questionContainer).toHaveStyle('max-height: calc(100dvh - calc(140px + 180px + 40px))');
  });

  test('E) ACTION BUTTONS: Visible and stacked immediately below answer post-reveal', () => {
    setupModal({ isRevealed: true });
    
    const answer = screen.getByTestId('answer-text');
    const actions = screen.getByTestId('action-buttons-container');

    expect(answer).toBeInTheDocument();
    expect(actions).toBeInTheDocument();

    // DOM order check
    expect(answer.closest('.flex-none')?.nextElementSibling?.contains(actions)).toBeFalsy(); 
    // Wait, in our layout Row 3 is Answer, Row 4 is Actions.
    const row3 = answer.closest('.flex-none');
    const row4 = actions.closest('.flex-none');
    expect(row3?.nextElementSibling).toBe(row4);
  });

  test('F) REGRESSION: Space triggers reveal', () => {
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

    fireEvent.keyDown(window, { code: 'Space' });
    expect(onReveal).toHaveBeenCalled();
  });
});
