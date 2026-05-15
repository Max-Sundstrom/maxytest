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
