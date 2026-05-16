/**
 * Designer-side TanStack Query hooks for the Phase 2 prototype subsystem.
 *
 * Plan: 02-flagship-prototype-block-heatmap / 02-03 / Task 2.
 *
 * Source: apps/web/src/lib/queries/blocks.ts (Phase 1 canonical pattern).
 * Uses the designer auth client (@/lib/supabase/auth) — runner code MUST NOT
 * import this file. The ESLint config in apps/web/eslint.config.js enforces
 * the boundary (no-restricted-imports rule for runner-tree paths).
 *
 * Exports:
 *   - usePrototypeVersion(id) — fetches one prototype_versions row.
 *       Always filters status='complete' so designers never get a row that's
 *       still being uploaded by the import worker (B-05 invariant — the runner
 *       RLS in 00007 already enforces this for runners; the designer-side hook
 *       mirrors the filter so the import dialog only shows "ready" versions).
 *   - useFrames(prototypeVersionId) — paginated-friendly frame list
 *       ordered by position. The builder thumbnail grid (D-08, Plan 02-06)
 *       consumes this.
 *   - useHotspots(frameDbId) — hotspots for a single frame ordered by
 *       z_index DESC so the hit-test walker iterates overlay hotspots first
 *       (PROTO-09). The runner PrototypeRunner consumes the runner-side hook
 *       in lib/queries/prototypes-runner.ts; this designer-side hook is for
 *       the PrototypeEditor inspector.
 *   - useImportPrototype() — invokes the figma-import-worker Edge Function
 *       with the designer's JWT. Returns { import_id }. Does NOT invalidate
 *       prototype_versions on success — the import is async; the dialog
 *       subscribes via useImportJob(import_id) for actual completion.
 */

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { supabase } from '@/lib/supabase/auth';
import type { Database } from '@/lib/supabase/types.gen';

type PrototypeVersionRow = Database['public']['Tables']['prototype_versions']['Row'];
type FrameRow = Database['public']['Tables']['frames']['Row'];
type HotspotRow = Database['public']['Tables']['hotspots']['Row'];

export type PrototypeVersion = PrototypeVersionRow;
export type Frame = FrameRow;
export type Hotspot = HotspotRow;

/** Error surface for the figma-import-worker invocation. Codes mirror the
 *  Edge Function's response.error values so the dialog can render specific
 *  copy per failure mode. */
export type ImportPrototypeErrorCode =
  | 'workspace_membership_required'
  | 'unauthenticated'
  | 'bad_request'
  | 'invalid_share_link'
  | 'study_not_found'
  | 'unknown';

export class ImportPrototypeError extends Error {
  readonly code: ImportPrototypeErrorCode;
  readonly status?: number;

