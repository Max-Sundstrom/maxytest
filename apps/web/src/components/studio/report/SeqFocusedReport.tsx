/**
 * <SeqFocusedReport /> — focused-block card for `seq`-typed blocks (Quick
 * task 260522-jwn — Single Ease Question, Sauro & Dumas 2009).
 *
 * Visual mirror of <ScaleFocusedReport /> with the 7-point histogram + 3-tile
 * (Mean/Median/σ) stat grid. Endpoint labels are LOCKED to SEQ canon and
 * imported from defaults.ts so editor preview / runner / report all use the
 * same source of truth (RESEARCH.md Pitfall 8).
 *
 * Low-N gate (D-103, M-2): when `validSessionCount < 5` → LowNGateCard.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { SeqContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { ScaleStats } from '@/lib/analytics/scale-stats';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';
import { SEQ_ENDPOINT_MIN_DEFAULT, SEQ_ENDPOINT_MAX_DEFAULT } from '@/lib/blocks/defaults';

export interface SeqFocusedReportProps {
  block: Block;
  stats: ScaleStats;
  position: number;
  validSessionCount: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
}

export function SeqFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
}: SeqFocusedReportProps): JSX.Element {
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

  const content = block.content as SeqContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.question ?? '').trim() || 'Без вопроса';
  const max = Math.max(...stats.histogram, 1);

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

      {/* 3-tile stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatTile label="Среднее" value={stats.mean.toFixed(2)} />
        <StatTile label="Медиана" value={stats.median.toFixed(2)} />
        <StatTile label="Σ" value={stats.std.toFixed(2)} />
      </div>

      {/* Vertical histogram */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            height: 160,
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
                gap: 6,
                height: '100%',
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  font: '500 12px var(--font-mono)',
                  color: 'var(--text-2)',
                }}
              >
                {count}
              </span>
              <div
                style={{
                  width: '100%',
                  height: `${(count / max) * 100}%`,
                  background: 'var(--color-accent)',
                  borderRadius: 'var(--radius-sm)',
                  minHeight: count > 0 ? 4 : 0,
                  transition: 'height 240ms cubic-bezier(.2,.7,.3,1)',
                }}
              />
              <span
                style={{
                  font: '400 12px var(--font-mono)',
                  color: 'var(--text-3)',
                }}
              >
                {i + 1}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-3)',
          }}
        >
          <span>{SEQ_ENDPOINT_MIN_DEFAULT}</span>
          <span>{SEQ_ENDPOINT_MAX_DEFAULT}</span>
        </div>
      </div>
    </article>
  );
}

function StatTile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-3)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: '500 22px/28px var(--font-sans)',
          color: 'var(--text-1)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
