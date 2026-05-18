/**
 * `classifyOutcome` unit tests — Plan 03-01 Task 1C.
 *
 * Locks 03-CONTEXT.md §"Outcome Classification" D-30..D-38:
 *   - D-30 success: ≥1 frame_enter on a finish_frame_id.
 *   - D-31 giveup: valid session, no finish reached.
 *   - D-34 invalid: no frame_enter at all → null return.
 *   - D-36 re-finish: 2× frame_enter on finish frame → one success result.
 *   - D-38 task_finish IGNORED — only frame_enter matters.
 *
 * Fixtures use the `as BlockEventRow` literal-cast pattern from
 * `apps/web/src/lib/figma/coords.test.ts` (only the fields the classifier
 * reads are populated; the rest are coerced).
 */

import { describe, expect, it } from 'vitest';

import { classifyOutcome } from '../classify-outcome';
import type { BlockEventRow } from '@/lib/queries/block-events';

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
    client_ts: '2026-05-18T00:00:00.000Z',
    frame_id: null,
    ...partial,
  } as BlockEventRow;
}

describe('classifyOutcome', () => {
  it('returns null on empty input', () => {
    expect(classifyOutcome([], ['f1'])).toBeNull();
  });

  it('returns null when the session has no frame_enter (D-34 invalid)', () => {
    // Only tap + task_finish — no frame_enter anywhere.
    const events: BlockEventRow[] = [
      ev({ id: 'e1', event_type: 'tap', seq: 1, frame_id: 'f1' }),
      ev({ id: 'e2', event_type: 'task_finish', seq: 2, frame_id: null }),
    ];
    expect(classifyOutcome(events, ['f-finish'])).toBeNull();
  });

  it('returns success when a frame_enter lands on a finish_frame_id (D-30)', () => {
    const events: BlockEventRow[] = [
      ev({
        id: 'e1',
        event_type: 'frame_enter',
        seq: 1,
        frame_id: 'f-home',
        client_ts: '2026-05-18T00:00:00.000Z',
      }),
      ev({
        id: 'e2',
        event_type: 'tap',
        seq: 2,
        frame_id: 'f-home',
        client_ts: '2026-05-18T00:00:05.000Z',
      }),
      ev({
        id: 'e3',
        event_type: 'frame_enter',
        seq: 3,
        frame_id: 'f-finish',
        client_ts: '2026-05-18T00:00:10.000Z',
      }),
    ];
    const result = classifyOutcome(events, ['f-finish']);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('success');
    expect(result!.durationMs).toBe(10_000);
    expect(result!.firstEventTs).toBe('2026-05-18T00:00:00.000Z');
    expect(result!.lastEventTs).toBe('2026-05-18T00:00:10.000Z');
    expect(result!.sessionId).toBe('s1');
  });

  it('returns giveup when frame_enters never reach a finish frame (D-31)', () => {
    const events: BlockEventRow[] = [
      ev({
        id: 'e1',
        event_type: 'frame_enter',
        seq: 1,
        frame_id: 'f-home',
        client_ts: '2026-05-18T00:00:00.000Z',
      }),
      ev({
        id: 'e2',
        event_type: 'frame_enter',
        seq: 2,
        frame_id: 'f-help',
        client_ts: '2026-05-18T00:00:07.500Z',
      }),
    ];
    const result = classifyOutcome(events, ['f-finish']);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('giveup');
    expect(result!.durationMs).toBe(7_500);
  });

  it('ignores task_finish when classifying — only frame_enter on finish wins (D-38)', () => {
    // frame_enters never on finish; task_finish present. Must be giveup, not success.
    const events: BlockEventRow[] = [
      ev({
        id: 'e1',
        event_type: 'frame_enter',
        seq: 1,
        frame_id: 'f-home',
        client_ts: '2026-05-18T00:00:00.000Z',
      }),
      ev({
        id: 'e2',
        event_type: 'task_finish',
        seq: 2,
        // Even if task_finish has frame_id matching finish — D-38 says ignore.
        frame_id: 'f-finish',
        client_ts: '2026-05-18T00:00:02.000Z',
      }),
    ];
    const result = classifyOutcome(events, ['f-finish']);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('giveup');
  });

  it('counts a session that re-enters finish twice as a single success (D-36)', () => {
    const events: BlockEventRow[] = [
      ev({
        id: 'e1',
        event_type: 'frame_enter',
        seq: 1,
        frame_id: 'f-home',
        client_ts: '2026-05-18T00:00:00.000Z',
      }),
      ev({
        id: 'e2',
        event_type: 'frame_enter',
        seq: 2,
        frame_id: 'f-finish',
        client_ts: '2026-05-18T00:00:04.000Z',
      }),
      ev({
        id: 'e3',
        event_type: 'frame_enter',
        seq: 3,
        frame_id: 'f-home',
        client_ts: '2026-05-18T00:00:06.000Z',
      }),
      ev({
        id: 'e4',
        event_type: 'frame_enter',
        seq: 4,
        frame_id: 'f-finish',
        client_ts: '2026-05-18T00:00:09.000Z',
      }),
    ];
    const result = classifyOutcome(events, ['f-finish']);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('success'); // one row, not two
    expect(result!.durationMs).toBe(9_000);
  });
});
