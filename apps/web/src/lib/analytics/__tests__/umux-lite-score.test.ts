/**
 * `umux-lite-score` unit tests — Quick task 260522-jwn.
 *
 * Boundary tests LOCK the canonical UMUX-Lite (Lewis 2013) composite formula:
 *
 *   composite = ((item1 - 1) + (item2 - 1)) * (100 / 12)
 *
 * Load-bearing assertions (Pitfall 1 in RESEARCH.md):
 *   - (1, 1) → 0   — worst possible response normalises to 0
 *   - (7, 7) → 100 — best possible response normalises to 100
 *   - (4, 4) → 50  — midpoint MUST be 50, NOT 67 (the "-1 trap":
 *                    implementations that forget to subtract 1 give 8/12*100
 *                    ≈ 66.67 which silently looks plausible)
 *
 * Partial-row policy (Pitfall 7 / T-quick-jwn-04): rows where item1 OR item2
 * is null/undefined are SKIPPED from composite stats (no NaN propagation),
 * but contribute to per-item histograms when their present item is valid.
 */

import { describe, expect, it } from 'vitest';

import { umuxLiteScore, umuxLiteStats } from '../umux-lite-score';
import type { UmuxLiteAnswer } from '@/lib/blocks/schemas';

function row(session_id: string, item1: number | undefined, item2: number | undefined) {
  const answer: UmuxLiteAnswer = {};
  if (item1 !== undefined) answer.item1 = item1;
  if (item2 !== undefined) answer.item2 = item2;
  return { session_id, answer };
}

describe('umuxLiteScore — canonical formula boundaries (Pitfall 1)', () => {
  it('(1, 1) → 0 (worst-possible response normalises to 0)', () => {
    expect(umuxLiteScore(1, 1)).toBe(0);
  });

  it('(7, 7) → 100 (best-possible response normalises to 100)', () => {
    expect(umuxLiteScore(7, 7)).toBe(100);
  });

  it('(4, 4) → 50 (midpoint, NOT 67 — Pitfall 1 -1 normalisation trap)', () => {
    expect(umuxLiteScore(4, 4)).toBe(50);
    // Belt-and-suspenders: explicitly assert it is NOT the wrong "no-`-1`"
    // formula value (4+4)/14*100 ≈ 57.14 or (4+4)*100/12 ≈ 66.67.
    expect(umuxLiteScore(4, 4)).not.toBe(Math.round((8 / 12) * 100));
  });

  it('(1, 4) → 25 (one item at min, one at midpoint)', () => {
    expect(umuxLiteScore(1, 4)).toBe(25);
  });

  it('(7, 4) → 75 (one item at max, one at midpoint)', () => {
    expect(umuxLiteScore(7, 4)).toBe(75);
  });

  it('formula is symmetric in its two arguments', () => {
    expect(umuxLiteScore(2, 6)).toBe(umuxLiteScore(6, 2));
    expect(umuxLiteScore(1, 7)).toBe(umuxLiteScore(7, 1));
  });
});

describe('umuxLiteStats — aggregator', () => {
  it('empty responses → all zeros', () => {
    const r = umuxLiteStats([]);
    expect(r.n).toBe(0);
    expect(r.compositeMean).toBe(0);
    expect(r.compositeMedian).toBe(0);
    expect(r.item1Mean).toBe(0);
    expect(r.item2Mean).toBe(0);
    expect(r.item1Histogram).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.item2Histogram).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('three complete rows [1,4,7] x [1,4,7] → compositeMean = 50, item1Mean = 4, n = 3', () => {
    const r = umuxLiteStats([row('s1', 1, 1), row('s2', 4, 4), row('s3', 7, 7)]);
    expect(r.n).toBe(3);
    // (0 + 50 + 100) / 3 = 50
    expect(r.compositeMean).toBe(50);
    expect(r.compositeMedian).toBe(50);
    expect(r.item1Mean).toBe(4);
    expect(r.item2Mean).toBe(4);
    expect(r.item1Histogram[0]).toBe(1); // value=1 at index 0
    expect(r.item1Histogram[3]).toBe(1); // value=4 at index 3
    expect(r.item1Histogram[6]).toBe(1); // value=7 at index 6
  });

  it('partial row (item1=5, item2=null) → skipped from composite, still in item1 histogram', () => {
    const r = umuxLiteStats([
      row('s1', 5, undefined), // partial — composite skip
      row('s2', 6, 7), // complete
      row('s3', 4, 4), // complete
    ]);
    // Only 2 complete rows contribute to composite.
    expect(r.n).toBe(2);
    // item1Mean averages over all rows that supplied item1 (5, 6, 4) = 5.0
    expect(r.item1Mean).toBe(5);
    // item1Histogram counts the partial row at index 4 (value=5).
    expect(r.item1Histogram[4]).toBe(1);
    // item2 only collected from rows 2 and 3 → (7 + 4) / 2 = 5.5
    expect(r.item2Mean).toBe(5.5);
  });

  it('rejects out-of-range values from histogram + composite (defence-in-depth)', () => {
    const r = umuxLiteStats([
      row('s1', 0, 1), // item1 out of range (must be 1..7)
      row('s2', 8, 7), // item1 out of range
      row('s3', 3, 5), // valid
    ]);
    // Only the valid row contributes to composite.
    expect(r.n).toBe(1);
    // item1Histogram has only one entry: value=3 at index 2.
    expect(r.item1Histogram.reduce((a, b) => a + b, 0)).toBe(1);
    expect(r.item1Histogram[2]).toBe(1);
  });
});
