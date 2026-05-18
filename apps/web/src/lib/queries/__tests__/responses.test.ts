/**
 * `buildResponseRows` + `applyStatusFilterToRows` unit tests — Plan 03.1-04 Task 1.
 *
 * Locks CONTEXT.md GA3 / D-73 contract:
 *   - Sort order: `started_at` DESC (newest first).
 *   - Device-type mapping: 'mobile' | 'desktop' | 'tablet' pass through,
 *     anything else (null, '', 'foo') → 'unknown'.
 *   - Outcome resolution: 'success' | 'giveup' from `outcomes` lookup,
 *     'incomplete' fallback when no entry.
 *   - prototypeSummary: null when the session has zero events; non-null
 *     when there are events at all (framesVisited counts distinct
 *     `frame_enter.frame_id`s, durationMs is last−first `client_ts`).
 *   - statusFilter applied at the row level (re-uses Plan 03.1-03
 *     `classifyCompletion` semantics).
 *
 * Fixture pattern mirrors `funnel-steps.test.ts` and `session-filter.test.ts`:
 * minimal literal-cast helpers (`ev`, `sess`, `outcome`) populating only the
 * fields the function under test reads.
 */

import { describe, expect, it, vi } from 'vitest';

// `responses.ts` co-houses `useSubmitResponse` (Plan 01-05) which imports
// `supabaseAnon` — that constructor reads `import.meta.env.VITE_SUPABASE_*`
// at module init time and throws when those vars aren't set under Vitest.
// We mock `@supabase/supabase-js` BEFORE the late import below so the
// constructor accepts undefined args without throwing. None of these tests
// exercise the mutation — we only need `buildResponseRows` and
// `applyStatusFilterToRows`, both pure.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: () => ({ select: () => ({}) }),
    rpc: vi.fn(),
  }),
}));

const { applyStatusFilterToRows, buildResponseRows } = await import('../responses');
type ResponseRow = Awaited<ReturnType<typeof buildResponseRows>>[number];

import type { ClassifyOutcomeResult } from '@/lib/analytics/classify-outcome';
import type { StatusFilter } from '@/lib/analytics/session-filter';
import type { BlockEventRow } from '@/lib/queries/block-events';
import type { DesignerSession } from '@/lib/queries/designer-sessions';

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

/** Helper — build a minimal DesignerSession. */
function sess(partial: {
  id: string;
  started_at: string;
  status?: DesignerSession['status'];
  device_type?: string | null;
  study_id?: string;
}): DesignerSession {
  return {
    id: partial.id,
    study_id: partial.study_id ?? 'study-1',
    started_at: partial.started_at,
    status: partial.status ?? 'in_progress',
    device_type: partial.device_type ?? null,
  } as unknown as DesignerSession;
}

/** Helper — build a minimal ClassifyOutcomeResult. */
function outcome(
  sessionId: string,
  kind: 'success' | 'giveup' = 'success',
  durationMs = 1000,
): ClassifyOutcomeResult {
  return {
    sessionId,
    outcome: kind,
    durationMs,
    firstEventTs: EPOCH,
    lastEventTs: EPOCH,
  };
}

