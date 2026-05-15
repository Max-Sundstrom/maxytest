/**
 * `/r/$token` — the respondent runner entry point. Plan 01-05 Task 5.
 *
 * File-route naming per Pitfall 7: `_public.r.$token.tsx` maps to
 *   /_public/r/$token  →  URL: /r/$token
 * (the `_public` pathless layout strips its segment).
 *
 * The route's contract:
 *   - Parses + validates the 22-char token via Zod.
 *   - Calls `useRunnerSession(token)` which:
 *       1. Ensures `supabaseAnon.auth.signInAnonymously()` runs once.
 *       2. Resolves OR creates the sessions row.
 *       3. Fetches study + blocks + prior responses.
 *   - Branches on the hook's stable error codes:
 *       - `invalid_run_token`     → 404 card.
 *       - `not_accepting_responses` → <TestNotAcceptingScreen>.
 *       - otherwise                → <RunnerShell mode='live' />.
 *   - Emits `<meta name="robots" content="noindex,nofollow">` so search
 *     engines never index a respondent test URL (T-01-05-04).
 */

import { useEffect } from 'react';
import { z } from 'zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useRunnerSession, RunnerError } from '@/lib/queries/sessions';
import { RunnerShell } from '@/components/runner/RunnerShell';
import { TestNotAcceptingScreen } from '@/components/runner/TestNotAcceptingScreen';
import { Skeleton } from '@/components/ui/skeleton';

const tokenSchema = z.object({
  token: z.string().min(20).max(32),
});

export const Route = createFileRoute('/_public/r/$token')({
  params: {
    parse: (raw) => tokenSchema.parse(raw),
  },
  component: RunnerRoute,
  head: () => ({
    meta: [
      // T-01-05-04: prevent search engines from indexing test URLs.
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
});

function RunnerRoute() {
  const { token } = Route.useParams();
  const query = useRunnerSession(token);

  // Inject the noindex meta robustly even on TanStack versions that don't
  // route head() entries into <head>. The route's `head` is the canonical
  // path; this client-side hook is belt-and-suspenders.
  useEffect(() => {
    const existing = document.querySelector(
      'meta[name="robots"][data-runner="1"]',
    );
    if (existing) return;
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'robots');
    meta.setAttribute('content', 'noindex,nofollow');
    meta.setAttribute('data-runner', '1');
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  // Loading.
  if (query.isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-11 w-40" />
        </div>
      </div>
    );
  }

  // Stable error branches.
  if (query.error instanceof RunnerError) {
    if (query.error.code === 'not_accepting_responses') {
      return <TestNotAcceptingScreen />;
    }
    if (query.error.code === 'invalid_run_token') {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <h1 className="mb-2 text-h1 font-semibold">
              We can&rsquo;t find this test.
            </h1>
            <p className="mb-6 text-body text-muted-foreground">
              Double-check the link, or ask the test creator for an updated
              one.
            </p>
            <Link
              to="/"
              className="text-body text-accent underline-offset-4 hover:underline"
            >
              Go to homepage
            </Link>
          </div>
        </div>
      );
    }
  }

  // Unexpected hard failure — surface a generic message; the RunnerErrorBoundary
  // inside RunnerShell catches RUNTIME render errors, but this branch handles
  // the loader-side network failures before the shell mounts.
  if (query.error || !query.data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <h1 className="mb-2 text-h1 font-semibold">
            Something went wrong.
          </h1>
          <p className="mb-6 text-body text-muted-foreground">
            Try refreshing the page.
          </p>
          <button
            type="button"
            className="rounded-md bg-accent px-4 py-2 text-accent-foreground hover:bg-accent-hover min-h-touch min-w-touch"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  const { session, blocks, existingAnswers } = query.data;

  return (
    <RunnerShell
      mode="live"
      runToken={token}
      sessionId={session.id}
      blocks={blocks}
      existingAnswers={existingAnswers}
    />
  );
}
