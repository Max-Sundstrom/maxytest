/**
 * `session-filter` — pure helpers for the «Тип» (Завершённые / Неполные)
 * filter in the report sidebar (Plan 03.1-03).
 *
 * Locks CONTEXT.md GA2 / D-72 semantics. A session is «Завершённые» when ANY
 * of these three conditions holds:
 *
 *   1. The `sessions.status` column equals `'completed'`.
 *   2. There is at least one `task_finish` event for the session in the
 *      currently-loaded event window.
 *   3. The session has an entry in the `outcomes` array (classifyOutcome
 *      returned a non-null result — see classify-outcome.ts line 20-23 for the
 *      documented race where `status` may not be flipped to `'completed'`
 *      immediately after the runner writes `task_finish`).
 *
 * Otherwise the session is «Неполные» — covers `'in_progress'`, `'abandoned'`,
 * and the corner case where the session row is missing from the sessionsById
 * map (e.g. the sessions query is still loading).
 *
 * **Scope of the event window**. Classification is local to the in-memory
 * events that have already been narrowed by the date filter from Plan 03.1-02.
 * A session with a `task_finish` event OUTSIDE the current date range will
 * not be promoted to completed via condition 2 because that event is not in
 * `events` — but it WILL still be promoted via condition 1 (status column)
 * if the runner has finished writing the completion. Designers picking a
 * very narrow date window get the truthful "what classification do these
 * events tell me?" answer.
 *
 * Pure module — no React, no Supabase, no DOM. Imports only the row-shape
 * types from the query hooks (those imports are type-only and erase at
 * compile time).
 */

import type { ClassifyOutcomeResult } from './classify-outcome';
import type { BlockEventRow } from '@/lib/queries/block-events';
import type { DesignerSession } from '@/lib/queries/designer-sessions';

/**
 * Two-flag filter — both default to `true` would mean "show everything";
 * defaults at the call site are `{ completed: true, incomplete: false }`
 * per CONTEXT.md GA2 (matches the prior hardcoded sidebar mock).
 */
export type StatusFilter = {
  completed: boolean;
  incomplete: boolean;
};

/**
 * Classify a single session as `'completed'` | `'incomplete'`.
 *
 * Returns `'completed'` if ANY of the three CONTEXT.md GA2 / D-72 conditions
 * holds, otherwise `'incomplete'`. See module header for the documented
 * race rationale.
 */
export function classifyCompletion(
  sessionId: string,
  sessionsById: ReadonlyMap<string, DesignerSession>,
  events: readonly BlockEventRow[],
  outcomes: readonly ClassifyOutcomeResult[],
): 'completed' | 'incomplete' {
  // Condition 1 — explicit `status` column on the sessions row.
  if (sessionsById.get(sessionId)?.status === 'completed') return 'completed';

  // Condition 2 — at least one `task_finish` event for this session in the
  // current event window.
  for (const e of events) {
    if (e.session_id === sessionId && e.event_type === 'task_finish') {
      return 'completed';
    }
  }

  // Condition 3 — classifyOutcome returned a non-null result for this
  // session (success / giveup). `sessionId` is the canonical field on
  // ClassifyOutcomeResult.
  for (const o of outcomes) {
    if (o.sessionId === sessionId) return 'completed';
  }

  return 'incomplete';
}

/**
 * Narrow `allEvents` down to only the events whose session matches the
 * `filter` state. Used by ReportShell to produce the `filteredEvents` array
 * that drives the downstream `outcomes` / `sankey` / `funnel` memos.
 *
 * Special cases:
 *   - Both flags `false` → returns `[]` immediately (no sessions match).
 *   - Both flags `true` → returns a **shallow copy** of `allEvents` (not the
 *     same reference — callers rely on reference inequality for `useMemo`
 *     invalidation when the filter state changes).
 *   - Otherwise → groups by `session_id`, classifies each unique session
 *     ONCE via `classifyCompletion`, and includes all events belonging to
 *     sessions whose classification is allowed by the filter.
 */
export function filterEventsByStatus(
  allEvents: readonly BlockEventRow[],
  sessionsById: ReadonlyMap<string, DesignerSession>,
  outcomes: readonly ClassifyOutcomeResult[],
  filter: StatusFilter,
): BlockEventRow[] {
  // Fast-path 1 — neither flag is set, nothing matches.
  if (!filter.completed && !filter.incomplete) return [];

  // Fast-path 2 — both flags set, everything matches. Return a shallow copy
  // so memo deps that compare by reference still invalidate when the filter
  // flips between "both-on" and a single-side state.
  if (filter.completed && filter.incomplete) return [...allEvents];

  // General case — classify each unique session ONCE, then include events
  // whose session classification matches the filter.
  const allowed = new Map<string, boolean>();
  const result: BlockEventRow[] = [];
  for (const e of allEvents) {
    let isAllowed = allowed.get(e.session_id);
    if (isAllowed === undefined) {
      const status = classifyCompletion(e.session_id, sessionsById, allEvents, outcomes);
      isAllowed =
        (status === 'completed' && filter.completed) ||
        (status === 'incomplete' && filter.incomplete);
      allowed.set(e.session_id, isAllowed);
    }
    if (isAllowed) result.push(e);
  }
  return result;
}
