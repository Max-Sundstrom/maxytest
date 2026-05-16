-- =============================================================================
-- Maxytest Phase 2 / Plan 02-07 / Task 1
-- Events ingest contract: events table + sessions.prototype_version_pin
--                         + submit_events RPC (with p_block_id, B-02 fix)
--                         + set_session_prototype_pin RPC (B-03 pin)
--                         + RLS perimeter
-- =============================================================================
--
-- This migration lands the SECURITY-DEFINER ingestion boundary that Slice C's
-- PrototypeRunner (Plan 02-09) and client buffer (Plan 02-08) write against.
-- Every load-bearing correctness property lives at the DB/RPC layer:
--
--   * Per-session monotonic seq          — UNIQUE (session_id, seq)
--   * Idempotent retry                   — UUIDv7 id + ON CONFLICT (id) DO NOTHING
--   * Ownership                          — auth.uid() = sessions.respondent_id
--   * Liveness                           — sessions.status = 'in_progress'
--   * Multi-prototype-block disambiguation (B-02)
--                                        — p_block_id validated per study + type
--   * Re-import safety for in-flight     — sessions.prototype_version_pin (B-03)
--   * Client-supplied study_id / pv_id NEVER trusted — server enrichment only.
--
-- Mirrors the Phase 1 pattern from 00005_phase1_runner.sql (submit_response)
-- adapted for bulk-insert + idempotency via PK conflict.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Section 0 — sessions.prototype_version_pin column (B-03)
-- -----------------------------------------------------------------------------
-- B-03: pin the prototype_version_id at session start. Re-imports while a
-- respondent is mid-task do NOT change which prototype the session's events
-- attach to. Nullable because sessions for studies without a prototype block
-- don't have a pin.
ALTER TABLE public.sessions
  ADD COLUMN prototype_version_pin uuid REFERENCES public.prototype_versions(id);

COMMENT ON COLUMN public.sessions.prototype_version_pin IS
  'Pinned prototype_version_id for this session (B-03). Set ONCE by set_session_prototype_pin RPC at PrototypeRunner mount. submit_events reads pv_id from here, NOT live from the block payload.';


-- -----------------------------------------------------------------------------
-- Section 1 — events table
-- -----------------------------------------------------------------------------
CREATE TABLE public.events (
  id                    uuid PRIMARY KEY,                                              -- UUIDv7 from client (idempotency key)
  session_id            uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  study_id              uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  block_id              uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  prototype_version_id  uuid NOT NULL REFERENCES public.prototype_versions(id),       -- NO CASCADE: deleted prototypes keep events visible per CONTEXT D-07
  frame_id              text NOT NULL,                                                 -- text, NO FK to frames (cheaper joins + survives re-import; Open Q4 RESOLVED)
  hotspot_id            text,
  hit_target_id         text,                                                          -- null = misclick
  event_type            text NOT NULL CHECK (event_type IN ('tap','frame_enter','frame_exit','task_finish')),
  x                     real,                                                          -- normalized [0,1]
  y                     real,
  seq                   integer NOT NULL,                                              -- per-session monotonic
  client_ts             timestamptz NOT NULL,
  server_ts             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

CREATE INDEX events_session_seq  ON public.events(session_id, seq);
CREATE INDEX events_frame        ON public.events(prototype_version_id, frame_id);
CREATE INDEX events_study_frame  ON public.events(study_id, frame_id);

COMMENT ON TABLE public.events IS
  'Phase 2 event ingest. id is UUIDv7 from client (idempotency key). seq is per-session monotonic — order analytics by (session_id, seq), NEVER by server_ts. frame_id is text (no FK) per Open Q4 RESOLVED. study_id / block_id / prototype_version_id are server-enriched in submit_events — clients NEVER set them directly.';


-- -----------------------------------------------------------------------------
-- Section 2 — RLS perimeter
-- -----------------------------------------------------------------------------
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Designer can SELECT events for studies in their workspace.
-- STABLE current_workspace_role helper avoids the IN-SELECT anti-pattern.
CREATE POLICY events_designer_read ON public.events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = events.study_id
        AND public.current_workspace_role(s.workspace_id) IS NOT NULL
    )
  );

-- NO INSERT / UPDATE / DELETE policies for ANY role except service-role
-- (which bypasses RLS). Anonymous respondent writes ONLY through the
-- submit_events SECURITY DEFINER RPC.


