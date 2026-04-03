import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  section?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for sidebar sections.
 * One section crashing must not take down the whole sidebar.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[PitchLink] Error in ${this.props.section || 'component'}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            padding: '12px',
            margin: '8px 0',
            borderRadius: '6px',
            backgroundColor: 'var(--pl-bg-tertiary)',
            border: '1px solid var(--pl-border-primary)',
            fontSize: '12px',
            color: 'var(--pl-text-secondary)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--pl-error)' }}>
            Something went wrong
          </div>
          <div>{this.state.error?.message || 'An unexpected error occurred'}</div>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              marginTop: '8px',
              padding: '4px 10px',
              fontSize: '11px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
