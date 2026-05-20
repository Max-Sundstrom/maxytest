/**
 * `scale-stats` unit tests — Plan 04-03 Task 3.
 *
 * Locks: histogram length matches `points`, defensive empty, mean/median/std
 * computation on known fixtures, out-of-range / non-integer rejection.
 */

import { describe, expect, it } from 'vitest';

import { scaleStats } from '../scale-stats';
import type { ScaleAnswer } from '@/lib/blocks/schemas';

function r(session_id: string, value: number) {
  return { session_id, answer: { value } as ScaleAnswer };
}

describe('scaleStats', () => {
  it('empty responses → zeroed histogram + all stats 0', () => {
    const result = scaleStats(5, []);
    expect(result.histogram).toEqual([0, 0, 0, 0, 0]);
    expect(result.mean).toBe(0);
    expect(result.median).toBe(0);
    expect(result.std).toBe(0);
    expect(result.n).toBe(0);
  });

  it('histogram length matches `points` for 5/7/10', () => {
    expect(scaleStats(5, []).histogram).toHaveLength(5);
    expect(scaleStats(7, []).histogram).toHaveLength(7);
    expect(scaleStats(10, []).histogram).toHaveLength(10);
  });

  it('single response sets histogram[v-1]=1 and stats reflect single value', () => {
    const result = scaleStats(5, [r('s1', 3)]);
    expect(result.histogram).toEqual([0, 0, 1, 0, 0]);
    expect(result.mean).toBe(3);
    expect(result.median).toBe(3);
    expect(result.std).toBe(0);
    expect(result.n).toBe(1);
  });

  it('uniform distribution 1..5 → mean=3, median=3, std≈1.41', () => {
    const result = scaleStats(5, [r('s1', 1), r('s2', 2), r('s3', 3), r('s4', 4), r('s5', 5)]);
    expect(result.n).toBe(5);
    expect(result.mean).toBe(3);
    expect(result.median).toBe(3);
    // population std-dev: sqrt((4+1+0+1+4)/5) = sqrt(2) ≈ 1.41
    expect(result.std).toBe(1.41);
  });

  it('skewed distribution → mean differs from median', () => {
    // four 5s and one 1: mean = 21/5 = 4.2; median = 5.
    const result = scaleStats(5, [r('s1', 5), r('s2', 5), r('s3', 5), r('s4', 5), r('s5', 1)]);
    expect(result.mean).toBe(4.2);
    expect(result.median).toBe(5);
    expect(result.histogram).toEqual([1, 0, 0, 0, 4]);
  });

  it("out-of-range values are skipped (don't contribute to n)", () => {
    const result = scaleStats(5, [
      r('s1', 3),
      r('s2', 0), // below range
      r('s3', 6), // above range
      r('s4', 5),
    ]);
    expect(result.n).toBe(2);
    expect(result.histogram).toEqual([0, 0, 1, 0, 1]);
  });

  it('non-integer values are skipped', () => {
    const result = scaleStats(5, [r('s1', 3), r('s2', 2.5), r('s3', 4)]);
    expect(result.n).toBe(2);
    expect(result.histogram).toEqual([0, 0, 1, 1, 0]);
  });

  it('handles points=10 with even-count median interpolation', () => {
    // values 3,4,5,6 sorted → quantile p=0.5 = (4+5)/2 = 4.5
    const result = scaleStats(10, [r('s1', 3), r('s2', 4), r('s3', 5), r('s4', 6)]);
    expect(result.median).toBe(4.5);
    expect(result.mean).toBe(4.5);
  });
});
