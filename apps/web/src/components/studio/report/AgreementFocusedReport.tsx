/**
 * <AgreementFocusedReport /> — focused-block card for `agreement`-typed blocks
 * (BLK-07, legal-text checkbox).
 *
 * Phase 4 / Plan 04-04 Task 2. Consumes the `AgreementRate` produced by
 * `@/lib/analytics/agreement-rate` (agreed / declined / total / agreementPct).
 *
 * Visual:
 *   - Header pattern from PrototypeFocusedReport.
 *   - Big agreement percentage centered, font 500 48px.
 *   - One-line caption underneath: «N согласились · M отказались · из Total».
 *
 * Low-N gate (D-103, M-2): when `validSessionCount < 5` → LowNGateCard with
 * publicMode forwarded.
 */

import type { JSX } from 'react';
import type { Block } from '@/lib/blocks/types';
import type { AgreementContent } from '@/lib/blocks/schemas';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { AgreementRate } from '@/lib/analytics/agreement-rate';
import { passLowNGate } from '@/lib/analytics/low-n-gate';
import { LowNGateCard } from './LowNGateCard';

export interface AgreementFocusedReportProps {
  block: Block;
  stats: AgreementRate;
  position: number;
  validSessionCount: number;
  filtersActive: boolean;
  onResetFilters?: () => void;
  publicMode?: boolean;
}

export function AgreementFocusedReport({
  block,
  stats,
  position,
  validSessionCount,
  filtersActive,
  onResetFilters,
  publicMode = false,
}: AgreementFocusedReportProps): JSX.Element {
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

  const content = block.content as AgreementContent;
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;
  const title = (content.question ?? '').trim() || 'Согласие';

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
          {stats.total} ответов
        </span>
      </header>

      {/* Big percentage */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            font: '500 48px/56px var(--font-sans)',
            color: 'var(--text-1)',
          }}
        >
          {stats.agreementPct}%
        </span>
        <span
          style={{
            font: '400 13px/20px var(--font-sans)',
            color: 'var(--text-2)',
            textAlign: 'center',
          }}
        >
          {stats.agreed} согласились · {stats.declined} отказались · из {stats.total}
        </span>
      </div>
    </article>
  );
}
