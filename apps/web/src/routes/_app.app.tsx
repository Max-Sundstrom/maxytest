import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';

/**
 * `/app` — designer landing page after sign-in.
 *
 * Plan 01-02 ships an intentional placeholder so:
 *   - The auth flow is observable end-to-end (sign in → see workspace name).
 *   - The bootstrap trigger from 00001_init.sql is verified by the workspace
 *     query returning data (WS-01).
 *
 * Plan 01-03 replaces this with `<StudyList>` + `<EmptyTestsState>`. The
 * placeholder copy stays minimal so it doesn't compete with that screen.
 */
function AppHomeRoute() {
  const { workspace, isLoading, error } = useCurrentWorkspace();
  const [triggerFailed, setTriggerFailed] = useState(false);

  // After 2s, if the workspace is still null and we have no in-flight error,
  // assume the bootstrap trigger silently failed (T-01-02-08). Surface a
  // distinct error message rather than a stuck spinner.
  useEffect(() => {
    if (workspace || isLoading || error) return;
    const t = setTimeout(() => setTriggerFailed(true), 2000);
    return () => clearTimeout(t);
  }, [workspace, isLoading, error]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-2 text-h1 font-semibold">Something went wrong</h1>
        <p className="text-body text-muted-foreground">
          We couldn&rsquo;t load your workspace. Try refreshing the page.
        </p>
      </div>
    );
  }

  if (triggerFailed) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-2 text-h1 font-semibold">
          Workspace setup failed — contact support.
        </h1>
        <p className="text-body text-muted-foreground">
          The auto-create step that runs on first sign-in did not complete.
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8 py-16 text-center">
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-2 text-h1 font-semibold tracking-tight">
          Welcome to your workspace
        </h1>
        <p className="text-body text-muted-foreground">
          (Tests list lands in Plan 01-03.)
        </p>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/_app/app')({
  component: AppHomeRoute,
});
