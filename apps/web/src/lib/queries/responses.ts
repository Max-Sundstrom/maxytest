/**
 * Responses queries — two unrelated concerns share this file historically:
 *
 *  1. `useSubmitResponse(runToken)` — runner-side mutation (Plan 01-05 Task 2).
 *  2. `useResponses(...)` + `buildResponseRows(...)` + `ResponseRow` —
 *     designer-side per-response table aggregator (Plan 03.1-04 Task 1).
 *
 * The two layers share NO state or transport: the runner mutation talks to
 * `supabaseAnon` (the anon-storage client), the designer-side derivation is
 * a pure in-memory transform over data the report already has loaded. They
 * coexist here because CONTEXT.md / PLAN.md 03.1-04 explicitly named this
 * filename as the «view-scope» location. The ESLint runner/designer
 * boundary applies at the IMPORT site — runner code only imports
 * `useSubmitResponse`, designer code only imports the derivation helpers.
 *
 * ── Section 1 — runner submit-response mutation ─────────────────────────
 *
 * `useSubmitResponse(runToken)` calls the `submit_response` SECURITY DEFINER
 * RPC from migration 00005, which:
 *   - Verifies the caller's auth.uid() matches sessions.respondent_id.
 *   - Verifies sessions.status = 'in_progress' (post-completion edits are
 *     refused with `session_closed`).
 *   - UPSERTs the row on (session_id, block_id) — so a respondent who
 *     navigates back and re-submits an answer updates the existing row.
 *
 * On success invalidates `['runner-session', runToken]` so the next mount /
 * resume picks up the new authoritative state from the server (D-20).
 */

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseAnon } from '@/lib/supabase/anon';
import type { Json } from '@/lib/supabase/types.gen';
import type { BlockEventRow } from '@/lib/queries/block-events';
import type { DesignerSession } from '@/lib/queries/designer-sessions';
import type { ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { DateRange } from '@/lib/analytics/date-range';
import { classifyCompletion, type StatusFilter } from '@/lib/analytics/session-filter';

export interface SubmitResponseInput {
  sessionId: string;
  blockId: string;
  /** Anything Zod-validated on the block-runner side (e.g., `{text:'...'}`). */
  answer: unknown;
  /** Milliseconds since the block first rendered (RUNNER-04 will queue this offline in Phase 5). */
  timeMs: number;
}

export function useSubmitResponse(runToken: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitResponseInput): Promise<void> => {
      const { error } = await supabaseAnon.rpc(
        'submit_response' as never,
        {
          p_session_id: input.sessionId,
          p_block_id: input.blockId,
          p_answer: input.answer as unknown as Json,
          p_time_ms: input.timeMs,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      if (runToken) {
        // Invalidate so a refresh-during-runner reads the new authoritative
        // server state for `existingAnswers`. The active runner uses the
        // local Zustand buffer; this invalidation is for the resume path.
        qc.invalidateQueries({ queryKey: ['runner-session', runToken] });
      }
    },
  });
}

// ─── Section 2 — designer-side per-session aggregator (Plan 03.1-04) ─────
//
// `useResponses` + `buildResponseRows` + `ResponseRow` ship the data shape
// that <ResponsesView/> renders in the «Ответы N» tab of the report.
//
// Design (CONTEXT.md GA3 / D-73):
//
//  * Two-tier:
//    - `buildResponseRows(sessions, events, outcomes)` is PURE and testable
//      without `renderHook` ceremony. It does the heavy lifting (sort,
//      device-type mapping, prototype-summary derivation, outcome lookup).
//    - `useResponses(...)` is a thin `useMemo` wrapper that applies the
//      statusFilter via `classifyCompletion` (re-using the Plan 03.1-03
//      helper). No new TanStack Query slot — sessions/events/outcomes are
//      already in scope in ReportShell (loaded by `useDesignerSessions` and
//      `useBlockEvents` per Plan 03.1-02 wiring). Round-tripping again
//      would burn the cache slot and surface the same data; cheaper to
//      derive.
//  * Sort order: `started_at DESC` (newest first), matching SessionList.
//  * Answer-summary depth: prototype-block summary only in Phase 03.1 —
//    other block types render `—` placeholder (deferred to Phase 4, see
//    CONTEXT.md §"Deferred ideas").

