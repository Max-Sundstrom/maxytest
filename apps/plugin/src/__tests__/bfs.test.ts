// apps/plugin/src/__tests__/bfs.test.ts — Phase 02.2 Plan 06 (TDD).
//
// Validates walkReachable() — the breadth-first reactions walker that
// returns the set of frame IDs reachable from a starting frame via
// navigation actions. Implements CONTEXT D-05a:
//   - Includes NAVIGATE / OPEN_OVERLAY / SWAP_OVERLAY actions.
//   - Excludes CLOSE_OVERLAY and other non-navigation action types.
//   - Visited-set prevents infinite loops on cycles (the load-bearing
//     fix vs easytest, whose walker can spin forever on SWAP_OVERLAY
//     cycles — PATTERNS §9 "Explicit NOT-copy").
//   - visitedCap is a defense-in-depth bound against pathological graphs.
//
// The function takes a `getNode` callback rather than a full graph map
// because Plan 07 wires it to `figma.getNodeById(id) as FrameNode | null`
// inside the sandbox — that API is the cheapest way to resolve a node
// from its id without holding the entire document tree in memory.

import { describe, expect, it } from 'vitest';
import {
  collectSubtreeNavReactions,
  walkReachable,
  type BfsNode,
  type ReactionsTreeNode,
} from '../lib/bfs';

/** Test helper — build a Map-based getNode callback from an array of node specs. */
function graph(nodes: BfsNode[]): (id: string) => BfsNode | undefined {
  const map = new Map(nodes.map((n) => [n.id, n]));
  return (id) => map.get(id);
}

/** Test helper — build a single reaction shaped like Figma's. */
function react(actionType: string, destinationId: string | null) {
  return { action: { type: actionType, destinationId } };
}

