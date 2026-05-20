/**
 * `context-aggregate` — Plan 04-03 Task 4.
 *
 * Pure aggregator for BLK-08 (context block — composite age + experience +
 * role). Each sub-question is independently `enabled` per CONTEXT.md D-92, so
 * the aggregator returns `null` for any disabled sub-question (and the
 * focused-block card skips that section entirely).
 *
 * Per-sub-question contracts:
 *   - **age**       — bucket-id frequencies sorted by `block.age_question.options`
 *                      ORIGINAL order so the chart stays stable. Unknown age
 *                      ids in the response are ignored defensively.
 *   - **experience** — N-cell histogram (always 5 in v1, D-92) + mean. Mean
 *                      rounded to 2 decimals.
 *   - **role**      — flat list of `{ text, sessionId }` preserving submission
 *                      order. `sessionId` is needed for the public-share
 *                      open-answer toggle in Plan 04-06 — designer-side just
 *                      renders text.
 *
 * `n` is the total number of respondents who provided at least ONE non-null
 * answer to an ENABLED sub-question. A session that answered nothing in the
 * context block does NOT contribute to `n`.
 *
 * Pure module — no React, no Supabase, no clock reads.
 */

import type { ContextContent, ContextAnswer } from '@/lib/blocks/schemas';

export interface ContextAgeBucket {
  bucketId: string;
  label: string;
  count: number;
  pct: number;
}

export interface ContextExperience {
  histogram: number[];
  mean: number;
  n: number;
}

export interface ContextRoleEntry {
  text: string;
  sessionId: string;
}

export interface ContextAggregate {
  /** `null` when `age_question?.enabled` is false. */
  age: ContextAgeBucket[] | null;
  /** `null` when `experience_question?.enabled` is false. */
  experience: ContextExperience | null;
  /** `null` when `role_question?.enabled` is false. */
  role: ContextRoleEntry[] | null;
  /** Respondents with at least one non-null answer to an enabled sub-question. */
  n: number;
}

export function contextAggregate(
  block: ContextContent,
  responses: readonly { session_id: string; answer: Partial<ContextAnswer> }[],
): ContextAggregate {
  // ── Age section ──────────────────────────────────────────────────────
  let age: ContextAgeBucket[] | null = null;
  if (block.age_question?.enabled) {
    const opts = block.age_question.options;
    const counts = new Map<string, number>(opts.map((o) => [o.id, 0] as const));
    let total = 0;
    for (const r of responses) {
      const id = r.answer?.age;
      if (typeof id === 'string' && counts.has(id)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        total++;
      }
    }
    age = opts.map((o) => {
      const c = counts.get(o.id) ?? 0;
      return {
        bucketId: o.id,
        label: o.label,
        count: c,
        pct: total === 0 ? 0 : Math.round((c / total) * 1000) / 10,
      };
    });
  }

  // ── Experience section ───────────────────────────────────────────────
  let experience: ContextExperience | null = null;
  if (block.experience_question?.enabled) {
    const points = block.experience_question.points;
    const histogram = new Array<number>(points).fill(0);
    const values: number[] = [];
    for (const r of responses) {
      const v = r.answer?.experience;
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= points) {
        histogram[v - 1] = (histogram[v - 1] ?? 0) + 1;
        values.push(v);
      }
    }
    const en = values.length;
    const mean = en === 0 ? 0 : Math.round((values.reduce((a, b) => a + b, 0) / en) * 100) / 100;
    experience = { histogram, mean, n: en };
  }

  // ── Role section ─────────────────────────────────────────────────────
  let role: ContextRoleEntry[] | null = null;
  if (block.role_question?.enabled) {
    const list: ContextRoleEntry[] = [];
    for (const r of responses) {
      const t = r.answer?.role;
      if (typeof t === 'string' && t.length > 0) {
        list.push({ text: t, sessionId: r.session_id });
      }
    }
    role = list;
  }

  // ── n — respondents with at least one non-null enabled answer ────────
  let n = 0;
  for (const r of responses) {
    const a = r.answer ?? {};
    const ageMatch = block.age_question?.enabled && typeof a.age === 'string';
    const expMatch = block.experience_question?.enabled && typeof a.experience === 'number';
    const roleMatch =
      block.role_question?.enabled && typeof a.role === 'string' && a.role.length > 0;
    if (ageMatch || expMatch || roleMatch) n++;
  }

  return { age, experience, role, n };
}
