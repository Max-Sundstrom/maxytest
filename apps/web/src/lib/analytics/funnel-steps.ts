/**
 * `funnelSteps` — pure success-path funnel aggregator.
 *
 * Plan: 03-prototype-analytics-depth / 03-04 / Task 1.
 *
 * Closes ANALYTICS-08 (ROADMAP SC3 — designer-defined success path → funnel
 * with drop-off indicators).
 *
 * Source — pasted verbatim from 03-RESEARCH.md §"Funnel Mechanics" lines
 * 1462-1495, with the input row type swapped from the research's
 * `FrameEventRow` to `BlockEventRow` (Plan 03-01 driver row that already
 * carries `frame_id`).
 *
 * Locked semantics:
 *   - **D-50 — Forgiving.** A respondent "reached step N" if their session
 *     contains AT LEAST ONE `frame_enter` on `success_path[N]`, regardless
 *     of order. The funnel can be non-monotonic (step 3 > step 2) — that
 *     is an honest "respondents took a shortcut" signal, not a bug.
 *   - **D-53 — Empty path → []. ** When `successPath` is empty (or
 *     `validSessionCount === 0`) we return an empty array and let the UI
 *     hide the section entirely. No empty-state-with-CTA — designers who
 *     intentionally didn't set a success_path shouldn't be nagged.
 *   - **Pitfall 8.** Drop-off (negative diff between adjacent steps) is a
 *     UI concern, not a pure-fn concern; this function only emits one
 *     entry per step. `<FunnelSection>` (Task 2) computes drop-off in the
 *     render layer and renders a neutral `± 0` marker when diff ≥ 0.
 *
 * Trust boundary: pure. No React, no Supabase, no DOM, no d3, no clock.
 */

import type { BlockEventRow } from '@/lib/queries/block-events';

/** Result row — one entry per step in the designer's `success_path`. */
export interface FunnelStep {
  /** 0-based index into the source `success_path` array. */
  stepIndex: number;
  /** The frame_id at this step (mirror of `success_path[stepIndex]`). */
  frameId: string;
  /**
   * Count of distinct sessions whose event set contains at least one
   * `frame_enter` row with `frame_id === this.frameId` (D-50 Forgiving).
   */
  sessionsReached: number;
  /**
   * `(sessionsReached / validSessionCount) * 100`. Raw (not rounded) — the
   * UI consumer is responsible for formatting (e.g., `.toFixed(0)`).
   * `validSessionCount === 0` is guarded at the top of the function so we
   * never divide by zero here.
   */
  percentage: number;
}

/**
 * Build a funnel breakdown over the designer-defined success path.
 *
 * @param allEvents          — every event for the prototype block
 *                             (typically the result of `useBlockEvents`).
 * @param successPath        — ordered list of `frame_id`s the designer
 *                             flagged as the intended journey.
 * @param validSessionCount  — the denominator. Typically `outcomes.length`
 *                             from `classifyOutcome` so we only count the
 *                             D-34-valid sessions (Pitfall 5).
 */
export function funnelSteps(
  allEvents: BlockEventRow[],
  successPath: string[],
  validSessionCount: number,
): FunnelStep[] {
  // D-53 + division-by-zero guard.
  if (successPath.length === 0 || validSessionCount === 0) return [];

  // For each session, build a Set of visited frame_ids (frame_enter rows only).
  // `frame_id === null` rows are skipped — that's typically `task_finish`
  // without a frame anchor, which can't contribute to "reached step N".
  const visitedBySession = new Map<string, Set<string>>();
  for (const ev of allEvents) {
    if (ev.event_type !== 'frame_enter') continue;
    if (!ev.frame_id) continue;
    const set = visitedBySession.get(ev.session_id) ?? new Set<string>();
    set.add(ev.frame_id);
    visitedBySession.set(ev.session_id, set);
  }

  const steps: FunnelStep[] = [];
  for (let i = 0; i < successPath.length; i++) {
    const frameId = successPath[i]!;
    let reached = 0;
    for (const visited of visitedBySession.values()) {
      if (visited.has(frameId)) reached += 1;
    }
    steps.push({
      stepIndex: i,
      frameId,
      sessionsReached: reached,
      percentage: (reached / validSessionCount) * 100,
    });
  }

  return steps;
}
