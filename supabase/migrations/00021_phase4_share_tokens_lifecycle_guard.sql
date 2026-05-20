-- =============================================================================
-- Maxytest Phase 4 / Plan 04-06 / Task 4
-- Lifecycle guard: hard_delete_archived_studies() skips share-active studies
-- =============================================================================
--
-- Closes H-1 (REPORT-08 BLOCKER) and the TODO marker at
-- 00004_phase1_lifecycle.sql:269-280.
--
-- The existing hard_delete_archived_studies() (Phase 1) reaps studies whose
-- archived_at is older than 30 days. Plan 04-06 adds a NOT EXISTS guard so
-- studies referenced by an active public-share token are NEVER hard-deleted.
--
-- Mechanism — REPORT-08 ("link survives study deletion"):
--   While ANY share_token.is_active=true row references study X, the source
--   study row stays in public.studies → its CASCADE chain (blocks →
--   prototype_versions reference, sessions → responses, events) survives →
--   public.read_share_report(token) keeps materializing data.
--
--   After the designer revokes ALL share-tokens AND the study has aged
--   past 30 days, the next cron tick lets the DELETE through; CASCADE then
--   wipes blocks / sessions / responses / events in one atomic step.
--
-- Function signature is unchanged (RETURNS int), so the existing pg_cron /
-- Edge-Function-scheduled callers in 00004_phase1_lifecycle.sql:307-327
-- continue to work without re-deploy.
--
-- DEPENDS ON: 00004 (original hard_delete_archived_studies),
--             00018 (share_tokens table).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hard_delete_archived_studies()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH del AS (
    DELETE FROM public.studies s
     WHERE s.archived_at IS NOT NULL
       AND s.archived_at < now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1
           FROM public.share_tokens st
          WHERE st.study_id = s.id
            AND st.is_active = true
       )
    RETURNING s.id
  )
  SELECT COUNT(*) INTO deleted_count FROM del;

  RETURN COALESCE(deleted_count, 0);
END
$$;

COMMENT ON FUNCTION public.hard_delete_archived_studies() IS
  'D-28 cron + Phase 4 D-105/REPORT-08 lifecycle guard. Deletes studies with '
  'archived_at < now() - 30 days, BUT only when no active share_token '
  'references them. CASCADE chain: studies → blocks/sessions; sessions → '
  'responses. Phase 8 will add Storage GC for orphaned PNG renders.';

-- DOWN: restore the pre-Phase-4 version by re-applying the CREATE OR REPLACE
--       block from 00004_phase1_lifecycle.sql:282-302 (without the NOT EXISTS
--       sub-clause). This is the rollback path if Phase 4 share_tokens is
--       fully removed.
