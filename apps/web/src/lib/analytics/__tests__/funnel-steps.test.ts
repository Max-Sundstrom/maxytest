/**
 * `funnelSteps` unit tests — Plan 03-04 Task 1.
 *
 * Locks 03-RESEARCH.md §"Funnel Mechanics" lines 1441-1495 + §"Pitfall 8"
 * lines 1090-1106:
 *   - D-50 Forgiving — "reached step N" = at least one frame_enter on
 *     success_path[N] in the session, regardless of order.
 *   - D-53 — empty success_path OR zero valid sessions → [].
 *   - Pitfall 8 — non-monotonic funnels are honest (a session can skip
 *     middle steps and still count for later steps).
 *   - Tap events (or any non-frame_enter) never contribute to the
 *     visited-set.
 *   - `frame_id === null` rows are silently dropped.
 *   - `percentage` is raw (not rounded — UI formats).
 *
 * Fixture pattern mirrors transition-graph.test.ts / frame-timings.test.ts:
 * a minimal `ev()` literal-cast helper, only fields the function reads are
 * populated.
 */

import { describe, expect, it } from 'vitest';

import { funnelSteps } from '../funnel-steps';
import type { BlockEventRow } from '@/lib/queries/block-events';

const EPOCH = '2026-05-18T00:00:00.000Z';

/** Helper — build a minimal BlockEventRow literal with sensible defaults. */
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

