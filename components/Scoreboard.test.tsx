
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Scoreboard } from './Scoreboard';
import { Player, BoardViewSettings } from '../types';

// Fix: Add global declarations for Jest variables
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;
declare const global: any;
declare const require: any;

// Mock services
jest.mock('../services/soundService', () => ({
  soundService: {
    playClick: jest.fn(),
  },
}));

jest.mock('../services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const generatePlayers = (count: number): Player[] => 
  Array.from({ length: count }).map((_, i) => ({
    id: `p${i}`, name: `Player ${i + 1}`, score: 100 * i, color: '#ffffff'
  }));

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

describe('Scoreboard: Desktop Visibility & Layout (Card 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
  });

  test('A) 8-PLAYER GRID: Renders all 8 players in a 2-column grid layout', () => {
    render(
      <Scoreboard 
        players={generatePlayers(8)}
        selectedPlayerId="p0"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    const root = screen.getByTestId('scoreboard-root');
    expect(root).toHaveAttribute('data-layout', 'grid-2col');
    
    // Check all 8 player names are present
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`PLAYER ${i}`)).toBeInTheDocument();
    }
  });

  test('B) NO SCROLL: Enforces overflow-hidden and removes scrollbars via style audit', () => {
    const { container } = render(
      <Scoreboard 
        players={generatePlayers(8)}
        selectedPlayerId="p0"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('overflow-hidden');
    
    // Verify body row container is clipped
    const list = container.querySelector('.flex-1.overflow-hidden');
    expect(list).toBeInTheDocument();
  });

  test('C) LAYOUT SWITCHING: 1-column for 4 players, 2-column for 5 players', () => {
    const { rerender } = render(
      <Scoreboard 
        players={generatePlayers(4)}
        selectedPlayerId="p0"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    expect(screen.getByTestId('scoreboard-root')).toHaveAttribute('data-layout', 'list-1col');

    rerender(
      <Scoreboard 
        players={generatePlayers(5)}
        selectedPlayerId="p0"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    expect(screen.getByTestId('scoreboard-root')).toHaveAttribute('data-layout', 'grid-2col');
  });

  test('D) AUDIT LOGGING: Reports layout mode and viewport upon initialization', () => {
    const { logger } = require('../services/logger');
    render(
      <Scoreboard 
        players={generatePlayers(8)}
        selectedPlayerId="p0"
        onAddPlayer={jest.fn()}
        onUpdateScore={jest.fn()}
        onSelectPlayer={jest.fn()}
        gameActive={true}
        viewSettings={mockViewSettings}
      />
    );

    expect(logger.info).toHaveBeenCalledWith(
      "scoreboard_layout",
      expect.objectContaining({
        playerCount: 8,
        layoutMode: "grid-2col",
        viewport: expect.any(Object)
      })
    );
  });
});
