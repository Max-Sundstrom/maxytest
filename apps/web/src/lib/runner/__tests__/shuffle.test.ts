/**
 * deterministicShuffle — Vitest harness.
 *
 * Plan 04-02 Task 1 / RESEARCH.md Pitfall 9: shuffled option order MUST be
 * stable across runner re-mounts within the same respondent session, so that
 * a Phase 5 resume flow preserves the order the respondent first saw.
 *
 * The four invariants tested below mirror the Pitfall 9 mitigation:
 *   1. Empty / singleton inputs are returned unchanged (defensive identity).
 *   2. A non-trivial input becomes a permutation containing exactly the same
 *      elements (no element loss or duplication).
 *   3. The same `sessionId` always produces the same order (purity).
 *   4. Different `sessionId` values produce a well-distributed family of
 *      orderings (sample 100 distinct ids, assert ≥ 30 distinct orderings
 *      observed — Mulberry32 should comfortably clear this lower bound).
 *
 * No `Date.now()` / `Math.random()` reliance — the seed function is pure
 * and a Vitest `expect.assertions(...)` counter is NOT needed because all
 * tests are synchronous.
 */

import { describe, it, expect } from 'vitest';
import { deterministicShuffle } from '../shuffle';

describe('deterministicShuffle', () => {
  it('returns [] for an empty input (defensive)', () => {
    expect(deterministicShuffle([], 'session-1')).toEqual([]);
  });

  it('returns [a] for a singleton input (defensive)', () => {
    expect(deterministicShuffle(['only'], 'session-1')).toEqual(['only']);
  });

  it('returns a permutation containing every input element exactly once', () => {
    const input = ['A', 'B', 'C', 'D', 'E', 'F'];
    const out = deterministicShuffle(input, 'session-1');
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
    // And the input itself is not mutated.
    expect(input).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('is pure: same sessionId → same order across multiple invocations', () => {
    const input = ['A', 'B', 'C', 'D', 'E'];
    const a = deterministicShuffle(input, 'session-deadbeef');
    const b = deterministicShuffle(input, 'session-deadbeef');
    const c = deterministicShuffle(input, 'session-deadbeef');
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('produces well-distributed orderings across distinct sessionIds', () => {
    const input = ['A', 'B', 'C', 'D', 'E'];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const sessionId = `session-${i.toString(16)}-${(i * 17 + 13).toString(16)}`;
      seen.add(deterministicShuffle(input, sessionId).join('|'));
    }
    // 5! = 120 orderings possible. With 100 distinct seeds, we should
    // comfortably observe at least 30 unique permutations from a properly
    // dispersed RNG; Mulberry32-seeded-by-FNV1a clears 60+ in practice.
    expect(seen.size).toBeGreaterThanOrEqual(30);
  });

  it('produces a different order for two unrelated sessionIds (sanity)', () => {
    const input = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const a = deterministicShuffle(input, 'session-alpha');
    const b = deterministicShuffle(input, 'session-omega');
    // 8! = 40 320 — coincidence probability ≈ 1/40320, well below test noise.
    expect(a).not.toEqual(b);
  });
});
