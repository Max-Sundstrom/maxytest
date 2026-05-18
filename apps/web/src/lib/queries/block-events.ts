/**
 * Block-scoped events read hook — Plan 03-01 Task 1D.
 *
 * The driver hook for ALL Phase 3 analytics surfaces:
 *   - Header aggregates (Plan 03-01)         → groups by session_id + classifyOutcome
 *   - Sankey transition graph (Plan 03-02)   → filters frame_enter sequences
 *   - Funnel + drop-off (Plan 03-04)         → checks per-session visited frames
 *   - Time-on-frame (Plan 03-05)             → reads frame_enter / frame_exit pairs
 *   - Playback timeline (Plan 03-06)         → sorts session events by seq
 *
 * One TanStack query slot, one round-trip to Supabase. All analytics consume
 * the same cached rows; switching tabs / toggling sankey mode does not refetch.
 *
 * Distinct from `useFrameEvents` in `events-designer.ts` — that hook filters by
 * `frame_id` (per-frame heatmap canvas), whereas we want every event in the
 * block partition. `frame_id` is therefore SELECTED here (useFrameEvents skips
 * it because the column is part of the `.eq` predicate there).
 *
 * Trust boundary: imports `@/lib/supabase/auth` (designer-side authenticated
 * client). RLS on `events` filters rows down to workspaces the designer has
 * access to via `current_workspace_role()` (Phase 2 policy). This file is NOT
 * in the runner-tree ESLint glob (`apps/web/eslint.config.js`).
 *
 * queryKey namespace: `'block-events'` — unique per Pitfall 9 in 03-RESEARCH.md
 * (every Phase 3 hook MUST use a distinct namespace to avoid TanStack Query
 * cache-slot collisions).
 *
 * staleTime: 30_000 — matches `useFrameEvents` (events-designer.ts:63-64).
 * Report data rarely changes mid-view; 30 s avoids hammering the server when
 * the designer toggles a filter back and forth.
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase/auth';

/**
 * Row shape for the analytics consumers. Mirror of `FrameEventRow`
 * (events-designer.ts:32-42) + `frame_id` because we don't `.eq('frame_id')`
 * at query time. Every downstream pure-fn keys on `frame_id` (sankey edge
 * source/target, finish_frame check in classifyOutcome, funnel per-step
 * visited-set, etc.) — so the column MUST be present.
 */
export interface BlockEventRow {
  id: string;
  x: number | null;
  y: number | null;
  hotspot_id: string | null;
  hit_target_id: string | null;
  event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish';
  seq: number;
  session_id: string;
  client_ts: string;
  /** Required by analytics — null for `task_finish` if it lacks a frame anchor. */
  frame_id: string | null;
}

/**
 * Block-scoped events for analytics aggregation.
 *
 * @param prototypeVersionId — `prototype_versions.id` (UUID) the study points at.
 * @param blockId            — `blocks.id` (UUID) of the prototype block.
 */
export function useBlockEvents(
  prototypeVersionId: string | null | undefined,
  blockId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['block-events', prototypeVersionId, blockId] as const,
    enabled: !!prototypeVersionId && !!blockId,
    staleTime: 30_000,
    queryFn: async (): Promise<BlockEventRow[]> => {
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, x, y, hotspot_id, hit_target_id, event_type, seq, session_id, client_ts, frame_id',
        )
        .eq('prototype_version_id', prototypeVersionId!)
        .eq('block_id', blockId!);
      if (error) throw error;
      return (data as BlockEventRow[]) ?? [];
    },
  });
}
