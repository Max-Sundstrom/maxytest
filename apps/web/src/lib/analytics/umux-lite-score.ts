/**
 * `umux-lite-score` — Quick task 260522-jwn.
 *
 * UMUX-Lite (Lewis 2013) is a two-item, 7-point Likert usability survey.
 * Composite formula per the canonical Lewis paper:
 *
 *   composite = ((item1 - 1) + (item2 - 1)) * (100 / 12)
 *
 * Range check (LOAD-BEARING — Pitfall 1 in RESEARCH.md):
 *   - (1, 1) → 0     (worst response)
 *   - (4, 4) → 50    (midpoint — most-failed test in implementations
 *                     that forget the `-1` normalisation)
 *   - (7, 7) → 100   (best response)
 *
 * Sources:
 *   - Lewis (2013) "UMUX-LITE: When there's no time for the SUS"
 *   - UXtweak / Bluecadò vendor cross-references
 *
 * Partial-row policy (Pitfall 7 / T-quick-jwn-04):
 *   - Rows where item1 OR item2 is null/undefined are SKIPPED from composite
 *     (no NaN propagation).
 *   - Per-item histograms still count the partial row's present item.
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { UmuxLiteAnswer } from '@/lib/blocks/schemas';
import { quantile } from './quantile';

export interface UmuxLiteStats {
  /** Mean of item1 values across rows that supplied item1. 0 when no such rows. */
  item1Mean: number;
  /** Mean of item2 values across rows that supplied item2. 0 when no such rows. */
  item2Mean: number;
  /** Mean composite (0..100) across complete rows (both items present). 0 when no such rows. */
  compositeMean: number;
  /** Median composite (0..100) across complete rows. 0 when no such rows. */
  compositeMedian: number;
  /** Number of COMPLETE rows (both item1 AND item2 answered). */
  n: number;
  /** Length 7; histogram[i] = count of rows with item1 === i+1. */
  item1Histogram: number[];
  /** Length 7; histogram[i] = count of rows with item2 === i+1. */
  item2Histogram: number[];
}

/**
 * UMUX-Lite composite score (0..100) from two 7-point Likert item ratings.
 *
 * Item values MUST be integers in 1..7. Values outside that range produce
 * mathematically valid but semantically meaningless results — caller (Zod
 * schema + aggregator) is responsible for upstream validation.
 */
export function umuxLiteScore(item1: number, item2: number): number {
  return (item1 - 1 + (item2 - 1)) * (100 / 12);
}

/**
 * Aggregate UMUX-Lite responses across sessions.
 *
 * Defensive: per-item histograms and means count ROWS where that item was
 * answered, independently of the other item. Composite stats count only
 * rows where BOTH items were answered.
 */
export function umuxLiteStats(
  responses: readonly { session_id: string; answer: UmuxLiteAnswer }[],
): UmuxLiteStats {
  const item1Histogram = new Array<number>(7).fill(0);
  const item2Histogram = new Array<number>(7).fill(0);
  const item1Values: number[] = [];
  const item2Values: number[] = [];
  const composites: number[] = [];

  for (const r of responses) {
    const i1 = r.answer?.item1;
    const i2 = r.answer?.item2;
    const i1Valid = typeof i1 === 'number' && Number.isInteger(i1) && i1 >= 1 && i1 <= 7;
    const i2Valid = typeof i2 === 'number' && Number.isInteger(i2) && i2 >= 1 && i2 <= 7;
    if (i1Valid) {
      item1Histogram[i1 - 1] = (item1Histogram[i1 - 1] ?? 0) + 1;
      item1Values.push(i1);
    }
    if (i2Valid) {
      item2Histogram[i2 - 1] = (item2Histogram[i2 - 1] ?? 0) + 1;
      item2Values.push(i2);
    }
    if (i1Valid && i2Valid) {
      composites.push(umuxLiteScore(i1, i2));
    }
  }

  const item1Mean =
    item1Values.length === 0
      ? 0
      : Math.round((item1Values.reduce((a, b) => a + b, 0) / item1Values.length) * 100) / 100;
  const item2Mean =
    item2Values.length === 0
      ? 0
      : Math.round((item2Values.reduce((a, b) => a + b, 0) / item2Values.length) * 100) / 100;
  const compositeMean =
    composites.length === 0
      ? 0
      : Math.round((composites.reduce((a, b) => a + b, 0) / composites.length) * 100) / 100;
  const compositeMedian =
    composites.length === 0
      ? 0
      : Math.round(
          quantile(
            [...composites].sort((a, b) => a - b),
            0.5,
          ) * 100,
        ) / 100;

  return {
    item1Mean,
    item2Mean,
    compositeMean,
    compositeMedian,
    n: composites.length,
    item1Histogram,
    item2Histogram,
  };
}
