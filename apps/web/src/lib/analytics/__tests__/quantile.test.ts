/**
 * `quantile` unit tests — Plan 03-01 Task 1B.
 *
 * Locks the linear-interpolation (R-7 / Excel-style) semantics from
 * 03-RESEARCH.md §"Quantile helper" lines 1245-1257. Defensive-return
 * branches (empty / single / p<=0 / p>=1) are each covered.
 *
 * Pattern mirrors `apps/web/src/lib/figma/coords.test.ts` — pure-fn import +
 * `describe/it/expect` only, no fixtures, no mocks.
 */

import { describe, expect, it } from 'vitest';

import { quantile } from '../quantile';

describe('quantile', () => {
  it('returns 0 for an empty array (defensive)', () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it('returns the only element when length === 1', () => {
    expect(quantile([42], 0.5)).toBe(42);
  });

  it('returns the median (p=0.5) on [1,2,3,4,5] → 3', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('returns the 95th percentile on [1,2,3,4,5] via linear interpolation ≈ 4.8', () => {
    // idx = 0.95 * 4 = 3.8 → 0.2 * sortedAsc[3] + 0.8 * sortedAsc[4] = 0.2*4 + 0.8*5 = 4.8
    expect(quantile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 10);
  });

  it('clamps p <= 0 to the first element', () => {
    expect(quantile([10, 20, 30], -0.5)).toBe(10);
  });

  it('clamps p >= 1 to the last element', () => {
    expect(quantile([10, 20, 30], 1.5)).toBe(30);
  });
});
