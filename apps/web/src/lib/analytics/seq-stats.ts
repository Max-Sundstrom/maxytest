/**
 * `seq-stats` — Quick task 260522-jwn.
 *
 * SEQ (Single Ease Question, Sauro & Dumas 2009) is a canonical 7-point
 * post-task usability survey. Aggregator is a thin wrapper over
 * `scaleStats(7, ...)` — SeqAnswer.value (int 1..7) is a strict subset of
 * ScaleAnswer.value (int 1..10), so the cast is safe.
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { ScaleAnswer, SeqAnswer } from '@/lib/blocks/schemas';
import { scaleStats, type ScaleStats } from './scale-stats';

/**
 * Aggregate SEQ responses into the standard `ScaleStats` shape with
 * `histogram.length === 7`.
 */
export function seqStats(
  responses: readonly { session_id: string; answer: SeqAnswer }[],
): ScaleStats {
  return scaleStats(
    7,
    responses as unknown as readonly { session_id: string; answer: ScaleAnswer }[],
  );
}
