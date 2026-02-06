
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectorSettingsPanel } from './DirectorSettingsPanel';
import { BoardViewSettings } from '../types';
import React from 'react';

vi.mock('../services/soundService', () => ({
  soundService: { playClick: vi.fn() },
}));

describe('Studio Settings: Configuration Lock', () => {
  const mockOnUpdateSettings = vi.fn();
  
  const initialSettings: BoardViewSettings = {
    categoryTitleScale: 'M',
    playerNameScale: 'M',
    tileScale: 'M',
    scoreboardScale: 1.0,
    tilePaddingScale: 1.0,
    updatedAt: 'initial-iso'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * WHY THIS FAILS: Changing the 'Category Title' scale accidentally changed 'Player Name' or 'Tile' scale.
   * SETTINGS MUST BE FULLY INDEPENDENT AND ORTHOGONAL.
   */
  it('LOCK: Visual scaling updates are independent and do not leak between fields', () => {
    render(<DirectorSettingsPanel settings={initialSettings} onUpdateSettings={mockOnUpdateSettings} />);
    
    // Find all 'XL' buttons (one for each group)
    const xlButtons = screen.getAllByText('XL');
    
    // Click XL for Category Titles (first group)
    fireEvent.click(xlButtons[0]);

    expect(mockOnUpdateSettings).toHaveBeenCalledWith({
      categoryTitleScale: 'XL'
    });

    // Verify specifically that OTHER scales were NOT emitted in the partial update
    const callArgs = mockOnUpdateSettings.mock.calls[0][0];
    expect(callArgs.playerNameScale).toBeUndefined();
    expect(callArgs.tileScale).toBeUndefined();
  });

  /**
   * WHY THIS FAILS: The 'Defaults' button didn't reset to the canonical production baseline.
   * PRODUCTION DEFAULTS MUST REMAIN [M, M, M, 1.0, 1.0].
   */
  it('LOCK: Reset to defaults applies canonical production baseline', () => {
    const weirdSettings = { ...initialSettings, categoryTitleScale: 'XS' as const };
    
    render(<DirectorSettingsPanel settings={weirdSettings} onUpdateSettings={mockOnUpdateSettings} />);
    
    const resetBtn = screen.getByText(/Defaults/i);
    
    // Mock global confirm
    vi.stubGlobal('confirm', () => true);
    fireEvent.click(resetBtn);

    expect(mockOnUpdateSettings).toHaveBeenCalledWith({
      categoryTitleScale: 'M',
      tileScale: 'M',
      playerNameScale: 'M',
      scoreboardScale: 1.0,
      tilePaddingScale: 1.0
    });
  });
});
