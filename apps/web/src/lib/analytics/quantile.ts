/**
 * `quantile` — pure utility for linear-interpolation p-quantile.
 *
 * Source: 03-RESEARCH.md §"Quantile helper" lines 1245-1257 (canonical 13-line
 * impl, pasted 1:1). R-7 / Excel-style — same definition as lodash, numpy
 * default. Caller MUST pre-sort the array ascending; we do not sort defensively
 * because every analytics consumer (frame-timings, time-on-frame, header
 * aggregates) already has a sorted-by-construction array, and re-sorting here
 * would mask bugs where the input was unsorted by accident.
 *
 * Defensive returns:
 *   - empty array      → 0 (caller should check sample_size)
 *   - length === 1     → the single element
 *   - p <= 0           → first element
 *   - p >= 1           → last element
 *
 * Reused by Plan 03-01 (header aggregates median/avg) and downstream Plans
 * 03-02..03-06 (transition graph dwell, time-on-frame P95, funnel time).
 */
export function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  if (p <= 0) return sortedAsc[0]!;
  if (p >= 1) return sortedAsc[sortedAsc.length - 1]!;

  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const frac = idx - lo;
  return sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac;
}
