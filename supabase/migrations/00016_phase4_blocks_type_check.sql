-- =============================================================================
-- Maxytest Phase 4 / Plan 04-01 / Task 1
-- Extend public.blocks.type CHECK constraint to include the 5 Phase 4 survey
-- block types: 'choice', 'scale', 'nps', 'agreement', 'context'.
-- =============================================================================
--
-- The previous CHECK constraint (from `00008_phase2_blocks_prototype_type.sql`)
-- permitted only: ('welcome', 'thanks', 'open_question', 'prototype').
--
-- Phase 4 ships the core survey-blocks-v1 set (BLK-04..BLK-08); this migration
-- widens the constraint by FIVE values so a designer can save a block of any
-- new type without violating the CHECK. The associated Zod discriminated union
-- in `apps/web/src/lib/blocks/schemas.ts` is extended in the same plan so the
-- DB and TS contracts move together (RESEARCH.md Pitfall 12, .planning/.../
-- 04-01-PLAN.md Task 3).
--
-- This is a STRICT SUPERSET of the previous constraint: every existing row
-- (welcome / thanks / open_question / prototype) remains valid; no data
-- migration is required (no rows with the new types existed yet because they
-- were never permitted before).
--
-- Threat T-04-01-01 (Tampering): extended IN-list is a strict superset of the
-- prior set; existing rows stay valid — verified by inspection of the new
-- IN-list (9 literals = 4 prior + 5 new).
--
-- Append-only migration path: this file is applied via
-- `supabase migration up --include-all`. `supabase db reset` is forbidden
-- by project convention (CLAUDE.md §Conventions); existing local data must
-- survive the upgrade.

ALTER TABLE public.blocks
  DROP CONSTRAINT blocks_type_check;

ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_type_check
  CHECK (type IN (
    'welcome', 'thanks', 'open_question', 'prototype',
    'choice', 'scale', 'nps', 'agreement', 'context'
  ));

COMMENT ON CONSTRAINT blocks_type_check ON public.blocks IS
  'Phase 4: added survey-blocks-v1 core set (choice/scale/nps/agreement/context). See .planning/phases/04-survey-blocks-v1-survey-analytics-reports-public-sharing/04-01-PLAN.md.';

-- DOWN (rollback notes — informational only; Supabase CLI does not auto-apply):
-- ALTER TABLE public.blocks DROP CONSTRAINT blocks_type_check;
-- ALTER TABLE public.blocks ADD CONSTRAINT blocks_type_check
--   CHECK (type IN ('welcome', 'thanks', 'open_question', 'prototype'));
-- NOTE: rollback requires that no rows with the new types
-- ('choice','scale','nps','agreement','context') exist in the table; delete
-- them first or the constraint addition will fail.
