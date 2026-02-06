
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BootstrapScreen } from './BootstrapScreen';
import { authService } from '../services/authService';

vi.mock('../services/authService', () => ({
  authService: {
    bootstrapMasterAdmin: vi.fn(),
  },
}));

vi.mock('../services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
  },
}));

describe('BootstrapScreen Regression (After SMS Integration)', () => {
  it('A) Initial state renders correctly', () => {
    render(<BootstrapScreen addToast={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByText(/System Bootstrap/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Initialize Studio/i })).toBeInTheDocument();
  });

  it('B) Successfully handles master token generation', async () => {
    vi.mocked(authService.bootstrapMasterAdmin).mockResolvedValue('mk-test-reg-123');
    const mockOnComplete = vi.fn();

    render(<BootstrapScreen addToast={vi.fn()} onComplete={mockOnComplete} />);
    
    const btn = screen.getByRole('button', { name: /Initialize Studio/i });
    btn.click();

    await waitFor(() => {
      expect(screen.getByText('mk-test-reg-123')).toBeInTheDocument();
      expect(screen.getByText(/Credentials Generated/i)).toBeInTheDocument();
    });

    const proceedBtn = screen.getByRole('button', { name: /Proceed to Login/i });
    proceedBtn.click();
    expect(mockOnComplete).toHaveBeenCalled();
  });
});
