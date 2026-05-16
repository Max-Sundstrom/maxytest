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

/**
 * Terminal status set — the union of `prototype_imports.status` values that
 * stop the polling loop and prevent the stalled-import heuristic from firing.
 *
 * Kept as a `readonly` tuple so it serves as the source of truth for both the
 * `refetchInterval` predicate below AND `isLikelyStalled`. Mirrors the
 * TERMINAL_STATUSES constant inside FigmaImportDialog (intentional duplication
 * — the dialog cannot import this without coupling its rendering to query
 * internals, and the union is small enough that drift is caught by tests).
 */
const TERMINAL_STATUSES = ['done', 'failed', 'partial'] as const;

/**
 * Phase 02.1 / D-04c — stale-fetch threshold.
 *
 * If a `prototype_imports` row sits in a non-terminal status with no
 * `updated_at` refresh for longer than this threshold, the frontend treats it
 * as a probable crash (likely OOM-adjacent timeout, runtime exception, or
 * connectivity loss between the Edge Function and Postgres).
 *
 * The Edge Function writes `updated_at` on every progress broadcast (per-frame
 * upload) — so a healthy import refreshes `updated_at` every few seconds. 60s
 * of silence is a strong signal something is wrong. Combined with the outer
 * try/catch from Task 1 of this plan, this gives the user a precise "Import
 * appears stalled — likely crashed" diagnostic instead of a forever-spinner.
 */
export const STALE_FETCH_THRESHOLD_MS = 60_000;

/**
 * Phase 02.1 / D-04c — return true when a non-terminal import has been silent
 * for longer than {@link STALE_FETCH_THRESHOLD_MS}.
 *
 * - Terminal jobs (done / failed / partial) are NEVER "stalled" — they
 *   already have a final status the UI can act on.
 * - Missing or malformed `updated_at` returns false (defensive — we'd rather
 *   not flicker the stalled banner on rows we don't trust).
 * - `nowMs` defaults to `Date.now()` for production but is overridable in
 *   tests so unit suites don't have to mock the clock.
 */
export function isLikelyStalled(
  job: PrototypeImport | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!job) return false;
  if ((TERMINAL_STATUSES as readonly string[]).includes(job.status)) return false;
  if (!job.updated_at) return false;
  const updatedMs = new Date(job.updated_at).getTime();
  if (Number.isNaN(updatedMs)) return false;
  return nowMs - updatedMs > STALE_FETCH_THRESHOLD_MS;
}

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
    // Phase 02.1 / D-04c — 2s polling fallback. Realtime broadcasts are the
    // primary signal, but logs showed Realtime occasionally falling back to
    // REST under transient network conditions. Polling every 2 seconds while
    // the job is non-terminal guarantees the dialog never sits on stale data
    // for more than 2 seconds — and the polling stops on `done | failed |
    // partial` so we don't hammer PostgREST for completed jobs that the user
    // hasn't closed the dialog on yet.
    //
    // The signature `(query) => …` matches TanStack Query v5's contract; we
    // read `query.state.data` (typed via the queryFn return) to decide.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000; // not loaded yet → poll
      if ((TERMINAL_STATUSES as readonly string[]).includes(data.status)) return false;
      return 2000; // still in-flight → keep polling
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
