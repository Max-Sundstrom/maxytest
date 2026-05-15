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
 * Discriminated union of all Phase 1 block content shapes.
 * Zod narrows on `type` so `parse({type:'welcome',...})` returns `WelcomeContent`.
 */
export const blockContentSchema = z.discriminatedUnion('type', [
  welcomeContentSchema,
  openQuestionContentSchema,
  thanksContentSchema,
]);

export type WelcomeContent = z.infer<typeof welcomeContentSchema>;
export type OpenQuestionContent = z.infer<typeof openQuestionContentSchema>;
export type ThanksContent = z.infer<typeof thanksContentSchema>;
export type BlockContent = z.infer<typeof blockContentSchema>;
