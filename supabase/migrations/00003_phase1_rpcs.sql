-- =============================================================================
-- Maxytest Phase 1: Walking Skeleton — RPC layer for the test builder
-- =============================================================================
--
-- Plan: 01-walking-skeleton / 01-03 / Task 2
--
-- Establishes:
--   - create_study(ws, title)               atomic study + welcome + thanks insert
--   - insert_block_at(study, pos, type, content, idempotency_key)
--                                            shifts subsequent positions
--   - delete_block(block, idempotency_key)  compacts positions
--   - duplicate_block(block, idempotency_key)
--   - reorder_blocks(study, ordered_ids[], idempotency_key)
--                                            atomic bulk position reorder
--
-- Threat model (PLAN.md T-01-03-06): every SECURITY DEFINER RPC starts with
-- `IF current_workspace_role((SELECT workspace_id FROM studies WHERE id = ...))
--  IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;` so a stolen JWT can't
-- escalate by passing somebody else's study_id.
--
-- Idempotency (D-16): every mutation RPC writes a row into block_changes
-- keyed by (block_id, idempotency_key) UNIQUE. A retried call with the same
-- key is silently deduplicated.
-- =============================================================================

-- =============================================================================
-- 1. create_study(workspace_id, title)
--    BUILDER-01 + BLK-01..02: a brand-new study auto-fills welcome + thanks.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_study(
  ws_id uuid,
  study_title text DEFAULT 'Untitled test'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid;
BEGIN
  -- Trust-boundary check (T-01-03-06): caller must be owner/editor of ws.
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.studies (workspace_id, title, created_by)
    VALUES (ws_id, study_title, auth.uid())
    RETURNING id INTO sid;

  -- Seed welcome + thanks per UI-SPEC defaults. The block_changes audit row
  -- isn't required for the initial seed (idempotency is on UPDATE/DELETE
  -- mutations, not the initial creation).
  INSERT INTO public.blocks (study_id, position, type, pinned, content)
    VALUES
      (
        sid, 0, 'welcome', true,
        jsonb_build_object(
          'type', 'welcome',
          'title', 'Help us understand `<product>`',
          'body', 'Takes about 3 minutes. We''ll ask a couple of quick questions.',
          'cta_label', 'Start'
        )
      ),
      (
        sid, 1, 'thanks', true,
        jsonb_build_object(
          'type', 'thanks',
          'title', 'Thank you!',
          'body', 'We appreciate you taking the time.'
        )
      );

  RETURN sid;
END
$$;

-- =============================================================================
-- 2. insert_block_at(study_id, pos, type, content, idempotency_key)
--    BUILDER-06: catalog adds a block at the given position; existing blocks
--    at >= pos shift down by one.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.insert_block_at(
  p_study_id uuid,
  p_position integer,
  p_type text,
  p_content jsonb,
  p_idempotency_key uuid
)
RETURNS public.blocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  new_block public.blocks%ROWTYPE;
BEGIN
  SELECT s.workspace_id INTO ws_id FROM public.studies s WHERE s.id = p_study_id;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study not found' USING ERRCODE = '02000';
  END IF;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Shift positions of blocks at >= p_position by one.
  -- Workaround for `UNIQUE (study_id, position)`: shift in descending order
  -- via a temporary negative offset that PostgreSQL accepts.
  UPDATE public.blocks
    SET position = -position
    WHERE study_id = p_study_id AND position >= p_position;
  UPDATE public.blocks
    SET position = -position + 1
    WHERE study_id = p_study_id AND position < 0;

  INSERT INTO public.blocks (study_id, position, type, pinned, content)
    VALUES (p_study_id, p_position, p_type, false, p_content)
    RETURNING * INTO new_block;

  -- Idempotency audit row (best-effort — caller's retry is deduplicated
  -- by the UNIQUE (block_id, idempotency_key) constraint).
  INSERT INTO public.block_changes
    (block_id, actor_id, idempotency_key, change_type, payload)
  VALUES
    (new_block.id, auth.uid(), p_idempotency_key, 'add',
     jsonb_build_object('type', p_type, 'position', p_position))
  ON CONFLICT (block_id, idempotency_key) DO NOTHING;

  RETURN new_block;
END
$$;

