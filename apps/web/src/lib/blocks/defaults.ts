/**
 * Default block content — Phase 1 Walking Skeleton (Plan 01-03 Task 1).
 *
 * Copy locked to UI-SPEC.md §"Block-type defaults" and CONTEXT.md §"specifics".
 * The `create_study()` RPC in `supabase/migrations/00003_phase1_rpcs.sql`
 * (Task 2) inserts WELCOME_DEFAULT + THANKS_DEFAULT as the seed of every new
 * study. OPEN_QUESTION_DEFAULT is what the catalog panel inserts when the
 * designer picks "Open question".
 */

import type { OpenQuestionContent, ThanksContent, WelcomeContent } from './schemas';

export const WELCOME_DEFAULT: WelcomeContent = {
  type: 'welcome',
  title: 'Help us understand `<product>`',
  body: "Takes about 3 minutes. We'll ask a couple of quick questions.",
  cta_label: 'Start',
};

export const THANKS_DEFAULT: ThanksContent = {
  type: 'thanks',
  title: 'Thank you!',
  body: 'We appreciate you taking the time.',
};

export const OPEN_QUESTION_DEFAULT: OpenQuestionContent = {
  type: 'open_question',
  question: 'What did you find confusing about this design?',
};

/**
 * Phase 2 — prototype default is INTENTIONALLY partial (CONTEXT.md D-10).
 *
 * The designer must import a Figma file before the block can satisfy
 * `prototypeContentSchema` (which requires `prototype_version_id` UUID and
 * a non-empty `starting_frame_id`). Until that happens, `BlockCard` renders
 * an "Import Figma prototype" CTA on top of this partial seed.
 *
 * Not typed as `PrototypeContent` because it intentionally omits the required
 * fields. The catalog-insert call site casts at insertion (the row in the DB
 * still goes through `prototypeContentSchema` once `prototype_version_id` is
 * populated by the import flow).
 */
export const PROTOTYPE_DEFAULT_PARTIAL = {
  type: 'prototype' as const,
  task_instruction: '',
};
