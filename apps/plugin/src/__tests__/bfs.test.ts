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
import { walkReachable, type BfsNode } from '../lib/bfs';

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

  it('Test 8 (max-iterations cap): 10000-node chain with cap=100 returns at most 100 IDs', () => {
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
