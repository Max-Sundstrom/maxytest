/**
 * `scale-stats` — Plan 04-03 Task 3.
 *
 * Pure aggregator for BLK-05 (numeric scale, 5/7/10-point). Consumes the
 * `points` setting (configured by the designer) and an array of scale
 * responses (each carrying an integer `value` in 1..points). Produces a
 * histogram array of length `points`, plus mean / median / std / n for
 * the focused-block card stat tiles (Plan 04-04).
 *
 * Statistics:
 *   - `mean`   — arithmetic mean rounded to 2 decimals.
 *   - `median` — quantile(values, 0.5) from `./quantile.ts` (linear
 *               interpolation, R-7 / Excel-style), rounded to 2 decimals.
 *   - `std`    — POPULATION std-dev (`sqrt(sum((v-mean)^2)/n)`), rounded
 *               to 2 decimals. We use population (not sample) std because
 *               the dataset IS the population for a given test run; we're
 *               not inferring about a wider universe.
 *
 * Defensive:
 *   - Empty / all-invalid responses → histogram of zeros, all stats 0, n=0.
 *   - Non-integer / out-of-range values are SKIPPED (don't contribute to n
 *     or histogram).
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { ScaleAnswer } from '@/lib/blocks/schemas';
import { quantile } from './quantile';

export interface ScaleStats {
  /** Length === `points`; histogram[i] = count of responses with value === i+1. */
  histogram: number[];
  mean: number;
  median: number;
  std: number;
  n: number;
}

/**
 * Aggregate scale responses into histogram + descriptive stats.
 *
 * @param points     5 | 7 | 10 — the configured scale resolution.
 * @param responses  Per-session answers; only `value` is read.
 */
export function scaleStats(
  points: 5 | 7 | 10,
  responses: readonly { session_id: string; answer: ScaleAnswer }[],
): ScaleStats {
  const histogram = new Array<number>(points).fill(0);
  const values: number[] = [];

  for (const r of responses) {
    const v = r.answer?.value;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > points) continue;
    histogram[v - 1] = (histogram[v - 1] ?? 0) + 1;
    values.push(v);
  }

  const n = values.length;
  if (n === 0) {
    return { histogram, mean: 0, median: 0, std: 0, n: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const meanRaw = sum / n;
  const mean = Math.round(meanRaw * 100) / 100;

  // quantile requires ascending sort.
  const sortedAsc = [...values].sort((a, b) => a - b);
  const medianRaw = quantile(sortedAsc, 0.5);
  const median = Math.round(medianRaw * 100) / 100;

  const variance = values.reduce((acc, v) => acc + (v - meanRaw) * (v - meanRaw), 0) / n;
  const std = Math.round(Math.sqrt(variance) * 100) / 100;

  return { histogram, mean, median, std, n };
}
