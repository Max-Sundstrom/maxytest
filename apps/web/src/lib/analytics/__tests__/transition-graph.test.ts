/**
 * `transitionGraph` unit tests — Plan 03-02 Task 1.
 *
 * Locks 03-CONTEXT.md §"Sankey (GA2, D-40..D-47)" + D-32 (terminal whitelist):
 *   - D-32 terminal whitelist — outputs ONLY 'TERMINAL_SUCCESS' and 'TERMINAL_GIVEUP',
 *     no other TERMINAL_* identifiers (TIMEOUT / SKIPPED / ABANDONED / EXPIRED / UNKNOWN).
 *   - D-40 5% threshold — edges below `Math.ceil(5/100 * validSessionCount)` (clamped to 1)
 *     collapse into otherPathsCount.
 *   - D-41 Other-node — standalone gray node with `Other · N путей` label.
 *   - D-42 mode toggle:
 *       'first' → per-session dedup (A→B→A→B counts edge A→B once, Pitfall 7).
 *                 Self-loops ignored entirely.
 *       'all'   → every transition counts; self-loops collected separately
 *                 (Pitfall 3 — d3-sankey can't render them).
 *   - D-43 terminal edges — for each outcome, edge from session's LAST frame_enter
 *     to TERMINAL_SUCCESS or TERMINAL_GIVEUP, only if source frame is in includedFrames.
 *
 * Fixture pattern mirrors classify-outcome.test.ts: minimal `ev()` literal-cast
 * helper, only fields the function reads are populated.
 */

import { describe, expect, it } from 'vitest';

import { transitionGraph } from '../transition-graph';
import type { ClassifyOutcomeResult } from '../classify-outcome';
import type { BlockEventRow } from '@/lib/queries/block-events';

/** Helper — build a minimal BlockEventRow literal with sensible defaults. */
function ev(partial: Partial<BlockEventRow>): BlockEventRow {
  return {
    id: 'e0',
    x: null,
    y: null,
    hotspot_id: null,
    hit_target_id: null,
    event_type: 'frame_enter',
    seq: 1,
    session_id: 's1',
    client_ts: '2026-05-18T00:00:00.000Z',
    frame_id: null,
    ...partial,
  } as BlockEventRow;
}

/** Helper — build a minimal ClassifyOutcomeResult literal. */
function outcome(partial: Partial<ClassifyOutcomeResult>): ClassifyOutcomeResult {
  return {
    sessionId: 's1',
    outcome: 'success',
    durationMs: 10_000,
    firstEventTs: '2026-05-18T00:00:00.000Z',
    lastEventTs: '2026-05-18T00:00:10.000Z',
    ...partial,
  };
}

/** Default options factory — call with overrides to keep tests terse. */
function opts(
  partial: Partial<Parameters<typeof transitionGraph>[1]> = {},
): Parameters<typeof transitionGraph>[1] {
  return {
    mode: 'first',
    thresholdPercent: 5,
    validSessionCount: 0,
    finishFrameIds: [],
    outcomes: [],
    frameNames: new Map(),
    ...partial,
  };
}

