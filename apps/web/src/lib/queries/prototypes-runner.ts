/**
 * Runner-side TanStack Query hooks for prototype frames + hotspots.
 *
 * Plan 02-09 W-06: PrototypeRunner used to fetch via inline useEffect +
 * supabaseAnon.from(...); this file lifts that to TanStack Query (cache +
 * dedupe + retry). The hooks live next to `@/lib/queries/prototypes.ts`
 * (designer mirror) but they use the ANON Supabase client.
 *
 * Trust boundary (RESEARCH.md Anti-Pattern 5 / ESLint runner-tree glob):
 *   - This file is in the ESLint runner-tree glob — DO NOT import
 *     `@/lib/supabase/auth`. The boundary is enforced at lint time by
 *     `apps/web/eslint.config.js` (Plan 02-01 extended the glob to cover
 *     `src/lib/queries/prototypes-runner.ts`).
 *
 * Caching strategy:
 *   - frames + hotspots become immutable once `prototype_versions.status =
 *     'complete'` (the only state at which the runner reads them). A long
 *     staleTime is therefore safe and saves needless re-fetches between
 *     remounts during the same respondent session.
 *
 * Ordering:
 *   - frames: ORDER BY position ASC — used to thread render_path_1x +
 *     render_path_2x into the signed-URL batch in mount order.
 *   - hotspots: ORDER BY z_index DESC — overlay hotspots (z_index ≥ 100)
 *     come first so the hit-test walker can early-out (PROTO-09). The
 *     designer-side mirror (`useHotspots`) applies the same ordering.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabaseAnon } from '@/lib/supabase/anon';
import type { Database } from '@/lib/supabase/types.gen';

type FrameRow = Database['public']['Tables']['frames']['Row'];
type HotspotRow = Database['public']['Tables']['hotspots']['Row'];

export type RunnerFrame = FrameRow;
export type RunnerHotspot = HotspotRow;

export function useFramesRunner(
  prototypeVersionId: string | null | undefined,
): UseQueryResult<RunnerFrame[], Error> {
  return useQuery({
    queryKey: ['frames:runner', prototypeVersionId] as const,
    enabled: !!prototypeVersionId,
    staleTime: 60_000,
    queryFn: async (): Promise<RunnerFrame[]> => {
      const { data, error } = await supabaseAnon
        .from('frames')
        .select(
          'id, frame_id, prototype_version_id, name, width, height, render_path_1x, render_path_2x, position',
        )
        .eq('prototype_version_id', prototypeVersionId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data as RunnerFrame[]) ?? [];
    },
  });
}

export function useHotspotsRunner(
  prototypeVersionId: string | null | undefined,
): UseQueryResult<RunnerHotspot[], Error> {
  return useQuery({
    queryKey: ['hotspots:runner', prototypeVersionId] as const,
    enabled: !!prototypeVersionId,
    staleTime: 60_000,
    queryFn: async (): Promise<RunnerHotspot[]> => {
      const { data, error } = await supabaseAnon
        .from('hotspots')
        .select(
          'id, frame_id, prototype_version_id, hotspot_id, target_frame_id, transition_kind, bbox_x, bbox_y, bbox_w, bbox_h, z_index, source_layer, figma_raw',
        )
        .eq('prototype_version_id', prototypeVersionId!)
        // DESC by z_index — overlay hotspots win the hit-test (PROTO-09).
        .order('z_index', { ascending: false });
      if (error) throw error;
      return (data as RunnerHotspot[]) ?? [];
    },
  });
}
