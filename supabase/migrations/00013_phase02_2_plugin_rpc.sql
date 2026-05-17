-- =============================================================================
-- Maxytest Phase 02.2 / Plan 02.2-02 / Task 1
-- Plugin import path — schema extension + atomic publish RPC
-- =============================================================================
--
-- This migration unblocks the Figma-plugin primary import path (Phase 02.2,
-- closes the REST 150s ceiling exposed by the 2026-05-16 UAT) by:
--
--   (a) Extending public.prototype_imports with a new `path` column
--       ('rest' | 'plugin') so the analytics + report-card surfaces (PROTO-05
--       "Source last modified Y" indicator) can distinguish which code path
--       produced a given import row. DEFAULT 'rest' backfills the existing
--       Phase 2 rows AND covers the existing figma-import-worker INSERT —
--       which deliberately does NOT specify `path` (D-06: no worker code
--       changes in this phase).
--
--   (b) Adding the SECURITY DEFINER function
--       public.publish_prototype_from_plugin(p_payload jsonb, p_idempotency_key uuid)
--       which atomically INSERTs prototype_versions + frames + hotspots +
--       prototype_imports for a plugin-side import. PNG uploads happen
--       client-side (in the plugin's iframe) BEFORE this RPC is called
--       (D-03a); the RPC just persists DB rows in one transaction. This
--       guarantees D-03 "no half-imported versions" — block.content can
--       never reference a prototype_version_id that does not exist on the
--       row-level (the INSERT is atomic, either all rows land or none do).
--
-- AUTHZ MODEL (mirrors insert_block_at @ 00003_phase1_rpcs.sql:83-132):
--   - SECURITY DEFINER so the function executes as the function's owner
--     (postgres). RLS is BYPASSED inside the function body — instead, the
--     function MANUALLY enforces the same gate that RLS policies would:
--     auth.uid() must be non-null AND current_workspace_role(workspace_id)
--     must be 'owner' or 'editor'. This is the canonical Phase 1 idiom.
--   - REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated — the anon
--     role (respondents) cannot invoke this RPC at all.
--   - SET search_path = public — prevents schema-shadowing attacks where a
--     caller could pre-create a malicious public.studies in their own
--     search-path. Standard Phase 1 hardening.
--
-- IDEMPOTENCY:
--   The (study_id, idempotency_key) UNIQUE constraint on prototype_imports
--   (introduced in 00011) is the DB-level backstop. Step 4 of the function
--   does a SELECT-before-INSERT against the same key — if found, it returns
--   the existing prototype_version_id with replayed=true and zero side
--   effects. The plugin uses UUIDv7 for idempotency_key (Phase 1 pattern),
--   so retries of the same logical publish (network flake, accidental
--   double-click) are safe.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (a) ALTER prototype_imports — add `path` column
-- -----------------------------------------------------------------------------
-- DEFAULT 'rest' is load-bearing in two ways:
--   1. Backfills existing Phase 2 rows (REST-path imports already in DB).
--   2. Covers the existing figma-import-worker INSERT (Edge Function), which
--      does NOT specify `path` and MUST NOT change in this phase (D-06).
--      Verified by reading supabase/functions/figma-import-worker/index.ts
--      lines 541-555 — the INSERT lists study_id, actor_id, idempotency_key,
--      figma_file_key, status, frames_total, frames_done — no `path` field.
--
ALTER TABLE public.prototype_imports
  ADD COLUMN path text NOT NULL DEFAULT 'rest'
    CHECK (path IN ('rest','plugin'));

COMMENT ON COLUMN public.prototype_imports.path IS
  'Phase 02.2 D-03b: which import path produced this row. ''rest'' = Edge Function (figma-import-worker), ''plugin'' = publish_prototype_from_plugin RPC. Used for analytics + report cards.';


-- -----------------------------------------------------------------------------
-- (b) CREATE FUNCTION publish_prototype_from_plugin
-- -----------------------------------------------------------------------------
-- Returns jsonb so the plugin can deep-link "Open in Maxytest" using the
-- study_id (UI-SPEC Open Item #1) and detect replays for telemetry.
--
-- Shape: { prototype_version_id: uuid, study_id: uuid, import_id?: uuid, replayed: boolean }
--   - replayed=false → newly created, no import_id key (the audit row id is
--                       not surfaced because the plugin does not need it).
--   - replayed=true  → existing row, import_id surfaced for diagnostics.
--
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
  --    current_workspace_role() returns NULL for non-members → NOT IN check
  --    catches them too. Viewer-role members also get rejected here.
  IF public.current_workspace_role(v_workspace_id) NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 3. Cross-check: workspace_id must own study_id -------------------------
  --    Prevents a caller from forging a study_id from workspace B while
  --    presenting workspace_id A (which they own). Returns 02000
  --    (no_data → PostgREST surfaces a friendly error code distinct from
  --    42501 so the plugin's friendly-copy map can differentiate).
  IF NOT EXISTS (
    SELECT 1 FROM public.studies
    WHERE id = v_study_id AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'study not found in workspace' USING ERRCODE = '02000';
  END IF;

  -- 4. Idempotency: same (study_id, idempotency_key) → return existing -----
  --    Done BEFORE any INSERT so a replay is a pure read transaction.
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
  --    status='complete' directly — plugin did the upload work BEFORE the
  --    RPC call (D-03a), so there is no "importing" intermediate state for
  --    the plugin path. Worker path still uses the importing → complete
  --    transition via service-role UPDATE.
  INSERT INTO public.prototype_versions (
    id, study_id, figma_file_key, figma_file_name,
    figma_node_tree, starting_frame_id, status
  ) VALUES (
    v_prototype_version_id, v_study_id, v_file_key, v_file_name,
    p_payload->'figma_node_tree', v_starting_frame_id, 'complete'
  );

  -- 6. INSERT frames -------------------------------------------------------
  --    Expand jsonb array; build a map (frame_node_id → frames.id UUID) so
  --    step 7 can resolve hotspot.frame_id correctly. The map is plpgsql
  --    jsonb (cheaper than a TEMP TABLE for the small N we expect).
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
  --    The hotspot payload key `frame_node_id` is the Figma node id of the
  --    parent frame; we resolve it to the DB UUID via the map built in
  --    step 6. COALESCE on figma_raw matches the 00007 column DEFAULT.
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
  --    frames_done == frames_total because the plugin already finished all
  --    PNG uploads before invoking the RPC (D-03a). The (study_id,
  --    idempotency_key) UNIQUE constraint is the DB-level backstop in case
  --    two concurrent RPC calls slip past the step-4 SELECT (race window;
  --    the UNIQUE constraint will reject the loser with 23505 and the
  --    plugin caller will retry, hit step 4, and get the replayed=true
  --    branch).
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
  'Phase 02.2 D-03: atomically commit a plugin-side import. PNG upload happens before this call (D-03a); RPC just persists DB rows. Idempotency keyed by (study_id, idempotency_key) — replays return the existing prototype_version_id.';