describe('transitionGraph', () => {
  it('returns empty graph on empty input', () => {
    const result = transitionGraph([], opts());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.selfLoops).toEqual([]);
    expect(result.otherPathsCount).toBe(0);
    expect(result.validSessionCount).toBe(0);
  });

  it("mode='first' dedupes A→B→A→B to weight 1 (Pitfall 7)", () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'B' }),
      ev({ id: 'e3', seq: 3, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e4', seq: 4, session_id: 's1', frame_id: 'B' }),
    ];
    const result = transitionGraph(
      events,
      opts({ mode: 'first', validSessionCount: 1, thresholdPercent: 0 }),
    );
    // A→B weight 1, B→A weight 1.
    const ab = result.edges.find((e) => e.source === 'A' && e.target === 'B');
    const ba = result.edges.find((e) => e.source === 'B' && e.target === 'A');
    expect(ab?.value).toBe(1);
    expect(ba?.value).toBe(1);
  });

  it("mode='all' counts A→B→A→B as weight 2", () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'B' }),
      ev({ id: 'e3', seq: 3, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e4', seq: 4, session_id: 's1', frame_id: 'B' }),
    ];
    const result = transitionGraph(
      events,
      opts({ mode: 'all', validSessionCount: 1, thresholdPercent: 0 }),
    );
    const ab = result.edges.find((e) => e.source === 'A' && e.target === 'B');
    expect(ab?.value).toBe(2);
  });

  it("mode='all' collects A→A self-loop in selfLoops array, NOT in edges (Pitfall 3)", () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'A' }),
    ];
    const result = transitionGraph(
      events,
      opts({ mode: 'all', validSessionCount: 1, thresholdPercent: 0 }),
    );
    expect(result.selfLoops).toEqual([{ frameId: 'A', sessionsCount: 1 }]);
    expect(result.edges.some((e) => e.source === 'A' && e.target === 'A')).toBe(false);
  });

  it("mode='first' ignores self-loops entirely", () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'A' }),
    ];
    const result = transitionGraph(
      events,
      opts({ mode: 'first', validSessionCount: 1, thresholdPercent: 0 }),
    );
    expect(result.selfLoops).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('threshold 5% filters edges below minValue and increments otherPathsCount (D-40 + D-41)', () => {
    // 100 sessions: A→B has weight 4 (filtered), A→C has weight 6 (kept).
    // minValue = ceil(5% * 100) = 5. So A→B (4) is filtered, A→C (6) is kept.
    const events: BlockEventRow[] = [];
    let id = 0;
    // 4 sessions A→B
    for (let i = 0; i < 4; i++) {
      events.push(
        ev({ id: `e${id++}`, seq: 1, session_id: `s-ab-${i}`, frame_id: 'A' }),
        ev({ id: `e${id++}`, seq: 2, session_id: `s-ab-${i}`, frame_id: 'B' }),
      );
    }
    // 6 sessions A→C
    for (let i = 0; i < 6; i++) {
      events.push(
        ev({ id: `e${id++}`, seq: 1, session_id: `s-ac-${i}`, frame_id: 'A' }),
        ev({ id: `e${id++}`, seq: 2, session_id: `s-ac-${i}`, frame_id: 'C' }),
      );
    }
    const result = transitionGraph(
      events,
      opts({ mode: 'first', validSessionCount: 100, thresholdPercent: 5 }),
    );
    expect(result.edges.find((e) => e.source === 'A' && e.target === 'B')).toBeUndefined();
    expect(result.edges.find((e) => e.source === 'A' && e.target === 'C')?.value).toBe(6);
    expect(result.otherPathsCount).toBe(1);
    // Other-node appended
    const otherNode = result.nodes.find((n) => n.id === 'OTHER');
    expect(otherNode).toBeDefined();
    expect(otherNode!.name).toBe('Other · 1 путей');
    expect(otherNode!.kind).toBe('other');
    // B is NOT in includedFrames so it's not a node.
    expect(result.nodes.find((n) => n.id === 'B')).toBeUndefined();
    // A and C are.
    expect(result.nodes.find((n) => n.id === 'A')?.kind).toBe('frame');
    expect(result.nodes.find((n) => n.id === 'C')?.kind).toBe('frame');
  });

  it('terminal_success edge added from last frame of success outcome (D-43)', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'B' }),
    ];
    const outcomes: ClassifyOutcomeResult[] = [outcome({ sessionId: 's1', outcome: 'success' })];
    const result = transitionGraph(
      events,
      opts({
        mode: 'first',
        validSessionCount: 1,
        thresholdPercent: 0,
        outcomes,
        finishFrameIds: ['B'],
      }),
    );
    const terminalEdge = result.edges.find((e) => e.target === 'TERMINAL_SUCCESS');
    expect(terminalEdge).toBeDefined();
    expect(terminalEdge!.source).toBe('B');
    expect(terminalEdge!.value).toBe(1);
    const node = result.nodes.find((n) => n.id === 'TERMINAL_SUCCESS');
    expect(node?.kind).toBe('terminal');
    expect(node?.name).toBe('Цель');
  });

  it('terminal_giveup edge added from last frame of giveup outcome (D-43)', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'B' }),
    ];
    const outcomes: ClassifyOutcomeResult[] = [outcome({ sessionId: 's1', outcome: 'giveup' })];
    const result = transitionGraph(
      events,
      opts({
        mode: 'first',
        validSessionCount: 1,
        thresholdPercent: 0,
        outcomes,
      }),
    );
    const terminalEdge = result.edges.find((e) => e.target === 'TERMINAL_GIVEUP');
    expect(terminalEdge).toBeDefined();
    expect(terminalEdge!.source).toBe('B');
    expect(terminalEdge!.value).toBe(1);
    const node = result.nodes.find((n) => n.id === 'TERMINAL_GIVEUP');
    expect(node?.kind).toBe('terminal');
    expect(node?.name).toBe('Сдались');
  });

  it('OTHER node added with correct count when otherPathsCount > 0 (D-41)', () => {
    // 2 hidden edges, each from distinct (src,tgt) pair below threshold.
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'X' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'Y' }),
      ev({ id: 'e3', seq: 1, session_id: 's2', frame_id: 'P' }),
      ev({ id: 'e4', seq: 2, session_id: 's2', frame_id: 'Q' }),
    ];
    // validSessionCount=100, both edges weight 1 → both below threshold (min=5).
    const result = transitionGraph(
      events,
      opts({ mode: 'first', validSessionCount: 100, thresholdPercent: 5 }),
    );
    expect(result.otherPathsCount).toBe(2);
    const otherNode = result.nodes.find((n) => n.id === 'OTHER');
    expect(otherNode).toBeDefined();
    expect(otherNode!.name).toBe('Other · 2 путей');
    expect(otherNode!.kind).toBe('other');
  });

  it('no terminal nodes when validSessionCount === 0 (no outcomes to consume)', () => {
    const result = transitionGraph([], opts({ mode: 'first', validSessionCount: 0 }));
    expect(result.nodes.filter((n) => n.kind === 'terminal')).toEqual([]);
  });

  it('TERMINAL whitelist (D-32 / D-43 / W3) — outputs only TERMINAL_SUCCESS and TERMINAL_GIVEUP', () => {
    // Construct a mixed input with success + giveup outcomes; assert
    // no spurious terminal ids appear.
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'A' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'B' }),
      ev({ id: 'e3', seq: 1, session_id: 's2', frame_id: 'A' }),
      ev({ id: 'e4', seq: 2, session_id: 's2', frame_id: 'C' }),
    ];
    const outcomes: ClassifyOutcomeResult[] = [
      outcome({ sessionId: 's1', outcome: 'success' }),
      outcome({ sessionId: 's2', outcome: 'giveup' }),
    ];
    const result = transitionGraph(
      events,
      opts({
        mode: 'first',
        validSessionCount: 2,
        thresholdPercent: 0,
        outcomes,
        finishFrameIds: ['B'],
      }),
    );
    expect(
      result.nodes.every(
        (n) =>
          n.id !== 'TERMINAL_TIMEOUT' &&
          n.id !== 'TERMINAL_SKIPPED' &&
          n.id !== 'TERMINAL_ABANDONED',
      ),
    ).toBe(true);
    expect(
      result.nodes.filter((n) =>
        /^TERMINAL_(TIMEOUT|SKIPPED|ABANDONED|EXPIRED|UNKNOWN)/.test(n.id),
      ),
    ).toEqual([]);
    expect(
      result.nodes
        .filter((n) => n.kind === 'terminal')
        .map((n) => n.id)
        .sort(),
    ).toEqual(['TERMINAL_GIVEUP', 'TERMINAL_SUCCESS']);
  });

  it('frameNames map resolves node display names; falls back to frame_id', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', seq: 1, session_id: 's1', frame_id: 'frame-1' }),
      ev({ id: 'e2', seq: 2, session_id: 's1', frame_id: 'frame-2' }),
    ];
    const result = transitionGraph(
      events,
      opts({
        mode: 'first',
        validSessionCount: 1,
        thresholdPercent: 0,
        frameNames: new Map([['frame-1', 'Home']]),
      }),
    );
    expect(result.nodes.find((n) => n.id === 'frame-1')?.name).toBe('Home');
    // Missing name → falls back to id
    expect(result.nodes.find((n) => n.id === 'frame-2')?.name).toBe('frame-2');
  });
});
