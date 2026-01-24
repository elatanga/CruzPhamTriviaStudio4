
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

// Mock window.confirm to always return true for testing
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

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', score: 0, color: '#fff' },
];

const mockTimer: GameTimer = {
  duration: 30,
  endTime: null,
  isRunning: false,
};

describe('QuestionModal Component Hardening', () => {
  test('VOID ACTION TEST: Void button triggers onClose with "void" post-reveal after confirmation', () => {
    const onClose = jest.fn();
    render(
      <QuestionModal
        question={{ ...mockQuestion, isRevealed: true }}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={onClose}
        onReveal={jest.fn()}
      />
    );

    const voidBtn = screen.getByText(/Void/i).closest('button');
    expect(voidBtn).toBeInTheDocument();
    
    fireEvent.click(voidBtn!);
    
    expect(mockConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith('void');
  });

  test('REGRESSION: Award button works normally post-reveal', () => {
    const onClose = jest.fn();
    render(
      <QuestionModal
        question={{ ...mockQuestion, isRevealed: true }}
        categoryTitle="Geography"
        players={mockPlayers}
        selectedPlayerId="p1"
        timer={mockTimer}
        onClose={onClose}
        onReveal={jest.fn()}
      />
    );

    const awardBtn = screen.getByText(/Award/i).closest('button');
    fireEvent.click(awardBtn!);
    
    expect(onClose).toHaveBeenCalledWith('award', 'p1');
  });
});
