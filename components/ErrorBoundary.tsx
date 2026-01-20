import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../services/logger';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught error in component tree', { error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
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

    return this.props.children;
  }
}