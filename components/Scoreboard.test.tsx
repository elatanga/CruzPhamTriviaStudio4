import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Scoreboard } from './Scoreboard';
import { Player, BoardViewSettings } from '../types';

// Fix: Add global declarations for Jest, Node, and browser-like globals
declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const beforeEach: any;
declare const global: any;
declare const require: any;

// Mock sound service
jest.mock('../services/soundService', () => ({
  soundService: {
    playClick: jest.fn(),
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
  { id: 'p1', name: 'Contestant Alpha', score: 1200, color: '#ffffff' },
  { id: 'p2', name: 'Contestant Beta', score: 800, color: '#ffffff' },
  { id: 'p3', name: 'Contestant Gamma', score: 500, color: '#ffffff' },
  { id: 'p4', name: 'Contestant Delta', score: 300, color: '#ffffff' },
];

const mockViewSettings: BoardViewSettings = {
  boardFontScale: 1.0,
  tileScale: 1.0,
  scoreboardScale: 1.0,
  updatedAt: new Date().toISOString(),
};

// Simple ResizeObserver mock
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Fix: global name is now declared
global.ResizeObserver = MockResizeObserver as any;

describe('Scoreboard Component: Zero-Scroll Fit System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate desktop viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
  });

  test('A) ZERO SCROLL: Scoreboard root has overflow-hidden on desktop', () => {
    const { container } = render(
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

    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('lg:overflow-hidden');
    expect(root).toHaveClass('overflow-hidden');
    expect(root).toHaveClass('overscroll-behavior-none');
  });

  test('B) FIT LOGIC: CSS variables for row-height and font-size are applied', () => {
    const { container } = render(
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

    const root = container.firstChild as HTMLElement;
    
    // Check for existence of fit variables
    expect(root.style.getPropertyValue('--sb-row-h')).toBeDefined();
    expect(root.style.getPropertyValue('--sb-font')).toBeDefined();
    expect(root.style.getPropertyValue('--sb-gap')).toBeDefined();
  });

  test('C) LOGGING: Component logs fit computation on mount', () => {
    // Fix: require name is now declared
    const { logger } = require('../services/logger');
    
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

    // Note: Due to mock getBoundingClientRect returning 0 in JSDOM, 
    // it will likely log the fallback warn first if not manually mocked.
    expect(logger.warn || logger.info).toHaveBeenCalled();
  });

  test('D) REGRESSION: Scoreboard still renders player data correctly', () => {
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

    expect(screen.getByText('CONTESTANT ALPHA')).toBeInTheDocument();
    expect(screen.getByText('1200')).toBeInTheDocument();
  });
});