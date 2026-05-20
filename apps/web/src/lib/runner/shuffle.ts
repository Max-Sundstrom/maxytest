/**
 * `deterministicShuffle(items, sessionId)` — Pitfall 9 mitigation.
 *
 * RESEARCH.md §"Pitfall 9 — Choice option order drifts on respondent reload"
 * (Plan 04-02 Task 1) mandates a seeded shuffle keyed by `sessionId` so that
 *
 *   1. Within a single respondent session, ChoiceRunner option order stays
 *      stable across every re-mount (page refresh, route change, Phase 5
 *      resume).
 *   2. Across distinct sessions, the order is well-distributed (each
 *      respondent sees a different ordering) so that position-bias is
 *      averaged out at the aggregate level.
 *
 * Implementation: FNV-1a 32-bit hash of `sessionId` → Mulberry32 PRNG →
 * Fisher–Yates shuffle. All purely synchronous, no `Date.now()`,
 * `Math.random()`, or other ambient state. The input array is NOT mutated;
 * a fresh array is returned in every case.
 *
 * Performance note: `items.length` is bounded by Zod choiceContentSchema
 * (≤ 20 options) and by contextContentSchema age-options (≤ ~10 entries),
 * so the O(n) loop is trivial. The FNV-1a hash is O(|sessionId|) — a 36-char
 * UUID v7 is ~36 iterations, negligible.
 */

/**
 * FNV-1a 32-bit hash of an ASCII string. Same algorithm spec'd in the
 * Plan 04-02 PLAN.md «action» block; reproduced here so the production
 * code path is self-contained and not a documentation diff.
 */
function hashString(s: string): number {
  let h = 2166136261; // FNV-1a 32-bit offset basis.
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV-1a 32-bit prime.
  }
  // Coerce to unsigned 32-bit before returning so downstream callers see a
  // non-negative seed regardless of sign-bit churn during xor.
  return h >>> 0;
}

/**
 * Mulberry32 — a small, well-distributed 32-bit PRNG with a single uint32
 * state. Output is a float in `[0, 1)`. Source: Tommy Ettinger's public
 * domain port (en.wikipedia.org/wiki/Linear_congruential_generator family).
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle of `items` seeded by `sessionId`. Returns a fresh
 * array; the input is never mutated. Empty / singleton inputs are returned
 * as a defensive copy so the caller can treat the result uniformly.
 */
export function deterministicShuffle<T>(items: readonly T[], sessionId: string): T[] {
  if (items.length <= 1) return [...items];
  const rng = mulberry32(hashString(sessionId));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}
