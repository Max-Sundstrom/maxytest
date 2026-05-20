/**
 * <ReportShell /> — design-system v1 report page (2026-05-17).
 *
 * Source: design-system handoff ADDENDUM-v3 §1 + `js/maxitest-report.jsx`.
 *
 * Layout:
 *   - <ReportTopbar /> (2-row, Report tab active)
 *   - Grid `288px 1fr` below: <ReportSidebar /> + <main canvas>
 *   - Canvas hosts a single focused block-card (Phase 2 ships one prototype
 *     block per study). The block-card contains:
 *       Header row: `4.` + chip + "Figma" title + N ответов
 *       <TaskCallout /> — designer's task_instruction in 18/26 weight-500
 *       4-stat grid: Успешно / Сдались (with people-icons) / Avg / Median time
 *       "Пути" section: <ReportSankey /> with pan/zoom
 *       "Тепловые карты и клики" section: embeds the existing <PrototypeReport />
 *
 * Stats / response counts are now driven by real session aggregates from
 * `useBlockEvents` + `classifyOutcome` (Plan 03-01). Sankey, funnel,
 * time-on-frame, playback drawer remain Plan 03-02..06 territory; this file
 * is the canonical driver-hook call site for the whole report surface.
 *
 * Existing <PrototypeReport /> (heatmap + per-frame stats) is preserved as
 * the body of the "Тепловые карты и клики" section so Phase 2's analytics
 * surface stays accessible while the new design-language summary sits above.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useBlocks } from '@/lib/queries/blocks';
import { useDesignerSessions } from '@/lib/queries/designer-sessions';
import { useFrames, type Frame } from '@/lib/queries/prototypes';
import { useBlockEvents, type BlockEventRow } from '@/lib/queries/block-events';
import { useResponses } from '@/lib/queries/responses';
import { useSurveyResponses, type SurveyResponseRow } from '@/lib/queries/survey-responses';
import { classifyOutcome, type ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { DatePreset, DateRange } from '@/lib/analytics/date-range';
import {
  classifyCompletion,
  filterEventsByStatus,
  type StatusFilter,
} from '@/lib/analytics/session-filter';
import { quantile } from '@/lib/analytics/quantile';
import { transitionGraph } from '@/lib/analytics/transition-graph';
import { funnelSteps } from '@/lib/analytics/funnel-steps';
import type { Block } from '@/lib/blocks/types';
import type {
  ChoiceAnswer,
  ChoiceContent,
  ContextAnswer,
  ContextContent,
  NpsAnswer,
  ScaleAnswer,
  ScaleContent,
  AgreementAnswer,
} from '@/lib/blocks/schemas';
import { choiceAggregate } from '@/lib/analytics/choice-aggregate';
import { scaleStats } from '@/lib/analytics/scale-stats';
import { npsBreakdown } from '@/lib/analytics/nps-breakdown';
import { agreementRate } from '@/lib/analytics/agreement-rate';
import { contextAggregate } from '@/lib/analytics/context-aggregate';
import { supabase } from '@/lib/supabase/auth';
import { AgreementFocusedReport } from './AgreementFocusedReport';
import { ChoiceFocusedReport } from './ChoiceFocusedReport';
import { ContextFocusedReport } from './ContextFocusedReport';
import { NpsFocusedReport } from './NpsFocusedReport';
import { OpenQuestionFocusedReport } from './OpenQuestionFocusedReport';
import { PlaybackDrawer } from './PlaybackDrawer';
import { PrototypeFocusedReport } from './PrototypeFocusedReport';
import { ReportSidebar } from './ReportSidebar';
import { ReportTopbar } from './ReportTopbar';
import { ResponsesView } from './ResponsesView';
import { ScaleFocusedReport } from './ScaleFocusedReport';

// Plan 03-04 — signed-URL TTL for FunnelSection thumbnails. Mirrors
// PrototypeReport.tsx lines 51-52 (private `prototype-renders` bucket
// pattern from Phase 2 B-04). 86 400 s = 24 h matches the heatmap aside
// so a single page-view never needs a re-mint.
const STORAGE_BUCKET = 'prototype-renders';
const SIGNED_URL_TTL_SECONDS = 86_400;

/** Stable empty-array reference for the `useFrames` data default — see
 *  comment on the `frames` line below. */
