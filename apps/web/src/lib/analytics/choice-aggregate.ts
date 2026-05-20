/**
 * `choice-aggregate` — Plan 04-03 Task 2.
 *
 * Pure aggregator for BLK-04 (choice block, single + multi mode). Consumes
 * the block content (option list, hasOtherOption) and an array of choice
 * responses and produces sorted bars + a flat list of `otherText` strings
 * for the focused-block card (Plan 04-04) and the public-share view
 * (Plan 04-06).
 *
 * Sorting contract (CONTEXT.md §"Choice focused-block"):
 *   - bars sorted by `count` DESC; ties broken by the ORIGINAL option order
 *     in `block.options` so the chart stays stable under repeated renders.
 *   - When `hasOtherOption === true` the «Другое» (Other) bar is appended
 *     LAST regardless of count (visual convention: "other" never sits
 *     between two named options).
 *
 * Percentages are rounded to 1 decimal (`Math.round((c/total)*1000)/10`)
 * matching the format used elsewhere in the report (`nps-breakdown`,
 * `context-aggregate.experience.histogram`).
 *
 * Defensive:
 *   - Empty responses → empty bars[], totalResponses=0, otherTexts=[].
 *   - Responses with NEITHER `selectedId` NOR `selectedIds` are skipped
 *     (don't contribute to totalResponses).
 *   - `selectedIds: []` (empty array, multi mode) is treated as no selection
 *     and skipped.
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { ChoiceContent, ChoiceAnswer } from '@/lib/blocks/schemas';

export interface ChoiceBar {
  optionId: string;
  label: string;
  count: number;
  pct: number;
  /** True only for the appended «Другое» bar when `hasOtherOption` is set. */
  isOtherOption: boolean;
}

export interface ChoiceAggregate {
  bars: ChoiceBar[];
  /** Number of responses that contributed at least one selection. */
  totalResponses: number;
  /** Flat list of every non-empty `otherText` value (order of submission). */
  otherTexts: string[];
}

/**
 * Aggregate choice responses into sorted bars.
 *
 * @param block      The BLK-04 choice content (options + hasOtherOption flag).
 * @param responses  Per-session answers; only `selectedId` / `selectedIds`
 *                   / `otherText` are read.
 */
export function choiceAggregate(
  block: ChoiceContent,
  responses: readonly { session_id: string; answer: ChoiceAnswer }[],
): ChoiceAggregate {
  if (responses.length === 0) {
    return { bars: [], totalResponses: 0, otherTexts: [] };
  }

  const counts = new Map<string, number>();
  const otherTexts: string[] = [];
  let totalResponses = 0;

  for (const r of responses) {
    const a = r.answer;
    if (!a) continue;
    const hasSingle = typeof a.selectedId === 'string' && a.selectedId.length > 0;
    const hasMulti = Array.isArray(a.selectedIds) && a.selectedIds.length > 0;
    if (!hasSingle && !hasMulti) continue;
    totalResponses++;
    if (hasSingle) {
      counts.set(a.selectedId as string, (counts.get(a.selectedId as string) ?? 0) + 1);
    }
    if (hasMulti) {
      for (const id of a.selectedIds as string[]) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    if (typeof a.otherText === 'string' && a.otherText.length > 0) {
      otherTexts.push(a.otherText);
    }
  }

  // Original option order — used to break ties deterministically.
  const optionOrder = new Map(block.options.map((o, i) => [o.id, i] as const));

  const bars: ChoiceBar[] = block.options.map((opt) => {
    const c = counts.get(opt.id) ?? 0;
    return {
      optionId: opt.id,
      label: opt.label,
      count: c,
      pct: totalResponses === 0 ? 0 : Math.round((c / totalResponses) * 1000) / 10,
      isOtherOption: false,
    };
  });

  bars.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (optionOrder.get(a.optionId) ?? 0) - (optionOrder.get(b.optionId) ?? 0);
  });

  if (block.hasOtherOption) {
    const otherCount = otherTexts.length;
    bars.push({
      optionId: '__other__',
      label: 'Другое',
      count: otherCount,
      pct: totalResponses === 0 ? 0 : Math.round((otherCount / totalResponses) * 1000) / 10,
      isOtherOption: true,
    });
  }

  return { bars, totalResponses, otherTexts };
}
