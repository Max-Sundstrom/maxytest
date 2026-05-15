-- =============================================================================
-- Maxytest Phase 1: Walking Skeleton — test lifecycle (publish / archive /
-- restore / move-to-draft) + 30-day soft-delete cron infrastructure.
-- =============================================================================
--
-- Plan: 01-walking-skeleton / 01-04 / Task 1
-- Filename note (deviation from plan, Rule 3 - Blocking): Plan frontmatter
-- listed `00003_phase1_lifecycle.sql` but 00003 was taken by Wave 3's
-- `00003_phase1_rpcs.sql`. This migration is therefore numbered 00004 so
-- `supabase db push` applies it after the existing 00001, 00002, 00003 in
-- lexical order. Documented in SUMMARY.md.
--
-- Decisions in scope (01-CONTEXT.md):
--   - D-19: 22-char run_token, stable across re-publishes
--   - D-27: publish requires ≥1 non-pinned block (server-side validation)
--   - D-28: 30-day soft-delete retention; archive_at filter drives hard-delete
--   - D-29: restore returns to status='draft' and preserves run_token
--   - D-30: future Phase 4 reference-counted retention via `report_tokens`
--           (commented enhancement marker below for reviewer discoverability)
--
-- Functions established:
--   - gen_run_token()                       → text  (22-char URL-safe; D-19)
--   - publish_study(uuid)                   → table (run_token, status); D-27
--   - move_study_to_draft(uuid)             → void  (published → draft)
--   - archive_study(uuid)                   → void  (any → archived; D-28)
--   - restore_study(uuid)                   → void  (archived → draft; D-29)
--   - hard_delete_archived_studies()        → int   (cron-callable; cascades)
--
-- Authorization model:
--   - publish / move / archive / restore: SECURITY DEFINER with explicit
--     `current_workspace_role(ws_id) IN ('owner','editor')` guard. Cross-tenant
--     calls raise SQLSTATE 42501 'forbidden' (mitigation T-01-04-04).
--   - hard_delete_archived_studies: SECURITY DEFINER with NO auth guard
--     because it is only callable by:
--       (a) the service-role key inside `supabase/functions/
--            hard_delete_archived_studies/index.ts`, OR
--       (b) `pg_cron` (self-host path; commented at bottom).
--     Authenticated end-users do not need to call it.
-- =============================================================================