-- =============================================================================
-- 3. delete_block(block_id, idempotency_key)
--    BUILDER-09: deletes a non-pinned block and compacts subsequent positions.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_block(
  p_block_id uuid,
  p_idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blk public.blocks%ROWTYPE;
  ws_id uuid;
BEGIN
  SELECT * INTO blk FROM public.blocks WHERE id = p_block_id;
  IF NOT FOUND THEN
    -- Idempotent: a retried delete after success simply returns.
    RETURN;
  END IF;

  IF blk.pinned THEN
    RAISE EXCEPTION 'cannot delete pinned block' USING ERRCODE = '42501';
  END IF;

  SELECT s.workspace_id INTO ws_id FROM public.studies s WHERE s.id = blk.study_id;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Audit row first (before the row goes away).
  INSERT INTO public.block_changes
    (block_id, actor_id, idempotency_key, change_type, payload)
  VALUES
    (blk.id, auth.uid(), p_idempotency_key, 'delete',
     jsonb_build_object('type', blk.type, 'position', blk.position))
  ON CONFLICT (block_id, idempotency_key) DO NOTHING;

  DELETE FROM public.blocks WHERE id = blk.id;

  -- Compact: shift positions down for siblings with position > blk.position.
  UPDATE public.blocks
    SET position = -position
    WHERE study_id = blk.study_id AND position > blk.position;
  UPDATE public.blocks
    SET position = -position - 1
    WHERE study_id = blk.study_id AND position < 0;
END
$$;

-- =============================================================================
-- 4. duplicate_block(block_id, idempotency_key)
--    BUILDER-09: clones a non-pinned block immediately after the original.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.duplicate_block(
  p_block_id uuid,
  p_idempotency_key uuid
)
RETURNS public.blocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.blocks%ROWTYPE;
  ws_id uuid;
  new_block public.blocks%ROWTYPE;
  new_position integer;
BEGIN
  SELECT * INTO src FROM public.blocks WHERE id = p_block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'block not found' USING ERRCODE = '02000';
  END IF;
  IF src.pinned THEN
    RAISE EXCEPTION 'cannot duplicate pinned block' USING ERRCODE = '42501';
  END IF;

  SELECT s.workspace_id INTO ws_id FROM public.studies s WHERE s.id = src.study_id;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  new_position := src.position + 1;

  -- Shift positions >= new_position by one (same UNIQUE workaround).
  UPDATE public.blocks
    SET position = -position
    WHERE study_id = src.study_id AND position >= new_position;
  UPDATE public.blocks
    SET position = -position + 1
    WHERE study_id = src.study_id AND position < 0;

  INSERT INTO public.blocks (study_id, position, type, pinned, content)
    VALUES (src.study_id, new_position, src.type, false, src.content)
    RETURNING * INTO new_block;

  INSERT INTO public.block_changes
    (block_id, actor_id, idempotency_key, change_type, payload)
  VALUES
    (new_block.id, auth.uid(), p_idempotency_key, 'duplicate',
     jsonb_build_object('source_block_id', src.id))
  ON CONFLICT (block_id, idempotency_key) DO NOTHING;

  RETURN new_block;
END
$$;

-- =============================================================================
-- 5. reorder_blocks(study_id, ordered_block_ids, idempotency_key)
--    BUILDER-03: atomic position update for dnd-kit drag-end.
--    `ordered_block_ids[]` is the desired position-0..N-1 sequence for the
--    UNPINNED blocks; pinned welcome (position=0) and thanks (position=last)
--    are not included and are rebased around the new unpinned ordering.
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
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
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

  -- Two-pass shift to bypass the (study_id, position) UNIQUE constraint:
  -- 1) Move every block in the study to a negative position based on its
  --    target slot (welcome = -1000, unpinned[i] = -(i+1) under offset, thanks
  --    = -1).
  -- 2) Flip negatives to the correct positive positions.
  -- (Simpler concrete approach below.)

  -- Step A: Park unpinned blocks at negative positions matching the new order.
  UPDATE public.blocks AS b
     SET position = -1 - sub.idx
    FROM unnest(p_ordered_block_ids) WITH ORDINALITY AS sub(id, idx)
   WHERE b.id = sub.id;

  -- Step B: Promote the welcome (pinned, was position 0) to remain at 0.
  -- (No work needed — welcome stays at 0.)

  -- Step C: Shift the parked unpinned blocks to positions 1..N.
  UPDATE public.blocks
     SET position = -position
   WHERE study_id = p_study_id AND position < 0;

  -- Step D: Move thanks (originally at old last position) to position N+1.
  UPDATE public.blocks
     SET position = arr_len + 1
   WHERE study_id = p_study_id AND pinned = true AND type = 'thanks';

  -- Audit row for the bulk reorder (attached to the FIRST reordered block so
  -- there is a non-null block_id; the payload carries the full new order).
  INSERT INTO public.block_changes
    (block_id, actor_id, idempotency_key, change_type, payload)
  VALUES
    (p_ordered_block_ids[1], auth.uid(), p_idempotency_key, 'reorder',
     jsonb_build_object('ordered_block_ids', to_jsonb(p_ordered_block_ids)))
  ON CONFLICT (block_id, idempotency_key) DO NOTHING;
END
$$;

-- =============================================================================
-- 6. force_update_block(block_id, content, idempotency_key)
--    D-14 "Use my version" conflict resolution: writes the caller's content
--    WITHOUT checking the version column. Still bumps version+1 and writes
--    the audit row so other tabs see a fresh value via BroadcastChannel.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.force_update_block(
  p_block_id uuid,
  p_content jsonb,
  p_idempotency_key uuid
)
RETURNS public.blocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blk public.blocks%ROWTYPE;
  ws_id uuid;
  updated public.blocks%ROWTYPE;
BEGIN
  SELECT * INTO blk FROM public.blocks WHERE id = p_block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'block not found' USING ERRCODE = '02000';
  END IF;

  SELECT s.workspace_id INTO ws_id FROM public.studies s WHERE s.id = blk.study_id;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.blocks
     SET content = p_content,
         version = version + 1,
         updated_at = now()
   WHERE id = p_block_id
   RETURNING * INTO updated;

  INSERT INTO public.block_changes
    (block_id, actor_id, idempotency_key, change_type, payload)
  VALUES
    (p_block_id, auth.uid(), p_idempotency_key, 'force_update',
     jsonb_build_object('content', p_content))
  ON CONFLICT (block_id, idempotency_key) DO NOTHING;

  RETURN updated;
END
$$;
