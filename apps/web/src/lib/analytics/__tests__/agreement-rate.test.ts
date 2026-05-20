/**
 * `agreement-rate` unit tests — Plan 04-03 Task 4.
 *
 * Locks: total = validSessionIds.size; declined = total - agreed (clamped at 0);
 * agreementPct rounded to 1 decimal; defensive on duplicate-session response rows.
 */

import { describe, expect, it } from 'vitest';

import { agreementRate } from '../agreement-rate';
import type { AgreementAnswer } from '@/lib/blocks/schemas';

function r(
  session_id: string,
  agreed: boolean,
): { session_id: string; answer: Partial<AgreementAnswer> } {
  return { session_id, answer: { agreed } as Partial<AgreementAnswer> };
}

describe('agreementRate', () => {
  it('empty validSessionIds → all zeros', () => {
    const result = agreementRate([], new Set());
    expect(result.agreed).toBe(0);
    expect(result.declined).toBe(0);
    expect(result.total).toBe(0);
    expect(result.agreementPct).toBe(0);
  });

  it('all sessions agreed → agreementPct=100', () => {
    const result = agreementRate(
      [r('s1', true), r('s2', true), r('s3', true)],
      new Set(['s1', 's2', 's3']),
    );
    expect(result.agreed).toBe(3);
    expect(result.declined).toBe(0);
    expect(result.total).toBe(3);
    expect(result.agreementPct).toBe(100);
  });

  it('mixed agreed/declined → correct counts + pct', () => {
    const result = agreementRate(
      [r('s1', true), r('s2', true), r('s3', false)],
      new Set(['s1', 's2', 's3', 's4']), // 4 total, s4 has no response row
    );
    expect(result.agreed).toBe(2);
    // total - agreed = 4 - 2 = 2 (covers s3 + s4 that didn't answer)
    expect(result.declined).toBe(2);
    expect(result.total).toBe(4);
    expect(result.agreementPct).toBe(50);
  });

  it('responses for sessions OUTSIDE validSessionIds are ignored', () => {
    const result = agreementRate(
      [r('s1', true), r('s99', true)], // s99 not in validSet
      new Set(['s1', 's2']),
    );
    expect(result.agreed).toBe(1);
    expect(result.total).toBe(2);
  });

  it('duplicate response rows for the same session are counted ONCE', () => {
    // Pathological — runner shouldn't write two rows for a session, but if it
    // did (resume race), we still count agreed once.
    const result = agreementRate([r('s1', true), r('s1', true), r('s1', true)], new Set(['s1']));
    expect(result.agreed).toBe(1);
    expect(result.declined).toBe(0);
    expect(result.total).toBe(1);
    expect(result.agreementPct).toBe(100);
  });

  it('agreed=false response → contributes to total but not to agreed', () => {
    const result = agreementRate([r('s1', false), r('s2', false)], new Set(['s1', 's2']));
    expect(result.agreed).toBe(0);
    expect(result.declined).toBe(2);
    expect(result.total).toBe(2);
    expect(result.agreementPct).toBe(0);
  });

  it('1-decimal rounding (1 of 3 = 33.3, not 33.33)', () => {
    const result = agreementRate(
      [r('s1', true), r('s2', false), r('s3', false)],
      new Set(['s1', 's2', 's3']),
    );
    expect(result.agreementPct).toBe(33.3);
  });
});
