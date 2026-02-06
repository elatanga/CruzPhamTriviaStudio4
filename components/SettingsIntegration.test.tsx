
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DirectorSettingsPanel } from './DirectorSettingsPanel';
import { GameBoard } from './GameBoard';
import { Scoreboard } from './Scoreboard';
import { GameState, BoardViewSettings } from '../types';

/**
 * Harness component to simulate App-level state propagation
 */
const IntegrationHarness = () => {
  const [settings, setSettings] = useState<BoardViewSettings>({
    categoryTitleScale: 'M',
    playerNameScale: 'M',
    tileScale: 'M',
    scoreboardScale: 1.0,
    tilePaddingScale: 1.0,
    updatedAt: ''
  });

  const categories = [{
    id: 'c1', title: 'TECH',
    questions: [{ id: 'q1', text: 'Q', answer: 'A', points: 100, isRevealed: false, isAnswered: false }]
  }];

  const players = [{ id: 'p1', name: 'Alice', score: 0, color: '#fff' }];

  return (
    <div>
      <DirectorSettingsPanel 
        settings={settings} 
        onUpdateSettings={(u) => setSettings(prev => ({ ...prev, ...u }))} 
      />
      <div id="board-mount">
        <GameBoard categories={categories} onSelectQuestion={() => {}} viewSettings={settings} />
      </div>
      <div id="scoreboard-mount">
        <Scoreboard players={players} selectedPlayerId={null} onAddPlayer={() => {}} onUpdateScore={() => {}} onSelectPlayer={() => {}} gameActive={true} viewSettings={settings} />
      </div>
    </div>
  );
};

describe('Settings Integration: Visual Propagation', () => {
  it('instantly reflows Board and Scoreboard on scale adjustment', () => {
    render(<IntegrationHarness />);

    // 1. Assert Baseline (Medium)
    const board = document.querySelector('#board-mount > div') as HTMLElement;
    const scoreboard = screen.getByTestId('scoreboard-root');
    
    expect(board.style.getPropertyValue('--cat-font-px')).toBe('16px');
    expect(scoreboard.style.getPropertyValue('--name-font-px')).toBe('16px');

    // 2. Adjust to XL
    const xlBtns = screen.getAllByText('XL');
    fireEvent.click(xlBtns[0]); // Category Title XL
    fireEvent.click(xlBtns[1]); // Tile Dim XL
    fireEvent.click(xlBtns[2]); // Player Name XL

    // 3. Assert Propagated Values
    expect(board.style.getPropertyValue('--cat-font-px')).toBe('24px');
    expect(board.style.getPropertyValue('--tile-scale-factor')).toBe('1.5');
    expect(scoreboard.style.getPropertyValue('--name-font-px')).toBe('22px'); // Clamped
  });

  it('applies numeric multipliers (scoreboard width)', () => {
    render(<IntegrationHarness />);
    const scoreboard = screen.getByTestId('scoreboard-root');
    
    // Baseline
    expect(scoreboard.style.getPropertyValue('--scoreboard-scale')).toBe('1');

    // Change to Ultra (1.4)
    fireEvent.click(screen.getByText('Ultra'));
    expect(scoreboard.style.getPropertyValue('--scoreboard-scale')).toBe('1.4');
  });
});
