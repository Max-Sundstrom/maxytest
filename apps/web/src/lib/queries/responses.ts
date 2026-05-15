/**
 * Responses TanStack Query hook — Plan 01-05 Task 2.
 *
 * `useSubmitResponse(runToken)` is the mutation the runner calls when the
 * respondent submits an answer to a block. It calls the `submit_response`
 * SECURITY DEFINER RPC from migration 00005, which:
 *
 *   - Verifies the caller's auth.uid() matches sessions.respondent_id.
 *   - Verifies sessions.status = 'in_progress' (post-completion edits are
 *     refused with `session_closed`).
 *   - UPSERTs the row on (session_id, block_id) — so a respondent who
 *     navigates back and re-submits an answer updates the existing row.
 *
 * On success invalidates `['runner-session', runToken]` so the next mount /
 * resume picks up the new authoritative state from the server (D-20).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseAnon } from '@/lib/supabase/anon';
import type { Json } from '@/lib/supabase/types.gen';

export interface SubmitResponseInput {
  sessionId: string;
  blockId: string;
  /** Anything Zod-validated on the block-runner side (e.g., `{text:'...'}`). */
  answer: unknown;
  /** Milliseconds since the block first rendered (RUNNER-04 will queue this offline in Phase 5). */
  timeMs: number;
}

export function useSubmitResponse(runToken: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitResponseInput): Promise<void> => {
      const { error } = await supabaseAnon.rpc(
        'submit_response' as never,
        {
          p_session_id: input.sessionId,
          p_block_id: input.blockId,
          p_answer: input.answer as unknown as Json,
          p_time_ms: input.timeMs,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      if (runToken) {
        // Invalidate so a refresh-during-runner reads the new authoritative
        // server state for `existingAnswers`. The active runner uses the
        // local Zustand buffer; this invalidation is for the resume path.
        qc.invalidateQueries({ queryKey: ['runner-session', runToken] });
      }
    },
  });
}