describe('funnelSteps', () => {
  it('returns [] on empty success_path (D-53)', () => {
    const result = funnelSteps([], [], 0);
    expect(result).toEqual([]);
  });

  it('returns [] when validSessionCount === 0 (division-by-zero guard)', () => {
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'f1', event_type: 'frame_enter' }),
    ];
    const result = funnelSteps(events, ['f1', 'f2', 'f3'], 0);
    expect(result).toEqual([]);
  });

  it('returns [] when both success_path and validSessionCount are empty', () => {
    const result = funnelSteps([], [], 100);
    expect(result).toEqual([]);
  });

  it('reached=[1,1,1] when single session visits all 3 steps in order', () => {
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'f1', seq: 1 }),
      ev({ session_id: 's1', frame_id: 'f2', seq: 2 }),
      ev({ session_id: 's1', frame_id: 'f3', seq: 3 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2', 'f3'], 1);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.sessionsReached)).toEqual([1, 1, 1]);
    expect(result.map((s) => s.percentage)).toEqual([100, 100, 100]);
    expect(result.map((s) => s.stepIndex)).toEqual([0, 1, 2]);
    expect(result.map((s) => s.frameId)).toEqual(['f1', 'f2', 'f3']);
  });

  it('reached=[1,0,1] when session skips middle (Forgiving non-monotonic D-50 + Pitfall 8)', () => {
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'f1', seq: 1 }),
      // No frame_enter on f2.
      ev({ session_id: 's1', frame_id: 'f3', seq: 2 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2', 'f3'], 1);
    expect(result.map((s) => s.sessionsReached)).toEqual([1, 0, 1]);
    expect(result.map((s) => s.percentage)).toEqual([100, 0, 100]);
  });

  it('order of frame_enters within a session does not matter (D-50 Forgiving)', () => {
    // success_path = [f1, f2, f3, f4] but session visits in order f1 → f3 → f2 → f4.
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'f1', seq: 1 }),
      ev({ session_id: 's1', frame_id: 'f3', seq: 2 }),
      ev({ session_id: 's1', frame_id: 'f2', seq: 3 }),
      ev({ session_id: 's1', frame_id: 'f4', seq: 4 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2', 'f3', 'f4'], 1);
    expect(result.map((s) => s.sessionsReached)).toEqual([1, 1, 1, 1]);
  });

  it('percentage scales correctly (7 of 10 = 70.0)', () => {
    // 10 sessions, 7 visit f1 (sessions s1..s7), 5 visit f2 (s1..s5), 3 visit f3 (s1..s3).
    const events: BlockEventRow[] = [];
    for (let i = 1; i <= 7; i++) {
      events.push(ev({ session_id: `s${i}`, frame_id: 'f1', seq: 1 }));
    }
    for (let i = 1; i <= 5; i++) {
      events.push(ev({ session_id: `s${i}`, frame_id: 'f2', seq: 2 }));
    }
    for (let i = 1; i <= 3; i++) {
      events.push(ev({ session_id: `s${i}`, frame_id: 'f3', seq: 3 }));
    }
    const result = funnelSteps(events, ['f1', 'f2', 'f3'], 10);
    expect(result.map((s) => s.sessionsReached)).toEqual([7, 5, 3]);
    expect(result.map((s) => s.percentage)).toEqual([70, 50, 30]);
  });

  it('ignores tap events (only frame_enter contributes to the visited set)', () => {
    const events: BlockEventRow[] = [
      // A tap on f1 — must NOT contribute.
      ev({ session_id: 's1', frame_id: 'f1', event_type: 'tap', seq: 1, x: 0.5, y: 0.5 }),
      ev({ session_id: 's1', frame_id: 'f2', event_type: 'frame_enter', seq: 2 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2'], 1);
    expect(result.map((s) => s.sessionsReached)).toEqual([0, 1]);
  });

  it('ignores frame_enter rows with frame_id null', () => {
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: null, event_type: 'frame_enter', seq: 1 }),
      ev({ session_id: 's1', frame_id: 'f2', event_type: 'frame_enter', seq: 2 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2'], 1);
    expect(result.map((s) => s.sessionsReached)).toEqual([0, 1]);
  });

  it('session that does not enter any success_path frame → reached=[0,0,0]', () => {
    // Session visits unrelated frames; success_path is [f1, f2, f3].
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'fX', event_type: 'frame_enter', seq: 1 }),
      ev({ session_id: 's1', frame_id: 'fY', event_type: 'frame_enter', seq: 2 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2', 'f3'], 1);
    expect(result.map((s) => s.sessionsReached)).toEqual([0, 0, 0]);
    expect(result.map((s) => s.percentage)).toEqual([0, 0, 0]);
  });

  it('counts each session at most once per step (re-entries do not inflate)', () => {
    // Single session visits f1 three times.
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'f1', seq: 1 }),
      ev({ session_id: 's1', frame_id: 'f2', seq: 2 }),
      ev({ session_id: 's1', frame_id: 'f1', seq: 3 }),
      ev({ session_id: 's1', frame_id: 'f2', seq: 4 }),
      ev({ session_id: 's1', frame_id: 'f1', seq: 5 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2'], 1);
    // Set-based per-session contains f1 once and f2 once.
    expect(result.map((s) => s.sessionsReached)).toEqual([1, 1]);
  });

  it('aggregates distinct sessions across multiple session_ids', () => {
    // 3 sessions: s1 reaches f1+f2, s2 reaches only f1, s3 reaches f1+f2+f3.
    const events: BlockEventRow[] = [
      ev({ session_id: 's1', frame_id: 'f1', seq: 1 }),
      ev({ session_id: 's1', frame_id: 'f2', seq: 2 }),
      ev({ session_id: 's2', frame_id: 'f1', seq: 1 }),
      ev({ session_id: 's3', frame_id: 'f1', seq: 1 }),
      ev({ session_id: 's3', frame_id: 'f2', seq: 2 }),
      ev({ session_id: 's3', frame_id: 'f3', seq: 3 }),
    ];
    const result = funnelSteps(events, ['f1', 'f2', 'f3'], 3);
    expect(result.map((s) => s.sessionsReached)).toEqual([3, 2, 1]);
    // 3/3 = 100, 2/3 ≈ 66.66..., 1/3 ≈ 33.33...
    expect(result[0]!.percentage).toBeCloseTo(100, 10);
    expect(result[1]!.percentage).toBeCloseTo(66.6666666, 5);
    expect(result[2]!.percentage).toBeCloseTo(33.3333333, 5);
  });
});
