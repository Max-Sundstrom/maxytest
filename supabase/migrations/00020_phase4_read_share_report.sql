-- =============================================================================
-- Maxytest Phase 4 / Plan 04-06 / Task 3
-- Anon-readable share-report RPCs
-- =============================================================================
--
-- Two anon-callable SECURITY DEFINER RPCs that materialize the public-view
-- surface for a share-token:
--   - read_share_report(token)      → single jsonb blob consumed by
--                                     PublicReportShell in Plan 04-07.
--   - count_share_responses(token)  → cheap bigint aggregate consumed by the
--                                     og-share-card Edge Function in Plan
--                                     04-07 ("N ответов" tile).
--
-- Threat model (00018 §):
--   T-04-06-02 Information Disclosure (public report leaks raw events /
--     respondent metadata): read_share_report returns ONLY safe columns:
--       blocks       — full block rows (no PII; designer-authored content)
--       sessions     — { id, started_at, completed_at, device_class, status }
--                      (no respondent_id, no IP, no user-agent string)
--       responses    — { session_id, block_id, answer, time_ms, submitted_at }
--                      (raw answers; UI hides them per open_answer_visibility)
--       events       — minimal subset for sankey/funnel/heatmap
--   T-04-06-05 RLS bypass via direct GET: anon role has NO SELECT policy on
--     share_tokens (00018). All anon access is RPC-only.
--
-- Returns NULL (not an exception) when token is missing or inactive — the
-- PublicReportShell loader in Plan 04-07 handles NULL by redirecting to
-- /share/gone.
--
-- DEPENDS ON: 00018 (share_tokens), 00019 (lifecycle RPCs).
-- =============================================================================

-- 1. read_share_report — public-view JSON blob ---------------------------------
CREATE OR REPLACE FUNCTION public.read_share_report(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_study_id   uuid;
  v_title      text;
  v_visibility jsonb;
  v_blocks     jsonb;
  v_sessions   jsonb;
  v_responses  jsonb;
  v_events     jsonb;
BEGIN
  SELECT t.study_id, t.title_snapshot, t.open_answer_visibility
    INTO v_study_id, v_title, v_visibility
  FROM public.share_tokens t
  WHERE t.token = p_token AND t.is_active = true
  LIMIT 1;
  IF v_study_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_blocks
    FROM public.blocks b WHERE b.study_id = v_study_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'started_at', s.started_at, 'completed_at', s.completed_at,
    'device_class', s.device_class, 'status', s.status
  )), '[]'::jsonb) INTO v_sessions
    FROM public.sessions s WHERE s.study_id = v_study_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', r.session_id, 'block_id', r.block_id, 'answer', r.answer,
    'time_ms', r.time_ms, 'submitted_at', r.submitted_at
  )), '[]'::jsonb) INTO v_responses
    FROM public.responses r
    JOIN public.sessions s ON s.id = r.session_id
   WHERE s.study_id = v_study_id;

  -- events: minimal subset for sankey / funnel / heatmap. NO respondent_id,
  -- NO ip / user-agent fields; only positional + interaction columns.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'session_id', e.session_id, 'block_id', e.block_id,
    'event_type', e.event_type, 'client_ts', e.client_ts, 'seq', e.seq,
    'frame_id', e.frame_id, 'x', e.x, 'y', e.y,
    'hotspot_id', e.hotspot_id, 'hit_target_id', e.hit_target_id
  )), '[]'::jsonb) INTO v_events
    FROM public.events e
    JOIN public.sessions s ON s.id = e.session_id
   WHERE s.study_id = v_study_id;

  RETURN jsonb_build_object(
    'title',                  v_title,
    'open_answer_visibility', v_visibility,
    'blocks',                 v_blocks,
    'sessions',               v_sessions,
    'responses',              v_responses,
    'events',                 v_events
  );
END
$$;

REVOKE ALL ON FUNCTION public.read_share_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_share_report(text) TO anon, authenticated;

COMMENT ON FUNCTION public.read_share_report(text) IS
  'Phase 4 REPORT-06: anon-callable. Returns NULL for missing/inactive tokens. '
  'Materializes blocks + sessions + responses + events for the public report '
  'view. NEVER includes respondent_id / IP / UA — STRIDE T-04-06-02 mitigation.';

-- 2. count_share_responses — OG-card aggregate ---------------------------------
--   sql function (no plpgsql), STABLE — Postgres can inline.
CREATE OR REPLACE FUNCTION public.count_share_responses(p_token text)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COUNT(*)::bigint
    FROM public.sessions s
    JOIN public.share_tokens t ON t.study_id = s.study_id
   WHERE t.token = p_token
     AND t.is_active = true
     AND s.completed_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.count_share_responses(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_share_responses(text) TO anon, authenticated;

COMMENT ON FUNCTION public.count_share_responses(text) IS
  'Phase 4 REPORT-06 / D-104: anon-callable. Returns the count of completed '
  'sessions for the study referenced by p_token (when active). Used by the '
  'og-share-card Edge Function in Plan 04-07. Returns 0 for unknown / revoked '
  'tokens (no exception).';

-- DOWN: DROP FUNCTION public.read_share_report(text);
--       DROP FUNCTION public.count_share_responses(text);
