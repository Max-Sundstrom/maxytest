/**
 * `low-n-gate` — Phase 4 D-103 reusable threshold.
 *
 * When a filtered sample size falls below 5, focused-block charts should
 * collapse to a "low-N" empty-state instead of rendering histogram / bars /
 * NPS-score with statistically meaningless numbers. The same gate is applied
 * uniformly in the designer-side report (Plan 04-04) and the public share
 * view (Plan 04-06) so private + public surfaces never diverge.
 *
 * Pure module — no React, no Supabase, no DOM. Defensive on NaN.
 */

/**
 * The N≥5 threshold. Exported as a constant so call sites can both
 * (a) gate rendering with `passLowNGate(n)` and (b) render a localized
 * "нужно минимум {LOW_N_THRESHOLD}" empty-state string.
 */
export const LOW_N_THRESHOLD = 5;

/**
 * Returns true iff `n >= LOW_N_THRESHOLD`.
 *
 * Defensive:
 *   - NaN          → false (treated as "no data").
 *   - -Infinity    → false.
 *   - +Infinity    → true (any infinite count clearly clears the gate).
 *   - 0 / negative → false.
 */
export function passLowNGate(n: number): boolean {
  if (Number.isNaN(n)) return false;
  if (n === Number.POSITIVE_INFINITY) return true;
  if (!Number.isFinite(n)) return false;
  return n >= LOW_N_THRESHOLD;
}