describe('walkReachable — reactions BFS with visited-set', () => {
  it('Test 1 (linear chain): A → B → C → D yields [A, B, C, D]', () => {
    const getNode = graph([
      { id: 'A', reactions: [react('NAVIGATE', 'B')] },
      { id: 'B', reactions: [react('NAVIGATE', 'C')] },
      { id: 'C', reactions: [react('NAVIGATE', 'D')] },
      { id: 'D', reactions: [] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('Test 2 (cycle): A → B → A → C terminates and yields [A, B, C]', () => {
    const getNode = graph([
      { id: 'A', reactions: [react('NAVIGATE', 'B')] },
      // B navigates back to A (cycle) AND forward to C — visited set must
      // ignore the A revisit but still expand into C from B's queue entry.
      { id: 'B', reactions: [react('NAVIGATE', 'A'), react('NAVIGATE', 'C')] },
      { id: 'C', reactions: [] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A', 'B', 'C']);
  });

  it('Test 3 (branch): A→B, A→C, B→D yields BFS order [A, B, C, D]', () => {
    const getNode = graph([
      { id: 'A', reactions: [react('NAVIGATE', 'B'), react('NAVIGATE', 'C')] },
      { id: 'B', reactions: [react('NAVIGATE', 'D')] },
      { id: 'C', reactions: [] },
      { id: 'D', reactions: [] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('Test 4 (OPEN_OVERLAY): A —OPEN_OVERLAY→ B includes B', () => {
    const getNode = graph([
      { id: 'A', reactions: [react('OPEN_OVERLAY', 'B')] },
      { id: 'B', reactions: [] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A', 'B']);
  });

  it('Test 5 (SWAP_OVERLAY): A —SWAP_OVERLAY→ B includes B', () => {
    const getNode = graph([
      { id: 'A', reactions: [react('SWAP_OVERLAY', 'B')] },
      { id: 'B', reactions: [] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A', 'B']);
  });

  it('Test 6 (NAVIGATE standard): A —NAVIGATE→ B includes B', () => {
    const getNode = graph([
      { id: 'A', reactions: [react('NAVIGATE', 'B')] },
      { id: 'B', reactions: [] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A', 'B']);
  });

  it('Test 7 (CLOSE_OVERLAY no destinationId): not a navigation — returns [A]', () => {
    const getNode = graph([
      { id: 'A', reactions: [{ action: { type: 'CLOSE_OVERLAY', destinationId: null } }] },
    ]);
    expect(walkReachable('A', getNode)).toEqual(['A']);
  });

  it('Test 8 (real-world bug fix): start frame has no own reactions, buttons inside do', () => {
    // The Smart-email UAT bug (2026-05-17 KI-02): a top-level frame carries
    // ZERO reactions of its own; its three button descendants each carry one
    // NAVIGATE reaction. Before the fix, the graph map had:
    //   frame   → BfsNode { reactions: [] }
    //   button1 → BfsNode { reactions: [NAVIGATE → target1] }
    //   button2 → BfsNode { reactions: [NAVIGATE → target2] }
    //   button3 → BfsNode { reactions: [NAVIGATE → target1] }
    // BFS from `frame` saw an empty reaction list and stopped immediately —
    // only 1 frame imported, button targets never followed.
    //
    // After the fix, the sandbox uses `collectSubtreeNavReactions` to build
    // the map so the frame's BfsNode carries the AGGREGATED reactions of its
    // subtree. This test runs the BFS against the post-fix map shape to
    // prove walkReachable now discovers the destinations.
    const getNode = graph([
      {
        id: 'frame',
        reactions: [
          react('NAVIGATE', 'target1'),
          react('NAVIGATE', 'target2'),
          react('NAVIGATE', 'target1'), // 3rd button — same target as 1st (dedup happens via visited-set)
        ],
      },
      { id: 'target1', reactions: [] },
      { id: 'target2', reactions: [] },
    ]);
    expect(walkReachable('frame', getNode)).toEqual(['frame', 'target1', 'target2']);
  });

  it('Test 9 (max-iterations cap): 10000-node chain with cap=100 returns at most 100 IDs', () => {
    // Build a 10000-node linear chain — A_0 → A_1 → A_2 → … → A_9999.
    const N = 10000;
    const nodes: BfsNode[] = [];
    for (let i = 0; i < N; i++) {
      const next = i + 1 < N ? `A_${i + 1}` : null;
      nodes.push({
        id: `A_${i}`,
        reactions: next ? [react('NAVIGATE', next)] : [],
      });
    }
    const getNode = graph(nodes);
    const result = walkReachable('A_0', getNode, /* visitedCap */ 100);
    expect(result.length).toBeLessThanOrEqual(100);
    // First 100 from the chain — confirms we expanded BFS, not bailed early.
    expect(result[0]).toBe('A_0');
    expect(result[99]).toBe('A_99');
  });
});

describe('collectSubtreeNavReactions — frame-subtree reaction aggregator', () => {
  // The post-fix contract for sandbox-collect.ts.`collectReactionsGraph`:
  // each top-level frame in the resulting graph map must carry the UNION of
  // navigation reactions found anywhere in its subtree. This describe-block
  // tests the pure helper that performs that union.

  /** Helper — build a tree node with optional children + reactions. */
  function node(
    id: string,
    reactions: ReactionsTreeNode['reactions'] = [],
    children: ReactionsTreeNode[] = [],
  ): ReactionsTreeNode {
    return { id, reactions, children };
  }

  it('Test A — frame with no own reactions but 3 buttons → 3 nav reactions', () => {
    // The Smart-email shape: frame `403:407962` itself has zero reactions;
    // its three button descendants (`403:407996`, `403:407999`, `403:408000`)
    // each NAVIGATE to a destination frame. Aggregator must surface all three.
    const tree = node(
      'frame',
      [],
      [
        node('btn-cancel', [{ action: { type: 'NAVIGATE', destinationId: 'target-A' } }]),
        node('btn-save', [{ action: { type: 'NAVIGATE', destinationId: 'target-B' } }]),
        node('btn-done', [{ action: { type: 'NAVIGATE', destinationId: 'target-A' } }]),
      ],
    );
    const aggregated = collectSubtreeNavReactions(tree);
    expect(aggregated).toHaveLength(3);
    const dests = aggregated.map((r) => r.action?.destinationId);
    expect(dests).toEqual(['target-A', 'target-B', 'target-A']);
  });

  it('Test B — frame with own reaction AND descendant reactions: both included', () => {
    // Rare but legal: the frame has a full-frame click reaction AND its
    // buttons have their own — should produce all of them.
    const tree = node(
      'frame',
      [{ action: { type: 'NAVIGATE', destinationId: 'whole-frame-target' } }],
      [node('btn', [{ action: { type: 'NAVIGATE', destinationId: 'btn-target' } }])],
    );
    const aggregated = collectSubtreeNavReactions(tree);
    expect(aggregated.map((r) => r.action?.destinationId)).toEqual([
      'whole-frame-target',
      'btn-target',
    ]);
  });

  it('Test C — deeply nested: frame > section > card > button still finds the reaction', () => {
    const tree = node(
      'frame',
      [],
      [
        node(
          'section',
          [],
          [
            node(
              'card',
              [],
              [node('btn', [{ action: { type: 'NAVIGATE', destinationId: 'deep-target' } }])],
            ),
          ],
        ),
      ],
    );
    const aggregated = collectSubtreeNavReactions(tree);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]!.action?.destinationId).toBe('deep-target');
  });

  it('Test D — non-navigation reactions (CLOSE_OVERLAY, SCROLL_TO) are filtered out', () => {
    const tree = node(
      'frame',
      [],
      [
        node('btn-back', [{ action: { type: 'CLOSE_OVERLAY', destinationId: null } }]),
        node('btn-scroll', [{ action: { type: 'SCROLL_TO', destinationId: 'anchor' } }]),
        node('btn-navigate', [{ action: { type: 'NAVIGATE', destinationId: 'target' } }]),
      ],
    );
    const aggregated = collectSubtreeNavReactions(tree);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]!.action?.type).toBe('NAVIGATE');
    expect(aggregated[0]!.action?.destinationId).toBe('target');
  });

  it('Test E — OPEN_OVERLAY and SWAP_OVERLAY are kept', () => {
    const tree = node(
      'frame',
      [],
      [
        node('btn-open', [{ action: { type: 'OPEN_OVERLAY', destinationId: 'overlay-A' } }]),
        node('btn-swap', [{ action: { type: 'SWAP_OVERLAY', destinationId: 'overlay-B' } }]),
      ],
    );
    const aggregated = collectSubtreeNavReactions(tree);
    expect(aggregated.map((r) => r.action?.type)).toEqual(['OPEN_OVERLAY', 'SWAP_OVERLAY']);
  });

  it('Test F — empty tree (no reactions anywhere): returns empty array', () => {
    const tree = node('frame', [], [node('decoration', [], [node('shape', [])])]);
    expect(collectSubtreeNavReactions(tree)).toEqual([]);
  });

  it('Test G — null action / missing action: skipped without crashing', () => {
    const tree = node('frame', [
      { action: null },
      { action: undefined as unknown as null },
      { action: { type: 'NAVIGATE', destinationId: 'good' } },
    ]);
    const aggregated = collectSubtreeNavReactions(tree);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]!.action?.destinationId).toBe('good');
  });
});
