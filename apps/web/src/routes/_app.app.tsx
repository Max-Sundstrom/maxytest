import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';
import { useCreateStudy, useStudies } from '@/lib/queries/studies';
import { EmptyTestsState } from '@/components/studies/EmptyTestsState';
import { NewTestButton, StudyList } from '@/components/studies/StudyList';

// Route-tree-agnostic navigate type — see comment in lib/queries/auth.ts.
type LooseNavigate = (opts: {
  to: string;
  params?: Record<string, string>;
}) => unknown;

/**
 * `/app` — designer's test list.
 *
 * Behaviour:
 *   - Loading workspace → 3 skeleton cards (UI-SPEC.md §States Catalog).
 *   - Workspace loaded + 0 studies → <EmptyTestsState>.
 *   - Workspace loaded + N studies → "Tests" heading + <NewTestButton> + <StudyList>.
 *
 * Plan 01-04 will add the Archived tab and wire status mutations; this route
 * stops at the surface that Plan 01-03 needs.
 */
function AppHomeRoute() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } =
    useCurrentWorkspace();
  const studiesQuery = useStudies(workspace?.id);
  const createStudy = useCreateStudy(workspace?.id);
  const navigate = useNavigate() as unknown as LooseNavigate;

  const [triggerFailed, setTriggerFailed] = useState(false);

  // After 2s, if the workspace is still null and we have no in-flight error,
  // assume the bootstrap trigger silently failed (T-01-02-08). Surface a
  // distinct error message rather than a stuck spinner.
  useEffect(() => {
    if (workspace || workspaceLoading || workspaceError) return;
    const t = setTimeout(() => setTriggerFailed(true), 2000);
    return () => clearTimeout(t);
  }, [workspace, workspaceLoading, workspaceError]);

  const handleCreate = () => {
    createStudy.mutate(
      {},
      {
        onSuccess: ({ studyId }) => {
          navigate({
            to: '/studies/$id/edit',
            params: { id: studyId },
          });
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : 'Try again in a moment.';
          toast.error("Couldn't create the test", { description: message });
        },
      },
    );
  };

  if (workspaceError) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-2 text-h1 font-semibold">Something went wrong</h1>
        <p className="text-body text-muted-foreground">
          We couldn&rsquo;t load your workspace. Try refreshing the page.
        </p>
      </div>
    );
  }

  if (triggerFailed && !workspace) {
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

  // Show skeletons while we don't yet have a workspace OR the studies query
  // is still resolving for the first time.
  if (workspaceLoading || !workspace || studiesQuery.isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Skeleton className="mb-6 h-8 w-32" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  const studies = studiesQuery.studies;

  if (studies.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <EmptyTestsState
          onCreate={handleCreate}
          isPending={createStudy.isPending}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-h1 font-semibold tracking-tight text-foreground">
          Tests
        </h1>
        <NewTestButton onClick={handleCreate} isPending={createStudy.isPending} />
      </div>
      <StudyList studies={studies} />
    </main>
  );
}

export const Route = createFileRoute('/_app/app')({
  component: AppHomeRoute,
});
