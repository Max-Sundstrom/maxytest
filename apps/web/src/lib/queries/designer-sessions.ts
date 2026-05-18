/**
 * `useDesignerSessions` — TanStack Query for the list of respondent sessions
 * within a study.
 *
 * Plan 03-05 (Wave 4) — foundations for ANALYTICS-09 per-respondent playback.
 * Feeds the left column of the future PlaybackDrawer (`SessionList` —
 * Plan 03-05 Task 3); also re-usable by Phase 6 cohort filters.
 *
 * The hook returns `SessionRow` objects (Supabase-generated row type for
 * `public.sessions`) sorted by `started_at DESC` — newest sessions first,
 * matching the GoalScreenDrawer / SessionList expected order.
 *
 * Pitfall 9 (queryKey namespace): uses `'designer-sessions'` — distinct from
 * `'sessions'` (which is reserved for `useRunnerSession`'s anon-scope
 * lookups in `sessions.ts`). No cross-tree cache-slot collisions.
 *
 * Trust boundary: imports `@/lib/supabase/auth` (designer-side authenticated
 * client). RLS policy `sessions_designer_read` (migration 00001, line 291)
 * filters rows down to studies in workspaces the designer has access to via
 * `current_workspace_role()`. This file is NOT in the runner-tree ESLint
 * glob.
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/types.gen';

/**
 * Row shape for the designer-side sessions list. Mirrors the Supabase-
 * generated `public.sessions` Row type 1:1 — we don't strip columns at
 * the query layer because the SessionList component reads `device_type`,
 * `started_at`, `status`, `id` and may grow to read more (last_seen_at
 * for a "still running" badge, etc).
 *
 * Note: we deliberately DO NOT alias this to `SessionRow` from
 * `sessions.ts` because that file is in the runner-tree ESLint glob and
 * cannot be imported from designer-side modules.
 */
export type DesignerSession = Database['public']['Tables']['sessions']['Row'];

/**
 * Fetch sessions for a single study, ordered newest-first.
 *
 * @param studyId — `studies.id` (UUID); when null/undefined the query is disabled.
 */
export function useDesignerSessions(studyId: string | null | undefined) {
  return useQuery({
    queryKey: ['designer-sessions', studyId] as const,
    enabled: !!studyId,
    // 30s matches block-events / session-playback. Sessions list is mostly
    // read-only from the designer's POV (respondents create sessions; the
    // designer never modifies them).
    staleTime: 30_000,
    queryFn: async (): Promise<DesignerSession[]> => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('study_id', studyId!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data as DesignerSession[]) ?? [];
    },
  });
}
