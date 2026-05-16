-- =============================================================================
-- Maxytest Phase 2 / hotfix
-- sessions_anon_self_read — anonymous respondent reads their own session
-- =============================================================================
--
-- Phase 1's 00001_init.sql granted anon `INSERT` + `UPDATE` policies on
-- public.sessions but no SELECT policy. Frontend code (`useSession(id)` /
-- RunnerShell mount) INSERTs the row then SELECT-by-id-single's it — the
-- SELECT returns 0 rows under anon RLS and PostgREST surfaces a 406
-- ("expected one row"). Live UAT 2026-05-16 surfaced this.
--
-- Symmetric to the existing _update policy: any anon JWT whose `sub` matches
-- the row's respondent_id can SELECT it.

CREATE POLICY sessions_anon_self_read ON public.sessions
  FOR SELECT
  USING (respondent_id = auth.uid());

COMMENT ON POLICY sessions_anon_self_read ON public.sessions IS
  'Phase 1 RLS gap fix — anon respondent can SELECT own session (mirrors sessions_anon_self_update). Without this, RunnerShell.mount() SELECT-after-INSERT returns 0 rows.';
