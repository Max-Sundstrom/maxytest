-- =============================================================================
-- Maxytest Phase 02.2 / Plan 02.2-08 close-out — KI-01 fix
-- publish_prototype_from_plugin: also create / update prototype block
-- =============================================================================
--
-- The RPC introduced in migration 00013 (and patched for the NULL-role bug in
-- 00014) writes prototype_versions / frames / hotspots / prototype_imports
-- atomically, but it skips `public.blocks`. The 2026-05-17 UAT proved this
-- breaks the plugin's whole proposition: after SuccessView → "Open in
-- Maxytest", Builder opens with only the default welcome+thanks blocks and
-- the designer is forced into the REST FigmaImportDialog — redundant since
-- the prototype_version already exists.
--
-- This migration extends the RPC so a successful publish ALSO creates (or
-- updates) a `prototype` block pointing to the new prototype_version_id,
-- positioned between welcome and thanks. After this lands, the plugin flow
-- becomes single-click: import → SuccessView → Builder shows a fully-wired
-- prototype block ready to publish.
--
-- WHAT CHANGES (vs 00014):
--   Steps 1-7 (auth gate / role gate / cross-check / idempotency / insert
--   versions+frames+hotspots) are byte-identical to 00014 — same body, same
--   COALESCE NULL-role idiom, same hash-mapped frame-id resolution.
--
--   NEW step 7.5 (lines tagged "KI-01"): after hotspots, ensure a prototype
--   block exists for this study.
--     - If one already exists (re-import into an existing study), UPDATE its
--       content to point at the new prototype_version_id + starting_frame_id
--       via jsonb `||` merge (so any user-edited task_instruction / success_
--       path / finish_frame_ids are preserved). Bump `version` for D-13
--       optimistic concurrency so any open PrototypeEditor sees the change.
--     - If none exists (first plugin import into a freshly-created study),
--       shift every block at position >= 1 by +1 (welcome stays at 0, thanks
--       moves from 1 to 2), then INSERT the prototype block at position 1
--       with a Russian placeholder task_instruction the designer can edit in
--       Builder. The negate-then-add shift idiom mirrors
--       `insert_block_at` @ 00003_phase1_rpcs.sql:107-115 — required because
--       blocks.UNIQUE(study_id, position) rejects a one-step `position+1`
--       update.
--
--   Step 8 (prototype_imports audit row) is byte-identical to 00014.
--
-- CONTENT PAYLOAD shape — matches prototypeContentSchema in
--   apps/web/src/lib/blocks/schemas.ts:56-66 (Zod validator):
--     type: literal 'prototype'
--     prototype_version_id: uuid (cast to text in jsonb)
--     starting_frame_id: string, min length 1
--     task_instruction: string, 1..280 chars
--     success_path[], finish_frame_ids[]: optional, omitted on insert
--
-- IDEMPOTENCY:
--   The block insert / update is protected by step 4 — a replay with the
--   same (study_id, idempotency_key) returns the existing pv_id with the
--   early-return branch and never reaches step 7.5. So no extra UNIQUE
--   constraint or idempotency key is needed on the blocks side.
--
-- APPEND-ONLY MIGRATION DISCIPLINE:
--   Per .planning/STATE.md "Append-only migration discipline holds even when
--   bug is discovered same-plan": 00013 and 00014 stay intact. This file
--   forward-fixes via CREATE OR REPLACE FUNCTION. An operator running
--   `supabase db reset` against a fresh local DB will hit all three in order
--   and end up with the correct function definition.
--
-- Schema-push audit (for Plan 02.2-08 closure):
--   migration_pushed_to: cloud:vydqgqmbnamperzadrpm
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
  v_existing_block_id     uuid;
BEGIN
  -- 1. Auth gate ------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Trust-boundary: caller must be owner|editor of the workspace --------
  --    COALESCE NULL → 'none' so non-members are rejected (00014 fix for the
  --    three-valued-logic bug in 00013).
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

  -- 7.5 KI-01 fix: ensure a prototype block exists for this study ----------
  --     Look for an existing prototype-type block. If found, UPDATE it to
  --     point at the new prototype_version_id + starting_frame_id (preserves
  --     user-edited task_instruction / success_path / finish_frame_ids via
  --     jsonb `||` merge — right side wins on collision). Bump `version` so
  --     the Phase 1 D-13 optimistic-concurrency check in PrototypeEditor
  --     refreshes correctly.
  --
  --     If NOT found (first plugin import into a freshly-seeded study), shift
  --     every block at position >= 1 by +1 (welcome stays at 0, thanks moves
  --     from 1 to 2), then INSERT the prototype block at position 1.
  SELECT id INTO v_existing_block_id
    FROM public.blocks
    WHERE study_id = v_study_id AND type = 'prototype'
    ORDER BY position ASC
    LIMIT 1;

  IF v_existing_block_id IS NOT NULL THEN
    -- Re-import path: patch existing block content.
    UPDATE public.blocks
      SET content = content
                    || jsonb_build_object(
                         'type', 'prototype',
                         'prototype_version_id', v_prototype_version_id::text,
                         'starting_frame_id', v_starting_frame_id
                       ),
          version = version + 1,
          updated_at = now()
      WHERE id = v_existing_block_id;
  ELSE
    -- First-import path: shift then insert at position 1.
    --
    -- Two-step negate-then-add pattern avoids the UNIQUE (study_id, position)
    -- constraint violation that a single UPDATE position = position + 1 would
    -- trip (rows are updated one-by-one and the intermediate state would have
    -- two rows at the same position). Mirrors insert_block_at @ 00003.
    UPDATE public.blocks
      SET position = -position
      WHERE study_id = v_study_id AND position >= 1;
    UPDATE public.blocks
      SET position = -position + 1
      WHERE study_id = v_study_id AND position < 0;

    INSERT INTO public.blocks (study_id, position, type, pinned, content)
    VALUES (
      v_study_id, 1, 'prototype', false,
      jsonb_build_object(
        'type', 'prototype',
        'prototype_version_id', v_prototype_version_id::text,
        'starting_frame_id', v_starting_frame_id,
        'task_instruction', 'Опишите задачу для респондента (можно отредактировать в Builder)'
      )
    );
  END IF;

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
  'Phase 02.2 D-03 + 00014 NULL-role fix + 00015 KI-01 block-insert fix: atomically commit a plugin-side import AND ensure a prototype block points at it. PNG upload happens before this call (D-03a); RPC just persists DB rows. Idempotency keyed by (study_id, idempotency_key) — replays return the existing prototype_version_id. Step 7.5 either UPDATEs an existing prototype block (re-import) or shifts thanks down and INSERTs a new one at position 1 (first import). Closes Plan 02.2-08 KI-01.';
