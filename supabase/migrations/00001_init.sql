-- =============================================================================
-- Maxytest Phase 1: Walking Skeleton — initial schema + RLS perimeter
-- =============================================================================
--
-- Plan: 01-walking-skeleton / 01-02 / Task 2
-- Source: 01-RESEARCH.md §"Code Examples" migration block
--         01-CONTEXT.md decisions D-01..D-30 (D-13 version, D-16 idempotency,
--                                              D-03 workspace name, D-27/28 status + soft-delete)
--         01-PLAN.md <interfaces> block
--
-- Establishes:
--   - 8 public.* tables (users, workspaces, memberships, studies, blocks,
--     block_changes, sessions, responses)
--   - RLS enabled on every table (T-01-02-02 mitigation)
--   - `current_workspace_role()` STABLE helper (avoids TEAM-04 IN-SELECT
--     anti-pattern; foundation for Plans 01-03/01-05)
--   - Auto-bootstrap trigger on auth.users insert (creates users +
--     workspaces + memberships(role='owner') atomically; WS-01)
--   - Idempotency-key audit table (D-16 / load-bearing for Phase 2)
--   - Version column on blocks (D-13 optimistic concurrency)
--
-- =============================================================================

-- -- Extensions --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. Helpers
-- =============================================================================
-- NOTE: current_workspace_role(ws) is defined AFTER public.memberships is
-- created (section 4 below), because LANGUAGE sql functions are validated at
-- CREATE time and need their referenced tables to already exist.

-- set_updated_at() — universal trigger function for updated_at columns.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

-- =============================================================================
-- 2. users  (thin row alongside auth.users; bootstrapped by trigger below)
-- =============================================================================
CREATE TABLE public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_read ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- =============================================================================
-- 3. workspaces
-- =============================================================================
CREATE TABLE public.workspaces (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  created_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. memberships  (must come BEFORE workspaces_member_read policy)
-- =============================================================================
CREATE TABLE public.memberships (
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_self_read ON public.memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- current_workspace_role(ws) — STABLE SECURITY DEFINER helper for RLS.
-- Returns the calling user's role in the given workspace, or NULL.
-- Uses a direct WHERE filter (NO `IN (SELECT ...)` anti-pattern); Phase 6
-- adds organisation-scoped roles on top of this.
-- Defined HERE (not in the helpers section) because LANGUAGE sql functions
-- are validated at CREATE time and reference public.memberships above.
CREATE OR REPLACE FUNCTION public.current_workspace_role(ws uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.memberships
  WHERE workspace_id = ws
    AND user_id = auth.uid()
  LIMIT 1
$$;

-- Policy on workspaces references current_workspace_role(), which reads
-- memberships. Define here once memberships exists.
CREATE POLICY workspaces_member_read ON public.workspaces
  FOR SELECT
  USING (public.current_workspace_role(id) IN ('owner','editor','viewer'));

-- =============================================================================
-- 5. studies
-- =============================================================================
CREATE TABLE public.studies (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT 'Untitled test',
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  run_token     text UNIQUE,                                   -- generated on first publish
  published_at  timestamptz,
  archived_at   timestamptz,                                   -- soft-delete; cron hard-deletes after 30d (D-28)
  created_by    uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY studies_read ON public.studies
  FOR SELECT
  USING (public.current_workspace_role(workspace_id) IN ('owner','editor','viewer'));

CREATE POLICY studies_write ON public.studies
  FOR INSERT
  WITH CHECK (public.current_workspace_role(workspace_id) IN ('owner','editor'));

CREATE POLICY studies_update ON public.studies
  FOR UPDATE
  USING (public.current_workspace_role(workspace_id) IN ('owner','editor'));

CREATE POLICY studies_delete ON public.studies
  FOR DELETE
  USING (public.current_workspace_role(workspace_id) = 'owner');

-- Anonymous-runner read path: any signInAnonymously() session can SELECT
-- published/archived studies. Runner code looks up by run_token; PostgREST
-- evaluates this OR'd against studies_read so designers still see drafts.
CREATE POLICY studies_runtoken_read ON public.studies
  FOR SELECT
  USING (run_token IS NOT NULL AND status IN ('published','archived'));

CREATE INDEX studies_workspace_status
  ON public.studies (workspace_id, status)
  WHERE archived_at IS NULL;

CREATE TRIGGER studies_updated_at
  BEFORE UPDATE ON public.studies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 6. blocks  (version column for D-13 optimistic concurrency)
-- =============================================================================
CREATE TABLE public.blocks (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id     uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  type         text NOT NULL CHECK (type IN ('welcome','thanks','open_question')),  -- Phase 1 set
  pinned       boolean NOT NULL DEFAULT false,                                       -- welcome/thanks = true
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer NOT NULL DEFAULT 1,                                           -- D-13 optimistic concurrency
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, position)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocks_read ON public.blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = blocks.study_id
        AND (
          public.current_workspace_role(s.workspace_id) IS NOT NULL
          OR s.status IN ('published','archived')   -- runner reads blocks of published studies
        )
    )
  );

CREATE POLICY blocks_write ON public.blocks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = blocks.study_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

CREATE POLICY blocks_update ON public.blocks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = blocks.study_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

CREATE POLICY blocks_delete ON public.blocks
  FOR DELETE
  USING (
    NOT pinned                                                  -- welcome/thanks immovable (D-11)
    AND EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = blocks.study_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

CREATE TRIGGER blocks_updated_at
  BEFORE UPDATE ON public.blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 7. block_changes  (audit-trail; D-16 idempotency-key infrastructure)
-- =============================================================================
CREATE TABLE public.block_changes (
  id               bigserial PRIMARY KEY,
  block_id         uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  actor_id         uuid REFERENCES public.users(id),
  idempotency_key  uuid NOT NULL,                       -- UUIDv7 from client
  change_type      text NOT NULL,                       -- 'content_edit'|'reorder'|'add'|'delete'|'duplicate'
  payload          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, idempotency_key)
);

ALTER TABLE public.block_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY block_changes_member_read ON public.block_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.blocks b
      JOIN public.studies s ON s.id = b.study_id
      WHERE b.id = block_changes.block_id
        AND public.current_workspace_role(s.workspace_id) IS NOT NULL
    )
  );

