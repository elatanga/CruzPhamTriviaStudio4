import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GameBoard } from './GameBoard';
import { BoardViewSettings } from '../types';

describe('Board Privacy: Analytics Isolation Regression', () => {
  const mockSettings: BoardViewSettings = {
    categoryTitleScale: 'M',
    playerNameScale: 'M',
    tileScale: 'M',
    scoreboardScale: 1.0,
    tilePaddingScale: 1.0,
    updatedAt: ''
  };

  it('A) Zero-Leak Policy: Presentation board does NOT render log or analytics UI', () => {
    render(
      <GameBoard 
        categories={[{ id: 'c1', title: 'HISTORY', questions: [] }]} 
        onSelectQuestion={vi.fn()} 
        viewSettings={mockSettings} 
      />
    );

    // Assert absolute absence of analytics keywords
    const forbiddenKeywords = [/Live Event Log/i, /Analytics/i, /Download Logs/i, /Telemetry/i, /Production Audit/i];
    
    forbiddenKeywords.forEach(regex => {
      expect(screen.queryByText(regex)).not.toBeInTheDocument();
    });

    // Assert absence of any component containers that might house them
    expect(document.querySelector('.divide-zinc-900')).not.toBeInTheDocument();
  });

  it('B) Snapshot: Locks board layout to prevent silent introduction of log panels', () => {
    const { container } = render(
      <GameBoard 
        categories={[{ id: 'c1', title: 'HISTORY', questions: [] }]} 
        onSelectQuestion={vi.fn()} 
        viewSettings={mockSettings} 
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});