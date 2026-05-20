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
import type { SurveyResponseRow } from '@/lib/queries/survey-responses';
import type { ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { DateRange } from '@/lib/analytics/date-range';
import { classifyCompletion, type StatusFilter } from '@/lib/analytics/session-filter';
import type { Block } from '@/lib/blocks/types';
import type {
  AgreementAnswer,
  ChoiceAnswer,
  ChoiceContent,
  ContextAnswer,
  ContextContent,
  NpsAnswer,
  ScaleAnswer,
  ScaleContent,
} from '@/lib/blocks/schemas';

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

/**
 * Phase 4 / Plan 04-04 D-98 — per-block answer summary line for the
 * vertical-stack rendering of the «Ответы» column in ResponsesView.
 *
 * `blockLines[]` is the CANONICAL source of truth for the column. One
 * entry per non-skipped, non-welcome/thanks block in the test, ordered by
 * `block.position`. Skipped blocks contribute NO entry (D-98 — em-dash is
 * NOT rendered for missing answers; the gap conveys the same info).
 *
 * Plan 04-04 — line text format (D-98 contract):
 *   - choice (single)  → «⚫ Выбор: Мобильный»
 *   - choice (multi)   → «⚫ Выбор: А, Б, В» (truncated to 80 chars)
 *   - scale            → «⊳ Шкала: 4/5»
 *   - nps              → «♡ NPS: 9 (промоутер)»
 *   - agreement        → «✓ Согласие» | «— Не согласился»
 *   - context          → «👤 Контекст: 25–34 · Опыт 4 · UX-дизайнер» (enabled only)
 *   - open_question    → first 80 chars
 *   - prototype        → «4 фрейма · 1.2 мин» (legacy formatter)
 */
export interface ResponseBlockLine {
  blockId: string;
  /** 0-indexed block.position used for stable display order. */
  position: number;
  type: string;
  /** Display-ready line (Russian, ellipsis-truncated where applicable). */
  line: string;
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
  /**
   * Phase 4 D-98 — per-block summary stack. Plan 04-04 ResponsesView renders
   * one line per entry as a vertical stack inside the «Ответы» column. Empty
   * array → «Нет ответов» fallback. Always populated by `buildResponseRows`
   * (may be empty if the session answered nothing AND prototype has no
   * events).
   */
  blockLines: ResponseBlockLine[];
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
 *
 * Plan 04-04 Task 6 extension — accepts `blocks` + `surveyResponses` so the
 * per-row `blockLines[]` stack can be derived in the same pure transform.
 * Phase 03.1 callers that only have sessions + events + outcomes can pass
 * empty `[]` for both (back-compat path: `blockLines` becomes prototype-only
 * or empty).
 */
export function buildResponseRows(
  sessions: readonly DesignerSession[],
  events: readonly BlockEventRow[],
  outcomes: readonly ClassifyOutcomeResult[],
  blocks: readonly Block[] = [],
  surveyResponses: readonly SurveyResponseRow[] = [],
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

  // Plan 04-04 — group survey responses by (session_id, block_id) lookup so
  // per-row line derivation is O(blocks) rather than O(blocks × responses).
  const surveyBySession = new Map<string, Map<string, SurveyResponseRow>>();
  for (const r of surveyResponses) {
    let perSession = surveyBySession.get(r.session_id);
    if (!perSession) {
      perSession = new Map<string, SurveyResponseRow>();
      surveyBySession.set(r.session_id, perSession);
    }
    perSession.set(r.block_id, r);
  }

  // Order blocks by position once so every row sees the same stack order.
  const orderedBlocks = [...blocks].sort((a, b) => a.position - b.position);

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

    // Plan 04-04 D-98 — build the per-block summary stack in block.position
    // order. Skipped blocks (no response AND not the prototype) contribute
    // NO entry. welcome/thanks are skipped entirely — they have no
    // analytical answer to summarize.
    const sessionResponses = surveyBySession.get(s.id);
    const blockLines: ResponseBlockLine[] = [];
    for (const block of orderedBlocks) {
      if (block.type === 'welcome' || block.type === 'thanks') continue;
      const resp = sessionResponses?.get(block.id);
      const line = summarizeBlockAnswer(block, resp, prototypeSummary);
      if (line !== null) {
        blockLines.push({
          blockId: block.id,
          position: block.position,
          type: block.type,
          line,
        });
      }
    }

    return {
      sessionId: s.id,
      startedAt: s.started_at,
      deviceType: normalizeDeviceType(s.device_type),
      outcome: outcomeBySession.get(s.id) ?? 'incomplete',
      prototypeSummary,
      blockLines,
    };
  });

  // Sort by started_at DESC (newest first). ISO strings sort lexicographically
  // in the same order as their timestamps when the format is identical
  // (Z-suffix UTC) — same convention SessionList uses.
  rows.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));

  return rows;
}

