/**
 * <PrototypeFocusedReport /> — focused-block card for `prototype`-typed blocks.
 *
 * Phase 4 / Plan 04-03 Task 7 — extracted from `ReportShell.tsx`'s previous
 * inline `<FocusedBlockCard />` definition (lines ~511-726 pre-extraction).
 * This is a VERBATIM cut+paste — zero behavior change. Phase 3 prototype
 * report UAT remains regression-free because the only differences from
 * the original inline definition are:
 *
 *   1. Component name: `FocusedBlockCard` → `PrototypeFocusedReport`.
 *   2. Props interface name: `FocusedBlockCardProps` → `PrototypeFocusedReportProps`.
 *   3. Imports: pulled in explicitly from `./` instead of relying on
 *      ReportShell's lexical scope.
 *
 * Task 8 wires ReportShell to call THIS component for `block.type === 'prototype'`;
 * survey-block focused cards (choice / scale / nps / agreement / context)
 * land in Plan 04-04 as their own components.
 */

import type { Frame } from '@/lib/queries/prototypes';
import type { Block } from '@/lib/blocks/types';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { SankeyGraph } from '@/lib/analytics/transition-graph';
import type { FunnelStep } from '@/lib/analytics/funnel-steps';
import type { DateRange } from '@/lib/analytics/date-range';
import { FunnelSection } from './FunnelSection';
import { PrototypeReport } from './PrototypeReport';
import { ReportSankey } from './ReportSankey';
import { StatRich } from './StatRich';

export interface PrototypeFocusedReportProps {
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
  /**
   * Plan 03.1-07 — forwarded from ReportShell so PrototypeReport's per-frame
   * hooks narrow in lockstep with the rest of the report.
   */
  dateRange: DateRange;
}

export function PrototypeFocusedReport({
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
  dateRange,
}: PrototypeFocusedReportProps) {
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
        subtitle="Тепловые карты по экранам, клики по hotspot'ам, низкоконфиденсные fallback'ы. Узкоэкранные стат-карточки реагируют на фильтр «Дата» (Plan 03.1-07)."
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
          {/* Plan 03.1-07 — dateRange forwarded so per-frame heatmap + time-on-frame narrow with the «Дата» filter (closes VERIFICATION.md Gap #1 / ROADMAP SC1). */}
          <PrototypeReport studyId={studyId} dateRange={dateRange} />
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
