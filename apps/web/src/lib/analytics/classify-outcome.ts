/**
 * `classifyOutcome` — pure session-level outcome classifier.
 *
 * Source: 03-RESEARCH.md Pattern 1 lines 482-512 (canonical impl), pasted 1:1
 * with the input type swapped from `FrameEventRow` to the Phase 3 driver row
 * `BlockEventRow` (which adds `frame_id`).
 *
 * Locked semantics — see 03-CONTEXT.md §"Outcome Classification (GA1, D-30..D-39)":
 *   - **D-30 Success.** ≥1 `frame_enter` event whose `frame_id` is in the
 *     `finishFrameIds` set (Maze-class definition: faktum is what matters, not
 *     path).
 *   - **D-31 Give-up.** Valid session that did NOT reach any finish frame.
 *   - **D-34 Validity.** Session is VALID iff it has ≥1 `frame_enter` for this
 *     prototype block. Returns `null` for invalid sessions (Pitfall 5 — caller
 *     `.filter(r => r !== null)` to keep counts honest).
 *   - **D-36 Re-finish.** A session that reaches a finish frame TWICE still
 *     yields ONE row with `outcome: 'success'`. The classifier doesn't loop
 *     over finishes; it asks `frameEnters.some(...)`. Caller dedups via
 *     `session_id` grouping (one input → one output).
 *   - **D-38 task_finish ignored.** Phase 2 runner writes a `task_finish` row
 *     when the respondent hits «Завершить задание», but Phase 3 does NOT use
 *     that for outcome — only `frame_enter` on a finish frame counts. A
 *     `task_finish` without a matching `frame_enter` on `finishFrameIds` is
 *     still a give-up.
 *
 * Pure function: no React, no Supabase, no `Date.now()` at call sites that
 * matter (we read `client_ts` only — those strings come from the caller's
 * fetched rows; runtime `new Date()` here is deterministic given input).
 */

import type { BlockEventRow } from '@/lib/queries/block-events';

export type SessionOutcome = 'success' | 'giveup';

export interface ClassifyOutcomeResult {
  sessionId: string;
  outcome: SessionOutcome;
  durationMs: number;
  firstEventTs: string;
  lastEventTs: string;
}

export function classifyOutcome(
  sessionEvents: BlockEventRow[],
  finishFrameIds: string[],
): ClassifyOutcomeResult | null {
  if (sessionEvents.length === 0) return null;

  const frameEnters = sessionEvents.filter((e) => e.event_type === 'frame_enter');
  if (frameEnters.length === 0) {
    // D-34: invalid — нет ни одного frame_enter
    return null;
  }

  // Сортируем по seq (per-session monotonic; safer than client_ts under clock skew).
  const sorted = [...sessionEvents].sort((a, b) => a.seq - b.seq);
  const firstTs = sorted[0]!.client_ts;
  const lastTs = sorted[sorted.length - 1]!.client_ts;
  const durationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime();

  const finishSet = new Set(finishFrameIds);
  const reachedFinish = frameEnters.some((e) => e.frame_id !== null && finishSet.has(e.frame_id));

  return {
    sessionId: sorted[0]!.session_id,
    outcome: reachedFinish ? 'success' : 'giveup',
    durationMs,
    firstEventTs: firstTs,
    lastEventTs: lastTs,
  };
}
