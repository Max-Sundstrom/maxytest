-- =============================================================================
-- Maxytest Phase 2 / Plan 02-05 / Task 1
-- Extend public.blocks.type CHECK constraint to include 'prototype'.
-- =============================================================================
--
-- The Phase 1 CHECK constraint (from supabase/migrations/00001_init.sql line 173)
-- permitted only the survey-block subset: ('welcome', 'thanks', 'open_question').
-- Phase 2 introduces the flagship "prototype" block (BLK-12); this migration
-- widens the constraint by ONE value so a designer can save a `'prototype'`-type
-- row without violating the check.
--
-- This is a STRICT SUPERSET of the previous constraint (RESEARCH.md line 684):
-- every existing row remains valid; no data migration is required.
--
-- The hand-written Zod `prototypeContentSchema` in
-- `apps/web/src/lib/blocks/schemas.ts` enforces the JSON shape of the new
-- `content` payload. The DB CHECK below only governs the `type` discriminator
-- column. Server-side payload validation lives in the publish_study RPC
-- (Plan 02-06 / future).
--
-- Threat T-02-05-02 (Tampering): existing rows ('welcome', 'open_question',
-- 'thanks') stay valid under the extended CHECK; verified by inspection of
-- the new IN-list which is a strict superset of the old one.

ALTER TABLE public.blocks
  DROP CONSTRAINT blocks_type_check;

ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_type_check
  CHECK (type IN ('welcome', 'thanks', 'open_question', 'prototype'));

COMMENT ON CONSTRAINT blocks_type_check ON public.blocks IS
  'Phase 2: added prototype. See .planning/phases/02-flagship-prototype-block-heatmap/02-05-PLAN.md.';
