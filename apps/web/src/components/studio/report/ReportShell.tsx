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

import { useEffect, useMemo, useState } from 'react';
import { useBlocks } from '@/lib/queries/blocks';
import { useFrames, type Frame } from '@/lib/queries/prototypes';
import { useBlockEvents, type BlockEventRow } from '@/lib/queries/block-events';
import { classifyOutcome, type ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import { quantile } from '@/lib/analytics/quantile';
import { transitionGraph, type SankeyGraph } from '@/lib/analytics/transition-graph';
import { funnelSteps, type FunnelStep } from '@/lib/analytics/funnel-steps';
import type { Block } from '@/lib/blocks/types';
import { blockVisualOf } from '@/lib/blocks/visual';
import { supabase } from '@/lib/supabase/auth';
import { FunnelSection } from './FunnelSection';
import { PlaybackDrawer } from './PlaybackDrawer';
import { PrototypeReport } from './PrototypeReport';
import { ReportSankey } from './ReportSankey';
import { ReportSidebar } from './ReportSidebar';
import { ReportTopbar } from './ReportTopbar';
import { StatRich } from './StatRich';

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

export function ReportShell({ studyId }: ReportShellProps) {
  const { data: blocks = [], isLoading: blocksLoading } = useBlocks(studyId);

  // Phase 2 ships ONE prototype block per study — pick it.
  const prototypeBlock = useMemo(() => blocks.find((b: Block) => b.type === 'prototype'), [blocks]);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Plan 03-06 — drawer that closes ROADMAP SC5 (ANALYTICS-09). State lives
  // here so the «Смотреть сессии» CTA in FocusedBlockCard can toggle it
  // (D-64). PlaybackDrawer's local state (selectedSessionId, filter) is
  // intentionally unmounted on close so the next open starts fresh.
  const [playbackOpen, setPlaybackOpen] = useState(false);

  // Default the sidebar's active row to the prototype block once blocks land.
  useEffect(() => {
    if (!activeBlockId && prototypeBlock) {
      setActiveBlockId(prototypeBlock.id);
    }
  }, [prototypeBlock, activeBlockId]);

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
  const { data: allEvents = [] } = useBlockEvents(pvId, prototypeBlock?.id);

  // Group events by session_id → classifyOutcome per session, filter
  // invalid (D-34: sessions with zero frame_enter return null and are
  // excluded from counters — Pitfall 5).
  const outcomes = useMemo<ClassifyOutcomeResult[]>(() => {
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
      // TODO Phase 4 / Plan 03-04 — replace with real funnel-step counts.
      // Sidebar shows "Completed / Incomplete" derived from sessions table,
      // not from block-scoped events. For Plan 03-01 we map responses to
      // completedCount so the sidebar text stays sensible until Plan 03-04
      // wires the real sessions list.
      completedCount: valid,
      incompleteCount: 0,
    };
  }, [outcomes]);

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
  const sankey = useMemo<SankeyGraph>(
    () =>
      transitionGraph(allEvents, {
        mode: sankeyMode,
        thresholdPercent: 5,
        validSessionCount: outcomes.length,
        finishFrameIds,
        outcomes,
        frameNames,
      }),
    [allEvents, sankeyMode, outcomes, finishFrameIds, frameNames],
  );

  // Plan 03-04 — success-path funnel. Forgiving semantics (D-50); empty
  // success_path → []  (D-53 — section will hide). Shares the same
  // useBlockEvents cache slot as ReportShell's header tiles + the sankey,
  // so this is a derived useMemo with zero additional network cost.
  const funnel = useMemo<FunnelStep[]>(
    () => funnelSteps(allEvents, successPath, outcomes.length),
    [allEvents, successPath, outcomes.length],
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
          blocks={blocks}
          activeBlockId={activeBlockId}
          onSelectBlock={setActiveBlockId}
          completedCount={stats.completedCount}
          incompleteCount={stats.incompleteCount}
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
          ) : !prototypeBlock ? (
            <EmptyReportState />
          ) : (
            <FocusedBlockCard
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
        />
      ) : null}
    </div>
  );
}

// ─── Focused block card ─────────────────────────────────────────────────

interface FocusedBlockCardProps {
  block: Block;
  responses: number;
  successCount: number;
  gaveUpCount: number;
  avgTimeS: string;
  medianTimeS: string;
  /** D-35 — when false, Успешно/Сдались tiles are hidden (no goal & no success_path). */
  showOutcomeCounters: boolean;
  frames: Frame[];
  startingFrameId: string | undefined;
  studyId: string;
  /** Plan 03-02 — pre-computed sankey graph from `transitionGraph(...)`. */
  sankey: SankeyGraph;
  /** D-42 mode — 'first' (DAG) / 'all' (cycles + self-loops visible). */
  sankeyMode: 'first' | 'all';
  /** Mode-change handler bubbled up from ModeToggle. */
  onSankeyModeChange: (mode: 'first' | 'all') => void;
  /** Plan 03-04 — designer-defined success path (D-53 guards on `length > 0`). */
  successPath: string[];
  /** Plan 03-04 — pre-computed funnel steps from `funnelSteps(...)`. */
  funnel: FunnelStep[];
  /** Plan 03-04 — signed URLs for the funnel-step thumbnails. */
  funnelSignedUrls: Record<string, string>;
  /** Plan 03-04 — denominator for the FunnelSection `N из Total` text. */
  validSessionCount: number;
  /** Plan 03-06 — opens the PlaybackDrawer (D-64). */
  onOpenPlayback: () => void;
}

