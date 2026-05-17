// apps/plugin/src/__tests__/payload.test.ts — Phase 02.2 Plan 06 (TDD).
//
// Validates publishPayloadSchema (Zod) — the source-of-truth for the
// jsonb body sent to `publish_prototype_from_plugin` RPC. The Zod
// schema MUST stay in lockstep with the RPC SQL (migration 00013) —
// any drift surfaces at parse-time client-side, never at the DB.
//
// shapePayload tests (Task 6) are appended to the bottom of this file
// once Task 6 ships its source module.

import { describe, expect, it } from 'vitest';
import { publishPayloadSchema, type PluginPublishPayload } from '../schemas';

const VALID_UUID_1 = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002';
const VALID_UUID_3 = '00000000-0000-4000-8000-000000000003';

function minimalValid(): PluginPublishPayload {
  return {
    study_id: VALID_UUID_1,
    workspace_id: VALID_UUID_2,
    prototype_version_id: VALID_UUID_3,
    file_key: 'AnPMpM9Locu4TGVZjK0emK',
    file_name: 'Onboarding flow',
    figma_node_tree: {},
    frames: [
      {
        frame_id: '1:23',
        name: 'Home',
        width: 375,
        height: 812,
        render_path_1x: `${VALID_UUID_2}/${VALID_UUID_3}/1:23-deadbeefcafe1234@1x.png`,
        render_path_2x: `${VALID_UUID_2}/${VALID_UUID_3}/1:23-deadbeefcafe1234@2x.png`,
        position: 0,
      },
    ],
    hotspots: [],
  };
}

describe('publishPayloadSchema', () => {
  it('Test 1: parses a minimal valid payload without throwing', () => {
    const result = publishPayloadSchema.parse(minimalValid());
    expect(result.study_id).toBe(VALID_UUID_1);
    expect(result.frames).toHaveLength(1);
    expect(result.hotspots).toEqual([]);
  });

  it('Test 2: throws ZodError when study_id is not a UUID', () => {
    const bad = { ...minimalValid(), study_id: 'not-a-uuid' };
    try {
      publishPayloadSchema.parse(bad);
      throw new Error('expected parse to throw');
    } catch (e) {
      // Zod's error message for `.uuid()` contains the string 'uuid' (case-insensitive).
      const msg = (e as Error).message.toLowerCase();
      expect(msg).toContain('uuid');
    }
  });

  it('Test 3: throws when frames is empty (min(1))', () => {
    const bad = { ...minimalValid(), frames: [] };
    try {
      publishPayloadSchema.parse(bad);
      throw new Error('expected parse to throw');
    } catch (e) {
      const msg = (e as Error).message;
      // Zod 4 reports either our custom message or its built-in "Too small" message.
      // Accept either — both prove the min(1) constraint fired.
      expect(
        msg.includes('frames must contain at least 1') ||
          msg.toLowerCase().includes('too small') ||
          msg.toLowerCase().includes('at least'),
      ).toBe(true);
    }
  });

  it('Test 4: throws when a hotspot has an invalid transition_kind enum', () => {
    const bad = {
      ...minimalValid(),
      hotspots: [
        {
          frame_node_id: '1:23',
          hotspot_id: '1:24',
          target_frame_id: null,
          transition_kind: 'fade', // INVALID — not in enum
          bbox_x: 0,
          bbox_y: 0,
          bbox_w: 1,
          bbox_h: 1,
          z_index: 0,
          source_layer: null,
          figma_raw: [],
        },
      ],
    };
    expect(() => publishPayloadSchema.parse(bad)).toThrow();
  });

  it('Test 5: PluginPublishPayload TS-type aligns with z.infer (compile-time)', () => {
    // Pure type-assertion test — if `PluginPublishPayload` is NOT structurally
    // identical to z.infer<typeof publishPayloadSchema>, this assignment fails
    // typecheck and `pnpm --filter @maxytest/plugin typecheck` errors out.
    const parsed = publishPayloadSchema.parse(minimalValid());
    const _typed: PluginPublishPayload = parsed;
    expect(_typed).toBeDefined();
  });
});
