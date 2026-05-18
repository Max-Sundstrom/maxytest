/**
 * `transitionGraph` — pure session-transition aggregator for the sankey board.
 *
 * Source: 03-RESEARCH.md §"Sankey Aggregation Algorithm" lines 1272-1424.
 * Pasted verbatim with the input type swapped from the research's
 * `FrameEventRow` to `BlockEventRow` (Plan 03-01 driver row that already
 * carries `frame_id`).
 *
 * Locked semantics — see 03-CONTEXT.md §"Sankey (GA2, D-40..D-47)":
 *   - **D-32 (terminal whitelist).** Output node `kind === 'terminal'` is
 *     EXCLUSIVELY one of `TERMINAL_SUCCESS` ('Цель') or `TERMINAL_GIVEUP`
 *     ('Сдались'). No `TERMINAL_TIMEOUT` / `TERMINAL_SKIPPED` /
 *     `TERMINAL_ABANDONED` / `TERMINAL_EXPIRED` / `TERMINAL_UNKNOWN` ids EVER.
 *     ROADMAP SC1 mentions «Timed out» / «Skipped» as conceptual terminals —
 *     D-32 + D-43 + W3 explicitly locked these OUT for v1.
 *   - **D-40 (threshold).** Edges with weight < `ceil(thresholdPercent/100 *
 *     validSessionCount)` are filtered into the otherPathsCount bucket. Minimum
 *     value is clamped to 1 so a 1-of-20 edge isn't auto-kept when
 *     `Math.ceil(0.05 * 20) === 1` already produces 1.
 *   - **D-41 (Other-node).** When `otherPathsCount > 0`, a standalone
 *     `kind === 'other'` node with name `Other · N путей` is appended. It is
 *     NEVER connected by an edge (recommendation Q above, "Standalone").
 *   - **D-42 (mode toggle).** `mode='first'` = each (src,tgt) edge counted at
 *     most once per session (DAG, Pitfall 7). `mode='all'` = every transition
 *     counts; self-loops separately tracked (Pitfall 3 — d3-sankey can't
 *     render them).
 *   - **D-43 (terminal edges).** For each `outcomes[i]`, an edge is drawn
 *     from that session's LAST `frame_enter` to the matching terminal node.
 *     Skipped if the source frame did not survive the threshold filter
 *     (rare-path frames are folded into Other).
 *
 * Pure function: no React, no Supabase, no d3, no DOM globals.
 *
 * Russian copy embedded by design (Pattern F — Russian copy in UI; English
 * in code).
 */

import type { BlockEventRow } from '@/lib/queries/block-events';
import type { ClassifyOutcomeResult } from './classify-outcome';

export interface SankeyGraphNode {
  /** Frame id, or one of `TERMINAL_SUCCESS` / `TERMINAL_GIVEUP` / `OTHER`. */
  id: string;
  /** Frame name resolved from `frameNames` map, or localized 'Цель' / 'Сдались' / 'Other · N путей'. */
  name: string;
  kind: 'frame' | 'terminal' | 'other';
}

export interface SankeyGraphEdge {
  source: string;
  target: string;
  /** Session count (per mode — see D-42). */
  value: number;
}

export interface SankeyGraph {
  nodes: SankeyGraphNode[];
  edges: SankeyGraphEdge[];
  /** Self-loops for the 'all' mode (Pitfall 3 — rendered as overlay arcs, not d3-sankey edges). */
  selfLoops: Array<{ frameId: string; sessionsCount: number }>;
  otherPathsCount: number;
  validSessionCount: number;
}

export interface TransitionGraphOptions {
  /** D-42 — 'first' = per-session edge dedup (DAG); 'all' = every transition counts. */
  mode: 'first' | 'all';
  /** D-40 — minimum edge weight as a percentage of `validSessionCount`. Default 5. */
  thresholdPercent: number;
  /** Number of valid sessions (from `classifyOutcome` output length). Drives D-40 threshold. */
  validSessionCount: number;
  /** Reserved for D-43 logic — currently unused at the call sites but kept for symmetry with classifyOutcome. */
  finishFrameIds: string[];
  /** Per-session outcomes (D-43 — drives terminal-node edges). */
  outcomes: ClassifyOutcomeResult[];
  /** Frame id → name lookup for resolving node display strings. */
  frameNames: Map<string, string>;
}

