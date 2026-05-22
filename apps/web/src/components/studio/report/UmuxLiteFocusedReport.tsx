/**
 * <UmuxLiteFocusedReport /> — focused-block card for `umux_lite`-typed blocks
 * (Quick task 260522-jwn — UMUX-Lite, Lewis 2013).
 *
 * Layout:
 *   - Big composite tile: rtlx-style 0..100 number in 48px font.
 *   - 2 per-item mini histograms (each 7 bars) with the designer's item
 *     labels above and per-item mean as caption.
 *
 * Low-N gate (D-103, M-2): when `validSessionCount < 5` → LowNGateCard.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { UmuxLiteContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { UmuxLiteStats } from '@/lib/analytics/umux-lite-score';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';
import { UMUX_LITE_ENDPOINT_MIN, UMUX_LITE_ENDPOINT_MAX } from '@/lib/blocks/defaults';

export interface UmuxLiteFocusedReportProps {
  block: Block;
  stats: UmuxLiteStats;
  position: number;
  validSessionCount: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
}

export function UmuxLiteFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
}: UmuxLiteFocusedReportProps): JSX.Element {
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

  const content = block.content as UmuxLiteContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = 'UMUX-Lite — удобство использования';

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
          style={{ font: '500 16px var(--font-sans)', color: 'var(--text-2)', minWidth: 22 }}
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

      {/* Big composite */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ font: '500 48px/56px var(--font-sans)', color: 'var(--text-1)' }}>
          {stats.compositeMean.toFixed(1)}
          <span style={{ font: '500 24px/32px var(--font-sans)', color: 'var(--text-2)' }}>
            {' '}
            / 100
          </span>
        </span>
        <span
          style={{
            font: '400 13px/20px var(--font-sans)',
            color: 'var(--text-2)',
            textAlign: 'center',
          }}
        >
          Композитный балл UMUX-Lite (0..100) · медиана {stats.compositeMedian.toFixed(1)}
        </span>
      </div>

      {/* Per-item mini-histograms */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ItemMiniHistogram
          label={content.item1_label}
          histogram={stats.item1Histogram}
          mean={stats.item1Mean}
        />
        <ItemMiniHistogram
          label={content.item2_label}
          histogram={stats.item2Histogram}
          mean={stats.item2Mean}
        />
      </div>
    </article>
  );
}

function ItemMiniHistogram({
  label,
  histogram,
  mean,
}: {
  label: string;
  histogram: number[];
  mean: number;
}): JSX.Element {
  const max = Math.max(...histogram, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <span
          style={{
            font: '500 13.5px/20px var(--font-sans)',
            color: 'var(--text-1)',
            flex: 1,
          }}
        >
          {label}
        </span>
        <span
          style={{
            font: '500 13px var(--font-mono)',
            color: 'var(--text-2)',
            whiteSpace: 'nowrap',
          }}
        >
          Среднее: {mean.toFixed(2)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
        {histogram.map((count, i) => (
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
            <span style={{ font: '500 11px var(--font-mono)', color: 'var(--text-2)' }}>
              {count}
            </span>
            <div
              style={{
                width: '100%',
                height: `${(count / max) * 100}%`,
                background: 'var(--color-accent)',
                borderRadius: 'var(--radius-sm)',
                minHeight: count > 0 ? 3 : 0,
              }}
            />
            <span style={{ font: '400 11px var(--font-mono)', color: 'var(--text-3)' }}>
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: '400 11.5px/16px var(--font-sans)',
          color: 'var(--text-3)',
        }}
      >
        <span>{UMUX_LITE_ENDPOINT_MIN}</span>
        <span>{UMUX_LITE_ENDPOINT_MAX}</span>
      </div>
    </div>
  );
}
