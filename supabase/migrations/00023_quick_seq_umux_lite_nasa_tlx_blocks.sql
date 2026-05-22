-- =============================================================================
-- Maxytest Quick Task 260522-jwn
-- Extend public.blocks.type CHECK constraint to include 3 standardized
-- survey blocks: 'seq', 'umux_lite', 'nasa_tlx'.
-- =============================================================================
--
-- The previous CHECK constraint (from `00016_phase4_blocks_type_check.sql`)
-- permitted only Phase 4 core survey blocks:
--   ('welcome', 'thanks', 'open_question', 'prototype',
--    'choice', 'scale', 'nps', 'agreement', 'context').
--
-- This quick task ships SEQ (Single Ease Question, 7-point), UMUX-Lite
-- (2-item usability composite), and NASA-TLX Raw (6-dimension workload).
-- The associated Zod discriminated union in
-- `apps/web/src/lib/blocks/schemas.ts` is extended in the same plan so the
-- DB and TS contracts move together (RESEARCH.md Pitfall 3).
--
-- This is a STRICT SUPERSET of the previous constraint: every existing row
-- remains valid; no data migration is required (no rows with the new types
-- existed yet because they were never permitted before).
--
-- Threat T-quick-jwn-06 (Tampering): extended IN-list is a strict superset
-- of the prior set; existing rows stay valid — verified by inspection of
-- the new IN-list (12 literals = 9 prior + 3 new).
--
-- Append-only migration path: this file is applied via
-- `supabase migration up --include-all`. Existing local data survives the
-- upgrade.

ALTER TABLE public.blocks
  DROP CONSTRAINT blocks_type_check;

ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_type_check
  CHECK (type IN (
    'welcome', 'thanks', 'open_question', 'prototype',
    'choice', 'scale', 'nps', 'agreement', 'context',
    'seq', 'umux_lite', 'nasa_tlx'
  ));

COMMENT ON CONSTRAINT blocks_type_check ON public.blocks IS
  'Quick task 260522-jwn: added SEQ + UMUX-Lite + NASA-TLX (Raw) survey blocks. See .planning/quick/260522-jwn-add-seq-umux-lite-nasa-tlx-survey-blocks/260522-jwn-PLAN.md.';

-- DOWN (rollback notes — informational only; Supabase CLI does not auto-apply):
-- ALTER TABLE public.blocks DROP CONSTRAINT blocks_type_check;
-- ALTER TABLE public.blocks ADD CONSTRAINT blocks_type_check
--   CHECK (type IN ('welcome', 'thanks', 'open_question', 'prototype',
--                   'choice', 'scale', 'nps', 'agreement', 'context'));
-- NOTE: rollback requires that no rows with 'seq'/'umux_lite'/'nasa_tlx'
-- exist; delete them first or the constraint addition will fail.
