-- =============================================================================
-- Maxytest Phase 4 / Plan 04-06 / Task 2
-- share_tokens lifecycle RPCs — create / revoke / rotate
-- =============================================================================
--
-- Three SECURITY DEFINER RPCs that wrap writes to public.share_tokens:
--   - create_share_token : workspace-gated, idempotency-protected.
--   - revoke_share_token : flips is_active=false (or back to true if
--                          p_reactivate=true). Workspace-gated.
--   - rotate_share_token : atomically revokes the old token and creates a
--                          new one in the same transaction.
--
-- Threat model (00018 §):
--   T-04-06-01 Spoofing: caller-supplied p_token is expected to be
--     nanoid(21) generated on the client. The RPC itself does NOT validate
--     entropy — that responsibility lies with the hook layer
--     (apps/web/src/lib/queries/share-tokens.ts Task 5).
--   T-04-06-04 Cross-workspace token access: each RPC checks
--     COALESCE(current_workspace_role(ws), 'none') IN ('owner','editor')
--     per PATTERNS §19 NULL-role canonical idiom.
--   T-04-06-07 Tampering: revoke + rotate look up the token's parent study
--     and re-check workspace_role before mutating; cross-workspace tampering
--     cannot reach the UPDATE.
--
-- DEPENDS ON: 00018 (share_tokens table).
-- =============================================================================

-- 1. create_share_token --------------------------------------------------------
--   Idempotency: same (study_id, token) → return the existing row instead of
--   inserting a duplicate. The unique constraint on share_tokens.token
--   guarantees the lookup is single-row.
CREATE OR REPLACE FUNCTION public.create_share_token(
  p_study_id                uuid,
  p_token                   text,        -- caller-generated nanoid(21)
  p_idempotency_key         uuid,
  p_open_answer_visibility  jsonb DEFAULT '{}'::jsonb
)
RETURNS public.share_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ws_id   uuid;
  v_title text;
  v_row   public.share_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT s.workspace_id, s.title INTO ws_id, v_title
    FROM public.studies s WHERE s.id = p_study_id;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'study_not_found' USING ERRCODE = '02000';
  END IF;
  IF COALESCE(public.current_workspace_role(ws_id), 'none')
       NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Idempotency: same (study_id, token) → return existing.
  SELECT * INTO v_row FROM public.share_tokens
    WHERE token = p_token AND study_id = p_study_id LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.share_tokens
    (study_id, token, created_by, open_answer_visibility, title_snapshot)
  VALUES
    (p_study_id, p_token, auth.uid(), p_open_answer_visibility, v_title)
  RETURNING * INTO v_row;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.create_share_token(uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_share_token(uuid, text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_share_token(uuid, text, uuid, jsonb) IS
  'Phase 4 REPORT-06: create a public-share token for a study. Workspace-gated '
  '(owner|editor), idempotency-protected via (study_id, token) re-lookup. '
  'Caller generates the nanoid(21) token client-side; server only stores it.';

-- 2. revoke_share_token --------------------------------------------------------
--   Sets is_active=false (revoke) or is_active=true (re-activate via
--   p_reactivate=true). Single RPC handles both flows so the UI surface in
--   ShareSettingsDialog can toggle from one mutation.
CREATE OR REPLACE FUNCTION public.revoke_share_token(
  p_token       text,
  p_reactivate  boolean DEFAULT false
)
RETURNS public.share_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  v_row public.share_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.*, s.workspace_id INTO v_row, ws_id
    FROM public.share_tokens t
    JOIN public.studies s ON s.id = t.study_id
   WHERE t.token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found' USING ERRCODE = '02000';
  END IF;
  IF COALESCE(public.current_workspace_role(ws_id), 'none')
       NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reactivate THEN
    UPDATE public.share_tokens
       SET is_active = true, revoked_at = NULL
     WHERE token = p_token
     RETURNING * INTO v_row;
  ELSE
    UPDATE public.share_tokens
       SET is_active = false, revoked_at = now()
     WHERE token = p_token
     RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.revoke_share_token(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_share_token(text, boolean) TO authenticated;

COMMENT ON FUNCTION public.revoke_share_token(text, boolean) IS
  'Phase 4 REPORT-06: flip share_tokens.is_active. Default revoke; pass '
  'p_reactivate=true to re-activate a previously revoked token. Workspace-gated.';

-- 3. rotate_share_token --------------------------------------------------------
--   Atomic: revoke the old token, then call create_share_token with the new
--   one in the SAME transaction. plpgsql blocks are implicitly transactional;
--   a failure in either step rolls back both.
--
--   Inherits open_answer_visibility from the old token so the designer's per-
--   block toggle state is preserved across rotation (CONTEXT.md §"rotate
--   preserves visibility").
CREATE OR REPLACE FUNCTION public.rotate_share_token(
  p_old_token       text,
  p_new_token       text,
  p_idempotency_key uuid
)
RETURNS public.share_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_study_id uuid;
  v_vis      jsonb;
  ws_id      uuid;
  v_new_row  public.share_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.study_id, t.open_answer_visibility, s.workspace_id
    INTO v_study_id, v_vis, ws_id
    FROM public.share_tokens t
    JOIN public.studies s ON s.id = t.study_id
   WHERE t.token = p_old_token LIMIT 1;
  IF v_study_id IS NULL THEN
    RAISE EXCEPTION 'token_not_found' USING ERRCODE = '02000';
  END IF;
  IF COALESCE(public.current_workspace_role(ws_id), 'none')
       NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Atomic: revoke old, then create new in same transaction.
  UPDATE public.share_tokens
     SET is_active = false, revoked_at = now()
   WHERE token = p_old_token;

  v_new_row := public.create_share_token(
    v_study_id, p_new_token, p_idempotency_key, COALESCE(v_vis, '{}'::jsonb)
  );
  RETURN v_new_row;
END
$$;

REVOKE ALL ON FUNCTION public.rotate_share_token(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_share_token(text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.rotate_share_token(text, text, uuid) IS
  'Phase 4 REPORT-06: atomically revoke old token + create new one. Inherits '
  'open_answer_visibility from the revoked token so designer per-block toggle '
  'state survives rotation. Workspace-gated.';

-- DOWN: DROP FUNCTION public.create_share_token(uuid, text, uuid, jsonb);
--       DROP FUNCTION public.revoke_share_token(text, boolean);
--       DROP FUNCTION public.rotate_share_token(text, text, uuid);