function FocusedBlockCard({
  block,
  responses,
  successCount,
  gaveUpCount,
  avgTimeS,
  medianTimeS,
  showOutcomeCounters,
  frames,
  startingFrameId,
  studyId,
  sankey,
  sankeyMode,
  onSankeyModeChange,
  successPath,
  funnel,
  funnelSignedUrls,
  validSessionCount,
  onOpenPlayback,
}: FocusedBlockCardProps) {
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const taskText =
    ((block.content as { task_instruction?: string } | undefined)?.task_instruction ?? '').trim() ||
    'Задание для этого блока не задано — добавь его в конструкторе.';

  return (
    <article
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        padding: '24px 28px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            font: '500 16px var(--font-sans)',
            color: 'var(--text-2)',
            minWidth: 22,
          }}
        >
          4.
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius)',
            background: visual.chipBg,
            color: visual.chipFg,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <ChipIcon size={14} strokeWidth={1.5} />
        </span>
        <span
          style={{
            flex: 1,
            font: '500 15px/22px var(--font-sans)',
            color: 'var(--text-1)',
          }}
        >
          Figma
        </span>
        <span style={{ font: '400 13px var(--font-sans)', color: 'var(--text-2)' }}>
          {responses} ответов
        </span>
        {/* Plan 03-06 — discovery CTA for per-respondent playback. The
            button only makes sense if there's at least one valid session
            to look at; we hide it when responses == 0 so the report
            doesn't promise something it can't deliver yet. */}
        {responses > 0 ? (
          <button
            type="button"
            onClick={onOpenPlayback}
            aria-label="Открыть список сессий и воспроизведение"
            style={{
              font: '500 13px var(--font-sans)',
              color: 'var(--text-1)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius)',
              padding: '0 12px',
              height: 32,
              cursor: 'pointer',
              transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-chip)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
            }}
          >
            Смотреть сессии
          </button>
        ) : null}
      </header>

      {/* Task callout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{
            font: '400 12.5px var(--font-sans)',
            color: 'var(--text-2)',
            letterSpacing: '0.01em',
          }}
        >
          Задание
        </span>
        <p
          style={{
            font: '500 18px/26px var(--font-sans)',
            color: 'var(--text-1)',
            margin: 0,
            maxWidth: 760,
          }}
        >
          {taskText}
        </p>
      </div>

      {/* Stat grid — D-35: collapse to 2 columns when no goal & no success_path */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showOutcomeCounters ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 24,
          paddingBottom: 20,
          borderBottom: '1px dashed var(--border-1)',
        }}
      >
        {showOutcomeCounters && (
          <>
            <StatRich
              icon="user-check"
              iconColor="var(--color-success)"
              label="Успешно"
              value={String(successCount)}
            />
            <StatRich
              icon="user-x"
              iconColor="var(--color-warning)"
              label="Сдались"
              value={String(gaveUpCount)}
            />
          </>
        )}
        <StatRich label="Среднее время" value={`${avgTimeS} с`} />
        <StatRich label="Медианное время" value={`${medianTimeS} с`} />
      </div>

      {/* Paths section */}
      <Section
        title="Пути"
        subtitle="Исследуйте, как пользователи перемещаются по экранам прототипа. Колесо или ⌘+скролл — зум, drag — пан."
      >
        <ReportSankey
          sankey={sankey}
          mode={sankeyMode}
          onModeChange={onSankeyModeChange}
          frames={frames}
          startingFrameId={startingFrameId}
        />
      </Section>

      {/* Plan 03-04 — Success-path funnel (D-51 placement: between «Пути»
          and «Тепловые карты и клики»). D-53 — section is hidden entirely
          when no success_path is set. */}
      {successPath.length > 0 && (
        <Section
          title="Целевой путь"
          subtitle="Как респонденты проходят по шагам, которые ты задал в конструкторе. Семантика — Forgiving (любой порядок)."
        >
          <FunnelSection
            steps={funnel}
            frames={frames}
            signedUrls={funnelSignedUrls}
            validSessionCount={validSessionCount}
          />
        </Section>
      )}

      {/* Heatmaps section — preserves existing Phase 2 surface */}
      <Section
        title="Тепловые карты и клики"
        subtitle="Тепловые карты по экранам, клики по hotspot'ам, низкоконфиденсные fallback'ы. Phase 2 surface — без изменений."
      >
        <div
          style={{
            background: 'var(--bg-page)',
            border: '1px solid var(--border-2)',
            borderRadius: 'var(--radius)',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <PrototypeReport studyId={studyId} />
        </div>
      </Section>
    </article>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h4
          style={{
            font: '500 14px var(--font-sans)',
            color: 'var(--text-1)',
            margin: 0,
          }}
        >
          {title}
        </h4>
        <span
          style={{
            font: '400 12.5px/18px var(--font-sans)',
            color: 'var(--text-3)',
          }}
        >
          {subtitle}
        </span>
      </header>
      {children}
    </section>
  );
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
        В этом тесте пока нет prototype-блока
      </h2>
      <p
        style={{
          font: '400 13.5px/20px var(--font-sans)',
          color: 'var(--text-2)',
          margin: '6px 0 0',
        }}
      >
        Добавь блок «Figma-прототип» в конструкторе, чтобы появились пути и тепловые карты.
      </p>
    </div>
  );
}
