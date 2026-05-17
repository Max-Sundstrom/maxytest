// apps/plugin/src/__tests__/flow-detection.test.ts — Phase 02.2 Plan 06 (TDD).
//
// Validates detectStartingFrames() — the pure function that produces the
// list of candidate flow starts the plugin UI offers to the designer. The
// 4-level cascade is the load-bearing UX choice from CONTEXT D-05 (matches
// easytest's well-validated fallback chain): we want the plugin to "just
// work" against any reasonable Figma file, escalating from authoritative
// Figma metadata down to a frame-grab-of-last-resort.
//
// Cascade order — once a level fires, lower levels are skipped:
//   1. flow-starting-point — PageNode.flowStartingPoints from Figma API.
//   2. name-marker         — top-level frame name matches /\[(start|begin)\]/i.
//   3. graph-root          — top-level frame with zero incoming reactions
//                             and at least one outgoing reaction.
//   4. first-frame-fallback — any top-level frame (last resort).
//
// detectStartingFrames is PURE — accepts plain-data FlowDetectionInput,
// returns FlowStart[]. No `figma.*` global. Plan 07 serializes the
// document tree into this shape inside the sandbox and passes the fixture
// in; tests drive it with hand-rolled fixtures.

import { describe, expect, it } from 'vitest';
import { detectStartingFrames, type FlowDetectionInput } from '../lib/flow-detection';

/** Test helper — build a FlowDetectionInput from a compact spec. */
function makeInput(pages: FlowDetectionInput['pages']): FlowDetectionInput {
  return { pages };
}

describe('detectStartingFrames — 4-level cascade', () => {
  it('Test 1 (level 1 single): returns flowStartingPoints from a single page', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [{ nodeId: '1:1', name: 'Home' }],
        topLevelFrames: [{ id: '1:1', name: 'Home', reactions: [] }],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toEqual([
      {
        pageId: 'p1',
        pageName: 'Page 1',
        nodeId: '1:1',
        nodeName: 'Home',
        source: 'flow-starting-point',
      },
    ]);
  });

  it('Test 2 (level 1 multi-page): returns all flowStartingPoints from all pages in input order', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [{ nodeId: '1:1', name: 'Onboarding' }],
        topLevelFrames: [{ id: '1:1', name: 'Onboarding', reactions: [] }],
      },
      {
        id: 'p2',
        name: 'Page 2',
        flowStartingPoints: [{ nodeId: '2:1', name: 'Settings' }],
        topLevelFrames: [{ id: '2:1', name: 'Settings', reactions: [] }],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.pageId).toBe('p1');
    expect(result[0]?.nodeId).toBe('1:1');
    expect(result[1]?.pageId).toBe('p2');
    expect(result[1]?.nodeId).toBe('2:1');
    expect(result.every((r) => r.source === 'flow-starting-point')).toBe(true);
  });

  it('Test 3 (level 2): no flowStartingPoints — finds frame with [start] marker', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [],
        topLevelFrames: [
          { id: '1:1', name: 'Regular frame', reactions: [] },
          { id: '1:2', name: '[start] Onboarding', reactions: [] },
        ],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('name-marker');
    expect(result[0]?.nodeId).toBe('1:2');
    expect(result[0]?.nodeName).toBe('[start] Onboarding');
  });

  it('Test 4 (level 2 case-insensitive): recognizes [Begin] / [START] / [Start] / [begin]', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [],
        topLevelFrames: [
          { id: '1:1', name: '[Begin] one', reactions: [] },
          { id: '1:2', name: '[START] two', reactions: [] },
          { id: '1:3', name: '[Start] three', reactions: [] },
          { id: '1:4', name: '[begin] four', reactions: [] },
          { id: '1:5', name: 'no marker', reactions: [] },
        ],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toHaveLength(4);
    expect(result.every((r) => r.source === 'name-marker')).toBe(true);
    expect(result.map((r) => r.nodeId)).toEqual(['1:1', '1:2', '1:3', '1:4']);
  });

  it('Test 5 (level 3): no flow-points, no markers — graph-root with outgoing wins; orphan with no outgoing does not', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [],
        topLevelFrames: [
          // 1:1 has outgoing → 1:2 — it's a graph root (no one points at it).
          { id: '1:1', name: 'A', reactions: [{ action: { destinationId: '1:2' } }] },
          // 1:2 is targeted by 1:1 — NOT a graph root.
          { id: '1:2', name: 'B', reactions: [] },
          // 1:3 has neither incoming nor outgoing — NOT picked as graph-root
          //  because the heuristic requires at least one outgoing reaction.
          { id: '1:3', name: 'Orphan', reactions: [] },
        ],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('graph-root');
    expect(result[0]?.nodeId).toBe('1:1');
  });

  it('Test 6 (level 4 fallback): no flow-points, no markers, no graph — first top-level frame wins', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [],
        topLevelFrames: [
          { id: '1:1', name: 'A', reactions: [] },
          { id: '1:2', name: 'B', reactions: [] },
        ],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('first-frame-fallback');
    expect(result[0]?.nodeId).toBe('1:1');
  });

  it('Test 7 (empty file): no pages → returns []', () => {
    const result = detectStartingFrames(makeInput([]));
    expect(result).toEqual([]);
  });

  it('Test 8 (level 1 multiple per page): returns ALL flow-starting-points, not just the first', () => {
    const input = makeInput([
      {
        id: 'p1',
        name: 'Page 1',
        flowStartingPoints: [
          { nodeId: '1:1', name: 'Flow A' },
          { nodeId: '1:2', name: 'Flow B' },
        ],
        topLevelFrames: [
          { id: '1:1', name: 'Flow A', reactions: [] },
          { id: '1:2', name: 'Flow B', reactions: [] },
        ],
      },
    ]);
    const result = detectStartingFrames(input);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.nodeId)).toEqual(['1:1', '1:2']);
    expect(result.every((r) => r.source === 'flow-starting-point')).toBe(true);
  });
});
