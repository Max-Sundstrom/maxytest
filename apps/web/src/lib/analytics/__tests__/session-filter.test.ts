/**
 * `session-filter` unit tests — Plan 03.1-03 Task 1.
 *
 * Locks CONTEXT.md GA2 / D-72 semantics:
 *   - «Завершённые» = `session.status === 'completed'` OR has a `task_finish` event
 *     for the session OR an outcome is classified (success / giveup).
 *   - «Неполные» = none of the above (covers `in_progress`, `abandoned`, and the
 *     missing-session-row corner case).
 *
 * Fixture pattern mirrors `funnel-steps.test.ts`: a minimal `ev()` literal-cast
 * helper for `BlockEventRow` + a `sess()` helper for `DesignerSession` rows
 * (only the columns the function reads are populated; the rest are cast away).
 */

import { describe, expect, it } from 'vitest';

import type { ClassifyOutcomeResult } from '../classify-outcome';
import {
  classifyCompletion,
  classifySurveyCompletion,
  filterEventsByStatus,
  type StatusFilter,
  type SurveyCompletionRow,
} from '../session-filter';
import type { BlockEventRow } from '@/lib/queries/block-events';
import type { DesignerSession } from '@/lib/queries/designer-sessions';
import type { Block } from '@/lib/blocks/types';
import type { AgreementContent } from '@/lib/blocks/schemas';

const EPOCH = '2026-05-18T00:00:00.000Z';

/** Helper — build a minimal BlockEventRow with sensible defaults. */
function ev(partial: Partial<BlockEventRow>): BlockEventRow {
  return {
    id: 'e0',
    x: null,
    y: null,
    hotspot_id: null,
    hit_target_id: null,
    event_type: 'frame_enter',
    seq: 1,
    session_id: 's1',
    client_ts: EPOCH,
    frame_id: null,
    ...partial,
  } as BlockEventRow;
}

/**
 * Helper — build a minimal DesignerSession with only the columns this
 * filter reads populated. The Supabase Row type has many other columns
 * (started_at, device_type, etc.) — they're irrelevant here and cast away.
 */
function sess(partial: {
  id: string;
  status: DesignerSession['status'];
  study_id?: string;
}): DesignerSession {
  return {
    id: partial.id,
    study_id: partial.study_id ?? 'study-1',
    status: partial.status,
  } as unknown as DesignerSession;
}

/** Helper — build a minimal ClassifyOutcomeResult. */
function outcome(sessionId: string, kind: 'success' | 'giveup' = 'success'): ClassifyOutcomeResult {
  return {
    sessionId,
    outcome: kind,
    durationMs: 1000,
    firstEventTs: EPOCH,
    lastEventTs: EPOCH,
  };
}

describe('classifyCompletion', () => {
  it('returns "completed" when session.status === "completed" (no events, no outcomes)', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'completed' })],
    ]);
    const result = classifyCompletion('s1', sessionsById, [], []);
    expect(result).toBe('completed');
  });

  it('returns "completed" when session is in_progress but a task_finish event exists for it', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const events: BlockEventRow[] = [ev({ session_id: 's1', event_type: 'task_finish', seq: 10 })];
    const result = classifyCompletion('s1', sessionsById, events, []);
    expect(result).toBe('completed');
  });

  it('returns "completed" when session is in_progress but it has an entry in outcomes', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const outcomes: ClassifyOutcomeResult[] = [outcome('s1', 'success')];
    const result = classifyCompletion('s1', sessionsById, [], outcomes);
    expect(result).toBe('completed');
  });

  it('returns "incomplete" when session is in_progress, no task_finish, no outcome', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', event_type: 'frame_enter', frame_id: 'f1', seq: 1 }),
    ];
    const result = classifyCompletion('s1', sessionsById, events, []);
    expect(result).toBe('incomplete');
  });

  it('returns "incomplete" when session.status === "abandoned" with no task_finish + no outcome', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'abandoned' })],
    ]);
    const result = classifyCompletion('s1', sessionsById, [], []);
    expect(result).toBe('incomplete');
  });

  it('returns "incomplete" when session is missing from sessionsById (corner case)', () => {
    const sessionsById = new Map<string, DesignerSession>();
    const result = classifyCompletion('s-unknown', sessionsById, [], []);
    expect(result).toBe('incomplete');
  });

  it('task_finish event for a DIFFERENT session does not flip THIS session to completed', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
      ['s2', sess({ id: 's2', status: 'in_progress' })],
    ]);
    const events: BlockEventRow[] = [ev({ session_id: 's2', event_type: 'task_finish', seq: 10 })];
    const result = classifyCompletion('s1', sessionsById, events, []);
    expect(result).toBe('incomplete');
  });
});

