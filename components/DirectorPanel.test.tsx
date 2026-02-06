
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DirectorPanel } from './DirectorPanel';
import { GameBoard } from './GameBoard';
import { QuestionModal } from './QuestionModal';
import { GameState } from '../types';

// --- MOCKS ---
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;

jest.mock('../services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), getCorrelationId: () => 'test-id' }
}));

jest.mock('../services/soundService', () => ({
  soundService: { playClick: jest.fn(), playSelect: jest.fn() }
}));

const mockGameState: GameState = {
  showTitle: 'Test Show',
  isGameStarted: true,
  categories: [
    {
      id: 'c1', title: 'Science',
      questions: [
        { id: 'q1', text: 'What is H2O?', answer: 'Water', points: 100, isRevealed: false, isAnswered: false }
      ]
    }
  ],
  players: [],
  activeQuestionId: null,
  activeCategoryId: null,
  selectedPlayerId: null,
  history: [],
  timer: { duration: 30, endTime: null, isRunning: false },
  viewSettings: { boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0, updatedAt: '' },
  lastPlays: [],
  events: []
};

const mockProps: any = {
  gameState: mockGameState,
  onUpdateState: jest.fn(),
  emitGameEvent: jest.fn(),
  addToast: jest.fn()
};

describe('Card 1: Director Live Board Control - Answer Visibility', () => {
  
  test('A) DIRECTOR UI RENDER TEST: Shows answer preview in grid', () => {
    render(<DirectorPanel {...mockProps} />);
    expect(screen.getByText('What is H2O?')).toBeInTheDocument();
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
  });

  test('B) NO-LEAK REGRESSION TEST: Answer is NOT present on public TriviaBoard', () => {
    render(
      <GameBoard 
        categories={mockGameState.categories} 
        onSelectQuestion={jest.fn()} 
        viewSettings={mockGameState.viewSettings} 
      />
    );
    expect(screen.queryByText('Water')).not.toBeInTheDocument();
  });

  test('C) MISSING ANSWER TEST: Shows warning indicator instead of crashing', () => {
    const buggyState = {
      ...mockGameState,
      categories: [{
        ...mockGameState.categories[0],
        questions: [{ ...mockGameState.categories[0].questions[0], answer: '' }]
      }]
    };
    render(<DirectorPanel {...mockProps} gameState={buggyState} />);
    expect(screen.getByText('(MISSING)')).toBeInTheDocument();
  });
});
