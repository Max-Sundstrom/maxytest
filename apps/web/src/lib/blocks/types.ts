/**
 * Block domain types — Phase 1 Walking Skeleton (Plan 01-03 Task 1).
 *
 * `BlockType` enumerates the FULL v1 block surface so the catalog panel can
 * render disabled rows for blocks shipping in later phases. The runtime DB
 * CHECK constraint on `public.blocks.type` only permits the Phase 1 subset
 * (welcome | thanks | open_question); the wider union here is purely a
 * client-side registry for the catalog.
 *
 * `Block` is the row shape that flows from Supabase (`select * from blocks`)
 * with `content` typed as the discriminated union from `./schemas.ts`.
 */

import type { BlockContent } from './schemas';

/** All v1 block types — Phase 1 ships only welcome / thanks / open_question. */
export type BlockType =
  | 'welcome'
  | 'open_question'
  | 'thanks'
  | 'choice'
  | 'scale'
  | 'nps'
  | 'agreement'
  | 'context'
  | 'matrix'
  | 'ranking'
  | 'umux_lite'
  | 'prototype'
  | 'five_second'
  | 'first_click'
  | 'preference'
  | 'card_sort'
  | 'tree_test';

/**
 * The four block types currently *implemented* in Phase 1.
 * (welcome / thanks always present; open_question added via catalog.)
 */
export type Phase1BlockType = 'welcome' | 'open_question' | 'thanks';

/**
 * Phase 2: extended to include the prototype block (BLK-12).
 *
 * The DB CHECK constraint on `public.blocks.type` is widened in tandem by
 * `supabase/migrations/00008_phase2_blocks_prototype_type.sql`. Phase1BlockType
 * is preserved as a historical reference but the `Block.type` field below
 * points at `Phase4BlockType` so downstream call sites narrow correctly.
 *
 * RESEARCH.md Pitfall 12 — DB and TS move together; widening the TS alias
 * without widening the CHECK constraint (or vice versa) would create a
 * runtime / compile-time skew that the publish flow eventually hits.
 */
export type Phase2BlockType = Phase1BlockType | 'prototype';

/**
 * Phase 4: extended to include the 5 core survey-blocks-v1 types
 * (BLK-04..BLK-08): `choice`, `scale`, `nps`, `agreement`, `context`.
 *
 * The DB CHECK constraint on `public.blocks.type` is widened in tandem by
 * `supabase/migrations/00016_phase4_blocks_type_check.sql`. Phase 2 / Phase 1
 * ladder types are preserved as historical references for narrowing
 * readability (e.g. `block.type === 'welcome'` still satisfies
 * `Phase1BlockType`).
 *
 * Plan 04-01 Task 2 — see
 * `.planning/phases/04-survey-blocks-v1-survey-analytics-reports-public-sharing/04-01-PLAN.md`.
 */
export type Phase4BlockType =
  | Phase2BlockType
  | 'choice'
  | 'scale'
  | 'nps'
  | 'agreement'
  | 'context';

export interface Block {
  id: string;
  study_id: string;
  position: number;
  type: Phase4BlockType;
  /** welcome/thanks have pinned=true → cannot be moved or deleted (D-11). */
  pinned: boolean;
  /** Discriminated by `type`; validated via `blockContentSchema`. */
  content: BlockContent;
  /** D-13 optimistic-concurrency version. */
  version: number;
  created_at: string;
  updated_at: string;
}
