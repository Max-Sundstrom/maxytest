/**
 * `frameTimings` — pure per-frame dwell aggregator (median + P95 + sample size).
 *
 * Plan: 03-prototype-analytics-depth / 03-03 / Task 1.
 *
 * Closes ROADMAP SC4 (time-on-frame with lockout excluded) + ANALYTICS-10.
 *
 * Source — pasted verbatim from 03-RESEARCH.md §"Time-on-frame Computation"
 * lines 1153-1231, with the input row type swapped from the research's
 * `FrameEventRow` to `BlockEventRow` (Plan 03-01 driver row that already
 * carries `frame_id`).
 *
 * Locked semantics — see 03-CONTEXT.md §"Claude's Discretion / Time-on-frame
 * mechanic" lines 224-232:
 *   - **D-discretion constant.** `LOCKOUT_MS = 300` — the runner's pointer-lock
 *     window between transition trigger and the new frame becoming interactive.
 *     Phase 2 picked a static 300 ms (mid-range 200-400 ms); we do NOT look up
 *     per-hotspot animation durations in v1 — the cost (per-hotspot JOIN +
 *     Smart Animate decoding) is not worth the precision gain for "did people
 *     stick on this frame" intuition.
 *   - **ADR-R2 (RESEARCH).** Pairing is `(frame_enter, next-event-in-session)`,
 *     not the naive `(frame_enter, frame_exit)` pair — because frame_exit may
 *     be absent (last-event-of-session) or replaced by `task_finish`.
 *   - **Open Q1 RESOLVED 2026-05-18.** Phase 2 runner writes `frame_exit` on
 *     every transition-triggering tap BEFORE the wall-clock animation gap, and
 *     `frame_enter` AFTER the gap. This algorithm's `frame_enter → frame_exit`
 *     branch is therefore the realistic common path on real respondent traces
 *     and correctly excludes lockout (the dwell window ends at `frame_exit`,
 *     which fires BEFORE the gap). The `frame_enter → frame_enter` branch only
 *     fires in unusual remount/retry scenarios where the previous frame_exit
 *     was lost; for those we explicitly subtract `LOCKOUT_MS`.
 *
 * Pitfall 4 pairing table (03-RESEARCH lines 1024-1030):
 *
 * | Pair                                    | Subtract lockout? |
 * |-----------------------------------------|-------------------|
 * | `frame_enter` → `frame_exit` (same)     | No  — exit fires pre-gap; window already excludes lockout. |
 * | `frame_enter` → `task_finish`           | No  — task_finish is not a transition. |
 * | `frame_enter_A` → `frame_enter_B`       | YES — 300 ms gap between exit (absent) and next enter. |
 * | `frame_enter` → `tap`                   | No  — tap on its own doesn't transition. |
 * | `frame_enter` → EOS (no successor)      | SKIP — no honest way to bound the dwell. |
 *
 * Defensive:
 *   - Negative `elapsed - lockout` (pathological clock skew) → clamped to 0
 *     via `Math.max(0, ...)`. The algorithm tolerates without crashing.
 *   - Per-session events sorted by `seq` defensively (Phase 2 guarantees
 *     per-session monotonic seq, but we don't rely on input ordering).
 *
 * Pure function: no React, no Supabase, no DOM globals. Consumed by
 * `PrototypeReport.tsx` via `useMemo(() => frameTimings(...), [...])` rooted
 * on the shared `useBlockEvents` query cache.
 */

import type { BlockEventRow } from '@/lib/queries/block-events';
import { quantile } from './quantile';

/** Phase 2 D-discretion: 300 ms pointer-lock window during frame transitions. */
const LOCKOUT_MS = 300;

export interface FrameTimings {
  median_ms: number;
  p95_ms: number;
  /** Number of valid dwell intervals computed (one frame can contribute many — revisits). */
  sample_size: number;
}

/**
 * Compute median + P95 time-on-frame for a single frame, across all sessions.
 *
 * Algorithm: per session, walk events sorted by `seq`. Each `frame_enter` on
 * `frameId` starts a dwell window; the window closes at the NEXT event in the
 * same session (any type). `dwell_ms = nextEvent.ts - enter.ts`, minus
 * `LOCKOUT_MS` only if the next event is another `frame_enter` (transition
 * happened between them, lockout was active). Last-event-of-session frame_enter
 * is skipped (we can't honestly bound the dwell).
 *
 * @param allEventsForBlock — `BlockEventRow[]` covering all sessions in this
 *                            block. Sorted internally per session by `seq`.
 * @param frameId           — the frame whose dwells we're aggregating.
 */
export function frameTimings(allEventsForBlock: BlockEventRow[], frameId: string): FrameTimings {
  // Group events by session.
  const bySession = new Map<string, BlockEventRow[]>();
  for (const ev of allEventsForBlock) {
    const list = bySession.get(ev.session_id) ?? [];
    list.push(ev);
    bySession.set(ev.session_id, list);
  }

  const dwells: number[] = [];

  for (const events of bySession.values()) {
    const sorted = [...events].sort((a, b) => a.seq - b.seq);

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (cur.event_type !== 'frame_enter') continue;
      if (cur.frame_id !== frameId) continue;

      // Find next event in same session (any type).
      const next = sorted[i + 1];
      if (!next) {
        // EOS — skip (Pitfall 4 case).
        continue;
      }

      const elapsed = new Date(next.client_ts).getTime() - new Date(cur.client_ts).getTime();

      // Subtract lockout only if NEXT was another frame_enter (transition occurred).
      const lockout = next.event_type === 'frame_enter' ? LOCKOUT_MS : 0;
      const dwell = Math.max(0, elapsed - lockout);

      dwells.push(dwell);
    }
  }

  if (dwells.length === 0) {
    return { median_ms: 0, p95_ms: 0, sample_size: 0 };
  }

  const sorted = [...dwells].sort((a, b) => a - b);
  return {
    median_ms: quantile(sorted, 0.5),
    p95_ms: quantile(sorted, 0.95),
    sample_size: dwells.length,
  };
}
