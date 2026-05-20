-- =============================================================================
-- Maxytest Phase 4 / Plan 04-05 Task 5 — TESTMGMT-04 duplicate_study RPC.
-- =============================================================================
--
-- Atomically copies a study + its blocks into a fresh draft. SECURITY DEFINER
-- so the caller bypasses RLS for the COPY but is gated by an explicit
-- workspace-role check (owner | editor only).
--
-- Source patterns reused:
--   - duplicate_block (00003:190-241) — atomic copy + workspace gate + audit
--     table for idempotency.
--   - publish_prototype_from_plugin (00013:81-150) + the 00014 NULL-role fix:
--     COALESCE(current_workspace_role(...), 'none') NOT IN ('owner','editor')
--     is the CANONICAL workspace gate idiom (PATTERNS §19, learned the hard
--     way in Phase 02.2-02).
--
-- What gets copied:
--   * studies row → new row with status='draft', NULL run_token (must publish
--     fresh — D-19 lifecycle), NULL archived_at, NULL published_at, fresh
--     created_at / updated_at.
--   * blocks → all rows with study_id=p_study_id are cloned at their original
--     positions, version reset to 0 (fresh autosave chain), pinned bit
--     preserved (welcome/thanks pinning is layout-critical).
--
-- What is NOT copied:
--   * sessions / responses / events — empty test on purpose; the designer
--     wants a fresh copy to iterate on, not a fork of the response data.
--   * share_tokens (when Plan 04-06 lands) — fresh tokens minted on publish.
--   * prototype_versions / frames / hotspots — referenced AS-IS through the
--     `blocks.content->>'prototype_version_id'` pointer. Both studies see
--     the same immutable PNG renders + hotspot graph. Per CONTEXT.md
--     constraint «Prototype immutability after import» this is intentional —
--     no copy means no fork; re-import on either copy creates a new
--     prototype_versions row that only that copy points at.
--
-- Idempotency:
--   Audit row in NEW `study_changes` table keyed on (study_id,
--   idempotency_key). A replay with the same key returns the previously-
--   created new_study_id. Matches PATTERNS §19 (duplicate_block uses
--   block_changes for the same purpose).
--
-- Migration is APPEND-ONLY (Phase 02.2 discipline — never edit prior
-- migrations). Operator pushes via `supabase db push --linked` or by
-- pasting into Supabase Studio SQL Editor.
-- =============================================================================

-- 1. New audit table for study lifecycle events ------------------------------
--    Mirrors block_changes (00003 line 280 area) but keyed on study_id.
--    Currently used only by duplicate_study; future Phase 4 archive / publish
--    extensions can reuse it (additive change_type values).
CREATE TABLE IF NOT EXISTS public.study_changes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id        uuid REFERENCES public.studies(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES auth.users(id)     ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  change_type     text NOT NULL
    CHECK (change_type IN ('create','duplicate','publish','archive','restore')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Replay key: same (study_id, idempotency_key) on the same change_type
  -- must dedupe. We don't put change_type in the unique because the
  -- duplicate path is the only producer; if more producers join later
  -- they generate distinct UUIDs and won't collide.
  UNIQUE (study_id, idempotency_key)
);

ALTER TABLE public.study_changes ENABLE ROW LEVEL SECURITY;

-- Designers can read their workspace's audit trail. Append happens via the
-- SECURITY DEFINER RPC, so no INSERT policy needed for the authenticated role.
CREATE POLICY study_changes_workspace_read ON public.study_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
       WHERE s.id = study_changes.study_id
         AND COALESCE(public.current_workspace_role(s.workspace_id), 'none')
               IN ('owner','editor','viewer')
    )
  );

-- 2. duplicate_study RPC -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.duplicate_study(
  p_study_id        uuid,
  p_new_title       text,
  p_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src_study     public.studies%ROWTYPE;
  ws_id         uuid;
  new_study_id  uuid;
  new_title     text;
  existing_dup  uuid;
BEGIN
  -- 1. Auth gate --------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. Source study lookup ----------------------------------------------------
  SELECT * INTO src_study FROM public.studies WHERE id = p_study_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_not_found' USING ERRCODE = '02000';
  END IF;
  ws_id := src_study.workspace_id;

  -- 3. Workspace role gate ----------------------------------------------------
  --    Canonical NULL-role idiom — COALESCE prevents the three-valued-logic
  --    trap (see migration 00014 header). Non-members get 'none' and are
  --    rejected.
  IF COALESCE(public.current_workspace_role(ws_id), 'none')
       NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 4. Idempotency replay -----------------------------------------------------
  --    Same (source study, idempotency_key) → return the previously-created
  --    new_study_id. Designer-side double-clicks become safe.
  SELECT (payload->>'new_study_id')::uuid INTO existing_dup
    FROM public.study_changes
   WHERE study_id = p_study_id
     AND idempotency_key = p_idempotency_key
     AND change_type = 'duplicate'
   LIMIT 1;
  IF existing_dup IS NOT NULL THEN
    RETURN existing_dup;
  END IF;

  -- 5. Compute new title ------------------------------------------------------
  --    Default suffix « (копия) » mirrors Russian-locale UX of similar
  --    designer-side flows. NULL-safe trim.
  new_title := COALESCE(NULLIF(trim(p_new_title), ''), src_study.title || ' (копия)');

  -- 6. Insert new studies row -------------------------------------------------
  --    status='draft', run_token=NULL (must publish fresh), archived_at=NULL,
  --    published_at=NULL. created_by tracks the caller, NOT the original
  --    author — copying is an act of authorship.
  INSERT INTO public.studies (
    workspace_id, title, status, run_token, archived_at, published_at, created_by
  ) VALUES (
    ws_id, new_title, 'draft', NULL, NULL, NULL, auth.uid()
  ) RETURNING id INTO new_study_id;

  -- 7. Copy blocks ------------------------------------------------------------
  --    Position + type + pinned + content (jsonb) carry over verbatim.
  --    `version` reset to 0 — the new study's autosave chain is independent
  --    of the source's. The prototype_version_id inside content (when type
  --    = 'prototype') is copied by reference: both studies point at the
  --    same immutable prototype_versions row (CONTEXT.md «Prototype
  --    immutability after import» — explicit intent, see header).
  INSERT INTO public.blocks (study_id, position, type, pinned, content, version)
  SELECT new_study_id, position, type, pinned, content, 0
    FROM public.blocks
   WHERE study_id = p_study_id;

  -- 8. Audit row + idempotency anchor ----------------------------------------
  INSERT INTO public.study_changes (
    study_id, actor_id, idempotency_key, change_type, payload
  ) VALUES (
    p_study_id, auth.uid(), p_idempotency_key, 'duplicate',
    jsonb_build_object(
      'new_study_id', new_study_id,
      'new_title',    new_title
    )
  )
  ON CONFLICT (study_id, idempotency_key) DO NOTHING;

  RETURN new_study_id;
END;
$$;

COMMENT ON FUNCTION public.duplicate_study(uuid, text, uuid) IS
  'Phase 4 / Plan 04-05 TESTMGMT-04. Atomically copies a study + its blocks
   into a new draft. Sessions / responses / events / share_tokens NOT copied.
   prototype_versions referenced read-only — both studies share the same
   immutable PNG renders. Idempotency_key dedupes replays via study_changes.';

GRANT EXECUTE ON FUNCTION public.duplicate_study(uuid, text, uuid) TO authenticated;

-- =============================================================================
-- DOWN (manual, not run automatically by Supabase CLI):
--   DROP FUNCTION public.duplicate_study(uuid, text, uuid);
--   DROP TABLE public.study_changes;
-- =============================================================================
