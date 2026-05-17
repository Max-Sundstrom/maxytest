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
 * Stats / response counts are placeholders in this commit — Phase 3
 * (ANALYTICS-04) will plumb in the real session-aggregation queries. The
 * sankey is rendered against the real `useFrames` data with stub flow paths
 * (see ReportSankey notes).
 *
 * Existing <PrototypeReport /> (heatmap + per-frame stats) is preserved as
 * the body of the "Тепловые карты и клики" section so Phase 2's analytics
 * surface stays accessible while the new design-language summary sits above.
 */

import { useEffect, useMemo, useState } from 'react';
import { useBlocks } from '@/lib/queries/blocks';
import { useFrames, type Frame } from '@/lib/queries/prototypes';
import type { Block } from '@/lib/blocks/types';
import { blockVisualOf } from '@/lib/blocks/visual';
import { PrototypeReport } from './PrototypeReport';
import { ReportSankey } from './ReportSankey';
import { ReportSidebar } from './ReportSidebar';
import { ReportTopbar } from './ReportTopbar';
import { StatRich } from './StatRich';

export interface ReportShellProps {
  studyId: string;
}

export function ReportShell({ studyId }: ReportShellProps) {
  const { data: blocks = [], isLoading: blocksLoading } = useBlocks(studyId);

  // Phase 2 ships ONE prototype block per study — pick it.
  const prototypeBlock = useMemo(() => blocks.find((b: Block) => b.type === 'prototype'), [blocks]);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Default the sidebar's active row to the prototype block once blocks land.
  useEffect(() => {
    if (!activeBlockId && prototypeBlock) {
      setActiveBlockId(prototypeBlock.id);
    }
  }, [prototypeBlock, activeBlockId]);

  // TODO Phase 3 (ANALYTICS-04) — plumb real session aggregates here.
  // Until then the visible numbers are placeholders so the layout reads
  // accurately to the designer reviewing handoff fidelity. The placeholder
  // values match ADDENDUM-v3 sample copy (95 ответов / Успешно 74 / Сдались
  // 21 / 80.14s avg / 57.23s median).
  const stats = {
    responses: 95,
    successCount: 74,
    gaveUpCount: 21,
    avgTimeS: '80.14',
    medianTimeS: '57.23',
    completedCount: 109,
    incompleteCount: 1,
  };

  const pvId = (prototypeBlock?.content as { prototype_version_id?: string } | undefined)
    ?.prototype_version_id;
  const finishFrameIds = useMemo(
    () =>
      ((prototypeBlock?.content as { finish_frame_ids?: string[] } | undefined)?.finish_frame_ids ??
        []) as string[],
    [prototypeBlock],
  );
  const startingFrameId = (prototypeBlock?.content as { starting_frame_id?: string } | undefined)
    ?.starting_frame_id;
  const { data: frames = [] } = useFrames(pvId);

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
              frames={frames}
              goalFrameIds={finishFrameIds}
              startingFrameId={startingFrameId}
              studyId={studyId}
            />
          )}
        </main>
      </div>
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
  frames: Frame[];
  goalFrameIds: string[];
  startingFrameId: string | undefined;
  studyId: string;
}

function FocusedBlockCard({
  block,
  responses,
  successCount,
  gaveUpCount,
  avgTimeS,
  medianTimeS,
  frames,
  goalFrameIds,
  startingFrameId,
  studyId,
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

      {/* Stat grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 24,
          paddingBottom: 20,
          borderBottom: '1px dashed var(--border-1)',
        }}
      >
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
        <StatRich label="Среднее время" value={`${avgTimeS} с`} />
        <StatRich label="Медианное время" value={`${medianTimeS} с`} />
      </div>

      {/* Paths section */}
      <Section
        title="Пути"
        subtitle="Исследуйте, как пользователи перемещаются по экранам прототипа. Колесо или ⌘+скролл — зум, drag — пан."
      >
        <ReportSankey
          frames={frames}
          goalFrameIds={goalFrameIds}
          startingFrameId={startingFrameId}
        />
      </Section>

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
