/**
 * Runner-side event ingest hooks — Plan 02-08 Task 4.
 *
 * This file is in the ESLint runner-tree glob (`apps/web/eslint.config.js`)
 * — DO NOT import `@/lib/supabase/auth` here. The boundary mirrors Plan 01-06
 * Anti-Pattern 5 (two-Supabase-client trust separation): the runner uses
 * `supabaseAnon` so its anonymous JWT never overwrites the designer's
 * session in the same browser.
 *
 * Plan 02-10's `PrototypeReport` (designer-side) needs separate read hooks
 * for per-frame heatmaps — those live in `events-designer.ts` and import
 * the auth client. Splitting the file is the only way to satisfy the ESLint
 * boundary without weakening it.
 *
 * B-02: `submit_events` takes `p_block_id` as a mandatory positional arg
 * (migration 00009). `useSubmitEventBatch` carries the blockId through so
 * the server can attribute events to the correct prototype block.
 */

import { useMutation } from '@tanstack/react-query';

import type { QueuedEvent } from '@/lib/runner/event-buffer';
import { supabaseAnon } from '@/lib/supabase/anon';

export interface SubmitEventBatchInput {
  /** Session id from `useRunnerSession` — owns the anon JWT used for RLS. */
  sessionId: string;
  /** B-02: bound to a single prototype block per buffer instance. */
  blockId: string;
  /** Drained-from-buffer batch. Each id is a UUIDv7 (idempotency key). */
  events: QueuedEvent[];
}

/**
 * Submit a batch of events. Returns the count of rows actually inserted
 * (idempotent retries dedupe to 0). Typed as `Promise<number>` to match the
 * RPC's `RETURNS int`.
 *
 * In production the buffer (`EventBuffer.flush`) calls the RPC directly to
 * keep its retry / re-queue path inside one class; this hook exists for
 * out-of-buffer call sites (e.g. an explicit "flush now" button in dev
 * tooling, or future per-question event submissions).
 */
export function useSubmitEventBatch() {
  return useMutation({
    mutationFn: async (input: SubmitEventBatchInput): Promise<number> => {
      const { data, error } = await supabaseAnon.rpc(
        'submit_events' as never,
        {
          p_session_id: input.sessionId,
          p_block_id: input.blockId,
          p_events: input.events as unknown as unknown[],
        } as never,
      );
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
  });
}
