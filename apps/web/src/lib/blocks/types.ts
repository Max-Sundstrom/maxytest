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

export interface Block {
  id: string;
  study_id: string;
  position: number;
  type: Phase1BlockType;
  /** welcome/thanks have pinned=true → cannot be moved or deleted (D-11). */
  pinned: boolean;
  /** Discriminated by `type`; validated via `blockContentSchema`. */
  content: BlockContent;
  /** D-13 optimistic-concurrency version. */
  version: number;
  created_at: string;
  updated_at: string;
}
