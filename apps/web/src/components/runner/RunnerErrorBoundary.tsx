/**
 * <RunnerErrorBoundary> — Plan 01-05 Task 3 / UI-SPEC.md §"<RunnerErrorBoundary>"
 *                       / D-25 / RUNNER-06.
 *
 * Class component (React error boundaries MUST be class components — there is
 * no functional-component equivalent for `componentDidCatch`).
 *
 * Surface contract:
 *   - Heading text-h1: "Something went wrong."
 *   - Body text-body text-muted-foreground: "Try refreshing the page."
 *   - Button: "Reload" → window.location.reload()
 *   - NEVER displays raw error text, status codes, or stack traces. Mobile
 *     respondents recover by reloading; the dev console gets the full error.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface State {
  hasError: boolean;
}

interface Props {
  children: ReactNode;
}

export class RunnerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Dev/Sentry visibility. Phase 1 logs to console; structured logging is
    // a Phase 5 polish step. PII never lands here because the runner doesn't
    // collect any (D-25 + Pitfall 10 default privacy posture).
    // eslint-disable-next-line no-console
    console.error('RunnerErrorBoundary caught:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8"
        role="alert"
      >
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <AlertOctagon
            className="mb-4 size-12 text-destructive"
            aria-hidden="true"
          />
          <h1 className="mb-2 text-h1 font-semibold">Something went wrong.</h1>
          <p className="mb-6 text-body text-muted-foreground">
            Try refreshing the page.
          </p>
          <Button
            type="button"
            size="lg"
            className="min-h-touch min-w-touch"
            onClick={this.handleReload}
          >
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
