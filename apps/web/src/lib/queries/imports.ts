/**
 * Designer-side TanStack Query hook for the prototype_imports job table.
 *
 * Plan: 02-flagship-prototype-block-heatmap / 02-03 / Task 2.
 *
 * `useImportJob(importId)` polls the row on mount AND subscribes to the
 * Supabase Realtime channel `imports:{import_id}` that figma-import-worker
 * broadcasts on. The channel sends `{ status, frames_total, frames_done,
 * prototype_version_id }` payloads on every uploaded frame and on terminal
 * states — the FigmaImportDialog (Plan 02-04) renders a progress bar from
 * frames_done / frames_total and shows a CTA when status === 'done' | 'partial'.
 *
 * If Realtime is disabled (RESEARCH.md A6), the query still works — it just
 * stalls on initial values until the next manual refetch. Plan 02-04's
 * dialog adds a 1s polling fallback via `refetchInterval` per-mount.
 *
 * Uses the designer auth client (@/lib/supabase/auth) — runner code MUST NOT
 * import this file. The ESLint config in apps/web/eslint.config.js enforces
 * the boundary.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/types.gen';

type PrototypeImportRow = Database['public']['Tables']['prototype_imports']['Row'];

export type PrototypeImport = PrototypeImportRow;

/** Payload shape the Edge Function broadcasts on `imports:{id}`. Mirrors the
 *  `payload` object in supabase/functions/figma-import-worker/index.ts. */
export interface ImportProgressPayload {
  status?: PrototypeImport['status'];
  frames_total?: number;
  frames_done?: number;
  prototype_version_id?: string | null;
  error_code?: string | null;
}

/**
 * Fetch + subscribe to a prototype_imports row. Returns a TanStack Query
 * result whose `data` is updated in-place by Realtime broadcasts AND by the
 * initial fetch.
 */
export function useImportJob(
  importId: string | null | undefined,
): UseQueryResult<PrototypeImport | null, Error> {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['import', importId] as const,
    enabled: !!importId,
    // staleTime: 0 — progress UX wants fresh values on focus / mount.
    staleTime: 0,
    queryFn: async (): Promise<PrototypeImport | null> => {
      const { data, error } = await supabase
        .from('prototype_imports')
        .select('*')
        .eq('id', importId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  useEffect(() => {
    if (!importId) return;
    const channel = supabase.channel('imports:' + importId);
    channel.on('broadcast', { event: 'progress' }, (msg) => {
      const payload = (msg.payload ?? {}) as ImportProgressPayload;
      qc.setQueryData<PrototypeImport | null>(['import', importId], (prev) => {
        if (!prev) return prev ?? null;
        return {
          ...prev,
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.frames_total !== undefined ? { frames_total: payload.frames_total } : {}),
          ...(payload.frames_done !== undefined ? { frames_done: payload.frames_done } : {}),
          ...(payload.prototype_version_id !== undefined
            ? { prototype_version_id: payload.prototype_version_id }
            : {}),
          ...(payload.error_code !== undefined ? { error_code: payload.error_code } : {}),
          updated_at: new Date().toISOString(),
        };
      });
      // On terminal states, also bump the query to refetch the canonical row
      // so warnings/error_message land from the DB (broadcasts don't carry the
      // full row to keep payloads small).
      if (
        payload.status === 'done' ||
        payload.status === 'partial' ||
        payload.status === 'failed'
      ) {
        void qc.invalidateQueries({ queryKey: ['import', importId] });
      }
    });
    void channel.subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [importId, qc]);

  return query;
}
