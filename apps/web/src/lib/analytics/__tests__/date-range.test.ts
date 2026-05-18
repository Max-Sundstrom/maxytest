// Plan 03.1-02 Task 1 — timezone-strict unit tests for `date-range.ts`.
//
// W6 harness (CONTEXT.md GA8 / D-78 — pure-fn Vitest coverage is mandatory):
//
//   1. `process.env.TZ = 'UTC'` is set BEFORE any `date-fns` import resolves so
//      `startOfDay` / `endOfDay` operate against a known timezone. Vitest spawns
//      a worker per file and reads `process.env.TZ` once at process start, so
//      setting it inside the test file works for all assertions in this file.
//      Choice rationale: pinning at the test-file head keeps the override
//      file-local (won't bleed into other suites) and avoids editing the
//      project-wide `vite.config.ts` `test.env` block, which would require a
//      broader review.
//
//   2. Inside each `describe` we install `vi.useFakeTimers()` with a fixed
//      `vi.setSystemTime(...)` so the helper's `now` default reads the pinned
//      moment. We restore real timers in `afterEach`.
//
//   3. Assertions use `.toBe(exactISO)` (exact equality) rather than
//      `.startsWith(...)` so a timezone bug surfaces immediately.

process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRangeRu, presetToRange, type DateRange } from '../date-range';

// Pinned moment used by every preset-relative assertion below. 12:00:00Z is
// chosen so any «accidental local-time leakage» (forgot to use UTC) shows up
// in the assertions immediately.
const FIXED_NOW = new Date('2026-05-18T12:00:00Z');

describe('presetToRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for 'all'", () => {
    expect(presetToRange('all')).toBeNull();
  });

  it("returns start/end of today for 'today'", () => {
    expect(presetToRange('today')).toEqual({
      startISO: '2026-05-18T00:00:00.000Z',
      endISO: '2026-05-18T23:59:59.999Z',
    });
  });

  it("returns last 7 inclusive days for 'last7'", () => {
    expect(presetToRange('last7')).toEqual({
      startISO: '2026-05-12T00:00:00.000Z',
      endISO: '2026-05-18T23:59:59.999Z',
    });
  });

  it("returns last 30 inclusive days for 'last30'", () => {
    expect(presetToRange('last30')).toEqual({
      startISO: '2026-04-19T00:00:00.000Z',
      endISO: '2026-05-18T23:59:59.999Z',
    });
  });

  it("returns null for 'custom' with both dates undefined", () => {
    expect(presetToRange('custom')).toBeNull();
    expect(presetToRange('custom', null, null)).toBeNull();
    expect(presetToRange('custom', new Date('2026-05-01T00:00:00Z'), null)).toBeNull();
    expect(presetToRange('custom', null, new Date('2026-05-10T00:00:00Z'))).toBeNull();
  });

  it("returns start/end ISOs for 'custom' with both dates present", () => {
    const start = new Date('2026-05-01T00:00:00Z');
    const end = new Date('2026-05-10T00:00:00Z');
    expect(presetToRange('custom', start, end)).toEqual({
      startISO: '2026-05-01T00:00:00.000Z',
      endISO: '2026-05-10T23:59:59.999Z',
    });
  });

  it("swaps 'custom' dates silently when customStart > customEnd", () => {
    // Swapped order — pick end first, start second.
    const earlier = new Date('2026-05-01T00:00:00Z');
    const later = new Date('2026-05-10T00:00:00Z');
    const result = presetToRange('custom', later, earlier);
    expect(result).not.toBeNull();
    // After swap, startISO must precede endISO lexicographically (UTC ISO strings
    // are lex-comparable when zone is identical, which it always is here).
    expect(result!.startISO < result!.endISO).toBe(true);
    expect(result).toEqual({
      startISO: '2026-05-01T00:00:00.000Z',
      endISO: '2026-05-10T23:59:59.999Z',
    });
  });
});

describe('formatRangeRu', () => {
  it("returns 'Всё время' for ('all')", () => {
    expect(formatRangeRu(null, 'all')).toBe('Всё время');
  });

  it("returns 'Сегодня' for ('today')", () => {
    expect(formatRangeRu(null, 'today')).toBe('Сегодня');
  });

  it("returns 'Произвольный период' for ('custom') with null range", () => {
    expect(formatRangeRu(null, 'custom')).toBe('Произвольный период');
  });

  it("returns formatted 'dd.MM.yyyy → dd.MM.yyyy' for ('custom') with a range", () => {
    const range: DateRange = {
      startISO: '2026-05-01T00:00:00.000Z',
      endISO: '2026-05-10T23:59:59.999Z',
    };
    expect(formatRangeRu(range, 'custom')).toBe('01.05.2026 → 10.05.2026');
  });
});
