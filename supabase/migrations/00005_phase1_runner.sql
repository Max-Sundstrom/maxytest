-- =============================================================================
-- Maxytest Phase 1 / Plan 01-05: Mobile runner RPCs
-- =============================================================================
--
-- Three SECURITY DEFINER RPCs for the anonymous respondent runner:
--
--   1. create_session(p_run_token, p_device_type, p_user_agent) RETURNS uuid
--      - Resolves study by run_token; only `status = 'published'` accepts new
--        sessions (archived studies render <TestNotAcceptingScreen> client-side
--        via the read path, NOT through this RPC).
--      - Inserts a sessions row keyed on `respondent_id = auth.uid()`
--        (auth.uid() is the anonymous Supabase user minted by
--        signInAnonymously() on first visit).
--      - Generates a server-internal session_token via gen_random_bytes(22)
--        to satisfy the UNIQUE constraint from 00001_init.sql §"8. sessions";
--        the client never reads this value (D-20 keeps session_id in
--        localStorage; session_token is a server-internal handle).
--
--   2. submit_response(p_session_id, p_block_id, p_answer, p_time_ms) RETURNS void
--      - Verifies session ownership (`auth.uid() = sessions.respondent_id`)
--        and that the session is `status = 'in_progress'`. After a session
--        completes, further submits raise `session_closed`.
--      - UPSERTs on (session_id, block_id) so a respondent who goes BACK and
--        edits a previous answer updates the existing row instead of inserting
--        a duplicate. The UNIQUE constraint from 00001_init.sql §"9. responses"
--        supports this.
--      - Updates `sessions.last_seen_at = now()` on every successful submit.
--
--   3. complete_session(p_session_id) RETURNS void
--      - Transitions status to 'completed' + sets completed_at = now().
--      - Gated on `respondent_id = auth.uid()` ownership; the SET clause
--        is a no-op for non-owners (no error raised; mirrors the pattern of
--        RLS-style silent filters).
--
-- ⚠ FILENAME NOTE: This file is named `00005_phase1_runner.sql` even though
-- PLAN.md frontmatter listed `00004_phase1_runner.sql`. The slot `00004` was
-- already taken by Wave 4's `00004_phase1_lifecycle.sql` (publish/archive
-- machinery). Numbering chains forward; Supabase CLI applies migrations in
-- lexical order so `00001 → 00002 → 00003 → 00004 → 00005` runs cleanly.
-- Documented as a Rule 3 deviation in 01-05-SUMMARY.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_session — respondent's first visit on /r/{runToken}
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_session(
  p_run_token text,
  p_device_type text,
  p_user_agent text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st_id           uuid;
  st_status       text;
  new_session_id  uuid;
  caller_uid      uuid := auth.uid();
BEGIN
  -- The runner only accepts authenticated callers (signInAnonymously creates a
  -- real auth user — auth.uid() is NOT NULL for those). If somehow we get
  -- called without a JWT we refuse rather than letting respondent_id default.
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Resolve study by run_token. The runner-side RLS policy
  -- `studies_runtoken_read` from 00001_init.sql lets anon clients SELECT
  -- studies where `run_token IS NOT NULL AND status IN ('published','archived')`,
  -- but for *opening a new session* we further restrict to 'published'.
  SELECT id, status INTO st_id, st_status
    FROM public.studies
   WHERE run_token = p_run_token;

  IF st_id IS NULL THEN
    RAISE EXCEPTION 'invalid_run_token' USING ERRCODE = 'P0001';
  END IF;

  IF st_status <> 'published' THEN
    -- Archived (and never-published) studies do not accept new sessions
    -- (D-19). The client surfaces <TestNotAcceptingScreen>.
    RAISE EXCEPTION 'not_accepting_responses' USING ERRCODE = 'P0001';
  END IF;

  -- Insert the session row. respondent_id is the auth.uid() of the
  -- anonymous Supabase user so the `sessions_anon_self_update` RLS policy
  -- and the submit_response/complete_session ownership checks all line up.
  INSERT INTO public.sessions (
    study_id,
    run_token,
    respondent_id,
    session_token,
    status,
    device_type,
    user_agent
  )
  VALUES (
    st_id,
    p_run_token,
    caller_uid,
    encode(gen_random_bytes(22), 'base64'),
    'in_progress',
    p_device_type,
    p_user_agent
  )
  RETURNING id INTO new_session_id;

  RETURN new_session_id;
END
$$;

COMMENT ON FUNCTION public.create_session(text, text, text) IS
  'Plan 01-05 Task 1 / D-20. Creates a sessions row for an anonymous respondent. Raises invalid_run_token if the token does not match any study; raises not_accepting_responses if the study is not currently published; raises not_authenticated if auth.uid() is null (signInAnonymously not called).';


-- -----------------------------------------------------------------------------
-- submit_response — UPSERT a respondent's answer to a block
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_response(
  p_session_id uuid,
  p_block_id uuid,
  p_answer jsonb,
  p_time_ms int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid   uuid;
  sess_status text;
  caller_uid  uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Verify session ownership AND that the session is still in_progress in
  -- a single SELECT. We do not lock the row; UPSERT below is atomic against
  -- concurrent retries from the same respondent (the UNIQUE constraint on
  -- (session_id, block_id) is the serialization point).
  SELECT respondent_id, status
    INTO owner_uid, sess_status
    FROM public.sessions
   WHERE id = p_session_id;

  IF owner_uid IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF owner_uid <> caller_uid THEN
    -- T-01-05-01: cross-respondent answer injection. Hard-stop.
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF sess_status <> 'in_progress' THEN
    -- T-01-05-03: respondent edits after completion. Block.
    RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
  END IF;

  -- UPSERT keyed on the UNIQUE (session_id, block_id) constraint.
  INSERT INTO public.responses (session_id, block_id, answer, time_ms, submitted_at)
   VALUES (p_session_id, p_block_id, p_answer, p_time_ms, now())
   ON CONFLICT (session_id, block_id) DO UPDATE
     SET answer       = EXCLUDED.answer,
         time_ms      = EXCLUDED.time_ms,
         submitted_at = EXCLUDED.submitted_at;

  -- Liveness ping. RLS `sessions_anon_self_update` would also let the client
  -- do this directly, but rolling it into the RPC reduces round-trips.
  UPDATE public.sessions
     SET last_seen_at = now()
   WHERE id = p_session_id;
END
$$;

COMMENT ON FUNCTION public.submit_response(uuid, uuid, jsonb, int) IS
  'Plan 01-05 Task 1. UPSERTs a row into public.responses, gated on sessions.respondent_id = auth.uid() AND sessions.status = ''in_progress''. Raises forbidden / session_closed / session_not_found / not_authenticated.';


-- -----------------------------------------------------------------------------
-- complete_session — respondent reaches the thanks block
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_session(
  p_session_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Idempotent: re-calling complete_session on an already-completed session
  -- is a no-op (the WHERE clause keeps status = 'in_progress' from being
  -- re-set, and an already-completed row simply matches zero rows here).
  UPDATE public.sessions
     SET status       = 'completed',
         completed_at = now(),
         last_seen_at = now()
   WHERE id = p_session_id
     AND respondent_id = caller_uid
     AND status = 'in_progress';
END
$$;

COMMENT ON FUNCTION public.complete_session(uuid) IS
  'Plan 01-05 Task 1. Transitions a session to status=completed when the respondent reaches the thanks block. Owner-checked and idempotent.';


-- -----------------------------------------------------------------------------
-- Grants: PostgREST exposes these via /rest/v1/rpc/{name}. The default grant
-- to PUBLIC on functions is fine because SECURITY DEFINER + the auth.uid()
-- check inside the body is what enforces authorization.
-- -----------------------------------------------------------------------------
-- (No explicit grants needed; default PostgREST behaviour applies.)
