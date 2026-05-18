/**
 * `frameTimings` unit tests — Plan 03-03 Task 1.
 *
 * Locks 03-RESEARCH.md §"Time-on-frame Computation" lines 1139-1232 + §"Pitfall 4"
 * lines 1001-1034 + §"Open Q1 RESOLVED" lines 2185-2238:
 *   - LOCKOUT_MS = 300 — subtracted ONLY when next event is another `frame_enter`
 *     (transition occurred between them; lockout is in the gap).
 *   - `frame_enter` → `frame_exit` (same frame) → NO lockout (exit fires before
 *     the animation gap on the OLD frame; the dwell window already excludes it).
 *   - `frame_enter` → `task_finish` → NO lockout (task_finish is not a transition).
 *   - `frame_enter` → `tap` → NO lockout (tap doesn't transition by itself in
 *     event semantics).
 *   - `frame_enter` with no successor in the session (EOS) → SKIP (no honest
 *     way to count time when we don't know when the user left).
 *   - Negative elapsed after lockout subtraction → clamp to 0 (defensive).
 *
 * Fixture pattern mirrors transition-graph.test.ts / classify-outcome.test.ts:
 * minimal `ev()` literal-cast helper, only fields the function reads are populated.
 */

import { describe, expect, it } from 'vitest';

import { frameTimings } from '../frame-timings';
import type { BlockEventRow } from '@/lib/queries/block-events';

const EPOCH = '2026-05-18T00:00:00.000Z';
const EPOCH_MS = new Date(EPOCH).getTime();

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

/** Build an ISO timestamp at `msFromEpoch` ms past EPOCH. */
function tsAt(msFromEpoch: number): string {
  return new Date(EPOCH_MS + msFromEpoch).toISOString();
}

/** Convenience — terse event factory with explicit seq + offset. */
function withTs(
  seq: number,
  eventType: BlockEventRow['event_type'],
  frameId: string | null,
  msFromStart: number,
  sessionId: string = 's1',
): BlockEventRow {
  return ev({
    id: `${sessionId}-${seq}`,
    seq,
    event_type: eventType,
    frame_id: frameId,
    client_ts: tsAt(msFromStart),
    session_id: sessionId,
  });
}

