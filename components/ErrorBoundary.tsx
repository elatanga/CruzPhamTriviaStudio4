import React, { ErrorInfo, ReactNode } from 'react';
import { logger } from '../services/logger';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component to catch and handle uncaught errors in the React component tree.
 */
// Fix: Use React.Component explicitly to ensure base class members like props and state are correctly inherited and recognized by TypeScript.
export class ErrorBoundary extends React.Component<Props, State> {
  // Fix: Explicitly initialize state as a class property for better type inference.
  public state: State = {
    hasError: false,
    error: null
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render shows the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to our internal logger for auditing and debugging.
    logger.error('Uncaught error in component tree', { error, errorInfo });
  }

  public handleReset = () => {
    // Resetting error state and performing a hard reload to attempt recovery.
    // Fix: setState is correctly inherited from React.Component
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    // Fix: state is correctly inherited from React.Component
    if (this.state.hasError) {
      // Render fallback studio failure UI.
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-gold-500 p-8 text-center font-sans">
          <div className="border border-gold-500/50 p-12 bg-gray-900/80 backdrop-blur-md rounded-lg max-w-lg shadow-2xl shadow-gold-500/10">
            <h1 className="text-3xl font-serif font-bold mb-4 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-600">
              CRITICAL FAILURE
            </h1>
            <p className="mb-6 text-gray-300">
              The studio encountered an unexpected anomaly. 
            </p>
            <p className="text-sm text-red-400 mb-8 font-mono bg-black/50 p-2 rounded">
              {this.state.error?.message || "Unknown Error"}
            </p>
            <button
              onClick={this.handleReset}
              className="px-6 py-3 bg-gradient-to-r from-gold-600 to-gold-400 text-black font-bold uppercase tracking-wider hover:scale-105 transition-transform rounded"
            >
              Reboot Studio
            </button>
          </div>
          <div className="mt-8 text-xs text-gray-600 font-mono">
            Error ID: {logger.getCorrelationId()}
          </div>
        </div>
      );
    }

    // Fix: props is correctly inherited from React.Component base class
    return this.props.children;
  }
}
