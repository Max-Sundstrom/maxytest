-- =============================================================================
-- Maxytest Phase 4 / Plan 04-06 / Task 1
-- share_tokens table + RLS designer_rw policy + indexes
-- =============================================================================
--
-- Public-share tokens for read-only report viewing.
--
-- Threat model:
--   T-04-06-01 Spoofing: nanoid(21) ~126 bits entropy; token unguessable.
--   T-04-06-02 Information Disclosure: anon read goes via SECURITY DEFINER
--     RPC (`read_share_report` in 00020), not direct table SELECT. The RLS
--     policy below is designer-only.
--   T-04-06-03 (REPORT-08): link survival is implemented via the lifecycle
--     guard in 00021_phase4_share_tokens_lifecycle_guard.sql which prevents
--     hard_delete_archived_studies() from removing studies referenced by
--     an active share_token. While a token is active, the source study
--     (and CASCADE chain — blocks, sessions, responses, prototype_versions)
--     is retained.
--   T-04-06-04 Cross-workspace token access: RLS designer_rw USING + WITH
--     CHECK clauses key on the parent study's workspace via
--     current_workspace_role(); double-defence with SECURITY DEFINER RPCs
--     in 00019.
--   T-04-06-05 RLS bypass via direct GET on /rest/v1/share_tokens: there is
--     NO anon SELECT policy on this table; anon access is RPC-only.
--
-- Design notes:
--   - `study_id` carries ON DELETE CASCADE — when a study is finally hard-
--     deleted (after all share-tokens have been revoked), its share_tokens
--     rows go with it. D-105 («link survives study deletion») is enforced
--     UPSTREAM by the lifecycle guard, not by NULL-tolerant FK semantics.
--   - `created_by` is SET NULL on auth.users delete so a designer removing
--     their account does not break links shared by their workspace.
--   - `open_answer_visibility` jsonb maps `{ "<block_id>": true|false }`.
--     Missing key = false (default OFF, REPORT-07).
--   - `title_snapshot` freezes the study title at publish time so the OG
--     card (D-104) survives study renames without re-publish.
-- =============================================================================

CREATE TABLE public.share_tokens (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_id                 uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  token                    text NOT NULL UNIQUE,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  revoked_at               timestamptz,
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- D-100 + REPORT-07 — per-block open-answer visibility.
  -- Shape: { "<block_id>": true|false, ... } ; missing key = false (default OFF).
  open_answer_visibility   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Frozen title for OG card (D-104). Captured at create_share_token time.
  title_snapshot           text
);

CREATE INDEX share_tokens_study_id_idx     ON public.share_tokens(study_id);
CREATE INDEX share_tokens_token_active_idx ON public.share_tokens(token) WHERE is_active = true;

ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;

-- Designer (authenticated, workspace member) — read/write.
-- USING clause grants READ to owner|editor|viewer of the parent study's
-- workspace; WITH CHECK clamps WRITES to owner|editor only (viewers cannot
-- mint or modify tokens). PATTERNS §19 — COALESCE NULL → 'none' so non-
-- members never sneak through the three-valued-logic gap.
CREATE POLICY share_tokens_designer_rw ON public.share_tokens
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = share_tokens.study_id
        AND COALESCE(public.current_workspace_role(s.workspace_id), 'none')
              IN ('owner','editor','viewer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = share_tokens.study_id
        AND COALESCE(public.current_workspace_role(s.workspace_id), 'none')
              IN ('owner','editor')
    )
  );

-- NO anon read policy on this table. Anonymous /share/$token route uses
-- read_share_report SECURITY DEFINER RPC (migration 00020) instead.

COMMENT ON TABLE public.share_tokens IS
  'Phase 4 REPORT-06..08. Public-share tokens. Anonymous read flows through '
  'read_share_report() SECURITY DEFINER RPC, never direct SELECT. '
  'REPORT-08 (link survives study deletion) is enforced by the lifecycle '
  'guard in 00021_phase4_share_tokens_lifecycle_guard.sql which keeps the '
  'source study alive while is_active=true.';

-- DOWN: DROP TABLE public.share_tokens CASCADE; -- (removes both indexes + policy)
