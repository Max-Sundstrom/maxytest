/**
 * `nps-breakdown` unit tests — Plan 04-03 Task 3.
 *
 * Locks: bucket boundaries (0..6 detractor / 7..8 passive / 9..10 promoter),
 * NPS score formula (promoterPct - detractorPct, rounded), defensive empty,
 * out-of-range / non-integer rejection.
 */

import { describe, expect, it } from 'vitest';

import { npsBreakdown } from '../nps-breakdown';
import type { NpsAnswer } from '@/lib/blocks/schemas';

function r(session_id: string, score: number) {
  return { session_id, answer: { score } as NpsAnswer };
}

describe('npsBreakdown', () => {
  it('empty responses → all zeros', () => {
    const result = npsBreakdown([]);
    expect(result.n).toBe(0);
    expect(result.promoters).toBe(0);
    expect(result.passives).toBe(0);
    expect(result.detractors).toBe(0);
    expect(result.npsScore).toBe(0);
    expect(result.histogram).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('boundary: 6 is the highest detractor', () => {
    const result = npsBreakdown([r('s1', 6)]);
    expect(result.detractors).toBe(1);
    expect(result.passives).toBe(0);
    expect(result.promoters).toBe(0);
  });

  it('boundary: 7 is the lowest passive', () => {
    const result = npsBreakdown([r('s1', 7)]);
    expect(result.detractors).toBe(0);
    expect(result.passives).toBe(1);
    expect(result.promoters).toBe(0);
  });

  it('boundary: 8 is the highest passive', () => {
    const result = npsBreakdown([r('s1', 8)]);
    expect(result.passives).toBe(1);
    expect(result.promoters).toBe(0);
  });

  it('boundary: 9 is the lowest promoter', () => {
    const result = npsBreakdown([r('s1', 9)]);
    expect(result.passives).toBe(0);
    expect(result.promoters).toBe(1);
  });

  it('all promoters (9..10) → npsScore = 100', () => {
    const result = npsBreakdown([r('s1', 9), r('s2', 10), r('s3', 10)]);
    expect(result.promoters).toBe(3);
    expect(result.npsScore).toBe(100);
    expect(result.promoterPct).toBe(100);
    expect(result.detractorPct).toBe(0);
  });

  it('all detractors → npsScore = -100', () => {
    const result = npsBreakdown([r('s1', 0), r('s2', 3), r('s3', 6)]);
    expect(result.detractors).toBe(3);
    expect(result.npsScore).toBe(-100);
    expect(result.promoterPct).toBe(0);
    expect(result.detractorPct).toBe(100);
  });

  it('mixed: 50% promoters + 50% detractors → npsScore = 0', () => {
    const result = npsBreakdown([r('s1', 10), r('s2', 0)]);
    expect(result.npsScore).toBe(0);
  });

  it('mixed: 2 promoters / 1 passive / 1 detractor → npsScore = 25', () => {
    // promoter 2/4 = 50%; detractor 1/4 = 25%; nps = 25.
    const result = npsBreakdown([r('s1', 10), r('s2', 9), r('s3', 7), r('s4', 3)]);
    expect(result.promoters).toBe(2);
    expect(result.passives).toBe(1);
    expect(result.detractors).toBe(1);
    expect(result.npsScore).toBe(25);
  });

  it('out-of-range scores are skipped (defensive)', () => {
    const result = npsBreakdown([r('s1', 10), r('s2', 11), r('s3', -1)]);
    expect(result.n).toBe(1);
  });

  it('non-integer scores are skipped', () => {
    const result = npsBreakdown([r('s1', 10), r('s2', 7.5)]);
    expect(result.n).toBe(1);
  });

  it('histogram length is exactly 11 (0..10)', () => {
    const result = npsBreakdown([r('s1', 0), r('s2', 10), r('s3', 5)]);
    expect(result.histogram).toHaveLength(11);
    expect(result.histogram[0]).toBe(1);
    expect(result.histogram[5]).toBe(1);
    expect(result.histogram[10]).toBe(1);
  });
});
