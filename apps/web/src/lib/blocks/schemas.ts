/**
 * Block content Zod schemas — Phase 1 Walking Skeleton (Plan 01-03 Task 1).
 *
 * Single source of truth for shape + validation of `blocks.content`. Used by:
 *   - react-hook-form `zodResolver` in each block editor (RESEARCH.md Pattern 8)
 *   - server-side validation when Plan 01-04's publish flow checks block content
 *   - future Supabase RPC validation when we add server-side `jsonb` schema check
 *
 * Discriminated on `type` so TypeScript narrows correctly inside switch / map.
 */

import { z } from 'zod';

export const welcomeContentSchema = z.object({
  type: z.literal('welcome'),
  title: z.string().min(1, 'Title is required').max(120, 'Title must be 120 characters or fewer'),
  body: z.string().max(500, 'Body must be 500 characters or fewer'),
  cta_label: z
    .string()
    .min(1, 'CTA label is required')
    .max(40, 'CTA must be 40 characters or fewer'),
});

export const openQuestionContentSchema = z.object({
  type: z.literal('open_question'),
  question: z
    .string()
    .min(1, 'Question is required')
    .max(280, 'Question must be 280 characters or fewer'),
  helper: z.string().max(200, 'Helper must be 200 characters or fewer').optional(),
  min_length: z.number().int().min(0).optional(),
  max_length: z.number().int().max(5000).optional(),
});

export const thanksContentSchema = z.object({
  type: z.literal('thanks'),
  title: z.string().min(1, 'Title is required').max(120, 'Title must be 120 characters or fewer'),
  body: z.string().max(500, 'Body must be 500 characters or fewer'),
});

/**
 * Phase 2 — flagship "prototype" block (BLK-12, PROTO-12..14, CONTEXT.md D-10).
 *
 * `prototype_version_id` references an immutable `prototype_versions` row
 * created by the Figma import flow (Plan 02-03). Until the designer imports,
 * the block is "incomplete" and BlockCard renders an "Import Figma prototype"
 * CTA (the `PROTOTYPE_DEFAULT_PARTIAL` factory in `defaults.ts` is intentionally
 * missing this field — see CONTEXT.md D-10 lines 173-185).
 *
 * `starting_frame_id` is the Figma node id of the frame the runner shows first.
 * `task_instruction` is the "what should the respondent do?" copy (≤280 chars,
 * mirroring `open_question.question` to keep the editor familiar).
 * `success_path` / `finish_frame_ids` are optional analytics annotations the
 * editor will surface in Plan 02-06.
 */
export const prototypeContentSchema = z.object({
  type: z.literal('prototype'),
  prototype_version_id: z.string().uuid('A prototype must be imported first.'),
  starting_frame_id: z.string().min(1, 'Pick a starting frame.'),
  task_instruction: z
    .string()
    .min(1, 'Task instruction is required.')
    .max(280, 'Task instruction must be 280 characters or fewer.'),
  success_path: z.array(z.string()).optional(),
  finish_frame_ids: z.array(z.string()).optional(),
});

// ============================================================================
// Phase 4 / Plan 04-01 — survey-blocks-v1 core set (BLK-04..BLK-08).
// ============================================================================
//
// Five new content schemas (`choice`, `scale`, `nps`, `agreement`, `context`)
// extend the discriminated union below. The exact field shapes are copied
// verbatim from `.planning/phases/04-.../04-RESEARCH.md` §"Pattern 1" so the
// schema is the single source of truth across editors (Plan 04-02), runners
// (Plan 04-02), analytics (Plan 04-03), and CSV export (Plan 04-05).
//
// Each schema corresponds to:
//   - choiceContentSchema    → BLK-04 (single / multi-select)
//   - scaleContentSchema     → BLK-05 (numeric 5/7/10-point scale)
//   - npsContentSchema       → BLK-06 (NPS 0–10)
//   - agreementContentSchema → BLK-07 (legal-text checkbox)
//   - contextContentSchema   → BLK-08 (composite age + experience + role)
//
// CONTEXT.md decisions referenced:
//   D-92 — context sub-questions are fixed canonical (age / experience / role).
//   D-93 — `required` toggle defaults to `false` for all blocks except agreement.
//   D-94 — choice supports `hasOtherOption` + `shuffleOptions` +
//          optional min/max selections (multi-mode only).
//   D-95 — agreement defaults `required: true` (legal consent).

export const choiceContentSchema = z
  .object({
    type: z.literal('choice'),
    question: z
      .string()
      .min(1, 'Введите текст вопроса')
      .max(280, 'Длина вопроса — не более 280 символов'),
    helper: z.string().max(200, 'Подсказка — не более 200 символов').optional(),
    mode: z.enum(['single', 'multi']),
    options: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z
            .string()
            .min(1, 'У варианта должна быть подпись')
            .max(120, 'Подпись варианта — не более 120 символов'),
        }),
      )
      .min(2, 'Добавьте минимум два варианта')
      .max(20, 'Не более 20 вариантов'),
    hasOtherOption: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    min_selections: z.number().int().min(0).optional(),
    max_selections: z.number().int().min(1).optional(),
    required: z.boolean().default(false), // D-93
  })
  .refine((c) => c.mode === 'single' || (c.max_selections ?? Infinity) >= (c.min_selections ?? 0), {
    message: 'Максимальное число выборов должно быть не меньше минимального',
    path: ['max_selections'],
  });