CREATE POLICY block_changes_insert ON public.block_changes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.blocks b
      JOIN public.studies s ON s.id = b.study_id
      WHERE b.id = block_changes.block_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor')
    )
  );

-- =============================================================================
-- 8. sessions  (respondent runtime; signInAnonymously() user)
-- =============================================================================
CREATE TABLE public.sessions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id        uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  run_token       text NOT NULL,                       -- denormalized for fast lookup
  respondent_id   uuid,                                 -- anon Supabase user id from signInAnonymously
  session_token   text UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  device_type     text,
  user_agent      text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Designer reads sessions for studies in their workspace
CREATE POLICY sessions_designer_read ON public.sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = sessions.study_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor','viewer')
    )
  );

-- Respondent (anonymous JWT) can insert and update their own session
CREATE POLICY sessions_anon_insert ON public.sessions
  FOR INSERT
  WITH CHECK (respondent_id = auth.uid());

CREATE POLICY sessions_anon_self_update ON public.sessions
  FOR UPDATE
  USING (respondent_id = auth.uid());

-- =============================================================================
-- 9. responses  (respondent answers; UNIQUE (session_id, block_id) prevents
--    duplicate submissions per Pitfall 1 idempotency surface)
-- =============================================================================
CREATE TABLE public.responses (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  block_id      uuid NOT NULL REFERENCES public.blocks(id),
  answer        jsonb NOT NULL,
  time_ms       integer,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, block_id)
);

ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY responses_designer_read ON public.responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions sess
      JOIN public.studies s ON s.id = sess.study_id
      WHERE sess.id = responses.session_id
        AND public.current_workspace_role(s.workspace_id) IN ('owner','editor','viewer')
    )
  );

CREATE POLICY responses_anon_insert ON public.responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions sess
      WHERE sess.id = responses.session_id
        AND sess.respondent_id = auth.uid()
        AND sess.status = 'in_progress'
    )
  );

-- =============================================================================
-- 10. Bootstrap workspace on new auth.users insert
--     (D-03: name = `<email-local>'s workspace`; WS-01 acceptance criterion)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_workspace_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id        uuid;
  email_local  text;
BEGIN
  -- For magic-link signups NEW.email is populated; fall back to 'user' if a
  -- third-party provider ever omits it.
  email_local := COALESCE(split_part(NEW.email, '@', 1), 'user');

  INSERT INTO public.users (id, display_name)
    VALUES (NEW.id, email_local);

  INSERT INTO public.workspaces (name, slug, created_by)
    VALUES (
      email_local || '''s workspace',
      email_local || '-' || substr(NEW.id::text, 1, 8),
      NEW.id
    )
    RETURNING id INTO ws_id;

  INSERT INTO public.memberships (workspace_id, user_id, role)
    VALUES (ws_id, NEW.id, 'owner');

  RETURN NEW;
END
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_workspace_for_new_user();
