/**
 * Designer-side events read hooks — Plan 02-08 Task 4.
 *
 * Consumed by Plan 02-10's `PrototypeReport` (per-frame heatmap canvas +
 * misclick decomposition). This file is NOT in the runner-tree ESLint glob
 * (`apps/web/eslint.config.js`) — it imports `@/lib/supabase/auth` (the
 * designer-side authenticated client). RLS on `events` filters rows down to
 * the workspaces the designer has access to via `current_workspace_role()`.
 *
 * Two hooks:
 *
 *   - `useFrameEvents(prototypeVersionId, frameId, filters)` returns the raw
 *     event rows needed for the simpleheat canvas overlay (`x`, `y`,
 *     `hotspot_id`, `hit_target_id`, etc).
 *   - `useFrameStats(prototypeVersionId, frameId)` returns the per-frame
 *     summary used in the misclick-decomposition card (total clicks,
 *     unique visitors, hit rate, misses). Server-side aggregation is
 *     deferred to Phase 8 — the JS reduce is fine for Phase 2's single-
 *     frame / single-cohort scope.
 *
 * The two hooks deliberately fetch the same partition twice rather than
 * sharing a query — they ask for different columns, and TanStack Query
 * caches them under independent keys so updating filters on one doesn't
 * invalidate the other.
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase/auth';

/** Shape of the columns the heatmap canvas + misclick decomposition need. */
export interface FrameEventRow {
  id: string;
  x: number | null;
  y: number | null;
  hotspot_id: string | null;
  hit_target_id: string | null;
  event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish';
  seq: number;
  session_id: string;
  client_ts: string;
}

export interface UseFrameEventsFilters {
  /** Filter to a single event type (defaults to all). */
  eventType?: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish';
}

/**
 * Raw events for a single (prototype_version, frame) tuple. Used by the
 * simpleheat overlay; the canvas reads `x` / `y` and the misclick layer
 * reads `hit_target_id`.
 */
export function useFrameEvents(
  prototypeVersionId: string | null | undefined,
  frameId: string | null | undefined,
  filters: UseFrameEventsFilters = {},
) {
  return useQuery({
    queryKey: ['frame-events', prototypeVersionId, frameId, filters] as const,
    enabled: !!prototypeVersionId && !!frameId,
    // Reports rarely change mid-view; 30s staleTime avoids hammering the
    // server when a designer toggles a filter back and forth.
    staleTime: 30_000,
    queryFn: async (): Promise<FrameEventRow[]> => {
      let q = supabase
        .from('events')
        .select('id, x, y, hotspot_id, hit_target_id, event_type, seq, session_id, client_ts')
        .eq('prototype_version_id', prototypeVersionId!)
        .eq('frame_id', frameId!);
      if (filters.eventType) q = q.eq('event_type', filters.eventType);
      const { data, error } = await q;
      if (error) throw error;
      return (data as FrameEventRow[]) ?? [];
    },
  });
}

/** Aggregated stats for the misclick-decomposition card on each frame. */
export interface FrameStats {
  /** Total `event_type='tap'` rows in this frame partition. */
  totalClicks: number;
  /** Distinct `session_id`s contributing at least one tap. */
  uniqueVisitors: number;
  /** Taps that resolved to a hit target (any non-null `hit_target_id`). */
  hits: number;
  /** Misses (no hit_target_id). */
  misses: number;
  /** hits / totalClicks; 0 when no taps. */
  hitRate: number;
}

export function useFrameStats(
  prototypeVersionId: string | null | undefined,
  frameId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['frame-stats', prototypeVersionId, frameId] as const,
    enabled: !!prototypeVersionId && !!frameId,
    staleTime: 30_000,
    queryFn: async (): Promise<FrameStats> => {
      const { data, error } = await supabase
        .from('events')
        .select('hit_target_id, session_id')
        .eq('prototype_version_id', prototypeVersionId!)
        .eq('frame_id', frameId!)
        .eq('event_type', 'tap');
      if (error) throw error;
      const taps = data ?? [];
      const totalClicks = taps.length;
      const uniqueVisitors = new Set(taps.map((r) => r.session_id)).size;
      const hits = taps.filter((r) => r.hit_target_id !== null).length;
      const misses = totalClicks - hits;
      return {
        totalClicks,
        uniqueVisitors,
        hits,
        misses,
        hitRate: totalClicks === 0 ? 0 : hits / totalClicks,
      };
    },
  });
}