const EMPTY_FRAMES: Frame[] = [];

export interface ReportShellProps {
  studyId: string;
}

// Block-type categories used by the focused-report router (Plan 04-03 D-97).
// Survey-analytical types feed `useSurveyResponses` and the survey-completion
// path in `classifyCompletion`. Prototype is its own canvas
// (`<PrototypeFocusedReport />`). welcome / thanks / agreement live in the
// runner only — they don't surface as standalone focused-report cards.
const SURVEY_ANALYTICAL_TYPES: ReadonlyArray<Block['type']> = [
  'choice',
  'scale',
  'nps',
  'agreement',
  'context',
  'open_question',
];
const NON_REPORTABLE_TYPES: ReadonlySet<Block['type']> = new Set(['welcome', 'thanks']);

export function ReportShell({ studyId }: ReportShellProps) {
  const { data: blocks = [], isLoading: blocksLoading } = useBlocks(studyId);

  // Phase 2 ships ONE prototype block per study — pick it. Still referenced
  // by the prototype-focused report card (PrototypeFocusedReport props).
  const prototypeBlock = useMemo(() => blocks.find((b: Block) => b.type === 'prototype'), [blocks]);

  // Plan 04-03 D-97 — block-list shown in the sidebar (welcome / thanks
  // never surface as focused cards). Agreement IS reportable (it has an
  // analytics card in 04-04) so we keep it here.
  const reportableBlocks = useMemo(
    () => blocks.filter((b) => !NON_REPORTABLE_TYPES.has(b.type)),
    [blocks],
  );

  // Plan 04-03 — survey-block ids for the SINGLE `useSurveyResponses` slot.
  // `open_question` is conventionally a survey block too (responses table
  // is the canonical storage) so it joins the same round-trip.
  const surveyBlockIds = useMemo(
    () => blocks.filter((b) => SURVEY_ANALYTICAL_TYPES.includes(b.type)).map((b) => b.id),
    [blocks],
  );

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Plan 03.1-02 (GA1 / D-71) — date filter state. `datePreset` drives the
  // sidebar trigger label; `dateRange` is the (startISO,endISO) tuple (or
  // null = «Всё время») threaded through every analytics query. Both are
  // owned by ReportShell so the sidebar stays a controlled component and
  // a re-mount of the canvas doesn't reset the user's filter.
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const onDateChange = useCallback((range: DateRange, preset: DatePreset) => {
    setDateRange(range);
    setDatePreset(preset);
  }, []);

  // Plan 03.1-03 (GA2 / D-72) — «Тип» (Завершённые / Неполные) filter state.
  // Single source of truth for the whole report — the filter narrows
  // `filteredEvents` (see below), which drives header tiles, sankey, funnel,
  // and PlaybackDrawer in lockstep. Default matches the prior hardcoded
  // sidebar mock: «Завершённые» checked, «Неполные» unchecked.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>({
    completed: true,
    incomplete: false,
  });

  // Plan 03-06 — drawer that closes ROADMAP SC5 (ANALYTICS-09). State lives
  // here so the «Смотреть сессии» CTA in FocusedBlockCard can toggle it
  // (D-64). PlaybackDrawer's local state (selectedSessionId, filter) is
  // intentionally unmounted on close so the next open starts fresh.
  const [playbackOpen, setPlaybackOpen] = useState(false);

  // Plan 03.1-04 — view-mode toggle («Сводный отчёт / Ответы N»). State lives
  // here so the sidebar PillTab pair is a controlled component and re-mounts
  // of the canvas don't reset the user's selection. `selectedSessionId` is
  // also lifted here so ResponsesView row-clicks can pre-select the drawer
  // (controlled mode on PlaybackDrawer — see Task 3 §C).
  const [viewMode, setViewMode] = useState<'aggregate' | 'responses'>('aggregate');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Plan 04-03 D-97 — focused-block resolution. Designer-chosen activeBlockId
  // wins; otherwise default to the prototype block; otherwise the first
  // analytical block in study order; otherwise null (empty-state copy).
  const focusedBlock = useMemo<Block | null>(() => {
    if (activeBlockId) {
      const picked = blocks.find((b) => b.id === activeBlockId);
      if (picked) return picked;
    }
    if (prototypeBlock) return prototypeBlock;
    const firstAnalytical = blocks.find((b) => SURVEY_ANALYTICAL_TYPES.includes(b.type));
    return firstAnalytical ?? null;
  }, [activeBlockId, prototypeBlock, blocks]);

  const pvId = (prototypeBlock?.content as { prototype_version_id?: string } | undefined)
    ?.prototype_version_id;
  const finishFrameIds = useMemo(
    () =>
      ((prototypeBlock?.content as { finish_frame_ids?: string[] } | undefined)?.finish_frame_ids ??
        []) as string[],
    [prototypeBlock],
  );
  const successPath = useMemo(
    () =>
      ((prototypeBlock?.content as { success_path?: string[] } | undefined)?.success_path ??
        []) as string[],
    [prototypeBlock],
  );
  const startingFrameId = (prototypeBlock?.content as { starting_frame_id?: string } | undefined)
    ?.starting_frame_id;
  const { data: framesData } = useFrames(pvId);
  // Stable default — inline `?? []` would mint a new array each render and
  // cause every effect that has `frames` in its deps to re-fire infinitely
  // (Maximum update depth exceeded — UAT 2026-05-18).
  const frames = framesData ?? EMPTY_FRAMES;

  // Phase 3 (Plan 03-01) — real header aggregates driven by the
  // block-scoped event stream. `useBlockEvents` fires once per (pvId,
  // blockId) tuple; downstream Plans 02/04/05/06 will read the same
  // cached rows via TanStack Query, so this hook is the canonical
  // analytics driver for the whole report.
  const { data: allEvents = [] } = useBlockEvents(pvId, prototypeBlock?.id, dateRange);

  // Plan 04-03 — single TanStack Query slot for ALL survey-block responses
  // (Anti-pattern 1: no N+1 per-block queries). Feeds Plan 04-04 focused-
  // report cards AND the L-1 survey-completion path inside `classifyCompletion`
  // below. Stays cold (`enabled: false`) until there is at least one survey
  // block in the test.
  const { data: surveyResponsesAll = [] } = useSurveyResponses(studyId, surveyBlockIds, dateRange);

  // Plan 03.1-03 — sessions query feeds the «Тип» (Завершённые / Неполные)
  // classifier via the `sessions.status` column (CONTEXT.md GA2 / D-72
  // condition 1). Same dateRange threading as PlaybackDrawer so both views
  // narrow in lockstep.
  const { data: sessions = [] } = useDesignerSessions(studyId, dateRange);
  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.id, s] as const)), [sessions]);

  // ── B2 ordering lock (Plan 03.1-03) — non-negotiable memo chain. ───────
  //
  // outcomesAll → derived from UNFILTERED `allEvents` so the classifier
  // sees each session's COMPLETE event timeline. Applying the status filter
  // BEFORE computing outcomes would corrupt per-session success/giveup
  // classification (events from sessions excluded by an incomplete-only
  // filter would never get to contribute to a sibling session's outcome
  // and vice versa). outcomesAll is therefore filter-UNAWARE and is the
  // canonical input to filterEventsByStatus condition 3.
  const outcomesAll = useMemo<ClassifyOutcomeResult[]>(() => {
    const bySession = new Map<string, BlockEventRow[]>();
    for (const e of allEvents) {
      const list = bySession.get(e.session_id) ?? [];
      list.push(e);
      bySession.set(e.session_id, list);
    }
    const results: ClassifyOutcomeResult[] = [];
    for (const evts of bySession.values()) {
      const r = classifyOutcome(evts, finishFrameIds);
      if (r !== null) results.push(r);
    }
    return results;
  }, [allEvents, finishFrameIds]);

  // filteredEvents → narrow `allEvents` to the sessions whose classification
  // is permitted by `statusFilter`. Inputs are exactly (allEvents,
  // sessionsById, outcomesAll, statusFilter) — see session-filter.ts
  // header for the three OR conditions per CONTEXT.md GA2 / D-72.
  const filteredEvents = useMemo(
    () => filterEventsByStatus(allEvents, sessionsById, outcomesAll, statusFilter),
    [allEvents, sessionsById, outcomesAll, statusFilter],
  );

  // outcomes → filter-AWARE classification, derived from `filteredEvents`.
  // This is the variable that the rest of ReportShell consumes (header
  // tiles, sankey, funnel, PlaybackDrawer). Existing call sites stay
  // stable — only the derivation input flips from `allEvents` to
  // `filteredEvents`.
  const outcomes = useMemo<ClassifyOutcomeResult[]>(() => {
    const bySession = new Map<string, BlockEventRow[]>();
    for (const e of filteredEvents) {
      const list = bySession.get(e.session_id) ?? [];
      list.push(e);
      bySession.set(e.session_id, list);
    }
    const results: ClassifyOutcomeResult[] = [];
    for (const evts of bySession.values()) {
      const r = classifyOutcome(evts, finishFrameIds);
      if (r !== null) results.push(r);
    }
    return results;
  }, [filteredEvents, finishFrameIds]);

  // Plan 03.1-04 — per-response rows for the «Ответы N» view-mode. Pure
  // derivation over data already in scope (sessions + filteredEvents +
  // outcomes); no new TanStack Query slot. The hook applies the «Тип»
  // status filter at the row level, matching the dataset that drives the
  // aggregate view, so the count next to the sidebar tab always equals the
  // number of rows in the table when the user switches to it.
  const responseRows = useResponses(
    studyId,
    dateRange,
    statusFilter,
    sessions,
    filteredEvents,
    outcomes,
    blocks,
    surveyResponsesAll,
  );
  const responsesCount = responseRows.length;

  // Header stats from outcomes. `responses` = valid sessions (D-39 — may
  // differ from sidebar's «Завершено» which counts every test session
  // regardless of prototype block reach). Avg + Median time use the full
  // duration distribution; `quantile` does linear interpolation on the
  // already-sorted ascending array.
  const stats = useMemo(() => {
    const valid = outcomes.length;
    const successCount = outcomes.filter((o) => o.outcome === 'success').length;
    const durations = outcomes.map((o) => o.durationMs).sort((a, b) => a - b);
    const avgMs =
      durations.length === 0 ? 0 : durations.reduce((a, b) => a + b, 0) / durations.length;
    const medianMs = quantile(durations, 0.5);
    return {
      responses: valid,
      successCount,
      gaveUpCount: valid - successCount,
      avgTimeS: (avgMs / 1000).toFixed(2),
      medianTimeS: (medianMs / 1000).toFixed(2),
    };
  }, [outcomes]);

  // Plan 03.1-03 — sidebar «Тип» counts are filter-UNAWARE labels next to
  // the checkboxes. They reflect the absolute population of «Завершённые»
  // vs «Неполные» in the current date-range / event window so the designer
  // can tell at a glance how much each toggle would reveal. The numbers
  // are derived from the same union of sources as the classifier itself:
  // sessionsById (covers sessions with no events at all) ∪ outcomesAll
  // (covers sessions that only exist as event rows) ∪ task_finish event
  // session_ids (covers the race window) ∪ surveyResponsesAll session_ids
  // (covers Plan 04-03 L-1: survey-only tests have no prototype events
  // but still need their sessions to enter the count union).
  const sidebarCounts = useMemo(() => {
    const sessionIds = new Set<string>();
    for (const id of sessionsById.keys()) sessionIds.add(id);
    for (const o of outcomesAll) sessionIds.add(o.sessionId);
    for (const e of allEvents) sessionIds.add(e.session_id);
    for (const r of surveyResponsesAll) sessionIds.add(r.session_id);
    let completed = 0;
    let incomplete = 0;
    for (const id of sessionIds) {
      // Plan 04-03 L-1 — pass blocks + survey responses so survey-only
      // sessions classify correctly. For prototype-only tests
      // requiredBlockIds.size === 0 → survey-path is a no-op.
      const kind = classifyCompletion(
        id,
        sessionsById,
        allEvents,
        outcomesAll,
        blocks,
        surveyResponsesAll,
      );
      if (kind === 'completed') completed += 1;
      else incomplete += 1;
    }
    return { completed, incomplete };
  }, [sessionsById, outcomesAll, allEvents, surveyResponsesAll, blocks]);

  // Plan 04-03 — validSessionIds is the filter-AWARE set of session IDs
  // that are allowed to contribute to focused-report cards (aggregators
  // in 04-04 consume it as the denominator + as the dedup key).
  //
  // Composition:
  //   1. Every session in `outcomes` (prototype-completed AND passing the
  //      «Тип» filter — outcomes is filter-AWARE per the B2 chain above).
  //   2. Every session that has at least one survey response AND whose
  //      classification matches `statusFilter`. We re-classify here using
  //      the L-1 path so survey-only sessions enter the set.
  //
  // B2 ordering lock is preserved: outcomesAll (filter-UNAWARE) feeds
  // filterEventsByStatus → outcomes (filter-AWARE) → validSessionIds.
  const validSessionIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of outcomes) s.add(o.sessionId);
    for (const r of surveyResponsesAll) {
      if (s.has(r.session_id)) continue; // already admitted via outcomes
      const c = classifyCompletion(
        r.session_id,
        sessionsById,
        filteredEvents,
        outcomesAll,
        blocks,
        surveyResponsesAll,
      );
      if (
        (c === 'completed' && statusFilter.completed) ||
        (c === 'incomplete' && statusFilter.incomplete)
      ) {
        s.add(r.session_id);
      }
    }
    return s;
  }, [
    outcomes,
    surveyResponsesAll,
    sessionsById,
    filteredEvents,
    outcomesAll,
    blocks,
    statusFilter,
  ]);

  // Plan 04-03 — per-block response count for the sidebar block-list.
  // Filter-AWARE: only sessions in `validSessionIds` contribute. Plan 04-04
  // will render these counts next to each block row.
  const responseCountByBlock = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of surveyResponsesAll) {
      if (validSessionIds.has(r.session_id)) {
        m[r.block_id] = (m[r.block_id] ?? 0) + 1;
      }
    }
    return m;
  }, [surveyResponsesAll, validSessionIds]);

  // Plan 04-04 — per-block responses index for the focused-report cards.
  // Filter-AWARE: same validSessionIds gate as responseCountByBlock above.
  // Each card looks its block up here and feeds the result to its aggregator.
  const responsesByBlock = useMemo(() => {
    const m = new Map<string, SurveyResponseRow[]>();
    for (const r of surveyResponsesAll) {
      if (!validSessionIds.has(r.session_id)) continue;
      const list = m.get(r.block_id) ?? [];
      list.push(r);
      m.set(r.block_id, list);
    }
    return m;
  }, [surveyResponsesAll, validSessionIds]);

  // Plan 04-04 — focused-block position (1-indexed) for the card header.
  const focusedBlockPosition = useMemo(() => {
    if (!focusedBlock) return 0;
    const idx = blocks.findIndex((b) => b.id === focusedBlock.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [focusedBlock, blocks]);

  // Plan 04-04 — filters-active flag (drives LowNGateCard «Сбросить фильтры» CTA).
  // True when date range is set OR status filter differs from the default
  // (completed: true, incomplete: false).
  const filtersActive = dateRange !== null || !statusFilter.completed || statusFilter.incomplete;

  // Plan 04-04 — reset-filters helper passed to focused-report cards.
  // Restores defaults — useCallback so the cards' memo identity is stable.
  const onResetFilters = useCallback(() => {
    setDateRange(null);
    setDatePreset('all');
    setStatusFilter({ completed: true, incomplete: false });
  }, []);

  // D-35 — счётчики Успешно / Сдались скрываются, когда у блока нет ни
  // finish_frame_ids, ни success_path. N ответов + Avg + Median остаются.
  const showOutcomeCounters = finishFrameIds.length > 0 || successPath.length > 0;

  // Phase 3 (Plan 03-02) — sankey transition graph derived from same cached
  // events. Mode toggle state lives here so re-renders of FocusedBlockCard
  // don't reset the user's choice. `transitionGraph` is pure; useMemo deps
  // are exactly the 5 inputs that influence the output (D-42 + D-40 + D-43).
  const [sankeyMode, setSankeyMode] = useState<'first' | 'all'>('first');
  const frameNames = useMemo(
    () => new Map(frames.map((f) => [f.frame_id, f.name] as const)),
    [frames],
  );
  const sankey = useMemo(
    () =>
      transitionGraph(filteredEvents, {
        mode: sankeyMode,
        thresholdPercent: 5,
        validSessionCount: outcomes.length,
        finishFrameIds,
        outcomes,
        frameNames,
      }),
    [filteredEvents, sankeyMode, outcomes, finishFrameIds, frameNames],
  );

  // Plan 03-04 — success-path funnel. Forgiving semantics (D-50); empty
  // success_path → []  (D-53 — section will hide). Shares the same
  // useBlockEvents cache slot as ReportShell's header tiles + the sankey,
  // so this is a derived useMemo with zero additional network cost.
  // Plan 03.1-03 — input is `filteredEvents` so funnel narrows in lockstep
  // with the «Тип» filter.
  const funnel = useMemo(
    () => funnelSteps(filteredEvents, successPath, outcomes.length),
    [filteredEvents, successPath, outcomes.length],
  );

  // Plan 03-04 — signed URLs for FunnelSection thumbnails. Mirrors
  // PrototypeReport.tsx lines 149-178 (designer-side mint against the
  // PRIVATE `prototype-renders` bucket). We mint only the paths referenced
  // by `success_path` so a long prototype doesn't pay for funnel-thumbnail
  // signed-URLs it won't render. Known limitation (plan §known_limitations):
  // when both this effect AND PrototypeReport mount we issue two parallel
  // createSignedUrls calls for overlapping paths — benign, deferred to
  // Phase 8 polish (lift signedUrls to ReportShell as the single owner).
  const [funnelSignedUrls, setFunnelSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (successPath.length === 0 || frames.length === 0) {
      setFunnelSignedUrls({});
      return;
    }
    const framesById = new Map(frames.map((f) => [f.frame_id, f] as const));
    const paths = Array.from(
      new Set(
        successPath
          .flatMap((frameId) => {
            const f = framesById.get(frameId);
            return f ? [f.render_path_1x, f.render_path_2x] : [];
          })
          .filter(Boolean),
      ),
    );
    if (paths.length === 0) return;

    let aborted = false;
    void supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (aborted || error || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.path && row.signedUrl) {
            map[row.path] = row.signedUrl;
          }
        }
        setFunnelSignedUrls(map);
      });

    return () => {
      aborted = true;
    };
    // Re-mint when the success_path changes OR the frame catalogue swaps.
    // We depend on `pvId` (stable string) + `frames.length` (primitive) +
    // memoized `successPath` — NOT on the `frames` array reference, which
    // would refire on every render that mints a new default and cause an
    // infinite update loop (Maximum update depth — UAT 2026-05-18).
  }, [successPath, pvId, frames.length]);

  return (
    <div
      style={{
        height: '100dvh',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <ReportTopbar
        studyId={studyId}
        blockCount={Math.max(0, blocks.length)}
        responseCount={stats.responses}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '288px 1fr',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <ReportSidebar
          blocks={reportableBlocks}
          activeBlockId={focusedBlock?.id ?? null}
          onSelectBlock={setActiveBlockId}
          completedCount={sidebarCounts.completed}
          incompleteCount={sidebarCounts.incomplete}
          dateRange={dateRange}
          datePreset={datePreset}
          onDateChange={onDateChange}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          responsesCount={responsesCount}
          responseCountByBlock={responseCountByBlock}
        />

        <main
          data-testid="report-canvas"
          style={{
            padding: '24px 32px 64px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            minWidth: 0,
          }}
        >
          {blocksLoading ? (
            <SkeletonCard />
          ) : focusedBlock === null ? (
            <EmptyReportState />
          ) : viewMode === 'aggregate' ? (
            // Plan 04-03 — focused-block router. Prototype keeps the full
            // sankey + funnel + heatmap canvas via the extracted
            // PrototypeFocusedReport. Survey blocks land in Plan 04-04 as
            // their own focused cards; for now we show a placeholder.
            focusedBlock.type === 'prototype' && prototypeBlock ? (
              <PrototypeFocusedReport
                block={prototypeBlock}
                responses={stats.responses}
                successCount={stats.successCount}
                gaveUpCount={stats.gaveUpCount}
                avgTimeS={stats.avgTimeS}
                medianTimeS={stats.medianTimeS}
                showOutcomeCounters={showOutcomeCounters}
                frames={frames}
                startingFrameId={startingFrameId}
                studyId={studyId}
                sankey={sankey}
                sankeyMode={sankeyMode}
                onSankeyModeChange={setSankeyMode}
                successPath={successPath}
                funnel={funnel}
                funnelSignedUrls={funnelSignedUrls}
                validSessionCount={outcomes.length}
                onOpenPlayback={() => setPlaybackOpen(true)}
                dateRange={dateRange}
              />
            ) : (
              // Plan 04-04 — focused-report router for the 6 survey-analytical
              // block types. Each card consumes its respective Wave 3
              // aggregator and applies the low-N gate via LowNGateCard.
              // ReportShell is the designer-side host — `publicMode` is NOT
              // passed (defaults to false); PublicReportShell (Plan 04-07)
              // will pass `publicMode={true}` for the M-2 closure.
              <FocusedSurveyCard
                block={focusedBlock}
                position={focusedBlockPosition}
                responsesByBlock={responsesByBlock}
                validSessionIds={validSessionIds}
                filtersActive={filtersActive}
                onResetFilters={onResetFilters}
              />
            )
          ) : (
            // Plan 03.1-04 — «Ответы N» view-mode. Clicking a row opens the
            // PlaybackDrawer pre-selected to that session via the controlled-
            // mode props on PlaybackDrawer (Task 3 §C).
            <ResponsesView
              rows={responseRows}
              onRowClick={(id) => {
                setSelectedSessionId(id);
                setPlaybackOpen(true);
              }}
            />
          )}
        </main>
      </div>

      {/* Plan 03-06 — Playback drawer (ANALYTICS-09, ROADMAP SC5).
          Conditionally mounted so `useDesignerSessions` stays cold until
          the designer asks for it; closing unmounts → next open starts
          fresh per D-64. */}
      {playbackOpen && prototypeBlock && pvId ? (
        <PlaybackDrawer
          open={playbackOpen}
          onOpenChange={setPlaybackOpen}
          studyId={studyId}
          blockId={prototypeBlock.id}
          prototypeVersionId={pvId}
          frames={frames}
          outcomes={outcomes}
          dateRange={dateRange}
          selectedSessionId={selectedSessionId}
          onSelectedSessionIdChange={setSelectedSessionId}
        />
      ) : null}
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────

/**
 * Plan 04-04 focused-report router for the 6 survey-analytical block types.
 *
 * Switches on `block.type` and renders the appropriate FocusedReport card,
 * after deriving the corresponding aggregator output from `responsesByBlock`.
 * Each card internally applies the low-N gate via <LowNGateCard /> — this
 * router only orchestrates the type-to-component mapping.
 *
 * B2 ordering lock preserved: `validSessionIds` is passed through unchanged;
 * no card re-derives it. `responsesByBlock` is already filter-AWARE upstream.
 *
 * Designer-side ReportShell consumes this without passing `publicMode` —
 * defaults flow through. Plan 04-07 PublicReportShell will pass
 * `publicMode={true}` for the M-2 closure on each FocusedReport.
 */
function FocusedSurveyCard({
  block,
  position,
  responsesByBlock,
  validSessionIds,
  filtersActive,
  onResetFilters,
}: {
  block: Block;
  position: number;
  responsesByBlock: ReadonlyMap<string, SurveyResponseRow[]>;
  validSessionIds: ReadonlySet<string>;
  filtersActive: boolean;
  onResetFilters: () => void;
}): JSX.Element {
  const responsesForBlock = responsesByBlock.get(block.id) ?? [];
  const validSessionCount = validSessionIds.size;

  switch (block.type) {
    case 'choice': {
      const stats = choiceAggregate(
        block.content as ChoiceContent,
        responsesForBlock as unknown as { session_id: string; answer: ChoiceAnswer }[],
      );
      return (
        <ChoiceFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          onResetFilters={onResetFilters}
        />
      );
    }
    case 'scale': {
      const content = block.content as ScaleContent;
      const stats = scaleStats(
        content.points,
        responsesForBlock as unknown as { session_id: string; answer: ScaleAnswer }[],
      );
      return (
        <ScaleFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          onResetFilters={onResetFilters}
        />
      );
    }
    case 'nps': {
      const stats = npsBreakdown(
        responsesForBlock as unknown as { session_id: string; answer: NpsAnswer }[],
      );
      return (
        <NpsFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          onResetFilters={onResetFilters}
        />
      );
    }
    case 'agreement': {
      const stats = agreementRate(
        responsesForBlock as unknown as {
          session_id: string;
          answer: Partial<AgreementAnswer>;
        }[],
        validSessionIds,
      );
      return (
        <AgreementFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          onResetFilters={onResetFilters}
        />
      );
    }
    case 'context': {
      const stats = contextAggregate(
        block.content as ContextContent,
        responsesForBlock as unknown as { session_id: string; answer: Partial<ContextAnswer> }[],
      );
      return (
        <ContextFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          onResetFilters={onResetFilters}
        />
      );
    }
    case 'open_question':
      return (
        <OpenQuestionFocusedReport
          block={block}
          responses={responsesForBlock}
          validSessionIds={validSessionIds}
          position={position}
          filtersActive={filtersActive}
          onResetFilters={onResetFilters}
        />
      );
    default:
      // welcome / thanks / agreement-as-non-analytical / unknown types — the
      // sidebar filter normally hides these, but defensive fall-through keeps
      // the canvas from going blank if a designer somehow surfaces one.
      return <EmptyReportState />;
  }
}

function SkeletonCard() {
  return (
    <div
      style={{
        height: 320,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        opacity: 0.6,
      }}
    />
  );
}

function EmptyReportState() {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--bg-card)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 'var(--radius)',
      }}
    >
      <h2
        style={{
          font: '500 17px/24px var(--font-sans)',
          color: 'var(--text-1)',
          margin: 0,
        }}
      >
        У этого теста пока нет аналитических блоков
      </h2>
      <p
        style={{
          font: '400 13.5px/20px var(--font-sans)',
          color: 'var(--text-2)',
          margin: '6px 0 0',
        }}
      >
        Добавьте блок «Figma-прототип» или любой опросный блок в конструкторе — пути, графики и
        тепловые карты появятся здесь.
      </p>
    </div>
  );
}
