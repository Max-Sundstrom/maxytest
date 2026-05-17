-- =============================================================================
-- Maxytest Phase 02.2 / Plan 02.2-02 / Task 3 (Rule 1 deviation)
-- Fix: publish_prototype_from_plugin role gate must reject NULL role
-- =============================================================================
--
-- The role gate in migration 00013 was:
--
--   IF public.current_workspace_role(v_workspace_id) NOT IN ('owner','editor') THEN
--     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--   END IF;
--
-- For non-members, current_workspace_role(...) returns NULL. In SQL three-
-- valued logic `NULL NOT IN (...)` evaluates to NULL, NOT to TRUE. The IF
-- branch treats NULL the same as FALSE, so the RAISE is skipped and the
-- RPC proceeds to publish the prototype. This was caught by the Task 3
-- RLS test suite: Test 1 (non-member publish attempt) showed designer B
-- (not a member of workspace A) successfully publishing into study A.
--
-- This is a Rule 1 bug per CLAUDE.md / get-shit-done deviation rules
-- (correctness defect discovered during current task, auto-fix in place).
-- The fix wraps the role lookup in COALESCE so a NULL membership result
-- becomes the literal 'none', which is then correctly rejected by the
-- NOT IN clause. Same idiom Phase 1 uses elsewhere for membership checks
-- (00003 insert_block_at line 100-103, see PATTERNS §19 canonical idiom).
--
-- This migration uses CREATE OR REPLACE FUNCTION so it is idempotent
-- against the live cloud database that already has the buggy version of
-- 00013 applied. Operator action: paste this SQL into Supabase Studio
-- SQL Editor and run, OR `supabase db push --linked` if CLI is wired.
--
-- Schema-push audit (for Plan 02.2-08 Task 1 pre-flight cross-check):
--   migration_pushed_to: cloud:vydqgqmbnamperzadrpm
--   (the same target as 00013 — Plan 02.2-02 Task 2 audit row)
--
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_prototype_from_plugin(
  p_payload jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_study_id              uuid := (p_payload->>'study_id')::uuid;
  v_workspace_id          uuid := (p_payload->>'workspace_id')::uuid;
  v_prototype_version_id  uuid := (p_payload->>'prototype_version_id')::uuid;
  v_file_key              text := p_payload->>'file_key';
  v_file_name             text := p_payload->>'file_name';
  v_starting_frame_id     text := p_payload->>'starting_frame_id';
  v_existing_import_id    uuid;
  v_existing_pv_id        uuid;
  v_frame                 jsonb;
  v_hotspot               jsonb;
  v_frame_db_id_by_node   jsonb := '{}'::jsonb;
  v_db_id                 uuid;
BEGIN
  -- 1. Auth gate ------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Trust-boundary: caller must be owner|editor of the workspace --------
  --    current_workspace_role() returns NULL for non-members. The COALESCE
  --    converts NULL to the literal 'none' so the NOT IN ('owner','editor')
  --    test returns TRUE (and the RAISE fires) instead of NULL (which IF
  --    treats as FALSE — the bug from migration 00013, caught by Task 3
  --    Test 1 in the Plan 02.2-02 RLS suite).
  IF COALESCE(public.current_workspace_role(v_workspace_id), 'none')
       NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 3. Cross-check: workspace_id must own study_id -------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.studies
    WHERE id = v_study_id AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'study not found in workspace' USING ERRCODE = '02000';
  END IF;

  -- 4. Idempotency: same (study_id, idempotency_key) → return existing -----
  SELECT id, prototype_version_id INTO v_existing_import_id, v_existing_pv_id
    FROM public.prototype_imports
    WHERE study_id = v_study_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'prototype_version_id', v_existing_pv_id,
      'study_id', v_study_id,
      'import_id', v_existing_import_id,
      'replayed', true
    );
  END IF;

  -- 5. INSERT prototype_versions -------------------------------------------
  INSERT INTO public.prototype_versions (
    id, study_id, figma_file_key, figma_file_name,
    figma_node_tree, starting_frame_id, status
  ) VALUES (
    v_prototype_version_id, v_study_id, v_file_key, v_file_name,
    p_payload->'figma_node_tree', v_starting_frame_id, 'complete'
  );

  -- 6. INSERT frames -------------------------------------------------------
  FOR v_frame IN SELECT * FROM jsonb_array_elements(p_payload->'frames')
  LOOP
    INSERT INTO public.frames (
      prototype_version_id, frame_id, name, width, height,
      render_path_1x, render_path_2x, position
    ) VALUES (
      v_prototype_version_id,
      v_frame->>'frame_id',
      v_frame->>'name',
      (v_frame->>'width')::int,
      (v_frame->>'height')::int,
      v_frame->>'render_path_1x',
      v_frame->>'render_path_2x',
      (v_frame->>'position')::int
    ) RETURNING id INTO v_db_id;
    v_frame_db_id_by_node := jsonb_set(
      v_frame_db_id_by_node,
      ARRAY[v_frame->>'frame_id'],
      to_jsonb(v_db_id::text)
    );
  END LOOP;

  -- 7. INSERT hotspots — lookup frame_db_id via the map --------------------
  FOR v_hotspot IN SELECT * FROM jsonb_array_elements(p_payload->'hotspots')
  LOOP
    INSERT INTO public.hotspots (
      frame_id, prototype_version_id,
      hotspot_id, target_frame_id, transition_kind,
      bbox_x, bbox_y, bbox_w, bbox_h,
      z_index, source_layer, figma_raw
    ) VALUES (
      (v_frame_db_id_by_node->>(v_hotspot->>'frame_node_id'))::uuid,
      v_prototype_version_id,
      v_hotspot->>'hotspot_id',
      v_hotspot->>'target_frame_id',
      v_hotspot->>'transition_kind',
      (v_hotspot->>'bbox_x')::real,
      (v_hotspot->>'bbox_y')::real,
      (v_hotspot->>'bbox_w')::real,
      (v_hotspot->>'bbox_h')::real,
      COALESCE((v_hotspot->>'z_index')::int, 0),
      v_hotspot->>'source_layer',
      COALESCE(v_hotspot->'figma_raw', '{}'::jsonb)
    );
  END LOOP;

  -- 8. INSERT prototype_imports audit row (path='plugin', status='done') ---
  INSERT INTO public.prototype_imports (
    study_id, actor_id, idempotency_key, figma_file_key,
    status, frames_total, frames_done,
    prototype_version_id, warnings, path
  ) VALUES (
    v_study_id, auth.uid(), p_idempotency_key, v_file_key,
    'done',
    jsonb_array_length(p_payload->'frames'),
    jsonb_array_length(p_payload->'frames'),
    v_prototype_version_id,
    COALESCE(p_payload->'warnings', '[]'::jsonb),
    'plugin'
  );

  RETURN jsonb_build_object(
    'prototype_version_id', v_prototype_version_id,
    'study_id', v_study_id,
    'replayed', false
  );
END
$$;

REVOKE ALL ON FUNCTION public.publish_prototype_from_plugin(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_prototype_from_plugin(jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.publish_prototype_from_plugin(jsonb, uuid) IS
  'Phase 02.2 D-03 + 00014 NULL-role fix: atomically commit a plugin-side import. PNG upload happens before this call (D-03a); RPC just persists DB rows. Idempotency keyed by (study_id, idempotency_key) — replays return the existing prototype_version_id. Role gate uses COALESCE(current_workspace_role, ''none'') to reject NULL membership (00013 had three-valued-logic bug).';
