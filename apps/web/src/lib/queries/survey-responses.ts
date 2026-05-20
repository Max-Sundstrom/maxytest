/**
 * `useSurveyResponses` — Plan 04-03 Task 6.
 *
 * Single TanStack Query slot that fetches `responses` rows for ALL survey
 * blocks of a study. The hook feeds Plan 04-04's focused-block cards
 * (choice / scale / nps / agreement / context) and the Plan 04-05 CSV
 * export. Anti-pattern 1 mitigation: one round-trip → one cache slot →
 * one re-render dependency for every survey-block aggregator.
 *
 * Designer-side only — imports `@/lib/supabase/auth` (the authenticated
 * designer client). The public-share path in Plan 04-06 / 04-07 needs a
 * parallel anon read which will likely go through a SECURITY DEFINER RPC,
 * but THAT lives in the public-share plan.
 *
 * queryKey shape: ['survey-responses', studyId, sortedBlockIds, startISO|null, endISO|null]
 *   - `studyId` discriminates per study (RLS already enforces, but the cache
 *     slot also discriminates client-side).
 *   - `sortedBlockIds` is `[...blockIds].sort()` so the cache slot is stable
 *     under input-order changes (Plan 04-04 may reorder the survey block list
 *     in memory).
 *   - `dateRange.startISO` / `.endISO` thread the Plan 03.1-02 date filter
 *     through the same way `useBlockEvents` does (CONTEXT.md GA1 / D-71).
 *
 * `enabled`: false until `studyId` is truthy AND `blockIds.length > 0` —
 * survey-only tests with zero survey blocks (degenerate) won't trigger a
 * pointless `.in('block_id', [])` round-trip.
 *
 * staleTime: 30_000 — matches `useBlockEvents` so the report stays
 * consistent under TanStack Query's background-refetch defaults.
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase/auth';
import type { DateRange } from '@/lib/analytics/date-range';

/**
 * Row shape consumed by Plan 04-04 aggregators. Structurally a superset of
 * `SurveyCompletionRow` from `@/lib/analytics/session-filter` (so passing
 * `useSurveyResponses().data` to `classifyCompletion(... blocks, X)`
 * type-checks).
 *
 * `answer` is typed as `unknown` — each aggregator narrows via its own
 * Zod-aligned cast (ChoiceAnswer, ScaleAnswer, etc. from
 * `@/lib/blocks/schemas`). Keeping it `unknown` at the query boundary
 * avoids over-committing the hook to a specific block type when the same
 * row stream feeds five different aggregators.
 */
export interface SurveyResponseRow {
  session_id: string;
  block_id: string;
  answer: unknown;
  time_ms: number | null;
  submitted_at: string;
}

export function useSurveyResponses(
  studyId: string | null | undefined,
  blockIds: readonly string[],
  dateRange?: DateRange,
) {
  return useQuery({
    queryKey: [
      'survey-responses',
      studyId,
      [...blockIds].sort(),
      dateRange?.startISO ?? null,
      dateRange?.endISO ?? null,
    ] as const,
    enabled: !!studyId && blockIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<SurveyResponseRow[]> => {
      // `responses` rows live behind RLS that filters via the sessions →
      // studies → workspace_members chain. Joining `sessions!inner(study_id)`
      // gives us two wins:
      //   1. RLS-anchor — Supabase narrows the join before any rows leak.
      //   2. dateRange threading — when the designer picks a date window
      //      we filter on `sessions.started_at` so per-block timestamps
      //      stay consistent across the report.
      let query = supabase
        .from('responses')
        .select(
          'session_id, block_id, answer, time_ms, submitted_at, sessions!inner(study_id, started_at)',
        )
        .eq('sessions.study_id', studyId!)
        .in('block_id', [...blockIds]);
      if (dateRange) {
        query = query
          .gte('sessions.started_at', dateRange.startISO)
          .lte('sessions.started_at', dateRange.endISO);
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        session_id: string;
        block_id: string;
        answer: unknown;
        time_ms: number | null;
        submitted_at: string;
      }[];
      return rows.map((r) => ({
        session_id: r.session_id,
        block_id: r.block_id,
        answer: r.answer,
        time_ms: r.time_ms ?? null,
        submitted_at: r.submitted_at,
      }));
    },
  });
}
