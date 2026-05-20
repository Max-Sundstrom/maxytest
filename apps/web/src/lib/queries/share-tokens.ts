/**
 * `share-tokens` query + mutation hooks — Plan 04-06 Task 5.
 *
 * Designer-side wrappers over the public-share-token RPCs added in
 * migrations 00018..00021:
 *
 *   - useShareToken(studyId)            — query, returns the latest
 *                                         share_tokens row for `studyId`
 *                                         (or null when none exists).
 *   - useCreateShareToken               — generates a nanoid(21) token
 *                                         client-side and calls
 *                                         `create_share_token` RPC.
 *   - useRevokeShareToken               — flips is_active via
 *                                         `revoke_share_token` RPC.
 *                                         Pass `reactivate: true` to
 *                                         re-enable a previously revoked
 *                                         token.
 *   - useRotateShareToken               — atomic revoke-old + create-new
 *                                         via `rotate_share_token` RPC.
 *   - useUpdateShareTokenVisibility     — direct UPDATE on share_tokens
 *                                         (RLS designer_rw gates writes);
 *                                         drives the per-block open-answer
 *                                         visibility toggles (REPORT-07).
 *
 * Designer-side imports the authenticated client from
 * `@/lib/supabase/auth` per Phase 1 two-Supabase-client boundary.
 *
 * Idempotency keys (`p_idempotency_key`) are generated with `uuidv7` —
 * matches the `useDuplicateStudy` / `useCreateBlock` patterns from Phase 1.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { uuidv7 } from 'uuidv7';
import { supabase } from '@/lib/supabase/auth';

/**
 * Row shape returned by the share_tokens table and by the three lifecycle
 * RPCs. Kept in sync with the SQL definition in
 * `supabase/migrations/00018_phase4_share_tokens.sql`.
 */
export interface ShareTokenRow {
  id: string;
  study_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
  created_by: string | null;
  open_answer_visibility: Record<string, boolean>;
  title_snapshot: string | null;
}

/**
 * Fetch the latest share-token for a given study. There is at most one
 * "active" token per study at any given time, but rotated/revoked tokens
 * stick around in the table (audit history + REPORT-08 lifecycle guard),
 * so we ORDER BY created_at DESC + LIMIT 1.
 *
 * Returns `null` (not an error) when no token has ever been minted.
 *
 * `enabled` is gated on `studyId` so passing `null` keeps the query idle
 * (matches the rest of the designer-side query pattern).
 *
 * Cache: 30 s staleTime — the row changes only when the designer toggles
 * publish/revoke/rotate, so we don't need aggressive refetching. The
 * mutations below invalidate the key on success.
 */
export function useShareToken(studyId: string | null | undefined) {
  return useQuery({
    queryKey: ['share-token', studyId],
    enabled: !!studyId,
    staleTime: 30_000,
    queryFn: async (): Promise<ShareTokenRow | null> => {
      // `as never` cast: the generated types.gen.ts doesn't yet know about
      // share_tokens (added in migration 00018). The orchestrator regenerates
      // post-merge; until then we cast through never to satisfy supabase-js
      // typings, same idiom as `useDuplicateStudy` in `studies.ts`.
      const { data, error } = await supabase
        .from('share_tokens' as never)
        .select('*')
        .eq('study_id', studyId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ShareTokenRow | null) ?? null;
    },
  });
}

/**
 * Mint a new share-token for a study. The token nanoid is generated here
 * (browser side) so the RPC stays pure SQL/plpgsql. Idempotency key is a
 * fresh UUIDv7 per call; same-call replays are dedup'd server-side by the
 * (study_id, token) unique constraint.
 */
export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studyId: string;
      openAnswerVisibility?: Record<string, boolean>;
    }): Promise<ShareTokenRow> => {
      const newToken = nanoid(21);
      // `as never` cast on the RPC name + args: types.gen.ts doesn't yet
      // include create_share_token; matches the useDuplicateStudy idiom.
      const { data, error } = await supabase.rpc(
        'create_share_token' as never,
        {
          p_study_id: input.studyId,
          p_token: newToken,
          p_idempotency_key: uuidv7(),
          p_open_answer_visibility: input.openAnswerVisibility ?? {},
        } as never,
      );
      if (error) throw error;
      return data as unknown as ShareTokenRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['share-token', vars.studyId] });
    },
  });
}

/**
 * Flip `share_tokens.is_active`. Default behaviour is revoke (sets
 * `is_active=false`, stamps `revoked_at`). Pass `reactivate: true` to
 * restore a previously revoked token (sets `is_active=true`, clears
 * `revoked_at`). The single RPC handles both directions so the
 * ShareSettingsDialog UI can wire one mutation to a toggle button.
 */
export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      token: string;
      studyId: string;
      reactivate?: boolean;
    }): Promise<ShareTokenRow> => {
      const { data, error } = await supabase.rpc(
        'revoke_share_token' as never,
        {
          p_token: input.token,
          p_reactivate: input.reactivate ?? false,
        } as never,
      );
      if (error) throw error;
      return data as unknown as ShareTokenRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['share-token', vars.studyId] });
    },
  });
}

/**
 * Atomically revoke the existing token and mint a new one. Server-side
 * RPC inherits `open_answer_visibility` from the revoked row so the
 * designer's per-block toggle state survives rotation.
 */
export function useRotateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { oldToken: string; studyId: string }): Promise<ShareTokenRow> => {
      const newToken = nanoid(21);
      const { data, error } = await supabase.rpc(
        'rotate_share_token' as never,
        {
          p_old_token: input.oldToken,
          p_new_token: newToken,
          p_idempotency_key: uuidv7(),
        } as never,
      );
      if (error) throw error;
      return data as unknown as ShareTokenRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['share-token', vars.studyId] });
    },
  });
}

/**
 * Update the per-block open-answer visibility flags on an existing token
 * (REPORT-07). Direct UPDATE on the table — RLS designer_rw policy gates
 * writes to workspace owner|editor, so we don't need a SECURITY DEFINER
 * RPC here.
 *
 * Caller passes the full visibility object; the hook merges by replace
 * (the caller is expected to spread the previous map and flip the relevant
 * keys, mirroring the pattern used by `useUpdateBlock`).
 */
export function useUpdateShareTokenVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      token: string;
      studyId: string;
      visibility: Record<string, boolean>;
    }): Promise<ShareTokenRow> => {
      // `as never` cast: share_tokens isn't yet in types.gen.ts. Cleared
      // up by orchestrator's post-merge `supabase gen types typescript`.
      const { data, error } = await supabase
        .from('share_tokens' as never)
        .update({ open_answer_visibility: input.visibility } as never)
        .eq('token', input.token)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ShareTokenRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['share-token', vars.studyId] });
    },
  });
}
