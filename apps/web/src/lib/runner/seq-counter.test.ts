/**
 * `nextSeq` unit tests — Plan 02-08 Task 1.
 *
 * Locks the per-session monotonic seq invariant:
 *   - First call for a fresh session returns 1.
 *   - Each subsequent call increments by 1.
 *   - Counter survives "page reload" (we wipe module-level cache by
 *     re-importing; the localStorage value drives the read).
 *   - Per-session keyspace isolation: 'session-a' and 'session-b' never
 *     collide.
 *   - iOS Safari Private Browsing fallback — when localStorage throws,
 *     `nextSeq` still returns a monotonic value from the in-memory map.
 *
 * Pitfall 4 from RESEARCH.md (the "seq resets on reload" mitigation) is the
 * canonical reference behind tests 3 + 5.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetMemoryFallback, nextSeq } from './seq-counter';

describe('nextSeq', () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
    __resetMemoryFallback();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 1 on the first call for a fresh session', () => {
    expect(nextSeq('session-a')).toBe(1);
  });

  it('increments by 1 on each call (1, 2, 3)', () => {
    expect(nextSeq('session-a')).toBe(1);
    expect(nextSeq('session-a')).toBe(2);
    expect(nextSeq('session-a')).toBe(3);
  });

  it('reads the persisted value after a "reload" — localStorage anchored', () => {
    // Simulate a previous tab having written seq=5; new tab calls nextSeq.
    window.localStorage.setItem('maxytest:seq:session-a', '5');
    expect(nextSeq('session-a')).toBe(6);
    expect(window.localStorage.getItem('maxytest:seq:session-a')).toBe('6');
  });

  it('keeps independent counters per session id', () => {
    expect(nextSeq('session-a')).toBe(1);
    expect(nextSeq('session-b')).toBe(1);
    expect(nextSeq('session-a')).toBe(2);
    expect(nextSeq('session-b')).toBe(2);
  });

  it('falls back to in-memory counter when localStorage throws on set', () => {
    // Stub a localStorage whose setItem throws (iOS Private Browsing quota).
    // getItem returns null so we exercise the "no entry yet" branch.
    const stub = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    vi.stubGlobal('localStorage', stub);

    expect(nextSeq('session-x')).toBe(1);
    expect(nextSeq('session-x')).toBe(2);
    expect(nextSeq('session-x')).toBe(3);
  });

  it('returns 1 when localStorage.getItem throws on a fresh key (treats absence as 0)', () => {
    const stub = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    vi.stubGlobal('localStorage', stub);

    expect(nextSeq('session-y')).toBe(1);
  });
});