/**
 * PURE — per-block answer summarizer. Returns the one-line string per D-98
 * contract OR `null` when the session didn't answer this block (skipped) AND
 * there's no implicit fallback (e.g. prototype with no events).
 *
 * Non-export: only `buildResponseRows` consumes it; co-located so the format
 * contract is testable in isolation if Phase 5 wants per-line snapshots.
 */
function summarizeBlockAnswer(
  block: Block,
  resp: SurveyResponseRow | undefined,
  prototypeSummary: ResponsePrototypeSummary | null,
): string | null {
  switch (block.type) {
    case 'choice': {
      const content = block.content as ChoiceContent;
      const a = resp?.answer as ChoiceAnswer | undefined;
      if (!a) return null;
      if (
        content.mode === 'single' &&
        typeof a.selectedId === 'string' &&
        a.selectedId.length > 0
      ) {
        const opt = content.options.find((o) => o.id === a.selectedId);
        return `⚫ Выбор: ${opt?.label ?? a.selectedId}`;
      }
      if (content.mode === 'multi' && Array.isArray(a.selectedIds) && a.selectedIds.length > 0) {
        const labels = a.selectedIds.map(
          (id) => content.options.find((o) => o.id === id)?.label ?? id,
        );
        const text = labels.join(', ');
        return `⚫ Выбор: ${text.length > 80 ? text.slice(0, 77) + '…' : text}`;
      }
      return null;
    }
    case 'scale': {
      const content = block.content as ScaleContent;
      const a = resp?.answer as ScaleAnswer | undefined;
      if (typeof a?.value !== 'number') return null;
      return `⊳ Шкала: ${a.value}/${content.points}`;
    }
    case 'nps': {
      const a = resp?.answer as NpsAnswer | undefined;
      if (typeof a?.score !== 'number') return null;
      const cat = a.score <= 6 ? 'детрактор' : a.score <= 8 ? 'нейтрал' : 'промоутер';
      return `♡ NPS: ${a.score} (${cat})`;
    }
    case 'agreement': {
      const a = resp?.answer as Partial<AgreementAnswer> | undefined;
      if (a?.agreed === true) return '✓ Согласие';
      if (resp) return '— Не согласился';
      return null;
    }
    case 'context': {
      const content = block.content as ContextContent;
      const a = resp?.answer as Partial<ContextAnswer> | undefined;
      if (!a) return null;
      const parts: string[] = [];
      if (content.age_question?.enabled && typeof a.age === 'string') {
        const opt = content.age_question.options.find((o) => o.id === a.age);
        parts.push(opt?.label ?? a.age);
      }
      if (content.experience_question?.enabled && typeof a.experience === 'number') {
        parts.push(`Опыт ${a.experience}`);
      }
      if (content.role_question?.enabled && typeof a.role === 'string' && a.role.length > 0) {
        parts.push(a.role);
      }
      if (parts.length === 0) return null;
      return `👤 Контекст: ${parts.join(' · ')}`;
    }
    case 'open_question': {
      const a = resp?.answer as { text?: string } | undefined;
      if (typeof a?.text !== 'string' || a.text.length === 0) return null;
      return a.text.length > 80 ? a.text.slice(0, 77) + '…' : a.text;
    }
    case 'prototype': {
      if (!prototypeSummary) return null;
      const { framesVisited, durationMs } = prototypeSummary;
      const framesWord = framesVisited === 1 ? 'фрейм' : 'фреймов';
      const minutes = (durationMs / 60_000).toFixed(1);
      return `${framesVisited} ${framesWord} · ${minutes} мин`;
    }
    default:
      return null;
  }
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
  /**
   * Plan 04-04 Task 6 — per-block summary lines are derived from these two
   * inputs. Phase 03.1 callers that didn't have them defaulted to `[]` /
   * `[]` via the buildResponseRows back-compat path.
   */
  blocks: readonly Block[] = [],
  surveyResponses: readonly SurveyResponseRow[] = [],
): ResponseRow[] {
  return useMemo(() => {
    const rows = buildResponseRows(sessions, events, outcomes, blocks, surveyResponses);
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
    blocks,
    surveyResponses,
  ]);
}