-- =============================================================================
-- 1. gen_run_token() — 22-char URL-safe random token (D-19)
-- =============================================================================
-- Equivalent to nanoid(22): 22 chars sampled uniformly from a 64-char
-- URL-safe alphabet (A-Z, a-z, 0-9, _, -). Search space = 64^22 ≈ 2^132,
-- which is far larger than the practical-collision threshold for the v1
-- corpus. Note: this uses `random()` which is *NOT* cryptographically
-- secure. Acceptable for run-tokens because they are public IDs, not
-- secrets — a respondent reads them off a published share link. Phase 4
-- introduces pgcrypto-backed report tokens for surfaces where secrecy
-- matters (signed share URLs).
CREATE OR REPLACE FUNCTION public.gen_run_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT array_to_string(
    ARRAY(
      SELECT substr(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
        floor(random() * 64)::int + 1,
        1
      )
      FROM generate_series(1, 22)
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.gen_run_token() IS
  'D-19: 22-char URL-safe random run-token. Run-tokens are public IDs (not secrets); cryptographic randomness is not required at v1. Re-evaluate if tokens ever gate access to private data.';

-- =============================================================================
-- 2. publish_study(study_uuid) — D-27 validate + mint token + transition
-- =============================================================================
-- Steps:
--   1. Authorization: caller must be owner/editor of the owning workspace.
--   2. Validate: study must contain ≥1 non-pinned block.
--   3. Token: reuse existing run_token if present (D-19 stability); else mint
--      a fresh one via gen_run_token() and loop on UNIQUE collision (the
--      probability is astronomically low but we retry to be defensive).
--   4. Transition: status='published', published_at=now(), archived_at=NULL
--      so a previously archived study can be re-published cleanly.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.publish_study(study_uuid uuid)
RETURNS TABLE(run_token text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id           uuid;
  existing_token  text;
  block_count     int;
  generated_token text;
  attempts        int := 0;
BEGIN
  -- 1. Authorization
  SELECT s.workspace_id, s.run_token INTO ws_id, existing_token
    FROM public.studies s
    WHERE s.id = study_uuid;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study_not_found' USING ERRCODE = '02000';
  END IF;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate ≥1 non-pinned block (D-27 "must have an open_question")
  SELECT COUNT(*) INTO block_count
    FROM public.blocks b
    WHERE b.study_id = study_uuid
      AND NOT b.pinned;
  IF block_count = 0 THEN
    RAISE EXCEPTION 'no_question_blocks' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Generate or reuse run_token (D-19 stability across re-publishes)
  IF existing_token IS NULL THEN
    LOOP
      generated_token := public.gen_run_token();
      BEGIN
        UPDATE public.studies
          SET run_token = generated_token
          WHERE id = study_uuid;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts > 5 THEN
          RAISE EXCEPTION 'run_token_collision' USING ERRCODE = 'P0001';
        END IF;
      END;
    END LOOP;
  ELSE
    generated_token := existing_token;
  END IF;

  -- 4. Transition status + clear archived_at (re-publish from archived state)
  UPDATE public.studies
    SET status = 'published',
        published_at = now(),
        archived_at = NULL
    WHERE id = study_uuid;

  RETURN QUERY SELECT generated_token, 'published'::text;
END
$$;

COMMENT ON FUNCTION public.publish_study(uuid) IS
  'D-27: validate ≥1 non-pinned block, mint stable run_token (D-19), transition to status=published.';

-- =============================================================================
-- 3. move_study_to_draft(study_uuid) — published → draft (TESTMGMT-02)
-- =============================================================================
-- Symmetric authorization. Preserves run_token (D-19) so re-publishing keeps
-- the same shareable URL. Clears published_at so analytics can distinguish
-- between "currently live" and "was live once".
-- =============================================================================
CREATE OR REPLACE FUNCTION public.move_study_to_draft(study_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
BEGIN
  SELECT workspace_id INTO ws_id
    FROM public.studies
    WHERE id = study_uuid;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study_not_found' USING ERRCODE = '02000';
  END IF;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.studies
    SET status = 'draft',
        published_at = NULL
    WHERE id = study_uuid;
END
$$;

COMMENT ON FUNCTION public.move_study_to_draft(uuid) IS
  'TESTMGMT-02: published → draft. Preserves run_token (D-19); clears published_at.';

-- =============================================================================
-- 4. archive_study(study_uuid) — any → archived (D-28)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.archive_study(study_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
BEGIN
  SELECT workspace_id INTO ws_id
    FROM public.studies
    WHERE id = study_uuid;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study_not_found' USING ERRCODE = '02000';
  END IF;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.studies
    SET status = 'archived',
        archived_at = now()
    WHERE id = study_uuid;
END
$$;

COMMENT ON FUNCTION public.archive_study(uuid) IS
  'D-28: status=archived + archived_at=now(). 30-day countdown begins; cron sweeps after that.';

-- =============================================================================
-- 5. restore_study(study_uuid) — archived → draft (D-29)
-- =============================================================================
-- D-29: status returns to 'draft' (never directly to 'published' — designer
-- must explicitly re-publish so they review state before respondents see it).
-- archived_at is cleared atomically so a concurrent
-- hard_delete_archived_studies() cron-pass cannot delete this row mid-restore
-- (T-01-04-01 mitigation).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.restore_study(study_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
BEGIN
  SELECT workspace_id INTO ws_id
    FROM public.studies
    WHERE id = study_uuid;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study_not_found' USING ERRCODE = '02000';
  END IF;
  IF public.current_workspace_role(ws_id) NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.studies
    SET status = 'draft',
        archived_at = NULL
    WHERE id = study_uuid;
END
$$;

COMMENT ON FUNCTION public.restore_study(uuid) IS
  'D-29: archived → draft. Atomic clear of archived_at (race-free with hard-delete cron).';

-- =============================================================================
-- 6. hard_delete_archived_studies() — cron-callable; cascades to children
-- =============================================================================
-- Deletes studies whose archived_at is older than 30 days. Returns the count
-- of deleted rows so the Edge Function caller can log it. CASCADE on:
--   - studies → blocks (ON DELETE CASCADE in 00001_init.sql)
--   - studies → sessions (ON DELETE CASCADE in 00001_init.sql)
--   - sessions → responses (ON DELETE CASCADE in 00001_init.sql)
-- ⇒ all four levels are wiped atomically per study; no orphan rows remain
-- (Pitfall 13 mitigation).
--
-- ─── Phase 4 enhancement marker (D-30) ────────────────────────────────────
-- Once Phase 4 introduces `public.report_tokens` (public read-only share
-- links), the WHERE clause must gain:
--   AND NOT EXISTS (
--     SELECT 1 FROM public.report_tokens rt
--     WHERE rt.study_id = studies.id
--   )
-- so a soft-deleted study that still has a referenced public report token
-- is NOT hard-deleted (reference-counted retention). When Plan 04-XX lands,
-- the planner MUST extend this function in lockstep. The TODO is intentional
-- and reviewer-discoverable.
-- ──────────────────────────────────────────────────────────────────────────
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
    DELETE FROM public.studies
     WHERE archived_at IS NOT NULL
       AND archived_at < now() - interval '30 days'
       -- Phase 4 (D-30): add `AND NOT EXISTS (SELECT 1 FROM public.report_tokens rt WHERE rt.study_id = studies.id)`
     RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM del;

  RETURN deleted_count;
END
$$;

COMMENT ON FUNCTION public.hard_delete_archived_studies() IS
  'D-28 cron: deletes studies with archived_at < now() - 30 days. Cascades to blocks/sessions/responses. Phase 4 must add a report_tokens reference-count guard.';

-- =============================================================================
-- 7. pg_cron schedule — SELF-HOST ONLY (commented; cloud uses Edge Function)
-- =============================================================================
-- Supabase Cloud does NOT enable pg_cron by default. Self-host operators can
-- uncomment this block AFTER enabling the extension to wire a nightly trigger
-- without the Edge Function path.
--
-- SUPABASE CLOUD PATH: deploy `supabase/functions/hard_delete_archived_studies/`
-- and configure a Scheduled Trigger via the Dashboard → Edge Functions →
-- Triggers → New trigger → CRON `0 3 * * *` (3 AM UTC daily). The Edge
-- Function calls `supabase.rpc('hard_delete_archived_studies')` using the
-- service-role key from its environment.
--
-- ─── pg_cron block (uncomment for self-host) ──────────────────────────────
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'hard-delete-archived-studies',
--   '0 3 * * *',
--   $$SELECT public.hard_delete_archived_studies()$$
-- );
-- ──────────────────────────────────────────────────────────────────────────