export function transitionGraph(
  allEvents: BlockEventRow[],
  options: TransitionGraphOptions,
): SankeyGraph {
  const { mode, thresholdPercent, validSessionCount, outcomes, frameNames } = options;

  // Group events by session — only frame_enter (transitions = sequential
  // frame_enters within a session).
  const bySession = new Map<string, BlockEventRow[]>();
  for (const ev of allEvents) {
    if (ev.event_type !== 'frame_enter') continue;
    const list = bySession.get(ev.session_id) ?? [];
    list.push(ev);
    bySession.set(ev.session_id, list);
  }

  // Build raw edge counts.
  const edgeCounts = new Map<string, number>(); //  key = `${src}|${tgt}`
  const selfLoopCounts = new Map<string, number>(); //  key = frameId
  const lastFrameBySession = new Map<string, string>();

  for (const [sessionId, frameEnters] of bySession) {
    frameEnters.sort((a, b) => a.seq - b.seq);
    const visitedEdges = new Set<string>();
    const visitedFrames = new Set<string>();
    let lastFrameInPath: string | undefined;

    for (let i = 1; i < frameEnters.length; i++) {
      const src = frameEnters[i - 1]!.frame_id;
      const tgt = frameEnters[i]!.frame_id;
      if (!src || !tgt) continue;
      if (lastFrameInPath === undefined) lastFrameInPath = src;

      if (src === tgt) {
        // Self-loop (Back button returning to same frame, etc.).
        if (mode === 'all') {
          selfLoopCounts.set(tgt, (selfLoopCounts.get(tgt) ?? 0) + 1);
        }
        // mode === 'first': ignore self-loops entirely.
        continue;
      }

      if (mode === 'first') {
        // D-42 «первое прохождение» semantics + cross-session DAG guard
        // (UAT 2026-05-18): once the respondent revisits a frame already
        // seen earlier in the same session, that's a loop. Recording
        // src→tgt would produce a back-edge in the aggregate graph and
        // make d3-sankey throw `circular link`. The whole point of 'first'
        // mode is «what the respondent saw on the first traversal» — stop
        // tracking transitions for this session at that point.
        visitedFrames.add(src);
        if (visitedFrames.has(tgt)) {
          break;
        }
        const key = `${src}|${tgt}`;
        if (visitedEdges.has(key)) continue;
        visitedEdges.add(key);
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        visitedFrames.add(tgt);
        lastFrameInPath = tgt;
      } else {
        // 'all' mode — every transition counts. Multi-frame cycle handling
        // is deferred (Phase 4 polish); designers see 'first' mode by
        // default and won't hit the cycle path in steady state.
        const key = `${src}|${tgt}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        lastFrameInPath = tgt;
      }
    }

    // Terminal-node edges (D-43): point at the LAST frame in the truncated
    // path, not the absolute last `frame_enter`. For a respondent who
    // reached the goal and kept exploring, this means the success edge
    // emanates from the goal frame, not from wherever they wandered next.
    if (lastFrameInPath !== undefined) {
      lastFrameBySession.set(sessionId, lastFrameInPath);
    } else if (frameEnters.length > 0) {
      // Single-frame session (or every pair was a self-loop).
      const onlyFrame = frameEnters[0]!.frame_id;
      if (onlyFrame) lastFrameBySession.set(sessionId, onlyFrame);
    }
  }

  // Threshold (D-40): keep edges with value >= ceil(threshold% * validSessionCount).
  // Clamped to 1 so an empty / single-session block doesn't divide-by-zero.
  const minValue = Math.max(1, Math.ceil((thresholdPercent / 100) * validSessionCount));
  const keptEdges: SankeyGraphEdge[] = [];
  let otherPathsCount = 0;
  const includedFrames = new Set<string>();

  for (const [key, value] of edgeCounts) {
    const [src, tgt] = key.split('|') as [string, string];
    if (value >= minValue) {
      keptEdges.push({ source: src, target: tgt, value });
      includedFrames.add(src);
      includedFrames.add(tgt);
    } else {
      otherPathsCount += 1;
    }
  }

  // Terminal-node edges (D-43): one edge per session-outcome, from the
  // session's last frame_enter to TERMINAL_SUCCESS or TERMINAL_GIVEUP.
  // Skipped if the source frame did not survive the threshold filter.
  const successEdgeFromFrame = new Map<string, number>();
  const giveupEdgeFromFrame = new Map<string, number>();
  for (const outcome of outcomes) {
    const lastFrame = lastFrameBySession.get(outcome.sessionId);
    if (!lastFrame) continue;
    const map = outcome.outcome === 'success' ? successEdgeFromFrame : giveupEdgeFromFrame;
    map.set(lastFrame, (map.get(lastFrame) ?? 0) + 1);
  }

  for (const [frameId, count] of successEdgeFromFrame) {
    if (!includedFrames.has(frameId)) continue;
    keptEdges.push({ source: frameId, target: 'TERMINAL_SUCCESS', value: count });
  }
  for (const [frameId, count] of giveupEdgeFromFrame) {
    if (!includedFrames.has(frameId)) continue;
    keptEdges.push({ source: frameId, target: 'TERMINAL_GIVEUP', value: count });
  }

  // Build node list.
  const nodes: SankeyGraphNode[] = [];
  for (const frameId of includedFrames) {
    nodes.push({ id: frameId, name: frameNames.get(frameId) ?? frameId, kind: 'frame' });
  }
  // Terminal nodes (D-32 whitelist + D-43). Only emitted when at least one
  // included frame has a terminal edge — keeps the node list minimal when
  // every outcome's source got folded into Other.
  let hasSuccessTerminal = false;
  let hasGiveupTerminal = false;
  for (const [frameId] of successEdgeFromFrame) {
    if (includedFrames.has(frameId)) {
      hasSuccessTerminal = true;
      break;
    }
  }
  for (const [frameId] of giveupEdgeFromFrame) {
    if (includedFrames.has(frameId)) {
      hasGiveupTerminal = true;
      break;
    }
  }
  if (hasSuccessTerminal) {
    nodes.push({ id: 'TERMINAL_SUCCESS', name: 'Цель', kind: 'terminal' });
  }
  if (hasGiveupTerminal) {
    nodes.push({ id: 'TERMINAL_GIVEUP', name: 'Сдались', kind: 'terminal' });
  }
  // Other-node (D-41) — standalone, no edges (per RESEARCH § Open Q recommendation).
  if (otherPathsCount > 0) {
    nodes.push({ id: 'OTHER', name: `Other · ${otherPathsCount} путей`, kind: 'other' });
  }

  // Defense-in-depth (UAT 2026-05-18): final DAG guard. The 'first'-mode
  // truncation above SHOULD produce a DAG for any session list, and 'all'
  // mode is documented to not handle multi-frame cycles. But if either the
  // base-edge pass OR the terminal-edge pass somehow inserts a back-edge
  // (regression, weird data, edge-case we didn't model), d3-sankey crashes
  // the whole report with `circular link`. We drop the lowest-weight
  // back-edge greedily until the graph is acyclic.
  const dagEdges = dropBackEdgesUntilDag(keptEdges);

  const selfLoops = Array.from(selfLoopCounts).map(([frameId, count]) => ({
    frameId,
    sessionsCount: count,
  }));

  return { nodes, edges: dagEdges, selfLoops, otherPathsCount, validSessionCount };
}

/**
 * Greedy back-edge dropper — returns a subset of `edges` that forms a DAG.
 *
 * Kahn's algorithm: repeatedly peel off zero-in-degree nodes. Whatever
 * remains in the in-degree map is part of a cycle. We pick the lowest-weight
 * edge incident to those remaining nodes, drop it, and restart. Worst-case
 * O(V·E) per drop × at most E drops = O(V·E²) — but our graphs are tiny
 * (~10 nodes, ~15 edges) so the constant factor is dominated by the
 * happy-path no-cycle pass.
 *
 * Self-loops (src === tgt) are not handled here — they're stored in a
 * separate `selfLoops` array and rendered as overlay arcs (Pitfall 3).
 */
function dropBackEdgesUntilDag(edges: SankeyGraphEdge[]): SankeyGraphEdge[] {
  // Filter out any accidental self-loops (defense-in-depth — they should
  // never reach this point given the src===tgt check upstream).
  const working = edges.filter((e) => e.source !== e.target).map((e) => ({ ...e }));

  while (true) {
    const nodes = new Set<string>();
    for (const e of working) {
      nodes.add(e.source);
      nodes.add(e.target);
    }
    const inDeg = new Map<string, number>();
    for (const n of nodes) inDeg.set(n, 0);
    for (const e of working) inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);

    const queue: string[] = [];
    for (const [n, d] of inDeg) if (d === 0) queue.push(n);

    let visited = 0;
    const stillReachable = new Set<string>(queue);
    while (queue.length > 0) {
      const n = queue.shift()!;
      visited += 1;
      for (const e of working) {
        if (e.source !== n) continue;
        const next = (inDeg.get(e.target) ?? 0) - 1;
        inDeg.set(e.target, next);
        if (next === 0) {
          queue.push(e.target);
          stillReachable.add(e.target);
        }
      }
    }

    if (visited === nodes.size) return working;

    // Find the lowest-weight edge among nodes that are still in a cycle
    // (i.e. NOT in stillReachable). Drop it and retry.
    const cycleNodes = new Set<string>();
    for (const n of nodes) if (!stillReachable.has(n)) cycleNodes.add(n);

    let weakest: { idx: number; value: number } | null = null;
    for (let i = 0; i < working.length; i++) {
      const e = working[i]!;
      if (!cycleNodes.has(e.source) || !cycleNodes.has(e.target)) continue;
      if (weakest === null || e.value < weakest.value) {
        weakest = { idx: i, value: e.value };
      }
    }
    if (weakest === null) {
      // Shouldn't happen — cycleNodes is non-empty so at least one edge is
      // incident on it. Bail out to avoid infinite loop.
      return working;
    }
    working.splice(weakest.idx, 1);
  }
}
