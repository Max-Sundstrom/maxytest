-- =============================================================================
-- Maxytest Phase 2 / Plan 02-02 / Task 1
-- Slice A schema: prototype_versions + frames + hotspots
-- =============================================================================
--
-- Establishes the three core tables that back the flagship "prototype" block:
--
--   1. prototype_versions   — immutable snapshot of a Figma prototype import
--                              (PROTO-04). Re-imports always create a NEW row.
--                              status column lets the figma-import-worker
--                              (Plan 02-03) reserve an id at status='importing',
--                              upload PNGs under the FINAL id path, and flip to
--                              status='complete' in a single transaction (B-05).
--   2. frames               — flat row-per-frame catalog (D-09). PNG render
--                              paths + dimensions; pagination-friendly for the
--                              builder thumbnail grid.
--   3. hotspots             — invisible hit-test regions over a frame, with
--                              normalized bounding-box geometry and a
--                              deterministic z_index for overlay-vs-base
--                              hit-test ordering (PROTO-09). Carries the
--                              verbatim Figma node interactions array in
--                              figma_raw so we can debug / re-derive without
--                              re-importing (RESEARCH.md Open Q2 RESOLVED).
--
-- RLS pattern mirrors blocks_read from 00001_init.sql lines 184-215 verbatim:
-- a single EXISTS join through studies → workspace_id → current_workspace_role.
-- STABLE helper, no IN (SELECT ...) anti-pattern, query plans stay flat.
--
-- IMMUTABILITY (PROTO-04): no UPDATE or DELETE policy is granted to the
-- designer role on prototype_versions / frames / hotspots. The import worker
-- (Edge Function, service-role) is the only authority that mutates these rows;
-- service-role bypasses RLS. Designers can INSERT (initial import) and SELECT
-- only — re-imports MUST go to a new prototype_versions row, not a mutation.
--
-- B-05 status semantics:
--   'importing' — worker has reserved the id and is uploading PNGs; designer
--                 lists filter this out. Runner-read policy on frames/hotspots
--                 ALSO requires status='complete' so respondents never see
--                 half-uploaded paths.
--   'complete'  — ready for use.
--   'failed'    — import gave up; row stays for debugging.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. prototype_versions — immutable snapshot
-- -----------------------------------------------------------------------------
CREATE TABLE public.prototype_versions (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id                   uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  figma_file_key             text NOT NULL,
  figma_file_name            text,
  figma_source_last_modified timestamptz,
  snapshot_taken_at          timestamptz NOT NULL DEFAULT now(),
  starting_frame_id          text,
  -- Nullable to support the B-05 import order: worker INSERTs the row at
  -- status='importing' before the Figma fetch completes; UPDATE sets the tree
  -- in the SAME transaction that flips status to 'complete'.
  figma_node_tree            jsonb,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('importing','complete','failed')),
  created_at                 timestamptz NOT NULL DEFAULT now()
  -- INTENTIONALLY NO updated_at — PROTO-04 immutability.
);

CREATE INDEX prototype_versions_study ON public.prototype_versions(study_id);

ALTER TABLE public.prototype_versions ENABLE ROW LEVEL SECURITY;

-- Designer-read: anyone with ANY workspace role on the owning study can SELECT.
CREATE POLICY prototype_versions_designer_read ON public.prototype_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = prototype_versions.study_id
        AND public.current_workspace_role(s.workspace_id) IS NOT NULL
    )
  );

-- Designer-write: only owner/editor can INSERT a new prototype_versions row.
CREATE POLICY prototype_versions_designer_write ON public.prototype_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = prototype_versions.study_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

-- Runner-read: anonymous respondent on a published/archived study can SELECT
-- the prototype version (so frames/hotspots can be displayed in the viewer).
-- Only completed versions are exposed (B-05).
CREATE POLICY prototype_versions_runner_read ON public.prototype_versions
  FOR SELECT
  USING (
    prototype_versions.status = 'complete'
    AND EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = prototype_versions.study_id
        AND s.status IN ('published','archived')
    )
  );

-- NO UPDATE policy. NO DELETE policy. Re-import goes to a new row (PROTO-04).
-- The import worker uses service-role to flip status; that bypasses RLS.

COMMENT ON TABLE public.prototype_versions IS
  'Immutable snapshot of a Figma prototype import. Re-imports always create a new row (PROTO-04). No UPDATE/DELETE policies — surface re-imports as new rows so old reports stay valid. status column lets the import worker (service-role) publish an id early at importing then flip to complete.';

COMMENT ON COLUMN public.prototype_versions.status IS
  'Import lifecycle (B-05). importing = worker reserved id and is uploading PNGs; complete = ready for use; failed = import gave up. Runner-read policy filters to complete only.';


