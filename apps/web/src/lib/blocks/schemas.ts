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

/**
 * Discriminated union of all currently-shipping block content shapes.
 * Zod narrows on `type` so `parse({type:'welcome',...})` returns `WelcomeContent`.
 */
export const blockContentSchema = z.discriminatedUnion('type', [
  welcomeContentSchema,
  openQuestionContentSchema,
  thanksContentSchema,
  prototypeContentSchema,
]);

export type WelcomeContent = z.infer<typeof welcomeContentSchema>;
export type OpenQuestionContent = z.infer<typeof openQuestionContentSchema>;
export type ThanksContent = z.infer<typeof thanksContentSchema>;
export type PrototypeContent = z.infer<typeof prototypeContentSchema>;
export type BlockContent = z.infer<typeof blockContentSchema>;
