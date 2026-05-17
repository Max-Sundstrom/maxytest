// apps/plugin/src/schemas.ts — Phase 02.2 Plan 06.
//
// INTENTIONALLY DUPLICATED from apps/web/src/lib/blocks/schemas.ts per Phase
// 02.2 D-04b (CONTEXT.md decision). `packages/blocks` workspace extraction is
// deferred to Phase 7. DO NOT "fix" this duplication — it is an accepted
// constraint that avoids 2-3 hours of workspace-extraction overhead for v1.
//
// ESLint cross-app-import rule (apps/plugin/eslint.config.js) enforces that
// this file does NOT import from `apps/web/*`. If you find yourself wanting to
// `import { prototypeContentSchema } from '@apps/web/...'` — DON'T. Update the
// duplicated copy below to match the apps/web source and add a `// SYNC: ...`
// comment on the diverging line so the next packages/blocks-extraction pass
// can find the diff cheaply.
//
// See: 02.2-CONTEXT.md D-04b, 02.2-PATTERNS.md §14, deferred list at the
// bottom of CONTEXT.md.

import { z } from 'zod';

/* -------------------------------------------------------------------------- *
 * Duplicated from apps/web/src/lib/blocks/schemas.ts lines 56-66
 * (prototypeContentSchema). Must stay byte-identical in shape; copy is
 * minimal because the plugin only validates this on the round-trip from the
 * RPC response when Plan 08 wires PrototypeEditor's post-publish autosave.
 * -------------------------------------------------------------------------- */
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

export type PrototypeContent = z.infer<typeof prototypeContentSchema>;

/* -------------------------------------------------------------------------- *
 * NEW for Plan 06 — publish_prototype_from_plugin RPC payload contract.
 *
 * Source of truth lives in:
 *   - .planning/phases/02.2-figma-plugin-primary-import-path/02.2-RESEARCH.md
 *     §"Payload contract" (TS interface)
 *   - supabase/migrations/00013_phase02_2_plugin_rpc.sql (jsonb columns
 *     consumed inside publish_prototype_from_plugin)
 *
 * The schema is the LAST guardrail before the RPC call (Plan 07). When the
 * plugin sandbox hands a payload to the UI, `publishPayloadSchema.parse(...)`
 * runs first; if it throws, the user gets a Zod error message instead of a
 * cryptic Postgres "invalid input syntax for type uuid" rejection 200 ms later.
 *
 * `hotspots[*].frame_node_id` is the Figma node id of the OWNING frame. The
 * RPC uses this string to resolve `frames.id` (UUID) via a map built right
 * after the `frames` INSERT — see 00013 migration step 7. The plugin does
 * NOT have access to the UUID until after the RPC returns.
 *
 * `figma_node_tree` defaults to `{}` in v1 (RESEARCH Open Question 1) — the
 * plugin does not yet serialize the full document tree; this slot is reserved
 * so a future plugin version can populate it without a migration. Server-side
 * the column is jsonb NOT NULL with DEFAULT '{}'::jsonb, so an empty object
 * round-trips cleanly.
 * -------------------------------------------------------------------------- */
export const publishPayloadSchema = z.object({
  study_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  prototype_version_id: z.string().uuid(),
  file_key: z.string().min(1),
  file_name: z.string(),
  starting_frame_id: z.string().optional(),
  // jsonb on the server; the plugin v1 sends `{}`. We accept any JSON-shaped
  // value at the schema layer to leave room for the Phase 7 enrichment pass.
  figma_node_tree: z.unknown(),
  frames: z
    .array(
      z.object({
        frame_id: z.string(),
        name: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        render_path_1x: z.string(),
        render_path_2x: z.string(),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'frames must contain at least 1'),
  hotspots: z.array(
    z.object({
      frame_node_id: z.string(),
      hotspot_id: z.string(),
      target_frame_id: z.string().nullable(),
      transition_kind: z.enum(['slide', 'push', 'smart_animate', 'dissolve']),
      bbox_x: z.number(),
      bbox_y: z.number(),
      bbox_w: z.number(),
      bbox_h: z.number(),
      z_index: z.number().int(),
      source_layer: z.string().nullable(),
      figma_raw: z.array(z.unknown()),
    }),
  ),
  warnings: z
    .array(
      z.object({
        code: z.string(),
        frame_id: z.string().optional(),
        bytes: z.number().optional(),
      }),
    )
    .optional(),
});

export type PluginPublishPayload = z.infer<typeof publishPayloadSchema>;
