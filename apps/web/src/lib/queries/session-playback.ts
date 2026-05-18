/**
 * `useSessionPlayback` — TanStack Query for ONE session's events.
 *
 * Plan 03-05 (Wave 4) — foundations for ANALYTICS-09 per-respondent playback.
 *
 * Why a separate query and not a `useMemo` derivation from `useBlockEvents`:
 *   `useBlockEvents` fetches ALL events for a block (~5k rows for a typical
 *   block with 100 sessions × 50 events). The playback drawer only ever
 *   needs ONE session's events (~50 rows). A fresh small query with
 *   `.eq('session_id', ...)` is cheaper than filtering 5k rows on the
 *   client AND it lets the drawer open before the aggregate dataset is
 *   even loaded. 03-RESEARCH.md §"useSessionPlayback" lines 1810-1827
 *   makes the explicit call: "separate query, not derived".
 *
 * Pitfall 9 (queryKey namespace): uses `'session-playback'` as the first
 * key segment — distinct from `'block-events'`, `'frame-events'`,
 * `'frame-stats'`, `'designer-sessions'`. No cache-slot collisions.
 *
 * Trust boundary: imports `@/lib/supabase/auth` (designer-side authenticated
 * client). RLS filters events down to workspaces the designer has access to
 * via `current_workspace_role()`. This file is NOT in the runner-tree
 * ESLint glob (`apps/web/eslint.config.js`).
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase/auth';
import type { BlockEventRow } from './block-events';

/**
 * Fetch all events for a single (session_id, block_id) pair.
 *
 * @param sessionId — `sessions.id` (UUID); when null/undefined the query is disabled.
 * @param blockId   — `blocks.id` (UUID); when null/undefined the query is disabled.
 *
 * Returns the raw `BlockEventRow[]` — the caller pipes them through
 * `playbackTimeline()` (pure-fn) to build a render-ready `PlaybackTimeline`.
 * Keeping the hook return shape == BlockEventRow keeps the pure-fn easily
 * testable in isolation (no React/Query coupling).
 */
export function useSessionPlayback(
  sessionId: string | null | undefined,
  blockId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['session-playback', sessionId, blockId] as const,
    enabled: !!sessionId && !!blockId,
    // 30s matches the rest of the Phase 3 read hooks (block-events.ts:71,
    // events-designer.ts:63). Playback data only changes if new events
    // somehow arrive mid-session-view — extremely rare for a finished
    // session, and the designer's "Reload" button would refetch anyway.
    staleTime: 30_000,
    queryFn: async (): Promise<BlockEventRow[]> => {
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, x, y, hotspot_id, hit_target_id, event_type, seq, session_id, client_ts, frame_id',
        )
        .eq('session_id', sessionId!)
        .eq('block_id', blockId!);
      if (error) throw error;
      return (data as BlockEventRow[]) ?? [];
    },
  });
}
