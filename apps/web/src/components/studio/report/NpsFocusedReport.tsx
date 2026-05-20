/**
 * <NpsFocusedReport /> — focused-block card for `nps`-typed blocks (BLK-06,
 * Net Promoter Score 0–10).
 *
 * Phase 4 / Plan 04-04 Task 2. Consumes the `NpsBreakdown` produced by
 * `@/lib/analytics/nps-breakdown` (segmented breakdown + score + 11-bucket
 * histogram).
 *
 * Visual:
 *   - Header pattern from PrototypeFocusedReport.
 *   - Big NPS-score number, font 500 48px, centered (handoff style).
 *   - Segmented horizontal bar: Detractors (--color-danger) /
 *     Passives (--color-warning) / Promoters (--color-success), widths
 *     proportional to their pcts.
 *   - 11-bucket mini-histogram (0..10) under the segmented bar with mono
 *     index labels.
 *
 * Low-N gate (D-103, M-2): when `validSessionCount < 5` → LowNGateCard with
 * publicMode forwarded.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { NpsContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { NpsBreakdown } from '@/lib/analytics/nps-breakdown';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';

export interface NpsFocusedReportProps {
  block: Block;
  stats: NpsBreakdown;
  position: number;
  validSessionCount: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
}

export function NpsFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
}: NpsFocusedReportProps): JSX.Element {
  if (!passLowNGate(validSessionCount)) {
    return (
      <LowNGateCard
        currentN={validSessionCount}
        filtersActive={filtersActive}
        publicMode={publicMode}
        onResetFilters={onResetFilters}
      />
    );
  }

  const content = block.content as NpsContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.question ?? '').trim() || 'NPS';
  const maxHist = Math.max(...stats.histogram, 1);

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
        gap: 24,
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
          {position}.
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
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span
          style={{
            font: '400 13px var(--font-sans)',
            color: 'var(--text-2)',
            whiteSpace: 'nowrap',
          }}
        >
          {stats.n} ответов
        </span>
      </header>

      {/* Big NPS score */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span
          style={{
            font: '500 48px/56px var(--font-sans)',
            color: 'var(--text-1)',
          }}
        >
          {stats.npsScore}
        </span>
        <span
          style={{
            font: '400 13px var(--font-mono)',
            color: 'var(--text-3)',
          }}
        >
          NPS-score · {stats.n} ответов
        </span>
      </div>

      {/* Segmented horizontal bar — detractors / passives / promoters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            height: 14,
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            background: 'var(--bg-input)',
          }}
        >
          <div
            style={{
              width: `${stats.detractorPct}%`,
              background: 'var(--color-danger)',
              transition: 'width 240ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
          <div
            style={{
              width: `${stats.passivePct}%`,
              background: 'var(--color-warning)',
              transition: 'width 240ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
          <div
            style={{
              width: `${stats.promoterPct}%`,
              background: 'var(--color-success)',
              transition: 'width 240ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-2)',
          }}
        >
          <SegmentLegend
            color="var(--color-danger)"
            label="Детракторы"
            count={stats.detractors}
            pct={stats.detractorPct}
          />
          <SegmentLegend
            color="var(--color-warning)"
            label="Нейтралы"
            count={stats.passives}
            pct={stats.passivePct}
          />
          <SegmentLegend
            color="var(--color-success)"
            label="Промоутеры"
            count={stats.promoters}
            pct={stats.promoterPct}
          />
        </div>
      </div>

      {/* 11-bucket histogram 0..10 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{
            font: '400 12.5px/16px var(--font-sans)',
            color: 'var(--text-3)',
            letterSpacing: '0.01em',
          }}
        >
          Распределение по баллам
        </span>
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'flex-end',
            height: 120,
          }}
        >
          {stats.histogram.map((count, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                height: '100%',
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  font: '500 11px var(--font-mono)',
                  color: 'var(--text-2)',
                }}
              >
                {count}
              </span>
              <div
                style={{
                  width: '100%',
                  height: `${(count / maxHist) * 100}%`,
                  background:
                    i <= 6
                      ? 'var(--color-danger)'
                      : i <= 8
                        ? 'var(--color-warning)'
                        : 'var(--color-success)',
                  borderRadius: 'var(--radius-sm)',
                  minHeight: count > 0 ? 4 : 0,
                  opacity: 0.75,
                  transition: 'height 240ms cubic-bezier(.2,.7,.3,1)',
                }}
              />
              <span
                style={{
                  font: '400 11px var(--font-mono)',
                  color: 'var(--text-3)',
                }}
              >
                {i}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function SegmentLegend({
  color,
  label,
  count,
  pct,
}: {
  color: string;
  label: string;
  count: number;
  pct: number;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 'var(--radius-xs)',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ color: 'var(--text-2)' }}>
        {label} · {count} · {pct}%
      </span>
    </div>
  );
}
