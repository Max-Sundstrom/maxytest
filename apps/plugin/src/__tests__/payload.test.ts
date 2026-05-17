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
import {
  shapePayload,
  type CollectedFrame,
  type CollectedHotspot,
  type ShapePayloadInput,
} from '../lib/payload';

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

/* -------------------------------------------------------------------------- *
 * shapePayload tests — added by Task 6.
 *
 * shapePayload is the assembler between the sandbox's collected data
 * (CollectedFrame[] + CollectedHotspot[]) and the RPC-ready
 * PluginPublishPayload. It composes Storage paths, runs the Zod schema as
 * a final guardrail, and returns a validated payload.
 * -------------------------------------------------------------------------- */

const FRAME_HASH_1X = 'aaaaaaaaaaaa1111';
const FRAME_HASH_2X = 'bbbbbbbbbbbb2222';

function minimalCollectedFrame(): CollectedFrame {
  return {
    figmaNodeId: '1:23',
    name: 'Home',
    width: 375,
    height: 812,
    hash1x: FRAME_HASH_1X,
    hash2x: FRAME_HASH_2X,
    position: 0,
  };
}

function minimalCollectedHotspot(): CollectedHotspot {
  return {
    frameNodeId: '1:23',
    hotspotId: '1:24',
    targetFrameId: '1:25',
    transitionKind: 'slide',
    bbox: { x: 10, y: 20, w: 100, h: 50 },
    zIndex: 0,
    sourceLayer: 'Button',
    figmaRaw: [],
  };
}

function minimalShapeInput(): ShapePayloadInput {
  return {
    studyId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
    prototypeVersionId: '00000000-0000-4000-8000-000000000003',
    fileKey: 'AnPMpM9Locu4TGVZjK0emK',
    fileName: 'Onboarding flow',
    frames: [minimalCollectedFrame()],
    hotspots: [minimalCollectedHotspot()],
  };
}

describe('shapePayload', () => {
  it('Test 6: minimal valid input round-trips through publishPayloadSchema', () => {
    const payload = shapePayload(minimalShapeInput());
    // shapePayload returns a payload that has ALREADY been parsed by the
    // schema (parse is the last step). Re-parsing is a no-op but proves
    // shape compatibility from the public surface.
    expect(() => publishPayloadSchema.parse(payload)).not.toThrow();
    expect(payload.frames).toHaveLength(1);
    expect(payload.hotspots).toHaveLength(1);
  });

  it('Test 7: empty hotspots array remains empty (no synthetic entries)', () => {
    const input = { ...minimalShapeInput(), hotspots: [] };
    const payload = shapePayload(input);
    expect(payload.hotspots).toEqual([]);
  });

  it('Test 8: hotspot with target_frame_id=null preserved (PROTO-07 misclick semantics)', () => {
    const input = {
      ...minimalShapeInput(),
      hotspots: [{ ...minimalCollectedHotspot(), targetFrameId: null }],
    };
    const payload = shapePayload(input);
    expect(payload.hotspots[0]?.target_frame_id).toBeNull();
  });

  it('Test 9: multiple frames preserve input order via position field', () => {
    const frames: CollectedFrame[] = [
      { ...minimalCollectedFrame(), figmaNodeId: '1:1', name: 'A', position: 0 },
      { ...minimalCollectedFrame(), figmaNodeId: '1:2', name: 'B', position: 1 },
      { ...minimalCollectedFrame(), figmaNodeId: '1:3', name: 'C', position: 2 },
    ];
    const payload = shapePayload({ ...minimalShapeInput(), frames, hotspots: [] });
    expect(payload.frames.map((f) => f.frame_id)).toEqual(['1:1', '1:2', '1:3']);
    expect(payload.frames.map((f) => f.position)).toEqual([0, 1, 2]);
  });

  it('Test 10: figma_node_tree defaults to {} when not provided (v1 — RESEARCH OQ1)', () => {
    const payload = shapePayload(minimalShapeInput());
    expect(payload.figma_node_tree).toEqual({});
  });

  it('Test 11: Storage paths composed as {ws}/{pv}/{frame_id}-{hash}@{1,2}x.png', () => {
    const payload = shapePayload(minimalShapeInput());
    const f = payload.frames[0]!;
    expect(f.render_path_1x).toBe(
      '00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003/1:23-aaaaaaaaaaaa1111@1x.png',
    );
    expect(f.render_path_2x).toBe(
      '00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003/1:23-bbbbbbbbbbbb2222@2x.png',
    );
  });

  it('Test 12: invalid workspace_id (non-UUID) throws via the internal schema gate', () => {
    const bad = { ...minimalShapeInput(), workspaceId: 'not-a-uuid' };
    expect(() => shapePayload(bad)).toThrow();
  });

  it('Test 13 (extra): starting_frame_id omitted unless provided', () => {
    const without = shapePayload(minimalShapeInput());
    expect(without.starting_frame_id).toBeUndefined();
    const withStart = shapePayload({ ...minimalShapeInput(), startingFrameId: '1:1' });
    expect(withStart.starting_frame_id).toBe('1:1');
  });

  it('Test 14 (extra): warnings omitted when input.warnings is empty or undefined', () => {
    const noWarn = shapePayload(minimalShapeInput());
    expect(noWarn.warnings).toBeUndefined();
    const emptyWarn = shapePayload({ ...minimalShapeInput(), warnings: [] });
    expect(emptyWarn.warnings).toBeUndefined();
    const withWarn = shapePayload({
      ...minimalShapeInput(),
      warnings: [{ code: 'png_1x_oversize', frame_id: '1:23', bytes: 9_000_000 }],
    });
    expect(withWarn.warnings).toHaveLength(1);
    expect(withWarn.warnings?.[0]?.code).toBe('png_1x_oversize');
  });

  it('Test 15 (extra): hotspot bbox decomposed into bbox_x/y/w/h numeric fields', () => {
    const payload = shapePayload(minimalShapeInput());
    const h = payload.hotspots[0]!;
    expect(h.bbox_x).toBe(10);
    expect(h.bbox_y).toBe(20);
    expect(h.bbox_w).toBe(100);
    expect(h.bbox_h).toBe(50);
  });

  it('Test 16 (extra): all four transition_kind enum values pass the schema', () => {
    const kinds: Array<'slide' | 'push' | 'smart_animate' | 'dissolve'> = [
      'slide',
      'push',
      'smart_animate',
      'dissolve',
    ];
    for (const k of kinds) {
      const payload = shapePayload({
        ...minimalShapeInput(),
        hotspots: [{ ...minimalCollectedHotspot(), transitionKind: k }],
      });
      expect(payload.hotspots[0]?.transition_kind).toBe(k);
    }
  });
});