export const scaleContentSchema = z.object({
  type: z.literal('scale'),
  question: z
    .string()
    .min(1, 'Введите текст вопроса')
    .max(280, 'Длина вопроса — не более 280 символов'),
  helper: z.string().max(200).optional(),
  points: z.union([z.literal(5), z.literal(7), z.literal(10)]),
  endpointMinLabel: z.string().max(40).optional(),
  endpointMaxLabel: z.string().max(40).optional(),
  required: z.boolean().default(false),
});

export const npsContentSchema = z.object({
  type: z.literal('nps'),
  question: z
    .string()
    .min(1)
    .max(280, 'Длина вопроса — не более 280 символов')
    .default('Насколько вероятно, что вы порекомендуете нас другу или коллеге?'),
  helper: z.string().max(200).optional(),
  required: z.boolean().default(false),
});

export const agreementContentSchema = z.object({
  type: z.literal('agreement'),
  question: z.string().min(1).max(280).default('Согласие с условиями'),
  legalText: z
    .string()
    .min(1, 'Текст согласия не может быть пустым')
    .max(5000, 'Текст согласия — не более 5000 символов'),
  required: z.boolean().default(true), // D-95 — agreement default REQUIRED
});

export const contextContentSchema = z
  .object({
    type: z.literal('context'),
    title: z.string().min(1).max(120).default('О вас'),
    age_question: z
      .object({
        enabled: z.boolean().default(true),
        options: z.array(z.object({ id: z.string(), label: z.string() })).default([
          { id: '18-24', label: '18–24' },
          { id: '25-34', label: '25–34' },
          { id: '35-44', label: '35–44' },
          { id: '45-54', label: '45–54' },
          { id: '55+', label: '55+' },
          { id: 'prefer_not', label: 'Предпочитаю не отвечать' },
        ]),
      })
      .optional(),
    experience_question: z
      .object({
        enabled: z.boolean().default(true),
        points: z.literal(5).default(5),
        endpointMinLabel: z.string().default('Новичок'),
        endpointMaxLabel: z.string().default('Эксперт'),
      })
      .optional(),
    role_question: z
      .object({
        enabled: z.boolean().default(true),
        placeholder: z.string().default('UX-дизайнер, продакт-менеджер, разработчик…'),
      })
      .optional(),
    required: z.boolean().default(false),
  })
  .refine(
    (c) =>
      (c.age_question?.enabled ?? false) ||
      (c.experience_question?.enabled ?? false) ||
      (c.role_question?.enabled ?? false),
    {
      message: 'Включите хотя бы один подвопрос',
      path: ['age_question'],
    },
  );

/**
 * Discriminated union of all currently-shipping block content shapes.
 * Zod narrows on `type` so `parse({type:'welcome',...})` returns `WelcomeContent`.
 */
export const blockContentSchema = z.discriminatedUnion('type', [
  welcomeContentSchema,
  openQuestionContentSchema,
  thanksContentSchema,
  prototypeContentSchema,
  choiceContentSchema,
  scaleContentSchema,
  npsContentSchema,
  agreementContentSchema,
  contextContentSchema,
]);

export type WelcomeContent = z.infer<typeof welcomeContentSchema>;
export type OpenQuestionContent = z.infer<typeof openQuestionContentSchema>;
export type ThanksContent = z.infer<typeof thanksContentSchema>;
export type PrototypeContent = z.infer<typeof prototypeContentSchema>;
export type ChoiceContent = z.infer<typeof choiceContentSchema>;
export type ScaleContent = z.infer<typeof scaleContentSchema>;
export type NpsContent = z.infer<typeof npsContentSchema>;
export type AgreementContent = z.infer<typeof agreementContentSchema>;
export type ContextContent = z.infer<typeof contextContentSchema>;
export type BlockContent = z.infer<typeof blockContentSchema>;

// ============================================================================
// Phase 4 — answer-shape schemas (Pitfall 5 mitigation, D-94 / D-95).
// ============================================================================
//
// Co-located with content schemas so both runner submit paths and the
// designer-side analytics aggregators import from the SAME source of truth.
// `responses.payload` shape divergence between writer and reader is exactly
// the failure mode RESEARCH.md Pitfall 5 calls out — avoiding it requires
// these schemas to live alongside their content counterparts forever.

export const choiceAnswerSchema = z.object({
  selectedId: z.string().optional(), // single-mode
  selectedIds: z.array(z.string()).optional(), // multi-mode
  otherText: z.string().optional(),
});
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;

export const scaleAnswerSchema = z.object({
  value: z.number().int().min(1).max(10),
});
export type ScaleAnswer = z.infer<typeof scaleAnswerSchema>;

export const npsAnswerSchema = z.object({
  score: z.number().int().min(0).max(10),
});
export type NpsAnswer = z.infer<typeof npsAnswerSchema>;

export const agreementAnswerSchema = z.object({
  agreed: z.literal(true, {
    message: 'Нужно согласие, чтобы продолжить',
  }),
});
export type AgreementAnswer = z.infer<typeof agreementAnswerSchema>;

export const contextAnswerSchema = z.object({
  age: z.string().optional(),
  experience: z.number().int().min(1).max(5).optional(),
  role: z.string().max(120).optional(),
});
export type ContextAnswer = z.infer<typeof contextAnswerSchema>;
