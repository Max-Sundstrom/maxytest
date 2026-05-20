/**
 * `low-n-gate` unit tests — Plan 04-03 Task 1.
 *
 * Locks the D-103 threshold (N≥5) shared by designer + public-share views.
 */

import { describe, expect, it } from 'vitest';

import { LOW_N_THRESHOLD, passLowNGate } from '../low-n-gate';

describe('passLowNGate', () => {
  it('exposes the threshold as 5', () => {
    expect(LOW_N_THRESHOLD).toBe(5);
  });

  it('returns false for 4 (just below threshold)', () => {
    expect(passLowNGate(4)).toBe(false);
  });

  it('returns true for 5 (exactly at threshold)', () => {
    expect(passLowNGate(5)).toBe(true);
  });

  it('returns true for 100 (well above threshold)', () => {
    expect(passLowNGate(100)).toBe(true);
  });

  it('returns false for 0 (no data)', () => {
    expect(passLowNGate(0)).toBe(false);
  });

  it('returns false for negative numbers (defensive)', () => {
    expect(passLowNGate(-1)).toBe(false);
    expect(passLowNGate(-100)).toBe(false);
  });

  it('returns false for NaN (defensive)', () => {
    expect(passLowNGate(NaN)).toBe(false);
  });

  it('returns true for +Infinity (defensive — clearly clears the gate)', () => {
    expect(passLowNGate(Number.POSITIVE_INFINITY)).toBe(true);
  });

  it('returns false for -Infinity (defensive)', () => {
    expect(passLowNGate(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