describe('frameTimings', () => {
  it('returns zeros for an empty events array', () => {
    expect(frameTimings([], 'A')).toEqual({
      median_ms: 0,
      p95_ms: 0,
      sample_size: 0,
    });
  });

  it('returns zeros when no frame_enter event matches the queried frameId', () => {
    const events = [withTs(1, 'frame_enter', 'X', 0), withTs(2, 'frame_enter', 'Y', 5_000)];
    expect(frameTimings(events, 'A')).toEqual({
      median_ms: 0,
      p95_ms: 0,
      sample_size: 0,
    });
  });

  it('frame_enter A → frame_enter B (same session) subtracts 300ms lockout', () => {
    // elapsed = 5000 ms, lockout = 300 → dwell = 4700
    const events = [withTs(1, 'frame_enter', 'A', 0), withTs(2, 'frame_enter', 'B', 5_000)];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(1);
    expect(r.median_ms).toBeCloseTo(4_700, 0);
    expect(r.p95_ms).toBeCloseTo(4_700, 0);
  });

  it('frame_enter A → frame_exit A (same frame) does NOT subtract lockout', () => {
    // elapsed = 3000 ms, lockout = 0 → dwell = 3000
    const events = [withTs(1, 'frame_enter', 'A', 0), withTs(2, 'frame_exit', 'A', 3_000)];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(1);
    expect(r.median_ms).toBeCloseTo(3_000, 0);
  });

  it('frame_enter A → task_finish does NOT subtract lockout', () => {
    const events = [withTs(1, 'frame_enter', 'A', 0), withTs(2, 'task_finish', null, 7_500)];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(1);
    expect(r.median_ms).toBeCloseTo(7_500, 0);
  });

  it('frame_enter A → tap (any frame) does NOT subtract lockout', () => {
    // tap doesn't transition by itself in event semantics — Pitfall 4 table.
    const events = [withTs(1, 'frame_enter', 'A', 0), withTs(2, 'tap', 'A', 2_000)];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(1);
    expect(r.median_ms).toBeCloseTo(2_000, 0);
  });

  it('frame_enter A as the LAST event of a session (EOS) is skipped', () => {
    const events = [
      withTs(1, 'frame_enter', 'A', 0),
      // EOS — no successor in this session.
    ];
    expect(frameTimings(events, 'A')).toEqual({
      median_ms: 0,
      p95_ms: 0,
      sample_size: 0,
    });
  });

  it('multi-session: aggregates all valid dwells, sample_size = total dwell count', () => {
    // s1: A→exit 2000, A→enter B 5000 (− 300 = 4700)
    // s2: A→finish 8000
    const events = [
      withTs(1, 'frame_enter', 'A', 0, 's1'),
      withTs(2, 'frame_exit', 'A', 2_000, 's1'),
      withTs(3, 'frame_enter', 'A', 3_000, 's1'),
      withTs(4, 'frame_enter', 'B', 8_000, 's1'), // 5000 elapsed − 300 = 4700
      withTs(1, 'frame_enter', 'A', 0, 's2'),
      withTs(2, 'task_finish', null, 8_000, 's2'),
    ];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(3); // s1 contributes 2 dwells, s2 contributes 1
    // dwells sorted: [2000, 4700, 8000]
    // median (p=0.5) → middle element → 4700
    expect(r.median_ms).toBeCloseTo(4_700, 0);
    // p95 on 3 elements: idx = 0.95 * 2 = 1.9 → 0.1*4700 + 0.9*8000 = 7670
    expect(r.p95_ms).toBeCloseTo(7_670, 0);
  });

  it('frame_enter on frame X is ignored when querying timings for frame Y', () => {
    const events = [
      withTs(1, 'frame_enter', 'X', 0),
      withTs(2, 'frame_enter', 'Y', 1_000), // for Y: next=X enter; 1000-300 = 700
      withTs(3, 'frame_enter', 'X', 2_000),
      withTs(4, 'tap', 'X', 4_500),
    ];
    // For Y: exactly ONE matching frame_enter at seq=2; next = frame_enter X
    // (different frame), so pair is (frame_enter Y, frame_enter) → subtract lockout.
    // dwell = (2000 − 1000) − 300 = 700.
    const rY = frameTimings(events, 'Y');
    expect(rY.sample_size).toBe(1);
    expect(rY.median_ms).toBeCloseTo(700, 0);

    // For X: two frame_enter on X. seq=1 → seq=2 (enter Y): 1000−300=700.
    // seq=3 → seq=4 (tap): 2500−0=2500.
    const rX = frameTimings(events, 'X');
    expect(rX.sample_size).toBe(2);
    // sorted [700, 2500]; median = 0.5*700 + 0.5*2500 = 1600
    expect(rX.median_ms).toBeCloseTo(1_600, 0);
  });

  it('negative elapsed after lockout subtraction clamps to 0 (defensive)', () => {
    // Pathological clock skew: next event ts BEFORE enter ts. elapsed < 0,
    // minus 300 still < 0 → clamp to 0. Algorithm tolerates without crashing.
    const events = [
      withTs(1, 'frame_enter', 'A', 5_000),
      withTs(2, 'frame_enter', 'B', 4_500), // -500 elapsed, − 300 lockout = -800 → 0
    ];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(1);
    expect(r.median_ms).toBe(0);
  });

  it('a session that revisits the same frame contributes multiple dwells', () => {
    // Two enters on A within one session → two dwells.
    const events = [
      withTs(1, 'frame_enter', 'A', 0, 's1'),
      withTs(2, 'frame_enter', 'B', 2_000, 's1'), // 2000-300 = 1700
      withTs(3, 'frame_enter', 'A', 4_000, 's1'),
      withTs(4, 'frame_exit', 'A', 7_000, 's1'), // 3000 (no lockout)
    ];
    const r = frameTimings(events, 'A');
    expect(r.sample_size).toBe(2);
    // dwells: [1700, 3000]
    // median p=0.5 → idx = 0.5*1 = 0.5 → 0.5*1700 + 0.5*3000 = 2350
    expect(r.median_ms).toBeCloseTo(2_350, 0);
  });

  it('respects per-session seq order even when input rows are out-of-order', () => {
    // Insert events shuffled — algorithm must sort by seq within session.
    const events = [
      withTs(4, 'frame_enter', 'B', 8_000, 's1'),
      withTs(1, 'frame_enter', 'A', 0, 's1'),
      withTs(3, 'frame_enter', 'A', 3_000, 's1'),
      withTs(2, 'frame_exit', 'A', 2_000, 's1'),
    ];
    const r = frameTimings(events, 'A');
    // After per-session sort by seq:
    //   seq1 enter A → seq2 exit A: dwell 2000 (no lockout)
    //   seq3 enter A → seq4 enter B: dwell 5000 − 300 = 4700
    expect(r.sample_size).toBe(2);
    // sorted dwells: [2000, 4700]; median p=0.5 → 0.5*2000 + 0.5*4700 = 3350
    expect(r.median_ms).toBeCloseTo(3_350, 0);
  });
});