/**
 * Discriminated union for the «Устройство» column.
 *
 * The DB column `sessions.device_type` is `string | null`. We narrow it to
 * `'mobile' | 'desktop' | 'tablet'` when the runner wrote one of those
 * literals; any other value (null, '', 'foo') falls back to `'unknown'`
 * which renders as a `<HelpCircle>` icon + "Неизвестное устройство" label.
 */
export type ResponseDeviceType = 'mobile' | 'desktop' | 'tablet' | 'unknown';

/**
 * Outcome surface for the «Результат» column.
 *
 * `'success'` and `'giveup'` come from `outcomes` (classifyOutcome on the
 * session's events). `'incomplete'` is the fallback when the session has no
 * outcome entry — see CONTEXT.md GA3 «Результат» chip semantics.
 */
export type ResponseOutcome = 'success' | 'giveup' | 'incomplete';

/**
 * Per-prototype-block summary surfaced in the «Ответы» column.
 *
 * - `framesVisited`: distinct count of `frame_id`s where `event_type ===
 *   'frame_enter'`.
 * - `durationMs`: last `client_ts` − first `client_ts` across all events
 *   for that session (matches the playback drawer's duration).
 *
 * `null` when the session has zero events — renders as `—` in the UI.
 */
export interface ResponsePrototypeSummary {
  framesVisited: number;
  durationMs: number;
}

/** Row shape consumed by `<ResponsesView/>` — one per session. */
export interface ResponseRow {
  sessionId: string;
  /** ISO string from `sessions.started_at`. UI formats via `date-fns`. */
  startedAt: string;
  deviceType: ResponseDeviceType;
  outcome: ResponseOutcome;
  /** Prototype-block answer summary; `null` when the session has no events. */
  prototypeSummary: ResponsePrototypeSummary | null;
  // Future block-type summaries (e.g. openAnswerText, choiceLabel) land
  // here as additional optional fields. Phase 03.1 ships prototypeSummary
  // only — other block-type summaries deferred to Phase 4.
}

/** Map the DB string into our discriminated union. Cheap, no allocations. */
function normalizeDeviceType(raw: string | null | undefined): ResponseDeviceType {
  if (raw === 'mobile' || raw === 'desktop' || raw === 'tablet') return raw;
  return 'unknown';
}

/**
 * PURE — build one `ResponseRow` per session, sorted by `started_at` DESC.
 *
 * No React, no Supabase, no clock reads. All inputs are passed in; outputs
 * are deterministic given inputs. Easy to unit-test in Vitest without
 * `renderHook`.
 */
export function buildResponseRows(
  sessions: readonly DesignerSession[],
  events: readonly BlockEventRow[],
  outcomes: readonly ClassifyOutcomeResult[],
): ResponseRow[] {
  // Build the outcome lookup once. `sessionId → ('success' | 'giveup')`.
  const outcomeBySession = new Map<string, ResponseOutcome>();
  for (const o of outcomes) outcomeBySession.set(o.sessionId, o.outcome);

  // Group events by session ONCE, so prototype-summary derivation is O(N)
  // not O(N × sessions). frame_enter contributes to `framesVisited`; all
  // events contribute to the duration min/max scan.
  const eventsBySession = new Map<string, BlockEventRow[]>();
  for (const e of events) {
    const list = eventsBySession.get(e.session_id);
    if (list) list.push(e);
    else eventsBySession.set(e.session_id, [e]);
  }

  const rows: ResponseRow[] = sessions.map((s) => {
    const sessionEvents = eventsBySession.get(s.id);
    let prototypeSummary: ResponsePrototypeSummary | null = null;
    if (sessionEvents && sessionEvents.length > 0) {
      // Distinct frame_id under `frame_enter`.
      const visited = new Set<string>();
      let firstTs: string | null = null;
      let lastTs: string | null = null;
      for (const ev of sessionEvents) {
        if (ev.event_type === 'frame_enter' && ev.frame_id !== null) {
          visited.add(ev.frame_id);
        }
        if (firstTs === null || ev.client_ts < firstTs) firstTs = ev.client_ts;
        if (lastTs === null || ev.client_ts > lastTs) lastTs = ev.client_ts;
      }
      const durationMs =
        firstTs && lastTs ? new Date(lastTs).getTime() - new Date(firstTs).getTime() : 0;
      prototypeSummary = {
        framesVisited: visited.size,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      };
    }

    return {
      sessionId: s.id,
      startedAt: s.started_at,
      deviceType: normalizeDeviceType(s.device_type),
      outcome: outcomeBySession.get(s.id) ?? 'incomplete',
      prototypeSummary,
    };
  });

  // Sort by started_at DESC (newest first). ISO strings sort lexicographically
  // in the same order as their timestamps when the format is identical
  // (Z-suffix UTC) — same convention SessionList uses.
  rows.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));

  return rows;
}

