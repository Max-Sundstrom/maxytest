import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';
import { useCreateStudy, useStudies, useStudiesArchived } from '@/lib/queries/studies';
import { EmptyTestsState } from '@/components/studies/EmptyTestsState';
import { NewTestButton, StudyList } from '@/components/studies/StudyList';
import { ArchivedTabPanel } from '@/components/studies/ArchivedTabPanel';

// Route-tree-agnostic navigate type — see comment in lib/queries/auth.ts.
type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

/**
 * `/app` — designer's test list.
 *
 * Plan 01-03 surface: workspace-loading skeletons → EmptyTestsState OR
 * StudyList with NewTestButton.
 *
 * Plan 01-04 surface: when ANY test (active OR archived) exists, wrap the
 * list in shadcn Tabs ["Tests", "Archived"]. The greenfield empty state
 * (zero studies in BOTH lists) still shows <EmptyTestsState>.
 */
function AppHomeRoute() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useCurrentWorkspace();
  const studiesQuery = useStudies(workspace?.id);
  const archivedQuery = useStudiesArchived(workspace?.id);
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
          const message = err instanceof Error ? err.message : 'Try again in a moment.';
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
        <h1 className="mb-2 text-h1 font-semibold">Workspace setup failed — contact support.</h1>
        <p className="text-body text-muted-foreground">
          The auto-create step that runs on first sign-in did not complete.
        </p>
      </div>
    );
  }

  // Show skeletons while we don't yet have a workspace OR the active-studies
  // query is still resolving for the first time. We don't block on the
  // archived query — it can stream in independently because the Archived
  // tab is not the default view.
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
  const archivedStudies = archivedQuery.studies;
  const hasAnyStudies = studies.length > 0 || archivedStudies.length > 0;

  // Greenfield UX: no active AND no archived → onboarding empty state.
  if (!hasAnyStudies) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <EmptyTestsState onCreate={handleCreate} isPending={createStudy.isPending} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-h1 font-semibold tracking-tight text-foreground">Tests</h1>
        <NewTestButton onClick={handleCreate} isPending={createStudy.isPending} />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Tests</TabsTrigger>
          <TabsTrigger value="archived">
            Archived
            {archivedStudies.length > 0 && ` (${archivedStudies.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {studies.length === 0 ? (
            <p className="py-12 text-center text-body text-muted-foreground">
              No active tests. All your tests are archived.
            </p>
          ) : (
            <StudyList studies={studies} workspaceId={workspace.id} />
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <ArchivedTabPanel workspaceId={workspace.id} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

export const Route = createFileRoute('/_app/app')({
  component: AppHomeRoute,
});
