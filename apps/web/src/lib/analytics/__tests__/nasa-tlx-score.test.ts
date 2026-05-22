/**
 * `nasa-tlx-score` unit tests — Quick task 260522-jwn.
 *
 * Boundary tests LOCK the canonical RTLX (Hart 2006) composite formula:
 *
 *   rtlx = sum(dims) / (enabledDims.size * 20) * 100
 *
 * Load-bearing assertions:
 *   - Pitfall 2: Performance is NOT inverted at composite time.
 *     The UI labels Performance «Идеально (0) ←→ Полная неудача (20)» so
 *     a high cell index already means "more workload". The composite
 *     therefore treats Performance identically to the other five
 *     dimensions. The invariant `score({performance=20}) ===
 *     score({mental=20})` proves no inversion is silently applied.
 *
 * Partial-row policy (Pitfall 7 / T-quick-jwn-05): a row contributes to a
 * per-dim mean independently per dimension, BUT contributes to rtlxMean
 * only if it answered ALL enabled dimensions (no "low workload" illusion
 * from skipped dimensions).
 */

import { describe, expect, it } from 'vitest';

import { nasaTlxScore, nasaTlxStats, type NasaTlxDimension } from '../nasa-tlx-score';
import type { NasaTlxAnswer } from '@/lib/blocks/schemas';

function allSix(value: number) {
  return {
    mental: value,
    physical: value,
    temporal: value,
    performance: value,
    effort: value,
    frustration: value,
  };
}

function row(session_id: string, answer: NasaTlxAnswer) {
  return { session_id, answer };
}

describe('nasaTlxScore — canonical formula boundaries', () => {
  it('all six dimensions = 0 → RTLX = 0', () => {
    expect(nasaTlxScore(allSix(0))).toBe(0);
  });

  it('all six dimensions = 20 → RTLX = 100', () => {
    expect(nasaTlxScore(allSix(20))).toBe(100);
  });

  it('all six dimensions = 10 → RTLX = 50 (midpoint)', () => {
    expect(nasaTlxScore(allSix(10))).toBe(50);
  });

  it('Performance no-inversion invariant — performance=20 contributes the SAME as mental=20 (Pitfall 2)', () => {
    const onlyPerf = nasaTlxScore({
      mental: 0,
      physical: 0,
      temporal: 0,
      performance: 20,
      effort: 0,
      frustration: 0,
    });
    const onlyMental = nasaTlxScore({
      mental: 20,
      physical: 0,
      temporal: 0,
      performance: 0,
      effort: 0,
      frustration: 0,
    });
    expect(onlyPerf).toBe(onlyMental);
    // Both should equal 20/120*100 ≈ 16.67 — proving NO inversion.
    expect(onlyPerf).toBeCloseTo((20 / 120) * 100, 5);
  });

  it('clamps out-of-range values defensively (belt-and-suspenders)', () => {
    // value=999 must be clamped to 20 → same result as value=20.
    expect(nasaTlxScore(allSix(999))).toBe(100);
    // value=-5 must be clamped to 0 → same as value=0.
    expect(nasaTlxScore(allSix(-5))).toBe(0);
  });
});

describe('nasaTlxStats — aggregator', () => {
  const ALL_DIMS = new Set<NasaTlxDimension>([
    'mental',
    'physical',
    'temporal',
    'performance',
    'effort',
    'frustration',
  ]);

  it('empty responses → all zero / null per-dim', () => {
    const r = nasaTlxStats([], ALL_DIMS);
    expect(r.n).toBe(0);
    expect(r.rtlxMean).toBe(0);
    expect(r.rtlxMedian).toBe(0);
    expect(r.perDimMean.mental).toBeNull();
  });

  it('disabled dimensions yield perDimMean = null AND are excluded from composite', () => {
    const enabledDims = new Set<NasaTlxDimension>(['mental', 'effort']);
    const r = nasaTlxStats(
      [row('s1', { mental: 10, effort: 10 }), row('s2', { mental: 20, effort: 20 })],
      enabledDims,
    );
    // 2 fully-answered (in terms of enabled dims) rows.
    expect(r.n).toBe(2);
    // perDimMean: only mental + effort populated; the other four are null.
    expect(r.perDimMean.mental).toBe(15);
    expect(r.perDimMean.effort).toBe(15);
    expect(r.perDimMean.physical).toBeNull();
    expect(r.perDimMean.temporal).toBeNull();
    expect(r.perDimMean.performance).toBeNull();
    expect(r.perDimMean.frustration).toBeNull();
    // rtlxMean over enabled dims only:
    //   row s1: (10+10) / (2*20) * 100 = 50
    //   row s2: (20+20) / (2*20) * 100 = 100
    //   mean = (50 + 100) / 2 = 75
    expect(r.rtlxMean).toBe(75);
  });

  it('Pitfall 7 — row with mental=10 but missing effort contributes to perDimMean.mental but NOT to rtlxMean', () => {
    const enabledDims = new Set<NasaTlxDimension>(['mental', 'effort']);
    const r = nasaTlxStats(
      [
        row('s1', { mental: 10 }), // partial — composite skip, per-dim mental hit
        row('s2', { mental: 20, effort: 20 }), // complete
      ],
      enabledDims,
    );
    // Only row s2 is complete → n = 1.
    expect(r.n).toBe(1);
    // Per-dim mental averages 10 (s1) and 20 (s2) → 15
    expect(r.perDimMean.mental).toBe(15);
    // Per-dim effort only counts s2 (s1 skipped) → 20
    expect(r.perDimMean.effort).toBe(20);
    // rtlx only counts row s2: (20+20)/(2*20)*100 = 100
    expect(r.rtlxMean).toBe(100);
  });

  it('fully-answered rows with all six dims enabled — composite formula reproduces nasaTlxScore', () => {
    const r = nasaTlxStats([row('s1', allSix(10)), row('s2', allSix(20))], ALL_DIMS);
    expect(r.n).toBe(2);
    // (50 + 100) / 2 = 75
    expect(r.rtlxMean).toBe(75);
  });
});
