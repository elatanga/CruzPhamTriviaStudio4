import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Scoreboard } from './Scoreboard';
import { Player, BoardViewSettings } from '../types';

// --- MOCKS ---

vi.mock('../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() }
}));

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn(), playSelect: vi.fn() }
}));

describe('Wildcard & Steals Logic Lock', () => {
  const mockViewSettings: BoardViewSettings = {
    categoryTitleScale: 'M',
    playerNameScale: 'M',
    tileScale: 'M',
    scoreboardScale: 1.0,
    tilePaddingScale: 1.0,
    updatedAt: ''
  };

  const players: Player[] = [
    { id: 'p1', name: 'Alice', score: 100, color: '#fff', wildcardsUsed: 1, stealsCount: 2 },
    { id: 'p2', name: 'Bob', score: 200, color: '#fff', wildcardsUsed: 4, stealsCount: 0 }
  ];

  it('1) RENDERS: Correct star color for partial wildcard usage (Orange)', () => {
    render(<Scoreboard players={players} selectedPlayerId={null} onAddPlayer={vi.fn()} onUpdateScore={vi.fn()} onSelectPlayer={vi.fn()} gameActive={true} viewSettings={mockViewSettings} />);
    
    const star = screen.getByText('★');
    expect(star).toHaveStyle('color: #FF8A00');
  });

  it('2) RENDERS: Correct star color and count for maximum wildcard usage (Yellow)', () => {
    render(<Scoreboard players={players} selectedPlayerId={null} onAddPlayer={vi.fn()} onUpdateScore={vi.fn()} onSelectPlayer={vi.fn()} gameActive={true} viewSettings={mockViewSettings} />);
    
    const stars = screen.getByText('★★★★');
    expect(stars).toHaveStyle('color: #FFD400');
  });

  it('3) RENDERS: Steals badge only for players with steals', () => {
    render(<Scoreboard players={players} selectedPlayerId={null} onAddPlayer={vi.fn()} onUpdateScore={vi.fn()} onSelectPlayer={vi.fn()} gameActive={true} viewSettings={mockViewSettings} />);
    
    expect(screen.getByText('STEALS: 2')).toBeInTheDocument();
    // Bob has 0 steals, so no badge should render for him
    expect(screen.queryByText('STEALS: 0')).not.toBeInTheDocument();
  });
});