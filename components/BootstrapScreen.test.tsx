
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BootstrapScreen } from './BootstrapScreen';
import { authService } from '../services/authService';
import { soundService } from '../services/soundService';

// --- MOCKS ---

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

// Mock clipboard API as it is not available in JSDOM environment
const mockWriteText = vi.fn();
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: mockWriteText,
  },
  configurable: true,
});

describe('BootstrapScreen Regression Suite', () => {
  const mockAddToast = vi.fn();
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1) Renders baseline UI with "admin" default and initialize button', () => {
    render(<BootstrapScreen addToast={mockAddToast} onComplete={mockOnComplete} />);

    expect(screen.getByText(/System Bootstrap/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. master_admin/i)).toHaveValue('admin');
    expect(screen.getByRole('button', { name: /Initialize Studio/i })).toBeInTheDocument();
  });

  it('2) Trims input and calls bootstrap service exactly once', async () => {
    vi.mocked(authService.bootstrapMasterAdmin).mockResolvedValue('mk-test-123');

    render(<BootstrapScreen addToast={mockAddToast} onComplete={mockOnComplete} />);

    const input = screen.getByPlaceholderText(/e.g. master_admin/i);
    fireEvent.change(input, { target: { value: '  super_admin  ' } });
    
    const submitBtn = screen.getByRole('button', { name: /Initialize Studio/i });
    fireEvent.click(submitBtn);

    expect(soundService.playClick).toHaveBeenCalled();
    expect(authService.bootstrapMasterAdmin).toHaveBeenCalledTimes(1);
    expect(authService.bootstrapMasterAdmin).toHaveBeenCalledWith('super_admin');
  });

  it('3) Handles success: shows "Credentials Generated", toast, and copy feedback', async () => {
    const TEST_TOKEN = 'mk-secret-production-token-123';
    vi.mocked(authService.bootstrapMasterAdmin).mockResolvedValue(TEST_TOKEN);

    render(<BootstrapScreen addToast={mockAddToast} onComplete={mockOnComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /Initialize Studio/i }));

    // Wait for Success View
    await waitFor(() => {
      expect(screen.getByText(TEST_TOKEN)).toBeInTheDocument();
      expect(screen.getByText(/Credentials Generated/i)).toBeInTheDocument();
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Master Admin Created Successfully');
    });

    // Test Copy Logic
    const copyBtn = screen.getByTitle(/Copy to Clipboard/i);
    fireEvent.click(copyBtn);
    expect(mockWriteText).toHaveBeenCalledWith(TEST_TOKEN);
    expect(mockAddToast).toHaveBeenCalledWith('success', 'Token copied to clipboard');

    // Test Completion
    const proceedBtn = screen.getByRole('button', { name: /Proceed to Login/i });
    fireEvent.click(proceedBtn);
    expect(mockOnComplete).toHaveBeenCalledTimes(1);
  });

  it('4) Handles error: displays error message in a toast', async () => {
    const ERROR_MSG = 'Bootstrap already completed or service down';
    vi.mocked(authService.bootstrapMasterAdmin).mockRejectedValue(new Error(ERROR_MSG));

    render(<BootstrapScreen addToast={mockAddToast} onComplete={mockOnComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Initialize Studio/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', ERROR_MSG);
      // Ensure we are still on the first step
      expect(screen.getByRole('button', { name: /Initialize Studio/i })).toBeInTheDocument();
    });
  });

  it('5) No Regression: Ensures the generated token is never leaked to console logs', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const SENSITIVE_TOKEN = 'mk-leak-test-token-safe';
    vi.mocked(authService.bootstrapMasterAdmin).mockResolvedValue(SENSITIVE_TOKEN);

    render(<BootstrapScreen addToast={mockAddToast} onComplete={mockOnComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Initialize Studio/i }));

    await waitFor(() => {
      expect(screen.getByText(SENSITIVE_TOKEN)).toBeInTheDocument();
    });

    // Verify token is NOT present in any console.log argument
    const leaked = consoleSpy.mock.calls.some(args => 
      args.some(arg => typeof arg === 'string' && arg.includes(SENSITIVE_TOKEN))
    );
    
    expect(leaked).toBe(false, "SENSITIVE_TOKEN was leaked to console.log!");
    consoleSpy.mockRestore();
  });
});