describe('filterEventsByStatus', () => {
  // Shared fixture: 2 sessions — s1 completed (status='completed'), s2 incomplete.
  const sessionsById = new Map<string, DesignerSession>([
    ['s1', sess({ id: 's1', status: 'completed' })],
    ['s2', sess({ id: 's2', status: 'in_progress' })],
  ]);
  const events: BlockEventRow[] = [
    ev({ id: 'e1', session_id: 's1', frame_id: 'f1', event_type: 'frame_enter', seq: 1 }),
    ev({ id: 'e2', session_id: 's1', frame_id: 'f2', event_type: 'frame_enter', seq: 2 }),
    ev({ id: 'e3', session_id: 's2', frame_id: 'f1', event_type: 'frame_enter', seq: 1 }),
  ];
  const outcomes: ClassifyOutcomeResult[] = []; // no classified outcomes here

  it('both flags true → shallow copy of all events (reference inequality holds)', () => {
    const filter: StatusFilter = { completed: true, incomplete: true };
    const result = filterEventsByStatus(events, sessionsById, outcomes, filter);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
    // Reference inequality: callers rely on this for useMemo invalidation.
    expect(result).not.toBe(events);
  });

  it('both flags false → empty array', () => {
    const filter: StatusFilter = { completed: false, incomplete: false };
    const result = filterEventsByStatus(events, sessionsById, outcomes, filter);
    expect(result).toEqual([]);
  });

  it('completed only → returns events from session s1 only', () => {
    const filter: StatusFilter = { completed: true, incomplete: false };
    const result = filterEventsByStatus(events, sessionsById, outcomes, filter);
    expect(result.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('incomplete only → returns events from session s2 only', () => {
    const filter: StatusFilter = { completed: false, incomplete: true };
    const result = filterEventsByStatus(events, sessionsById, outcomes, filter);
    expect(result.map((e) => e.id).sort()).toEqual(['e3']);
  });

  it('task_finish event promotes an in_progress session to completed under completed-only filter', () => {
    // s2 is in_progress per sessionsById, BUT has a task_finish event → should be classified completed.
    const eventsWithFinish: BlockEventRow[] = [
      ev({ id: 'e1', session_id: 's1', frame_id: 'f1', event_type: 'frame_enter', seq: 1 }),
      ev({ id: 'e3', session_id: 's2', frame_id: 'f1', event_type: 'frame_enter', seq: 1 }),
      ev({ id: 'e4', session_id: 's2', event_type: 'task_finish', seq: 2 }),
    ];
    const filter: StatusFilter = { completed: true, incomplete: false };
    const result = filterEventsByStatus(eventsWithFinish, sessionsById, outcomes, filter);
    // Both sessions should now match completed.
    expect(result.map((e) => e.id).sort()).toEqual(['e1', 'e3', 'e4']);
  });

  it('outcome entry promotes an in_progress session to completed under completed-only filter', () => {
    const filter: StatusFilter = { completed: true, incomplete: false };
    const outcomesWithS2: ClassifyOutcomeResult[] = [outcome('s2', 'giveup')];
    const result = filterEventsByStatus(events, sessionsById, outcomesWithS2, filter);
    // Now both s1 (status=completed) AND s2 (has outcome) match completed.
    expect(result.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Phase 4 / Plan 04-03 / L-1 closure — classifySurveyCompletion +
// classifyCompletion 4th OR-branch.
// ──────────────────────────────────────────────────────────────────────────

/** Build a minimal Block — only the fields the function reads. */
function blk(partial: { id: string; type: Block['type']; required?: boolean }): Block {
  const content =
    partial.type === 'agreement'
      ? ({ type: 'agreement', required: partial.required ?? true } as Partial<AgreementContent>)
      : { type: partial.type };
  return {
    id: partial.id,
    type: partial.type,
    content,
  } as unknown as Block;
}

/** Build a minimal SurveyCompletionRow. */
function sr(session_id: string, block_id: string): SurveyCompletionRow {
  return { session_id, block_id };
}

describe('classifySurveyCompletion (L-1)', () => {
  it('returns false when no survey blocks exist (prototype-only test)', () => {
    const blocks: Block[] = [
      blk({ id: 'b-welcome', type: 'welcome' }),
      blk({ id: 'b-proto', type: 'prototype' }),
      blk({ id: 'b-thanks', type: 'thanks' }),
    ];
    const result = classifySurveyCompletion('s1', blocks, [
      sr('s1', 'b-proto'), // ignored; prototype is not a survey block
    ]);
    expect(result).toBe(false);
  });

  it('returns false when session has no responses for any required block', () => {
    const blocks: Block[] = [
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-scale', type: 'scale' }),
    ];
    const result = classifySurveyCompletion('s1', blocks, []);
    expect(result).toBe(false);
  });

  it('returns true when session answered all required survey blocks', () => {
    const blocks: Block[] = [
      blk({ id: 'b-welcome', type: 'welcome' }),
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-scale', type: 'scale' }),
      blk({ id: 'b-nps', type: 'nps' }),
      blk({ id: 'b-thanks', type: 'thanks' }),
    ];
    const responses: SurveyCompletionRow[] = [
      sr('s1', 'b-choice'),
      sr('s1', 'b-scale'),
      sr('s1', 'b-nps'),
    ];
    expect(classifySurveyCompletion('s1', blocks, responses)).toBe(true);
  });

  it('returns false when session missed one required block (partial answer)', () => {
    const blocks: Block[] = [
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-scale', type: 'scale' }),
    ];
    const responses: SurveyCompletionRow[] = [sr('s1', 'b-choice')]; // missing b-scale
    expect(classifySurveyCompletion('s1', blocks, responses)).toBe(false);
  });

  it('ignores welcome/thanks/prototype blocks (they are not survey-required)', () => {
    const blocks: Block[] = [
      blk({ id: 'b-welcome', type: 'welcome' }),
      blk({ id: 'b-proto', type: 'prototype' }),
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-thanks', type: 'thanks' }),
    ];
    // Only b-choice needs an answer.
    expect(classifySurveyCompletion('s1', blocks, [sr('s1', 'b-choice')])).toBe(true);
  });

  it('agreement block with required=false is NOT survey-required', () => {
    const blocks: Block[] = [
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-agree', type: 'agreement', required: false }),
    ];
    // Only b-choice answered — agreement is optional, so the session completes.
    expect(classifySurveyCompletion('s1', blocks, [sr('s1', 'b-choice')])).toBe(true);
  });

  it('agreement block with required=true IS survey-required', () => {
    const blocks: Block[] = [
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-agree', type: 'agreement', required: true }),
    ];
    expect(classifySurveyCompletion('s1', blocks, [sr('s1', 'b-choice')])).toBe(false);
    expect(
      classifySurveyCompletion('s1', blocks, [sr('s1', 'b-choice'), sr('s1', 'b-agree')]),
    ).toBe(true);
  });

  it("different sessions are isolated — s1's answers do not help s2", () => {
    const blocks: Block[] = [blk({ id: 'b-choice', type: 'choice' })];
    const responses: SurveyCompletionRow[] = [sr('s1', 'b-choice')];
    expect(classifySurveyCompletion('s1', blocks, responses)).toBe(true);
    expect(classifySurveyCompletion('s2', blocks, responses)).toBe(false);
  });

  it('open_question and context are survey-required', () => {
    const blocks: Block[] = [
      blk({ id: 'b-open', type: 'open_question' }),
      blk({ id: 'b-ctx', type: 'context' }),
    ];
    expect(classifySurveyCompletion('s1', blocks, [sr('s1', 'b-open')])).toBe(false);
    expect(classifySurveyCompletion('s1', blocks, [sr('s1', 'b-open'), sr('s1', 'b-ctx')])).toBe(
      true,
    );
  });
});

describe('classifyCompletion (L-1 extension — 4th OR-branch)', () => {
  it('zero regression: still returns "completed" via task_finish path when blocks/responses omitted', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const events: BlockEventRow[] = [ev({ session_id: 's1', event_type: 'task_finish', seq: 10 })];
    // Calls with the original Phase 3.1 signature — blocks/responses default to [].
    expect(classifyCompletion('s1', sessionsById, events, [])).toBe('completed');
  });

  it('returns "completed" via NEW survey-completion path when prototype absent', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const blocks: Block[] = [
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-scale', type: 'scale' }),
    ];
    const responses: SurveyCompletionRow[] = [sr('s1', 'b-choice'), sr('s1', 'b-scale')];
    // No task_finish, no outcomes, sessions.status != completed — only the
    // survey-path can promote this to «completed».
    expect(classifyCompletion('s1', sessionsById, [], [], blocks, responses)).toBe('completed');
  });

  it('returns "incomplete" when survey-only session missed one required block', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const blocks: Block[] = [
      blk({ id: 'b-choice', type: 'choice' }),
      blk({ id: 'b-scale', type: 'scale' }),
    ];
    const responses: SurveyCompletionRow[] = [sr('s1', 'b-choice')]; // missing b-scale
    expect(classifyCompletion('s1', sessionsById, [], [], blocks, responses)).toBe('incomplete');
  });

  it('prototype-only test with explicit empty survey args — survey-path no-ops', () => {
    const sessionsById = new Map<string, DesignerSession>([
      ['s1', sess({ id: 's1', status: 'in_progress' })],
    ]);
    const blocks: Block[] = [
      blk({ id: 'b-welcome', type: 'welcome' }),
      blk({ id: 'b-proto', type: 'prototype' }),
      blk({ id: 'b-thanks', type: 'thanks' }),
    ];
    // No prototype-completion signals → incomplete; survey-path returns false
    // because no survey blocks exist.
    expect(classifyCompletion('s1', sessionsById, [], [], blocks, [])).toBe('incomplete');
  });
});
