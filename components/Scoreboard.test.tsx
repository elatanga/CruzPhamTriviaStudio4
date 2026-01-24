import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Scoreboard } from './Scoreboard';
import { Player, BoardViewSettings } from '../types';

// Fix: Add global declarations for Jest variables
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const beforeEach: any;

// Mock sound service
jest.mock('../services/soundService', () => ({
  soundService: {
    playClick: jest.fn(),
  },
}));

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Contestant Alpha', score: 1200, color: '#ffffff' },
  { id: 'p2', name: 'Contestant Beta', score: 800, color: '#ffffff' },
];

const mockViewSettings: BoardViewSettings = {
  boardFontScale: 1.0,
  tileScale: 1.0,
  scoreboardScale: 1.0,
  updatedAt: new Date().toISOString(),
};

describe('Scoreboard Component', () => {
  test('A) STYLE TEST: Player names use Roboto Bold and responsive sizing', () => {
    render(
      <Scoreboard 
        players={mockPlayers}
        selectedPlayerId="p1"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    const alphaName = screen.getByText('Contestant Alpha');
    expect(alphaName).toHaveClass('font-roboto');
    expect(alphaName).toHaveClass('font-bold');
    
    // Check for ellipsis/truncate
    expect(alphaName).toHaveClass('truncate');
    
    // Verify style for clamp logic
    expect(alphaName).toHaveStyle('font-size: calc(clamp(16px, 1.6vw, 30px) * var(--scoreboard-scale))');
  });

  test('B) REGRESSION TEST: Renders all players and handles score updates', () => {
    const onUpdateScore = jest.fn();
    render(
      <Scoreboard 
        players={mockPlayers}
        selectedPlayerId={null}
        onAddPlayer={jest.fn()}
        onUpdateScore={onUpdateScore}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    // Verify initial render
    expect(screen.getByText('Contestant Alpha')).toBeInTheDocument();
    expect(screen.getByText('1200')).toBeInTheDocument();
    expect(screen.getByText('Contestant Beta')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();

    // Verify interaction
    const plusButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-plus'));
    fireEvent.click(plusButtons[0]); // Plus for Contestant Alpha
    expect(onUpdateScore).toHaveBeenCalledWith('p1', 100);
  });

  test('C) SELECTION TEST: Highlights selected player', () => {
    const onSelectPlayer = jest.fn();
    render(
      <Scoreboard 
        players={mockPlayers}
        selectedPlayerId="p2"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={onSelectPlayer}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    // Beta should be highlighted (white text)
    const betaName = screen.getByText('Contestant Beta');
    expect(betaName).toHaveClass('text-white');

    // Alpha should not be highlighted (zinc-400 text)
    const alphaName = screen.getByText('Contestant Alpha');
    expect(alphaName).toHaveClass('text-zinc-400');
    
    // Test selecting a player
    fireEvent.click(screen.getByText('Contestant Alpha').closest('div')!);
    expect(onSelectPlayer).toHaveBeenCalledWith('p1');
  });

  test('D) RESPONSIVE CLASS TEST: Scale setting is applied to root container', () => {
    const largeViewSettings = { ...mockViewSettings, scoreboardScale: 1.4 };
    render(
      <Scoreboard 
        players={mockPlayers}
        selectedPlayerId={null}
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={largeViewSettings}
      />
    );

    const root = document.querySelector('.h-full.flex.flex-col.bg-black\\/95');
    expect(root).toHaveStyle('--scoreboard-scale: 1.4');
  });
});