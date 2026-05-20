/**
 * <PublicReportShell /> — anonymous-mode wrapper around the focused-report
 * cards shipped in Plan 04-04.
 *
 * Plan 04-07 Task 5. Mounted by the `_public.share.$token` route after the
 * loader has confirmed `read_share_report(token)` returns a non-null blob.
 *
 * Surfaces ONLY aggregate views:
 *   - sidebar block-list + DateRangeControl + «Тип» (Завершённые / Неполные)
 *     checkboxes — same controls a designer sees so a public viewer can
 *     debug «почему пусто?» the same way (CONTEXT.md D-102).
 *   - One focused-report card per the selected block (Plan 04-04 cards).
 *   - LowNGateCard with `publicMode={true}` whenever validSessionCount < 5
 *     (CONTEXT.md D-103 + M-2 closure: hides exact N from viewers).
 *   - Per-block open-answer suppression honored via the `hideOpenAnswers`
 *     prop on ChoiceFocusedReport / ContextFocusedReport /
 *     OpenQuestionFocusedReport (Plan 04-04 already accepts this prop;
 *     Plan 04-06 ships the designer-side `open_answer_visibility` map).
 *
 * Does NOT mount:
 *   - ResponsesView (PillTab «Ответы N») — public surface is aggregate-only.
 *   - PlaybackDrawer — never reachable from this tree.
 *   - ShareReportButton / CsvDownloadButton — designer-only surfaces.
 *   - Any data fetched via `@/lib/supabase/auth` — the entire component
 *     tree is anon-tier (ESLint two-Supabase-client boundary enforces).
 *
 * Data source: a single anon-callable `read_share_report` RPC round-trip
 * via `supabaseAnon`. Returns the jsonb blob defined in migration 00020:
 *   { title, open_answer_visibility, blocks, sessions, responses, events }.
 *
 * "Powered by Maxytest" footer per CONTEXT.md §specifics.
 *
 * Hex literals: NONE — every color uses CSS vars from
 * apps/web/src/styles/tokens.css so skin-swaps (paper / white / dark) work
 * out of the box.
 */

import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabaseAnon } from '@/lib/supabase/anon';
import { blockVisualOf } from '@/lib/blocks/visual';
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
import { choiceAggregate } from '@/lib/analytics/choice-aggregate';
import { scaleStats } from '@/lib/analytics/scale-stats';
import { npsBreakdown } from '@/lib/analytics/nps-breakdown';
import { agreementRate } from '@/lib/analytics/agreement-rate';
import { contextAggregate } from '@/lib/analytics/context-aggregate';
import { LOW_N_THRESHOLD, passLowNGate } from '@/lib/analytics/low-n-gate';
import type { DatePreset, DateRange } from '@/lib/analytics/date-range';
import { DateRangeControl } from '@/components/studio/report/DateRangeControl';
import { ChoiceFocusedReport } from '@/components/studio/report/ChoiceFocusedReport';
import { ScaleFocusedReport } from '@/components/studio/report/ScaleFocusedReport';
import { NpsFocusedReport } from '@/components/studio/report/NpsFocusedReport';
import { AgreementFocusedReport } from '@/components/studio/report/AgreementFocusedReport';
import { ContextFocusedReport } from '@/components/studio/report/ContextFocusedReport';
import { OpenQuestionFocusedReport } from '@/components/studio/report/OpenQuestionFocusedReport';
import { LowNGateCard } from '@/components/studio/report/LowNGateCard';

// ── Wire-shapes consumed from read_share_report jsonb blob ─────────────────
//
// These mirror the SELECT projections in migration 00020 (NOT the raw
// table types). We deliberately re-declare them here as a structural
// contract so a future migration change can be detected at compile time.
//
// Keep in sync with supabase/migrations/00020_phase4_read_share_report.sql.

interface ShareSessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  device_class: string | null;
  status: string | null;
}

interface ShareResponseRow {
  session_id: string;
  block_id: string;
  answer: unknown;
  time_ms: number | null;
  submitted_at: string;
}

interface ShareEventRow {
  id: string;
  session_id: string;
  block_id: string | null;
  event_type: string;
  client_ts: string;
  seq: number;
  frame_id: string | null;
  x: number | null;
  y: number | null;
  hotspot_id: string | null;
  hit_target_id: string | null;
}

interface ShareReportBlob {
  title: string | null;
  open_answer_visibility: Record<string, boolean>;
  blocks: Block[];
  sessions: ShareSessionRow[];
  responses: ShareResponseRow[];
  events: ShareEventRow[];
}

