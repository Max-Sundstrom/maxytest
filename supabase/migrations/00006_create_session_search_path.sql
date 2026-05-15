-- =============================================================================
-- 00006: fix create_session() to find pgcrypto's gen_random_bytes()
-- =============================================================================
--
-- Problem: 00005's create_session() uses `gen_random_bytes(22)` from the
-- pgcrypto extension. Supabase installs pgcrypto in the `extensions` schema,
-- but the function declared `SET search_path = public`, which overrode the
-- role-level search_path and made `gen_random_bytes` unreachable.
-- SQLSTATE 42883: "function gen_random_bytes(integer) does not exist".
--
-- Fix: CREATE OR REPLACE the function with `SET search_path = public, extensions`
-- so pgcrypto functions resolve. Function body unchanged.

CREATE OR REPLACE FUNCTION public.create_session(
  p_run_token text,
  p_device_type text,
  p_user_agent text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  st_id           uuid;
  st_status       text;
  new_session_id  uuid;
  caller_uid      uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, status INTO st_id, st_status
    FROM public.studies
   WHERE run_token = p_run_token;

  IF st_id IS NULL THEN
    RAISE EXCEPTION 'invalid_run_token' USING ERRCODE = 'P0001';
  END IF;

  IF st_status <> 'published' THEN
    RAISE EXCEPTION 'not_accepting_responses' USING ERRCODE = 'P0001';
  END IF;

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
