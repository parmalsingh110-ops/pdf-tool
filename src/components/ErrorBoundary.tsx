import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  resetKey: number;
}

interface Props {
  children: React.ReactNode;
  /** Optional location key — when this changes (route change), error state resets. */
  locationKey?: string;
}

/**
 * Catches uncaught JS errors anywhere below in the tree and renders a friendly
 * fallback instead of a blank white page. Auto-resets when the route changes
 * (so navigating away from a broken tool re-enables the rest of the app).
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Surface to console for debugging while still rendering the fallback.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
  }

  componentDidUpdate(prevProps: Props) {
    // Reset when the route changes so a broken page doesn't poison navigation.
    if (
      this.state.hasError &&
      this.props.locationKey !== undefined &&
      this.props.locationKey !== prevProps.locationKey
    ) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      resetKey: this.state.resetKey + 1,
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) {
      // `resetKey` lets us force-remount children when user clicks "Try again".
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    }

    const message = this.state.error?.message ?? 'An unexpected error occurred.';
    const stack = this.state.error?.stack ?? '';

    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
        <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl shadow-sm p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Something went wrong
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This tool hit an unexpected error. Your other tools are fine — try again, or pick a different tool.
              </p>
              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-words">
                  {message.slice(0, 240)}
                </p>
              </div>

              {import.meta.env.DEV && stack && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200">
                    Stack trace (dev only)
                  </summary>
                  <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-auto max-h-40">
                    {stack}
                  </pre>
                </details>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
                <button
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors"
                >
                  Reload page
                </button>
                <button
                  onClick={this.handleHome}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors"
                >
                  <Home className="w-4 h-4" />
                  Home
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
