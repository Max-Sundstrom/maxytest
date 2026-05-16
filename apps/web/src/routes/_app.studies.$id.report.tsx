/**
 * `/studies/$id/report` — the prototype-report page (Plan 02-10 Task 2).
 *
 * Mirrors the file-route shape of `_app.studies.$id.edit.tsx`. The `_app`
 * prefix is the pathless layout from Plan 01-02 that gates on the
 * designer's session via Supabase Auth. The loader best-effort prefetches
 * the study + blocks queries so the first render skips loading skeletons
 * when the data is already cached.
 *
 * Phase 2 ships ONE prototype block per study, so the PrototypeReport
 * component finds it via `useBlocks(studyId).find(b => b.type === 'prototype')`.
 * A multi-block selector + sankey view land in Phase 4 (REPORT-04).
 */

import { createFileRoute } from '@tanstack/react-router';
import { PrototypeReport } from '@/components/studio/report/PrototypeReport';
import { supabase } from '@/lib/supabase/auth';

export const Route = createFileRoute('/_app/studies/$id/report')({
  loader: async ({ params, context }) => {
    const qc = (context as { queryClient?: import('@tanstack/react-query').QueryClient })
      .queryClient;
    if (!qc) return null;

    // Best-effort prefetch — the report renders correctly even if these
    // miss; TanStack Query will then fetch on mount.
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
  component: ReportRoute,
});

function ReportRoute() {
  const { id } = Route.useParams();
  return <PrototypeReport studyId={id} />;
}
