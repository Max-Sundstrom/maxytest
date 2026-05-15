-- =============================================================================
-- 00002: allow auth.users / public.users deletion when they created workspaces/studies
-- =============================================================================
--
-- Problem: deleting an auth.users row cascades to public.users (PK FK), then
-- to memberships (CASCADE), but FAILS at workspaces.created_by / studies.created_by
-- because those FKs have no ON DELETE rule (defaults to NO ACTION).
--
-- Symptom: RLS test suite cleanup throws `AuthApiError: Database error deleting
-- user` when calling auth.admin.deleteUser() for any user who has a bootstrapped
-- workspace.
--
-- Decision: SET NULL on both columns. A workspace / study is "owned" by its
-- memberships(role='owner'), not by created_by. If the creator is deleted but
-- other owners exist, the workspace lives on (with created_by = NULL, which is
-- already nullable). If no owners remain, the workspace becomes invisible via
-- RLS — Phase 6 orphan-cleanup cron can sweep it later.

ALTER TABLE public.workspaces
  DROP CONSTRAINT workspaces_created_by_fkey,
  ADD CONSTRAINT workspaces_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.studies
  DROP CONSTRAINT studies_created_by_fkey,
  ADD CONSTRAINT studies_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
