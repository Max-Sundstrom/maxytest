import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SkinPicker } from '@/components/shared/SkinPicker';

/**
 * Single QueryClient instance for the app.
 * Phase 1 defaults per RESEARCH.md §"Pattern 3" (TanStack Query baseline):
 *   - `staleTime: 30_000` — Supabase data treated as fresh for 30s; mid-edit
 *     refetches don't fight optimistic mutations.
 *   - `refetchOnWindowFocus: false` — D-15 BroadcastChannel handles cross-tab
 *     invalidation explicitly; we don't want a noisy refetch on every tab focus.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * RunnerErrorBoundary lands in Plan 01-05 (mobile runner tree). For Plan 01-01
 * we ship a minimal app-wide boundary so render errors don't blank the screen.
 */
interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Phase 1: console only. Sentry / structured logging lands later.

    console.error('AppErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
            <p className="mb-6 text-slate-600">Try refreshing the page.</p>
            <Button onClick={this.handleReload}>Reload</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppErrorBoundary>
          <Outlet />
        </AppErrorBoundary>
        <SkinPicker />
        <Toaster richColors position="bottom-right" theme="light" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
