/**
 * `nasa-tlx-score` — Quick task 260522-jwn.
 *
 * NASA-TLX Raw (RTLX, Hart 2006) — six-dimension workload composite without
 * paired-comparisons weighting. Each dimension is rated on a 21-cell row
 * stored as integer cell index 0..20.
 *
 * Composite formula:
 *
 *   rtlx = sum(d for d in dims) / 120 * 100   // sum range 0..120 → 0..100
 *
 * IMPORTANT — Performance reverse-scoring (LOAD-BEARING — Pitfall 2 in
 * RESEARCH.md): the UI labels Performance as «Идеально (0) ←→ Полная неудача
 * (20)» so that HIGH cell index = MORE workload (worse performance is more
 * cognitive cost). The composite therefore treats Performance IDENTICALLY to
 * the other five dimensions — there is NO inversion at composite time.
 *
 * Vitest assertion lock:
 *   - nasaTlxScore({...all 0}) === 0
 *   - nasaTlxScore({...all 20}) === 100
 *   - nasaTlxScore({performance:20, others:0}) === nasaTlxScore({mental:20, others:0})
 *
 * Partial-row policy (Pitfall 7 / T-quick-jwn-05):
 *   - Per-dimension means: a row contributes to perDimMean[d] iff it answered d.
 *   - Composite: a row contributes to rtlxMean iff it answered ALL enabled
 *     dimensions (no partial composites — would otherwise produce misleading
 *     "low workload" scores from skipped dimensions).
 *   - Disabled dimensions: perDimMean[disabled] === null; composite skips them.
 *
 * Defensive: clamps each dimension value to 0..20 before summing
 * (belt-and-suspenders against Zod-schema bypass).
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { NasaTlxAnswer } from '@/lib/blocks/schemas';
import { quantile } from './quantile';

export type NasaTlxDimension =
  | 'mental'
  | 'physical'
  | 'temporal'
  | 'performance'
  | 'effort'
  | 'frustration';

export const NASA_TLX_DIMENSION_ORDER: readonly NasaTlxDimension[] = [
  'mental',
  'physical',
  'temporal',
  'performance',
  'effort',
  'frustration',
] as const;

export interface NasaTlxStats {
  /** Mean composite (0..100) across COMPLETE rows (all enabled dims answered). */
  rtlxMean: number;
  /** Median composite (0..100) across complete rows. */
  rtlxMedian: number;
  /** Per-dimension mean (0..20). `null` when dimension is disabled OR has no answers. */
  perDimMean: Record<NasaTlxDimension, number | null>;
  /** Number of COMPLETE rows (all enabled dimensions answered). */
  n: number;
}

/** Clamp helper used in both pure-score and aggregator paths. */
function clamp20(v: number): number {
  if (v < 0) return 0;
  if (v > 20) return 20;
  return v;
}

/**
 * NASA-TLX RTLX composite (0..100) from a complete 6-dim row.
 *
 * Values OUTSIDE 0..20 are clamped defensively. NO inversion of Performance.
 */
export function nasaTlxScore(dims: {
  mental: number;
  physical: number;
  temporal: number;
  performance: number;
  effort: number;
  frustration: number;
}): number {
  const sum =
    clamp20(dims.mental) +
    clamp20(dims.physical) +
    clamp20(dims.temporal) +
    clamp20(dims.performance) +
    clamp20(dims.effort) +
    clamp20(dims.frustration);
  return (sum / 120) * 100;
}

/**
 * Aggregate NASA-TLX responses across sessions, respecting the designer's
 * enabled-dimensions choice (disabled dims are excluded from BOTH the
 * per-dim grid and the composite).
 *
 * @param responses     Per-session answers — each `answer` may have any subset
 *                      of the six dimension keys populated.
 * @param enabledDims   Set of dimensions the designer kept enabled in this
 *                      block. Composite considers only these dimensions and
 *                      requires ALL of them to be answered.
 */
export function nasaTlxStats(
  responses: readonly { session_id: string; answer: NasaTlxAnswer }[],
  enabledDims: ReadonlySet<NasaTlxDimension>,
): NasaTlxStats {
  // Per-dimension accumulator — sum + count for each dim independently.
  const perDimSum: Record<NasaTlxDimension, number> = {
    mental: 0,
    physical: 0,
    temporal: 0,
    performance: 0,
    effort: 0,
    frustration: 0,
  };
  const perDimCount: Record<NasaTlxDimension, number> = {
    mental: 0,
    physical: 0,
    temporal: 0,
    performance: 0,
    effort: 0,
    frustration: 0,
  };

  // Composite accumulator — only rows where ALL enabled dims are answered.
  const composites: number[] = [];

  for (const r of responses) {
    const a = r.answer;
    if (!a) continue;
    // Per-dim independent
    for (const d of NASA_TLX_DIMENSION_ORDER) {
      const v = a[d];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 20) {
        perDimSum[d] += v;
        perDimCount[d] += 1;
      }
    }
    // Composite — only when ALL enabled dims are present
    let complete = true;
    const sumDims: {
      mental: number;
      physical: number;
      temporal: number;
      performance: number;
      effort: number;
      frustration: number;
    } = { mental: 0, physical: 0, temporal: 0, performance: 0, effort: 0, frustration: 0 };
    for (const d of NASA_TLX_DIMENSION_ORDER) {
      if (!enabledDims.has(d)) continue;
      const v = a[d];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 20) {
        complete = false;
        break;
      }
      sumDims[d] = v;
    }
    if (complete && enabledDims.size > 0) {
      // Compute composite using only enabled dims; rescale to 0..100 against
      // the dynamic max (enabledDims.size * 20) so e.g. a 4-dim composite
      // still maps 0..100. Disabled dims contribute 0 to numerator AND 0 to
      // denominator.
      let total = 0;
      for (const d of NASA_TLX_DIMENSION_ORDER) {
        if (enabledDims.has(d)) total += clamp20(sumDims[d]);
      }
      const maxPossible = enabledDims.size * 20;
      composites.push((total / maxPossible) * 100);
    }
  }

  const perDimMean: Record<NasaTlxDimension, number | null> = {
    mental: null,
    physical: null,
    temporal: null,
    performance: null,
    effort: null,
    frustration: null,
  };
  for (const d of NASA_TLX_DIMENSION_ORDER) {
    if (!enabledDims.has(d)) {
      perDimMean[d] = null;
      continue;
    }
    perDimMean[d] =
      perDimCount[d] === 0 ? null : Math.round((perDimSum[d] / perDimCount[d]) * 100) / 100;
  }

  const rtlxMean =
    composites.length === 0
      ? 0
      : Math.round((composites.reduce((a, b) => a + b, 0) / composites.length) * 100) / 100;
  const rtlxMedian =
    composites.length === 0
      ? 0
      : Math.round(
          quantile(
            [...composites].sort((a, b) => a - b),
            0.5,
          ) * 100,
        ) / 100;

  return {
    rtlxMean,
    rtlxMedian,
    perDimMean,
    n: composites.length,
  };
}