/**
 * PURE — apply the «Тип» status filter at the row level.
 *
 * Extracted as a separate helper (rather than inlined into `useResponses`)
 * so Vitest can exercise it without spinning up `renderHook`. The semantics
 * are identical to `filterEventsByStatus` from `session-filter.ts`, but
 * applied to ROWS (one per session) — re-using `classifyCompletion` keeps
 * the classification rules in one place.
 *
 * Fast-paths:
 *   - both flags false → `[]`
 *   - both flags true  → shallow copy of `rows` (preserves reference
 *     inequality so `useMemo` invalidates)
 */
export function applyStatusFilterToRows(
  rows: readonly ResponseRow[],
  sessionsById: ReadonlyMap<string, DesignerSession>,
  events: readonly BlockEventRow[],
  outcomes: readonly ClassifyOutcomeResult[],
  filter: StatusFilter,
): ResponseRow[] {
  if (!filter.completed && !filter.incomplete) return [];
  if (filter.completed && filter.incomplete) return [...rows];

  const result: ResponseRow[] = [];
  for (const row of rows) {
    const status = classifyCompletion(row.sessionId, sessionsById, events, outcomes);
    if (status === 'completed' && filter.completed) result.push(row);
    else if (status === 'incomplete' && filter.incomplete) result.push(row);
  }
  return result;
}

/**
 * React hook — derive the filtered + sorted response rows.
 *
 * NOT a TanStack Query hook — sessions/events/outcomes are already in scope
 * in ReportShell. This is a `useMemo` wrapper over `buildResponseRows` +
 * `applyStatusFilterToRows` so call sites stay ergonomic.
 *
 * @param studyId    Used in the memo key for cache discrimination (future-proofing).
 * @param dateRange  Used in the memo key for cache discrimination (sessions/events
 *                   are already date-filtered upstream; the range here is purely
 *                   informational for invalidation).
 * @param statusFilter The «Тип» filter state (Plan 03.1-03).
 * @param sessions   From `useDesignerSessions(studyId, dateRange)`.
 * @param events     From `useBlockEvents(pvId, blockId, dateRange)`. Pre-filtered
 *                   by the date range upstream.
 * @param outcomes   From `outcomes` memo in ReportShell (per-session classification).
 */
export function useResponses(
  studyId: string | null | undefined,
  dateRange: DateRange,
  statusFilter: StatusFilter,
  sessions: readonly DesignerSession[],
  events: readonly BlockEventRow[],
  outcomes: readonly ClassifyOutcomeResult[],
): ResponseRow[] {
  return useMemo(() => {
    const rows = buildResponseRows(sessions, events, outcomes);
    if (rows.length === 0) return rows;
    const sessionsById = new Map(sessions.map((s) => [s.id, s] as const));
    return applyStatusFilterToRows(rows, sessionsById, events, outcomes, statusFilter);
    // `studyId` and `dateRange` are included to keep the memo key stable
    // across re-renders of the report shell — even though they're not read
    // inside, they let downstream call sites trust the memo's identity.
  }, [
    studyId,
    dateRange?.startISO,
    dateRange?.endISO,
    statusFilter.completed,
    statusFilter.incomplete,
    sessions,
    events,
    outcomes,
  ]);
}
