/**
 * `nps-breakdown` — Plan 04-03 Task 3.
 *
 * Pure aggregator for BLK-06 (Net Promoter Score, 0–10 scale). Consumes
 * NPS responses and produces the standard NPS breakdown:
 *
 *   - score 0–6   → detractor
 *   - score 7–8   → passive
 *   - score 9–10  → promoter
 *   - NPS         = promoterPct - detractorPct (rounded to integer, range
 *                   -100..+100)
 *
 * Also produces an 11-cell histogram (buckets for 0..10) so the focused-block
 * card (Plan 04-04) can render the standard NPS distribution chart alongside
 * the score.
 *
 * Defensive:
 *   - Empty responses → all zeros (histogram of 11 zeros, score 0, n=0).
 *   - Non-integer / out-of-range values are SKIPPED (don't contribute to
 *     n or histogram).
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { NpsAnswer } from '@/lib/blocks/schemas';

export interface NpsBreakdown {
  promoters: number;
  passives: number;
  detractors: number;
  /** Promoter percentage, 1-decimal rounded. */
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
  /** Net Promoter Score: promoterPct - detractorPct, rounded to nearest integer. */
  npsScore: number;
  n: number;
  /** Length === 11; histogram[s] = count of responses with score === s. */
  histogram: number[];
}

export function npsBreakdown(
  responses: readonly { session_id: string; answer: NpsAnswer }[],
): NpsBreakdown {
  const histogram = new Array<number>(11).fill(0);
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const r of responses) {
    const s = r.answer?.score;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 10) continue;
    histogram[s] = (histogram[s] ?? 0) + 1;
    if (s <= 6) detractors++;
    else if (s <= 8) passives++;
    else promoters++;
  }

  const n = promoters + passives + detractors;
  if (n === 0) {
    return {
      promoters: 0,
      passives: 0,
      detractors: 0,
      promoterPct: 0,
      passivePct: 0,
      detractorPct: 0,
      npsScore: 0,
      n: 0,
      histogram,
    };
  }

  const promoterPct = Math.round((promoters / n) * 1000) / 10;
  const passivePct = Math.round((passives / n) * 1000) / 10;
  const detractorPct = Math.round((detractors / n) * 1000) / 10;
  const npsScore = Math.round(promoterPct - detractorPct);

  return {
    promoters,
    passives,
    detractors,
    promoterPct,
    passivePct,
    detractorPct,
    npsScore,
    n,
    histogram,
  };
}