describe('buildResponseRows', () => {
  it('sorts rows by started_at DESC (newest first)', () => {
    const sessions: DesignerSession[] = [
      sess({ id: 's1', started_at: '2026-05-01T10:00:00.000Z' }),
      sess({ id: 's2', started_at: '2026-05-10T10:00:00.000Z' }),
      sess({ id: 's3', started_at: '2026-05-05T10:00:00.000Z' }),
    ];
    const rows = buildResponseRows(sessions, [], []);
    expect(rows.map((r) => r.sessionId)).toEqual(['s2', 's3', 's1']);
  });

  it("maps device_type='mobile' through unchanged", () => {
    const rows = buildResponseRows(
      [sess({ id: 's1', started_at: EPOCH, device_type: 'mobile' })],
      [],
      [],
    );
    expect(rows[0]!.deviceType).toBe('mobile');
  });

  it("maps device_type='desktop' through unchanged", () => {
    const rows = buildResponseRows(
      [sess({ id: 's1', started_at: EPOCH, device_type: 'desktop' })],
      [],
      [],
    );
    expect(rows[0]!.deviceType).toBe('desktop');
  });

  it("maps device_type='tablet' through unchanged", () => {
    const rows = buildResponseRows(
      [sess({ id: 's1', started_at: EPOCH, device_type: 'tablet' })],
      [],
      [],
    );
    expect(rows[0]!.deviceType).toBe('tablet');
  });

  it('maps null / empty / unknown device_type to "unknown"', () => {
    const rows = buildResponseRows(
      [
        sess({ id: 's1', started_at: '2026-05-03T00:00:00.000Z', device_type: null }),
        sess({ id: 's2', started_at: '2026-05-02T00:00:00.000Z', device_type: '' }),
        sess({ id: 's3', started_at: '2026-05-01T00:00:00.000Z', device_type: 'foo' }),
      ],
      [],
      [],
    );
    expect(rows.map((r) => r.deviceType)).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('resolves outcome="success" from the outcomes map', () => {
    const rows = buildResponseRows(
      [sess({ id: 's1', started_at: EPOCH })],
      [],
      [outcome('s1', 'success')],
    );
    expect(rows[0]!.outcome).toBe('success');
  });

  it('resolves outcome="giveup" from the outcomes map', () => {
    const rows = buildResponseRows(
      [sess({ id: 's1', started_at: EPOCH })],
      [],
      [outcome('s1', 'giveup')],
    );
    expect(rows[0]!.outcome).toBe('giveup');
  });

  it('falls back to outcome="incomplete" when no outcomes entry exists', () => {
    const rows = buildResponseRows([sess({ id: 's1', started_at: EPOCH })], [], []);
    expect(rows[0]!.outcome).toBe('incomplete');
  });

  it('prototypeSummary is null when the session has zero events', () => {
    const rows = buildResponseRows([sess({ id: 's1', started_at: EPOCH })], [], []);
    expect(rows[0]!.prototypeSummary).toBeNull();
  });

  it('prototypeSummary has framesVisited=0 when only tap events are present', () => {
    // The plan locks this edge: with only-tap events, durationMs is computed
    // (first→last client_ts) but framesVisited is 0 (no frame_enter rows).
    const events: BlockEventRow[] = [
      ev({
        session_id: 's1',
        event_type: 'tap',
        client_ts: '2026-05-18T00:00:01.000Z',
        x: 0.5,
        y: 0.5,
      }),
      ev({
        session_id: 's1',
        event_type: 'tap',
        client_ts: '2026-05-18T00:00:03.000Z',
        x: 0.6,
        y: 0.6,
      }),
    ];
    const rows = buildResponseRows([sess({ id: 's1', started_at: EPOCH })], events, []);
    expect(rows[0]!.prototypeSummary).toEqual({ framesVisited: 0, durationMs: 2000 });
  });

  it('prototypeSummary counts distinct frame_enter.frame_id only (re-entries do not inflate)', () => {
    const events: BlockEventRow[] = [
      ev({
        session_id: 's1',
        event_type: 'frame_enter',
        frame_id: 'f1',
        client_ts: '2026-05-18T00:00:00.000Z',
      }),
      ev({
        session_id: 's1',
        event_type: 'frame_enter',
        frame_id: 'f2',
        client_ts: '2026-05-18T00:00:01.000Z',
      }),
      ev({
        session_id: 's1',
        event_type: 'frame_enter',
        frame_id: 'f1', // re-entry
        client_ts: '2026-05-18T00:00:02.000Z',
      }),
    ];
    const rows = buildResponseRows([sess({ id: 's1', started_at: EPOCH })], events, []);
    expect(rows[0]!.prototypeSummary!.framesVisited).toBe(2);
    expect(rows[0]!.prototypeSummary!.durationMs).toBe(2000);
  });

  it('does not cross-contaminate events between sessions', () => {
    const events: BlockEventRow[] = [
      ev({
        session_id: 's1',
        event_type: 'frame_enter',
        frame_id: 'f1',
        client_ts: EPOCH,
      }),
      ev({
        session_id: 's2',
        event_type: 'frame_enter',
        frame_id: 'f99',
        client_ts: EPOCH,
      }),
    ];
    const rows = buildResponseRows(
      [
        sess({ id: 's1', started_at: '2026-05-02T00:00:00.000Z' }),
        sess({ id: 's2', started_at: '2026-05-01T00:00:00.000Z' }),
      ],
      events,
      [],
    );
    const s1Row = rows.find((r) => r.sessionId === 's1')!;
    const s2Row = rows.find((r) => r.sessionId === 's2')!;
    expect(s1Row.prototypeSummary!.framesVisited).toBe(1);
    expect(s2Row.prototypeSummary!.framesVisited).toBe(1);
  });
});

describe('applyStatusFilterToRows', () => {
  // Shared fixture: three sessions where A is completed (status), B is
  // incomplete (in_progress + no events + no outcome), C is incomplete
  // (missing from sessionsById entirely — see classifyCompletion corner).
  const sessionA: DesignerSession = sess({
    id: 'A',
    started_at: '2026-05-03T00:00:00.000Z',
    status: 'completed',
  });
  const sessionB: DesignerSession = sess({
    id: 'B',
    started_at: '2026-05-02T00:00:00.000Z',
    status: 'in_progress',
  });
  // C only exists as a row but not in sessionsById — classifyCompletion
  // returns 'incomplete' for missing entries.
  const sessionC: DesignerSession = sess({
    id: 'C',
    started_at: '2026-05-01T00:00:00.000Z',
    status: 'in_progress',
  });

  const sessionsById = new Map<string, DesignerSession>([
    ['A', sessionA],
    ['B', sessionB],
    // C deliberately omitted to exercise the missing-session corner.
  ]);

  const rows: ResponseRow[] = buildResponseRows([sessionA, sessionB, sessionC], [], []);

  it('returns [A] when completed=true, incomplete=false', () => {
    const filter: StatusFilter = { completed: true, incomplete: false };
    const result = applyStatusFilterToRows(rows, sessionsById, [], [], filter);
    expect(result.map((r) => r.sessionId)).toEqual(['A']);
  });

  it('returns [B, C] when completed=false, incomplete=true', () => {
    const filter: StatusFilter = { completed: false, incomplete: true };
    const result = applyStatusFilterToRows(rows, sessionsById, [], [], filter);
    // Sort order DESC by started_at — B (May 2) then C (May 1).
    expect(result.map((r) => r.sessionId)).toEqual(['B', 'C']);
  });

  it('returns all three rows when both flags are true', () => {
    const filter: StatusFilter = { completed: true, incomplete: true };
    const result = applyStatusFilterToRows(rows, sessionsById, [], [], filter);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.sessionId)).toEqual(['A', 'B', 'C']);
    // Reference inequality — callers rely on this for useMemo invalidation.
    expect(result).not.toBe(rows);
  });

  it('returns [] when both flags are false', () => {
    const filter: StatusFilter = { completed: false, incomplete: false };
    const result = applyStatusFilterToRows(rows, sessionsById, [], [], filter);
    expect(result).toEqual([]);
  });

  it('respects task_finish-event promotion (in_progress + task_finish → completed)', () => {
    // B is in_progress per sessionsById, but has a task_finish event in the
    // current event window. Under completed-only filter B should appear.
    const events: BlockEventRow[] = [ev({ session_id: 'B', event_type: 'task_finish', seq: 10 })];
    const filter: StatusFilter = { completed: true, incomplete: false };
    const result = applyStatusFilterToRows(rows, sessionsById, events, [], filter);
    expect(result.map((r) => r.sessionId).sort()).toEqual(['A', 'B']);
  });
});