  constructor(code: ImportPrototypeErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.name = 'ImportPrototypeError';
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function usePrototypeVersion(
  prototypeVersionId: string | null | undefined,
): UseQueryResult<PrototypeVersion | null, Error> {
  return useQuery({
    queryKey: ['prototype_version', prototypeVersionId] as const,
    enabled: !!prototypeVersionId,
    // Immutable once status='complete' — long stale is safe and saves
    // network round-trips when the builder reopens the editor.
    staleTime: 60_000,
    queryFn: async (): Promise<PrototypeVersion | null> => {
      const { data, error } = await supabase
        .from('prototype_versions')
        .select('*')
        .eq('id', prototypeVersionId!)
        .eq('status', 'complete')
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useFrames(
  prototypeVersionId: string | null | undefined,
): UseQueryResult<Frame[], Error> {
  return useQuery({
    queryKey: ['frames', prototypeVersionId] as const,
    enabled: !!prototypeVersionId,
    staleTime: 60_000,
    queryFn: async (): Promise<Frame[]> => {
      const { data, error } = await supabase
        .from('frames')
        .select('*')
        .eq('prototype_version_id', prototypeVersionId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHotspots(
  frameDbId: string | null | undefined,
): UseQueryResult<Hotspot[], Error> {
  return useQuery({
    queryKey: ['hotspots', frameDbId] as const,
    enabled: !!frameDbId,
    staleTime: 60_000,
    queryFn: async (): Promise<Hotspot[]> => {
      const { data, error } = await supabase
        .from('hotspots')
        .select('*')
        .eq('frame_id', frameDbId!)
        // DESC by z_index — overlay hotspots (z_index ≥ 100) come first so
        // the hit-test walker can early-out on overlay matches (PROTO-09).
        .order('z_index', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// useImportPrototype — invoke the figma-import-worker Edge Function
// ---------------------------------------------------------------------------

export interface ImportPrototypeInput {
  share_link: string;
  pat: string;
  study_id: string;
  /** Optional caller-supplied UUIDv7; generated if absent. Re-clicks dedup via
   *  UNIQUE (study_id, idempotency_key) on prototype_imports. */
  idempotency_key?: string;
}

export interface ImportPrototypeResult {
  import_id: string;
}

/** Map a JSON error body from the Edge Function to a typed code. */
function mapFunctionError(body: unknown, status: number): ImportPrototypeError {
  const error =
    body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)
      ? String((body as { error: unknown }).error)
      : 'unknown';
  switch (error) {
    case 'workspace_membership_required':
      return new ImportPrototypeError(
        'workspace_membership_required',
        "You don't have permission to import into this workspace.",
        status,
      );
    case 'unauthenticated':
      return new ImportPrototypeError(
        'unauthenticated',
        'Sign in again to import a prototype.',
        status,
      );
    case 'bad_request':
      return new ImportPrototypeError(
        'bad_request',
        'Missing or invalid import parameters.',
        status,
      );
    case 'invalid_share_link':
      return new ImportPrototypeError(
        'invalid_share_link',
        'That Figma share link is not recognized.',
        status,
      );
    case 'study_not_found':
      return new ImportPrototypeError('study_not_found', 'This test no longer exists.', status);
    default:
      return new ImportPrototypeError('unknown', `Import failed (${status}).`, status);
  }
}

export function useImportPrototype(): UseMutationResult<
  ImportPrototypeResult,
  ImportPrototypeError,
  ImportPrototypeInput
> {
  return useMutation({
    mutationFn: async (input: ImportPrototypeInput): Promise<ImportPrototypeResult> => {
      const idempotencyKey = input.idempotency_key ?? uuidv7();
      const { data, error } = await supabase.functions.invoke('figma-import-worker', {
        body: {
          share_link: input.share_link,
          pat: input.pat,
          study_id: input.study_id,
          idempotency_key: idempotencyKey,
        },
      });

      // supabase.functions.invoke returns `error` for non-2xx; the response
      // body is on `error.context.response` (Supabase SDK >= 2.39). We extract
      // the status + parsed body to map a typed ImportPrototypeError.
      if (error) {
        // Supabase wraps the underlying Response in error.context when the
        // function returned a JSON error. Try to drain it; fall back to
        // generic mapping if anything goes wrong.
        const ctx = (error as { context?: { response?: Response } }).context;
        const res = ctx?.response;
        if (res) {
          let body: unknown = undefined;
          try {
            body = await res.clone().json();
          } catch {
            /* ignore — keep body undefined */
          }
          throw mapFunctionError(body, res.status);
        }
        throw new ImportPrototypeError('unknown', error.message);
      }

      if (!data || typeof data !== 'object' || !('import_id' in data)) {
        throw new ImportPrototypeError('unknown', 'Import function returned an unexpected shape.');
      }
      return { import_id: String((data as { import_id: unknown }).import_id) };
    },
    // No onSuccess invalidation — the import is async. The FigmaImportDialog
    // calls useImportJob(import_id) to subscribe to progress via Realtime.
  });
}
