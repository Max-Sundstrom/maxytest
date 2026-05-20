/**
 * Default block content — Phase 1 Walking Skeleton (Plan 01-03 Task 1).
 *
 * Copy locked to UI-SPEC.md §"Block-type defaults" and CONTEXT.md §"specifics".
 * The `create_study()` RPC in `supabase/migrations/00003_phase1_rpcs.sql`
 * (Task 2) inserts WELCOME_DEFAULT + THANKS_DEFAULT as the seed of every new
 * study. OPEN_QUESTION_DEFAULT is what the catalog panel inserts when the
 * designer picks "Open question".
 */

import type {
  AgreementContent,
  ChoiceContent,
  ContextContent,
  NpsContent,
  OpenQuestionContent,
  ScaleContent,
  ThanksContent,
  WelcomeContent,
} from './schemas';

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

// ============================================================================
// Phase 4 / Plan 04-01 — survey-blocks-v1 core defaults (BLK-04..BLK-08).
// ============================================================================
//
// Each default is a "designer just clicked the catalog row" empty-state.
// Copy is in Russian per D-92 and `CLAUDE.md` "Общение с пользователем"
// guidance. Each factory MUST round-trip through its content schema
// (covered by `schemas.test.ts` Phase 4 defaults round-trip block).

export const CHOICE_DEFAULT: ChoiceContent = {
  type: 'choice',
  question: 'Какой вариант вам ближе?',
  mode: 'single',
  options: [
    { id: 'opt-1', label: 'Вариант 1' },
    { id: 'opt-2', label: 'Вариант 2' },
    { id: 'opt-3', label: 'Вариант 3' },
  ],
  hasOtherOption: false,
  shuffleOptions: false,
  required: false,
};

export const SCALE_DEFAULT: ScaleContent = {
  type: 'scale',
  question: 'Оцените от 1 до 5',
  points: 5,
  endpointMinLabel: 'Совсем нет',
  endpointMaxLabel: 'Полностью да',
  required: false,
};

export const NPS_DEFAULT: NpsContent = {
  type: 'nps',
  question: 'Насколько вероятно, что вы порекомендуете нас другу или коллеге?',
  required: false,
};

export const AGREEMENT_DEFAULT: AgreementContent = {
  type: 'agreement',
  question: 'Согласие с условиями',
  legalText:
    'Я согласен(-на) с тем, что мои ответы будут использованы в исследовательских целях. ' +
    'Ответы анонимны и не будут переданы третьим лицам.',
  required: true, // D-95
};

export const CONTEXT_DEFAULT: ContextContent = {
  type: 'context',
  title: 'О вас',
  age_question: {
    enabled: true,
    options: [
      { id: '18-24', label: '18–24' },
      { id: '25-34', label: '25–34' },
      { id: '35-44', label: '35–44' },
      { id: '45-54', label: '45–54' },
      { id: '55+', label: '55+' },
      { id: 'prefer_not', label: 'Предпочитаю не отвечать' },
    ],
  },
  experience_question: {
    enabled: true,
    points: 5,
    endpointMinLabel: 'Новичок',
    endpointMaxLabel: 'Эксперт',
  },
  role_question: {
    enabled: true,
    placeholder: 'UX-дизайнер, продакт-менеджер, разработчик…',
  },
  required: false,
};
