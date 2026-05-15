/**
 * `/studies/$id/edit` — the test builder (Plan 01-03 Task 5).
 *
 * Route file conforms to TanStack Router file-based routing (Pitfall 7):
 *   `_app.studies.$id.edit.tsx` → /_app/studies/$id/edit
 * The `_app` prefix is a pathless layout (Plan 01-02) that gates on session.
 *
 * `loader` preflights the study + blocks queries via `ensureQueryData` so the
 * first render doesn't show a flash of loading skeletons when the data is
 * already cached.
 */

import { createFileRoute } from '@tanstack/react-router';
import { BuilderShell } from '@/components/builder/BuilderShell';
import { supabase } from '@/lib/supabase/auth';

export const Route = createFileRoute('/_app/studies/$id/edit')({
  loader: async ({ params, context }) => {
    // We use `getQueryClient` via context if available; for Phase 1 the
    // QueryClient is the singleton in __root.tsx. TanStack Query treats
    // a missing prefetch as "fetch on mount", which is fine — the loader
    // is best-effort. Errors here would surface to the route ErrorBoundary
    // and the user would see the AppErrorBoundary fallback.
    const qc = (context as { queryClient?: import('@tanstack/react-query').QueryClient })
      .queryClient;
    if (!qc) return null;

    await Promise.all([
      qc.ensureQueryData({
        queryKey: ['study', params.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('studies')
            .select('*')
            .eq('id', params.id)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
      }),
      qc.ensureQueryData({
        queryKey: ['blocks', params.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('blocks')
            .select('*')
            .eq('study_id', params.id)
            .order('position', { ascending: true });
          if (error) throw error;
          return data ?? [];
        },
      }),
    ]);
    return null;
  },
  component: BuilderRoute,
});

function BuilderRoute() {
  const { id } = Route.useParams();
  return <BuilderShell studyId={id} />;
}