-- -----------------------------------------------------------------------------
-- Section 3 — set_session_prototype_pin RPC (B-03)
-- -----------------------------------------------------------------------------
-- Called by PrototypeRunner on mount BEFORE the first submit_events.
-- Pin is set ONCE; subsequent calls with the same pv_id no-op (retry safe).
-- Verifies the pv belongs to the session's study so a malicious caller
-- cannot bind their session to a foreign-study prototype.
CREATE OR REPLACE FUNCTION public.set_session_prototype_pin(
  p_session_id uuid,
  p_pv_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid   uuid := auth.uid();
  owner_uid    uuid;
  sess_status  text;
  sess_study   uuid;
  current_pin  uuid;
  pv_study     uuid;
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT respondent_id, status, study_id, prototype_version_pin
    INTO owner_uid, sess_status, sess_study, current_pin
    FROM public.sessions
   WHERE id = p_session_id;

  IF owner_uid IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF owner_uid <> caller_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF sess_status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Pin can only be set once. If already set, no-op (idempotent on retry).
  IF current_pin IS NOT NULL THEN
    RETURN;
  END IF;

  -- Verify the prototype_version belongs to this session's study.
  SELECT study_id INTO pv_study
    FROM public.prototype_versions
   WHERE id = p_pv_id;
  IF pv_study IS NULL OR pv_study <> sess_study THEN
    RAISE EXCEPTION 'invalid_prototype_version' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.sessions
     SET prototype_version_pin = p_pv_id,
         last_seen_at = now()
   WHERE id = p_session_id;
END
$$;

COMMENT ON FUNCTION public.set_session_prototype_pin(uuid, uuid) IS
  'B-03: pin a session to a prototype_version_id at PrototypeRunner mount. Idempotent on retry — if pin is already set, returns silently. submit_events reads from this pin, not live from the block payload.';

REVOKE ALL ON FUNCTION public.set_session_prototype_pin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_session_prototype_pin(uuid, uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- Section 4 — submit_events RPC (B-02 fix: p_block_id, B-03 fix: pv from pin)
-- -----------------------------------------------------------------------------
-- The hot ingest path. Called by PrototypeRunner (Plan 02-09) with a batch
-- of buffered events. SECURITY DEFINER + auth.uid() ownership check.
--
-- Server enrichment policy:
--   * study_id              ← sessions.study_id (NEVER trusted from client)
--   * block_id              ← p_block_id, validated per session.study_id + type='prototype' (B-02)
--   * prototype_version_id  ← sessions.prototype_version_pin (B-03; NOT live from the block payload)
--
-- Idempotency: PK is UUIDv7 from client; ON CONFLICT (id) DO NOTHING dedupes
-- replays silently. Returns the number of ROWS actually inserted.
CREATE OR REPLACE FUNCTION public.submit_events(
  p_session_id uuid,
  p_block_id   uuid,
  p_events     jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid     uuid := auth.uid();
  owner_uid      uuid;
  sess_status    text;
  st_id          uuid;
  pv_id          uuid;
  blk_study      uuid;
  blk_type       text;
  inserted_count int := 0;
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Verify session ownership + read the B-03 pin in one query.
  SELECT respondent_id, status, study_id, prototype_version_pin
    INTO owner_uid, sess_status, st_id, pv_id
    FROM public.sessions
   WHERE id = p_session_id;
  IF owner_uid IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF owner_uid <> caller_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF sess_status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_closed' USING ERRCODE = 'P0001';
  END IF;
  IF pv_id IS NULL THEN
    -- B-03: PrototypeRunner must call set_session_prototype_pin BEFORE
    -- the first submit_events. The client surfaces this as a runtime error.
    RAISE EXCEPTION 'session_pin_missing' USING ERRCODE = 'P0001';
  END IF;

  -- B-02: validate the supplied block belongs to this session's study AND
  -- is a prototype block. Catches the "multiple prototype blocks per study"
  -- mis-attribution hazard.
  SELECT study_id, type INTO blk_study, blk_type
    FROM public.blocks
   WHERE id = p_block_id;
  IF blk_study IS NULL OR blk_study <> st_id OR blk_type <> 'prototype' THEN
    RAISE EXCEPTION 'invalid_block' USING ERRCODE = 'P0001';
  END IF;

  -- Bulk insert with idempotency via ON CONFLICT on PK
  -- (id is UUIDv7 = idempotency key).
  --
  -- Server enriches study_id (from sessions.study_id)
  --                 + block_id (from validated p_block_id)
  --                 + prototype_version_id (from sessions.prototype_version_pin)
  -- — clients NEVER set these columns directly.
  INSERT INTO public.events (
    id, session_id, study_id, block_id, prototype_version_id,
    frame_id, hotspot_id, hit_target_id, event_type,
    x, y, seq, client_ts
  )
  SELECT
    (e->>'id')::uuid,
    p_session_id,
    st_id,
    p_block_id,
    pv_id,
    e->>'frame_id',
    NULLIF(e->>'hotspot_id', ''),
    NULLIF(e->>'hit_target_id', ''),
    e->>'event_type',
    NULLIF(e->>'x', '')::real,
    NULLIF(e->>'y', '')::real,
    (e->>'seq')::int,
    (e->>'client_ts')::timestamptz
  FROM jsonb_array_elements(p_events) AS e
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- Refresh session liveness so the designer's session list reflects activity.
  UPDATE public.sessions
     SET last_seen_at = now()
   WHERE id = p_session_id;

  RETURN inserted_count;
END
$$;

COMMENT ON FUNCTION public.submit_events(uuid, uuid, jsonb) IS
  'Phase 2 event ingest. SECURITY DEFINER + auth.uid() ownership check. (B-02) Server validates p_block_id belongs to session.study_id AND type=prototype. (B-03) Reads prototype_version_id from sessions.prototype_version_pin — re-imports do NOT corrupt in-flight sessions. Bulk insert with ON CONFLICT (id) DO NOTHING for UUIDv7 idempotency. Per-session UNIQUE(session_id, seq) prevents duplicate seq numbers.';

REVOKE ALL ON FUNCTION public.submit_events(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_events(uuid, uuid, jsonb) TO authenticated;
