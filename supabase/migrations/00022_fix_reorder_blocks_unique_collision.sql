-- =============================================================================
-- Maxytest — fix reorder_blocks UNIQUE-constraint collision (2026-05-21)
-- =============================================================================
--
-- Problem (surfaced 2026-05-21 during Phase 4 UAT on the fresh Supabase
-- project atysmteircnbukpwzfvr):
--
--   The reorder_blocks RPC in 00003_phase1_rpcs.sql parks unpinned blocks
--   at negative positions (-2..-N-1) in Step A, then promotes them back to
--   positives (2..N+1) in Step C. Thanks stays at its original positive
--   slot — which is exactly arr_len + 1 = N + 1. So the LAST unpinned
--   block, promoted to position N+1 in Step C, collides with thanks.
--   The (study_id, position) UNIQUE constraint is NOT deferrable, so the
--   transaction errors with 409 Conflict mid-statement.
--
--   PostgREST surfaces this to the client as HTTP 409 — which is what we
--   saw in DevTools when the user tried drag-and-drop or the "Move up/
--   down" menu items in the left sidebar.
--
--   The bug was latent in 00003 since Phase 1; the old project on
--   vydqgqmbnamperzadrpm seemingly never exercised the reorder path.
--
-- Fix: replace reorder_blocks with a four-pass version that parks BOTH
--   unpinned blocks AND thanks into the negative scratch space before
--   any promotion, so no positive slot is ever held by two rows at the
--   same time.
--
--   The (study_id, position) UNIQUE constraint stays as-is.
--
-- Append-only — never edit prior migrations. Operator pushes via
-- `supabase db push --linked` or pastes into Supabase Studio SQL Editor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reorder_blocks(
  p_study_id uuid,
  p_ordered_block_ids uuid[],
  p_idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  arr_len integer := coalesce(array_length(p_ordered_block_ids, 1), 0);
BEGIN
  SELECT s.workspace_id INTO ws_id FROM public.studies s WHERE s.id = p_study_id;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study not found' USING ERRCODE = '02000';
  END IF;
  IF COALESCE(public.current_workspace_role(ws_id), 'none')
       NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF arr_len = 0 THEN
    RETURN;
  END IF;

  -- Verify every id belongs to this study AND is not pinned.
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE id = ANY(p_ordered_block_ids)
      AND (study_id <> p_study_id OR pinned = true)
  ) THEN
    RAISE EXCEPTION 'invalid reorder: block does not belong to study or is pinned'
      USING ERRCODE = '22023';
  END IF;

  -- Four-pass shift using a far-negative scratch space.
  --
  -- Pass 1 — park every unpinned block at -1001..-1000-N (unique slots,
  --   far enough from welcome=0 that nothing else can hold them).
  UPDATE public.blocks AS b
     SET position = -1000 - sub.idx
    FROM unnest(p_ordered_block_ids) WITH ORDINALITY AS sub(id, idx)
   WHERE b.id = sub.id;

  -- Pass 2 — park thanks at -1 (also out of the way; welcome stays at 0).
  UPDATE public.blocks
     SET position = -1
   WHERE study_id = p_study_id AND pinned = true AND type = 'thanks';

  -- Pass 3 — promote each unpinned block from -1000-i back to position i.
  --   position = -1000 - position
  --   when position = -1000 - i   →   new position = -1000 - (-1000 - i) = i
  UPDATE public.blocks
     SET position = -1000 - position
   WHERE study_id = p_study_id AND position <= -1001;

  -- Pass 4 — promote thanks from -1 to arr_len + 1 (the final slot).
  UPDATE public.blocks
     SET position = arr_len + 1
   WHERE study_id = p_study_id AND position = -1;

  -- Audit row for the bulk reorder. Attached to the FIRST reordered block
  -- so there is a non-null block_id; the payload carries the full new
  -- order. Idempotency-keyed via block_changes (block_id, idempotency_key).
  INSERT INTO public.block_changes
    (block_id, actor_id, idempotency_key, change_type, payload)
  VALUES
    (p_ordered_block_ids[1], auth.uid(), p_idempotency_key, 'reorder',
     jsonb_build_object('ordered_block_ids', to_jsonb(p_ordered_block_ids)))
  ON CONFLICT (block_id, idempotency_key) DO NOTHING;
END
$$;

-- Re-grant EXECUTE on the replaced function. SECURITY DEFINER functions
-- need an explicit grant for the authenticated role; the original 00003
-- omitted this — Supabase Cloud's default ALTER DEFAULT PRIVILEGES on
-- the public schema usually covers it, but being explicit is safer for
-- self-host setups and audit trails.
GRANT EXECUTE ON FUNCTION public.reorder_blocks(uuid, uuid[], uuid) TO authenticated;

-- =============================================================================
-- DOWN (manual, not run automatically by Supabase CLI):
--   To roll back, re-run the original CREATE OR REPLACE block from
--   00003_phase1_rpcs.sql lines 250-321. The latent collision returns.
-- =============================================================================