// Block types that surface as focused-report cards in the sidebar.
// welcome / thanks are runner-only; prototype is supported in a simpler
// public-view (placeholder copy + N — see PrototypePublicCard below)
// because the designer-side PrototypeFocusedReport pulls signed-URL
// thumbnails through the auth client.
const REPORTABLE_TYPES: ReadonlySet<Block['type']> = new Set([
  'choice',
  'scale',
  'nps',
  'agreement',
  'context',
  'open_question',
  'prototype',
]);

export interface PublicReportShellProps {
  /** Share token (passed through from the route loader). */
  token: string;
  /** Title materialized by the loader; fallback display when blob is loading. */
  titleFromLoader: string | null;
}

export function PublicReportShell({ token, titleFromLoader }: PublicReportShellProps): JSX.Element {
  // ── 1. Single round-trip via read_share_report (anon-callable). ──────────
  const reportQ = useQuery({
    queryKey: ['public-share-report', token],
    staleTime: 30_000,
    queryFn: async (): Promise<ShareReportBlob | null> => {
      // `as never` casts: read_share_report is anon-RPC defined in migration
      // 00020 and not yet in types.gen.ts. Matches the share-tokens.ts idiom.
      const { data, error } = await supabaseAnon.rpc(
        'read_share_report' as never,
        { p_token: token } as never,
      );
      if (error) throw error;
      return (data as ShareReportBlob | null) ?? null;
    },
  });

  // ── 2. Filter state — owned by this component (matches ReportShell). ─────
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const [statusFilter, setStatusFilter] = useState<{ completed: boolean; incomplete: boolean }>({
    completed: true,
    incomplete: true,
  });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // ── 3. Derived data (memoized to avoid recomputation on filter toggles). ─
  const blob = reportQ.data ?? null;

  const blocks = blob?.blocks ?? [];
  const allSessions = blob?.sessions ?? [];
  const allResponses = blob?.responses ?? [];
  const visibility = blob?.open_answer_visibility ?? {};

  // Reportable blocks for the sidebar block-list (welcome/thanks hidden;
  // designer-authored ordering preserved by sorting on `position`).
  const reportableBlocks = useMemo<Block[]>(() => {
    const list = blocks.filter((b) => REPORTABLE_TYPES.has(b.type));
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return list;
  }, [blocks]);

  // Resolve the focused block: designer-picked activeBlockId wins,
  // otherwise the first reportable block in study order.
  const focusedBlock = useMemo<Block | null>(() => {
    if (activeBlockId) {
      const picked = reportableBlocks.find((b) => b.id === activeBlockId);
      if (picked) return picked;
    }
    return reportableBlocks[0] ?? null;
  }, [activeBlockId, reportableBlocks]);

  // Apply date filter to sessions (via started_at).
  const filteredSessions = useMemo<ShareSessionRow[]>(() => {
    if (!dateRange) return allSessions;
    const startMs = new Date(dateRange.startISO).getTime();
    const endMs = new Date(dateRange.endISO).getTime();
    return allSessions.filter((s) => {
      const t = new Date(s.started_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [allSessions, dateRange]);

  // Classify each filtered session as completed / incomplete using a
  // simplified-but-faithful port of the GA2 / D-72 four-condition OR:
  //   1. session.status === 'completed' (Phase 1 column).
  //   2. session.completed_at is non-null (write-after-finish race).
  //   3. session has a `task_finish` event in the blob's events stream.
  //   4. session has responses for every required-survey block in the
  //      test (Phase 4 L-1 survey-completion path).
  //
  // The public view classifies on the same union the designer does so the
  // sidebar counts feel familiar and the «Тип» filter narrows in lockstep
  // with how the designer sees the same data.
  const completedSessionIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    const events = blob?.events ?? [];

    // Pre-compute task_finish session set for O(1) lookup.
    const taskFinishSessions = new Set<string>();
    for (const e of events) {
      if (e.event_type === 'task_finish') taskFinishSessions.add(e.session_id);
    }

    // Pre-compute required-block-ids for the L-1 survey-completion path.
    const requiredBlockIds = new Set<string>();
    for (const b of blocks) {
      const t = b.type;
      if (
        t === 'choice' ||
        t === 'scale' ||
        t === 'nps' ||
        t === 'open_question' ||
        t === 'context'
      ) {
        requiredBlockIds.add(b.id);
      } else if (t === 'agreement') {
        // Match the designer-side semantics: required when content.required === true.
        const required = (b.content as { required?: boolean } | undefined)?.required === true;
        if (required) requiredBlockIds.add(b.id);
      }
    }

    // Pre-compute responses-by-session for the L-1 path.
    const responsesBySession = new Map<string, Set<string>>();
    for (const r of allResponses) {
      const set = responsesBySession.get(r.session_id) ?? new Set<string>();
      set.add(r.block_id);
      responsesBySession.set(r.session_id, set);
    }

    for (const s of filteredSessions) {
      // Condition 1 / 2.
      if (s.status === 'completed' || s.completed_at !== null) {
        ids.add(s.id);
        continue;
      }
      // Condition 3.
      if (taskFinishSessions.has(s.id)) {
        ids.add(s.id);
        continue;
      }
      // Condition 4 — L-1 (only when test has required survey blocks).
      if (requiredBlockIds.size > 0) {
        const answered = responsesBySession.get(s.id);
        if (answered) {
          let allRequired = true;
          for (const rid of requiredBlockIds) {
            if (!answered.has(rid)) {
              allRequired = false;
              break;
            }
          }
          if (allRequired) ids.add(s.id);
        }
      }
    }
    return ids;
  }, [filteredSessions, blob?.events, blocks, allResponses]);

  // Apply «Тип» filter to get the valid sessionId set for aggregator-input.
  const validSessionIds = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    for (const s of filteredSessions) {
      const isCompleted = completedSessionIds.has(s.id);
      if (isCompleted && statusFilter.completed) out.add(s.id);
      if (!isCompleted && statusFilter.incomplete) out.add(s.id);
    }
    return out;
  }, [filteredSessions, completedSessionIds, statusFilter]);

  // Filtered responses for the focused block + the validSessionIds gate.
  const responsesForFocused = useMemo<ShareResponseRow[]>(() => {
    if (!focusedBlock) return [];
    return allResponses.filter(
      (r) => r.block_id === focusedBlock.id && validSessionIds.has(r.session_id),
    );
  }, [allResponses, focusedBlock, validSessionIds]);

  // Per-block response counts for the sidebar block-list (filter-AWARE).
  const responseCountByBlock = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const r of allResponses) {
      if (!validSessionIds.has(r.session_id)) continue;
      m[r.block_id] = (m[r.block_id] ?? 0) + 1;
    }
    return m;
  }, [allResponses, validSessionIds]);

  // Filter-active flag (drives the visible CTA in LowNGateCard when public
  // viewer narrowed the date range — but `onResetFilters` is intentionally
  // NOT passed below because the design-system v1 hides the CTA in public
  // mode and we don't want public viewers to think a designer button exists).
  const filtersActive = dateRange !== null || !statusFilter.completed || !statusFilter.incomplete;

  // Focused-block 1-indexed position for the card header.
  const focusedBlockPosition = useMemo(() => {
    if (!focusedBlock) return 0;
    const idx = blocks.findIndex((b) => b.id === focusedBlock.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [focusedBlock, blocks]);

  // Per-block open-answer visibility — REPORT-07 default-OFF: when the
  // visibility map has no entry (or explicit false), public view hides.
  const hideOpenAnswers = focusedBlock ? visibility[focusedBlock.id] !== true : true;

  // ── 4. Render — loading / unavailable / canvas. ──────────────────────────
  if (reportQ.isLoading) {
    return (
      <ShellChrome title={titleFromLoader}>
        <p style={loadingTextStyle}>Загружаем отчёт…</p>
      </ShellChrome>
    );
  }
  if (!blob) {
    return (
      <ShellChrome title={titleFromLoader}>
        <p style={loadingTextStyle}>Отчёт недоступен.</p>
      </ShellChrome>
    );
  }

  const title = blob.title?.trim() || titleFromLoader || 'Отчёт';

  return (
    <ShellChrome title={title}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '288px 1fr',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            borderRight: '1px solid var(--border-1)',
            padding: 16,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            background: 'var(--bg-sidebar, var(--bg-card))',
          }}
        >
          <DateRangeControl
            preset={datePreset}
            value={dateRange}
            onChange={(range, preset) => {
              setDateRange(range);
              setDatePreset(preset);
            }}
          />

          <fieldset
            style={{
              border: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <legend
              style={{
                font: '500 12px var(--font-sans)',
                color: 'var(--text-2)',
                padding: 0,
                marginBottom: 6,
              }}
            >
              Тип
            </legend>
            <label style={statusCheckboxStyle}>
              <input
                type="checkbox"
                checked={statusFilter.completed}
                onChange={(e) => setStatusFilter((f) => ({ ...f, completed: e.target.checked }))}
              />
              <span>Завершённые</span>
            </label>
            <label style={statusCheckboxStyle}>
              <input
                type="checkbox"
                checked={statusFilter.incomplete}
                onChange={(e) => setStatusFilter((f) => ({ ...f, incomplete: e.target.checked }))}
              />
              <span>Неполные</span>
            </label>
          </fieldset>

          <nav
            aria-label="Блоки отчёта"
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {reportableBlocks.length === 0 ? (
              <p style={emptySidebarStyle}>В этом отчёте нет блоков.</p>
            ) : (
              reportableBlocks.map((b) => {
                const isActive = focusedBlock?.id === b.id;
                const count = responseCountByBlock[b.id] ?? 0;
                const visual = blockVisualOf(b.type);
                const ChipIcon = visual.icon;
                const blockTitle = blockShortLabel(b);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveBlockId(b.id)}
                    style={{
                      ...sidebarRowStyle,
                      background: isActive ? 'var(--bg-soft, var(--bg-input))' : 'transparent',
                      borderColor: isActive ? 'var(--color-accent)' : 'transparent',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: visual.chipBg,
                        color: visual.chipFg,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ChipIcon size={12} strokeWidth={1.5} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {blockTitle}
                    </span>
                    <span
                      style={{
                        font: '400 12px var(--font-mono)',
                        color: 'var(--text-3)',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })
            )}
          </nav>
        </aside>

        {/* Main canvas */}
        <main
          data-testid="public-report-canvas"
          style={{
            padding: '24px 32px 64px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            minWidth: 0,
          }}
        >
          {!focusedBlock ? (
            <p style={loadingTextStyle}>В этом отчёте нет аналитических блоков.</p>
          ) : (
            <FocusedCardForPublic
              block={focusedBlock}
              position={focusedBlockPosition}
              responses={responsesForFocused}
              validSessionIds={validSessionIds}
              filtersActive={filtersActive}
              hideOpenAnswers={hideOpenAnswers}
            />
          )}

          {/* "Powered by Maxytest" footer per CONTEXT.md §specifics. */}
          <footer
            style={{
              marginTop: 'auto',
              paddingTop: 32,
              textAlign: 'center',
              color: 'var(--text-3)',
              font: '400 12px var(--font-mono)',
            }}
          >
            Powered by Maxytest
          </footer>
        </main>
      </div>
    </ShellChrome>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ShellChrome({
  title,
  children,
}: {
  title: string | null;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        height: '100dvh',
        background: 'var(--bg-page)',
        color: 'var(--text-1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid var(--border-1)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-card)',
        }}
      >
        <h1
          style={{
            font: '500 18px/24px var(--font-sans)',
            margin: 0,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title?.trim() || 'Отчёт'}
        </h1>
      </header>
      {children}
    </div>
  );
}

/**
 * Public-mode focused-card router. Mirrors the designer-side router in
 * `ReportShell.tsx` (FocusedSurveyCard) but:
 *   - Always passes `publicMode={true}` to every card.
 *   - Passes `hideOpenAnswers` to the 3 cards that accept it.
 *   - Does NOT pass `onResetFilters` (public mode hides the CTA).
 *   - Renders a simple `<PrototypePublicCard />` for the prototype block
 *     (designer-side PrototypeFocusedReport pulls Supabase Storage signed
 *     URLs through the auth client; can't be reused as-is in anon mode).
 */
function FocusedCardForPublic({
  block,
  position,
  responses,
  validSessionIds,
  filtersActive,
  hideOpenAnswers,
}: {
  block: Block;
  position: number;
  responses: ShareResponseRow[];
  validSessionIds: ReadonlySet<string>;
  filtersActive: boolean;
  hideOpenAnswers: boolean;
}): JSX.Element {
  const validSessionCount = validSessionIds.size;

  // Low-N gate is rendered by each card itself; we still pre-check here so
  // the prototype branch (which doesn't have its own LowNGateCard wrap)
  // surfaces the same UX.
  if (!passLowNGate(validSessionCount) && block.type === 'prototype') {
    return (
      <LowNGateCard currentN={validSessionCount} filtersActive={filtersActive} publicMode={true} />
    );
  }

  switch (block.type) {
    case 'choice': {
      const stats = choiceAggregate(
        block.content as ChoiceContent,
        responses as unknown as { session_id: string; answer: ChoiceAnswer }[],
      );
      return (
        <ChoiceFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          publicMode={true}
          hideOpenAnswers={hideOpenAnswers}
        />
      );
    }
    case 'scale': {
      const content = block.content as ScaleContent;
      const stats = scaleStats(
        content.points,
        responses as unknown as { session_id: string; answer: ScaleAnswer }[],
      );
      return (
        <ScaleFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          publicMode={true}
        />
      );
    }
    case 'nps': {
      const stats = npsBreakdown(
        responses as unknown as { session_id: string; answer: NpsAnswer }[],
      );
      return (
        <NpsFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          publicMode={true}
        />
      );
    }
    case 'agreement': {
      const stats = agreementRate(
        responses as unknown as {
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
          publicMode={true}
        />
      );
    }
    case 'context': {
      const stats = contextAggregate(
        block.content as ContextContent,
        responses as unknown as { session_id: string; answer: Partial<ContextAnswer> }[],
      );
      return (
        <ContextFocusedReport
          block={block}
          stats={stats}
          position={position}
          validSessionCount={validSessionCount}
          filtersActive={filtersActive}
          publicMode={true}
          hideOpenAnswers={hideOpenAnswers}
        />
      );
    }
    case 'open_question':
      return (
        <OpenQuestionFocusedReport
          block={block}
          responses={
            responses as unknown as {
              session_id: string;
              block_id: string;
              answer: unknown;
              time_ms: number | null;
              submitted_at: string;
            }[]
          }
          validSessionIds={validSessionIds}
          position={position}
          filtersActive={filtersActive}
          publicMode={true}
          hideOpenAnswers={hideOpenAnswers}
        />
      );
    case 'prototype':
      return <PrototypePublicCard validSessionCount={validSessionCount} />;
    default:
      return <p style={loadingTextStyle}>Этот тип блока недоступен в публичном виде.</p>;
  }
}

/**
 * Public-mode placeholder for prototype blocks. The designer-side
 * PrototypeFocusedReport pulls signed-URL frames + heatmap data through
 * the auth client — that can't run under supabaseAnon. Plan 04-07 ships
 * this card as «N респондентов прошли прототип»; the rich heatmap /
 * sankey / funnel view ships in a follow-up phase if/when the designer
 * (D-104 / D-102) decides public viewers should see them.
 */
function PrototypePublicCard({ validSessionCount }: { validSessionCount: number }): JSX.Element {
  return (
    <article
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        padding: '32px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <h3 style={{ font: '500 18px var(--font-sans)', color: 'var(--text-1)', margin: 0 }}>
        Прототип
      </h3>
      <p style={{ font: '400 14px/22px var(--font-sans)', color: 'var(--text-2)', margin: 0 }}>
        {validSessionCount} респондентов прошли прототип. Детальная аналитика (тепловая карта, пути,
        воронка) доступна только дизайнеру в полном отчёте.
      </p>
    </article>
  );
}

/** Pick a short, sidebar-safe label for a block row. */
function blockShortLabel(b: Block): string {
  const c = b.content as { question?: string; title?: string } | undefined;
  const fromQuestion = c?.question?.trim();
  if (fromQuestion) return fromQuestion;
  const fromTitle = c?.title?.trim();
  if (fromTitle) return fromTitle;
  return blockTypeLabel(b.type);
}

function blockTypeLabel(t: Block['type']): string {
  switch (t) {
    case 'choice':
      return 'Выбор';
    case 'scale':
      return 'Шкала';
    case 'nps':
      return 'NPS';
    case 'agreement':
      return 'Согласие';
    case 'context':
      return 'Контекст';
    case 'open_question':
      return 'Открытый вопрос';
    case 'prototype':
      return 'Прототип';
    default:
      return t;
  }
}

// ── Inline styles (no Tailwind in this surface — design-system v1 CSS vars). ─

const loadingTextStyle: React.CSSProperties = {
  padding: 32,
  color: 'var(--text-2)',
  font: '400 14px var(--font-sans)',
  textAlign: 'center',
};

const statusCheckboxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  font: '400 13px var(--font-sans)',
  color: 'var(--text-1)',
  cursor: 'pointer',
};

const emptySidebarStyle: React.CSSProperties = {
  font: '400 13px var(--font-sans)',
  color: 'var(--text-3)',
  padding: '4px 0',
  margin: 0,
};

const sidebarRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  height: 32,
  padding: '0 8px',
  border: '1px solid transparent',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  font: '400 13px var(--font-sans)',
  color: 'var(--text-1)',
  textAlign: 'left',
};

// Silence unused-import warning when LOW_N_THRESHOLD is referenced only as
// a comment-anchor in the public-N-hidden card.
void LOW_N_THRESHOLD;
