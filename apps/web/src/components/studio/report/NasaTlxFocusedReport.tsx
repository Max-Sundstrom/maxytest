/**
 * <NasaTlxFocusedReport /> — focused-block card for `nasa_tlx`-typed blocks
 * (Quick task 260522-jwn — NASA-TLX Raw, Hart 2006).
 *
 * Layout:
 *   - Big RTLX composite tile (0..100) in 48px.
 *   - 3×2 grid of per-dimension stat tiles (label + mean 0..20). Disabled
 *     dimensions (designer-toggled-off) render «—».
 *
 * Per Pitfall 2 (RESEARCH.md): Performance is NOT inverted at composite-time;
 * the UI labels Performance «Идеально ←→ Полная неудача» so HIGH = worse =
 * more workload. The per-dimension mean displayed below is the RAW
 * 0..20 cell index — designer reads «Performance: 12» as "average respondent
 * felt task was leaning toward поражение".
 *
 * Low-N gate (D-103, M-2): when `validSessionCount < 5` → LowNGateCard.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { NasaTlxContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { NasaTlxStats, NasaTlxDimension } from '@/lib/analytics/nasa-tlx-score';
import { NASA_TLX_DIMENSION_ORDER } from '@/lib/analytics/nasa-tlx-score';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';
import { NASA_TLX_DIMENSION_META } from '@/lib/blocks/defaults';

export interface NasaTlxFocusedReportProps {
  block: Block;
  stats: NasaTlxStats;
  position: number;
  validSessionCount: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
}

export function NasaTlxFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
}: NasaTlxFocusedReportProps): JSX.Element {
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

  const content = block.content as NasaTlxContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.title ?? '').trim() || 'NASA-TLX';

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

      {/* Big RTLX composite */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ font: '500 48px/56px var(--font-sans)', color: 'var(--text-1)' }}>
          {stats.rtlxMean.toFixed(1)}
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
          RTLX композитный балл (0..100) · медиана {stats.rtlxMedian.toFixed(1)}
        </span>
      </div>

      {/* Per-dimension grid 3×2 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {NASA_TLX_DIMENSION_ORDER.map((dim) => (
          <DimensionTile
            key={dim}
            dim={dim}
            mean={stats.perDimMean[dim]}
            enabled={content.dimensions[dim] === true}
          />
        ))}
      </div>
    </article>
  );
}

function DimensionTile({
  dim,
  mean,
  enabled,
}: {
  dim: NasaTlxDimension;
  mean: number | null;
  enabled: boolean;
}): JSX.Element {
  const meta = NASA_TLX_DIMENSION_META[dim];
  const valueDisplay = !enabled ? '—' : mean === null ? '—' : mean.toFixed(1);

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
        opacity: enabled ? 1 : 0.5,
      }}
    >
      <span
        style={{
          font: '400 12px/16px var(--font-sans)',
          color: 'var(--text-3)',
          letterSpacing: '0.01em',
        }}
      >
        {meta.label}
      </span>
      <span style={{ font: '500 22px/28px var(--font-sans)', color: 'var(--text-1)' }}>
        {valueDisplay}
        {enabled && mean !== null && (
          <span style={{ font: '500 13px/20px var(--font-sans)', color: 'var(--text-2)' }}>
            {' '}
            / 20
          </span>
        )}
      </span>
      {!enabled && (
        <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-3)' }}>
          Отключено дизайнером
        </span>
      )}
    </div>
  );
}