-- -----------------------------------------------------------------------------
-- 2. frames — flat row-per-frame catalog (D-09)
-- -----------------------------------------------------------------------------
CREATE TABLE public.frames (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prototype_version_id uuid NOT NULL REFERENCES public.prototype_versions(id) ON DELETE CASCADE,
  frame_id             text NOT NULL,                          -- Figma node id
  name                 text NOT NULL,
  width                integer NOT NULL CHECK (width > 0),
  height               integer NOT NULL CHECK (height > 0),
  render_path_1x       text NOT NULL,
  render_path_2x       text NOT NULL,
  position             integer NOT NULL DEFAULT 0,
  UNIQUE (prototype_version_id, frame_id)
);

CREATE INDEX frames_prototype_version ON public.frames(prototype_version_id);

ALTER TABLE public.frames ENABLE ROW LEVEL SECURITY;

-- Designer-read: workspace member of the prototype's study can SELECT.
CREATE POLICY frames_designer_read ON public.frames
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prototype_versions pv
      JOIN public.studies s ON s.id = pv.study_id
      WHERE pv.id = frames.prototype_version_id
        AND public.current_workspace_role(s.workspace_id) IS NOT NULL
    )
  );

-- Designer-write: owner/editor of the workspace can INSERT.
CREATE POLICY frames_designer_write ON public.frames
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prototype_versions pv
      JOIN public.studies s ON s.id = pv.study_id
      WHERE pv.id = frames.prototype_version_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

-- Runner-read: anon respondent on a published/archived study sees frames of
-- COMPLETE prototype versions only (B-05).
CREATE POLICY frames_runner_read ON public.frames
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prototype_versions pv
      JOIN public.studies s ON s.id = pv.study_id
      WHERE pv.id = frames.prototype_version_id
        AND pv.status = 'complete'
        AND s.status IN ('published','archived')
    )
  );

-- NO UPDATE/DELETE for designers. Re-imports cascade DELETE via the
-- prototype_versions FK; the import worker (service-role) is the only writer.


-- -----------------------------------------------------------------------------
-- 3. hotspots — invisible hit-test regions
-- -----------------------------------------------------------------------------
CREATE TABLE public.hotspots (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  frame_id             uuid NOT NULL REFERENCES public.frames(id) ON DELETE CASCADE,
  prototype_version_id uuid NOT NULL REFERENCES public.prototype_versions(id) ON DELETE CASCADE,
  hotspot_id           text NOT NULL,                          -- Figma node id
  target_frame_id      text,                                   -- destination frame's Figma node id (null for non-navigation actions)
  transition_kind      text NOT NULL DEFAULT 'dissolve'
                            CHECK (transition_kind IN ('slide','dissolve','push','smart_animate')),
  bbox_x               real NOT NULL CHECK (bbox_x >= 0 AND bbox_x <= 1),
  bbox_y               real NOT NULL CHECK (bbox_y >= 0 AND bbox_y <= 1),
  bbox_w               real NOT NULL CHECK (bbox_w > 0  AND bbox_w <= 1),
  bbox_h               real NOT NULL CHECK (bbox_h > 0  AND bbox_h <= 1),
  z_index integer NOT NULL DEFAULT 0,                          -- PROTO-09: overlay > base
  source_layer         text,                                   -- "Group", "Component", etc. — for debugging
  figma_raw jsonb NOT NULL DEFAULT '{}'::jsonb,                -- verbatim Figma interactions array (Open Q2)
  UNIQUE (frame_id, hotspot_id)
);

CREATE INDEX hotspots_frame ON public.hotspots(frame_id);

ALTER TABLE public.hotspots ENABLE ROW LEVEL SECURITY;

-- Designer-read: workspace member.
CREATE POLICY hotspots_designer_read ON public.hotspots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prototype_versions pv
      JOIN public.studies s ON s.id = pv.study_id
      WHERE pv.id = hotspots.prototype_version_id
        AND public.current_workspace_role(s.workspace_id) IS NOT NULL
    )
  );

-- Designer-write: owner/editor only.
CREATE POLICY hotspots_designer_write ON public.hotspots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prototype_versions pv
      JOIN public.studies s ON s.id = pv.study_id
      WHERE pv.id = hotspots.prototype_version_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

-- Runner-read: anon respondent on a published/archived study sees hotspots of
-- COMPLETE prototype versions only (B-05).
CREATE POLICY hotspots_runner_read ON public.hotspots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prototype_versions pv
      JOIN public.studies s ON s.id = pv.study_id
      WHERE pv.id = hotspots.prototype_version_id
        AND pv.status = 'complete'
        AND s.status IN ('published','archived')
    )
  );

-- NO UPDATE/DELETE for designers. Hotspots are import-worker-only writes;
-- re-imports cascade through prototype_versions/frames.

COMMENT ON COLUMN public.hotspots.figma_raw IS
  'Verbatim Figma node interactions array. RESEARCH.md Open Q2 RESOLVED — lets us debug / re-derive without re-importing.';

COMMENT ON COLUMN public.hotspots.z_index IS
  'Deterministic overlay-vs-base hit-test ordering (PROTO-09). Higher z_index wins. Overlay hotspots get higher values than base-frame hotspots at import time.';
