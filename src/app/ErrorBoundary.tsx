import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Meridian caught an unexpected error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="card w-full max-w-lg p-6 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-danger-50 text-danger-500">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-base font-semibold">This screen hit an unexpected error</h1>
          <p className="mt-2 text-sm text-muted">
            The rest of Meridian is still running. Reload to return to your dashboard — your data is stored locally
            and has not been lost.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-sunken p-3 text-left text-xs text-muted">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>Dismiss</Button>
            <Button variant="primary" onClick={() => window.location.assign('/')}>Reload Meridian</Button>
          </div>
        </div>
      </div>
    );
  }
}
