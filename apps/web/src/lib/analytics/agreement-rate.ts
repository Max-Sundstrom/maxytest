/**
 * `agreement-rate` — Plan 04-03 Task 4.
 *
 * Pure aggregator for BLK-07 (agreement block, legal-text checkbox). Consumes
 * agreement responses + a `validSessionIds` set (sessions that completed
 * enough of the test to count toward the report) and produces the agreed /
 * declined split + agreement percentage.
 *
 * Semantics (CONTEXT.md D-95):
 *   - `total`        = validSessionIds.size (denominator). Sessions that
 *                      never reached the agreement block are NOT counted as
 *                      «declined» — that would punish the agreement block's
 *                      acceptance rate for unrelated drop-off.
 *   - `agreed`       = number of sessions in `validSessionIds` whose answer
 *                      has `agreed === true` (each session counted once even
 *                      if the response table somehow has two rows for the
 *                      same session, e.g. resume + resubmit edge).
 *   - `declined`     = total - agreed (clamped at 0 for defensive safety).
 *   - `agreementPct` = round(agreed / total * 1000) / 10. Returns 0 when
 *                      total === 0.
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { AgreementAnswer } from '@/lib/blocks/schemas';

export interface AgreementRate {
  agreed: number;
  declined: number;
  total: number;
  /** 1-decimal rounded percentage in 0..100. */
  agreementPct: number;
}

export function agreementRate(
  responses: readonly { session_id: string; answer: Partial<AgreementAnswer> }[],
  validSessionIds: ReadonlySet<string>,
): AgreementRate {
  const total = validSessionIds.size;

  let agreed = 0;
  const seen = new Set<string>();
  for (const r of responses) {
    if (!validSessionIds.has(r.session_id)) continue;
    if (seen.has(r.session_id)) continue;
    seen.add(r.session_id);
    if (r.answer?.agreed === true) agreed++;
  }

  const declined = Math.max(total - agreed, 0);
  const agreementPct = total === 0 ? 0 : Math.round((agreed / total) * 1000) / 10;

  return { agreed, declined, total, agreementPct };
}
