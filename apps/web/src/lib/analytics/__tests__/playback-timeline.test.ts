/**
 * `playbackTimeline` + `findFrameAt` unit tests — Plan 03-05 Task 1.
 *
 * Locks 03-CONTEXT.md §D-62 (wall-clock scrubber) + §D-63 (click overlay
 * semantics) + 03-RESEARCH.md "Timeline construction" lines 1518-1599.
 *
 * Test fixtures follow the same `ev()` literal-cast helper pattern used by
 * classify-outcome.test.ts / transition-graph.test.ts: only the fields the
 * function reads are populated; the rest are coerced to BlockEventRow.
 */

import { describe, expect, it } from 'vitest';

import { findFrameAt, playbackTimeline } from '../playback-timeline';
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

/** Helper — produce an ISO string `offsetMs` after EPOCH. */
function tsAt(offsetMs: number): string {
  return new Date(EPOCH_MS + offsetMs).toISOString();
}

describe('playbackTimeline', () => {
  it('returns the all-zeros struct on empty input', () => {
    const result = playbackTimeline([]);
    expect(result).toEqual({
      totalMs: 0,
      frameEnters: [],
      clicks: [],
      firstClientTs: '',
      lastClientTs: '',
    });
  });

  it('records a single frame_enter with tsMs=0 and totalMs=0', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', event_type: 'frame_enter', frame_id: 'fA', seq: 1, client_ts: EPOCH }),
    ];
    const result = playbackTimeline(events);
    expect(result.frameEnters).toEqual([{ frameId: 'fA', tsMs: 0 }]);
    expect(result.clicks).toEqual([]);
    expect(result.totalMs).toBe(0);
    expect(result.firstClientTs).toBe(EPOCH);
    expect(result.lastClientTs).toBe(EPOCH);
  });

  it('records a hit tap as a click anchored to the current frame_enter', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', event_type: 'frame_enter', frame_id: 'fA', seq: 1, client_ts: EPOCH }),
      ev({
        id: 'e2',
        event_type: 'tap',
        frame_id: 'fA',
        seq: 2,
        client_ts: tsAt(2000),
        x: 0.5,
        y: 0.5,
        hit_target_id: 'hotspot-1',
      }),
    ];
    const result = playbackTimeline(events);
    expect(result.frameEnters).toEqual([{ frameId: 'fA', tsMs: 0 }]);
    expect(result.clicks).toHaveLength(1);
    expect(result.clicks[0]).toEqual({
      eventId: 'e2',
      tsMs: 2000,
      x: 0.5,
      y: 0.5,
      hit: true,
      frameId: 'fA',
    });
    expect(result.totalMs).toBe(2000);
  });

  it('records a missed tap with hit=false (no hit_target_id)', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', event_type: 'frame_enter', frame_id: 'fA', seq: 1, client_ts: EPOCH }),
      ev({
        id: 'e2',
        event_type: 'tap',
        frame_id: 'fA',
        seq: 2,
        client_ts: tsAt(500),
        x: 0.2,
        y: 0.8,
        hit_target_id: null,
      }),
    ];
    const result = playbackTimeline(events);
    expect(result.clicks).toHaveLength(1);
    expect(result.clicks[0]!.hit).toBe(false);
  });

  it('IGNORES taps that fire before any frame_enter (no currentFrame anchor)', () => {
    const events: BlockEventRow[] = [
      ev({
        id: 'e1',
        event_type: 'tap',
        seq: 1,
        client_ts: EPOCH,
        x: 0.5,
        y: 0.5,
        frame_id: null,
      }),
      ev({
        id: 'e2',
        event_type: 'frame_enter',
        frame_id: 'fA',
        seq: 2,
        client_ts: tsAt(1000),
      }),
    ];
    const result = playbackTimeline(events);
    expect(result.clicks).toEqual([]);
    expect(result.frameEnters).toEqual([{ frameId: 'fA', tsMs: 1000 }]);
  });

  it('IGNORES taps with null x or null y (no coordinates to render)', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', event_type: 'frame_enter', frame_id: 'fA', seq: 1, client_ts: EPOCH }),
      ev({
        id: 'e2',
        event_type: 'tap',
        frame_id: 'fA',
        seq: 2,
        client_ts: tsAt(100),
        x: null,
        y: 0.5,
      }),
      ev({
        id: 'e3',
        event_type: 'tap',
        frame_id: 'fA',
        seq: 3,
        client_ts: tsAt(200),
        x: 0.5,
        y: null,
      }),
    ];
    const result = playbackTimeline(events);
    expect(result.clicks).toEqual([]);
  });

  it('sorts unordered events by seq before computing tsMs offsets', () => {
    // Insert events in REVERSE seq order; client_ts agrees with seq, so a
    // naive iteration would mis-compute firstMs/lastMs.
    const events: BlockEventRow[] = [
      ev({ id: 'e3', event_type: 'frame_enter', frame_id: 'fB', seq: 3, client_ts: tsAt(2000) }),
      ev({
        id: 'e2',
        event_type: 'tap',
        frame_id: 'fA',
        seq: 2,
        client_ts: tsAt(1000),
        x: 0.4,
        y: 0.6,
        hit_target_id: 'h1',
      }),
      ev({ id: 'e1', event_type: 'frame_enter', frame_id: 'fA', seq: 1, client_ts: EPOCH }),
    ];
    const result = playbackTimeline(events);
    expect(result.firstClientTs).toBe(EPOCH);
    expect(result.lastClientTs).toBe(tsAt(2000));
    expect(result.totalMs).toBe(2000);
    expect(result.frameEnters).toEqual([
      { frameId: 'fA', tsMs: 0 },
      { frameId: 'fB', tsMs: 2000 },
    ]);
    expect(result.clicks).toHaveLength(1);
    expect(result.clicks[0]!.frameId).toBe('fA');
    expect(result.clicks[0]!.tsMs).toBe(1000);
  });

  it('tracks currentFrame across multiple frame_enters (tap on fB after entering fB)', () => {
    const events: BlockEventRow[] = [
      ev({ id: 'e1', event_type: 'frame_enter', frame_id: 'fA', seq: 1, client_ts: EPOCH }),
      ev({
        id: 'e2',
        event_type: 'tap',
        frame_id: 'fA',
        seq: 2,
        client_ts: tsAt(500),
        x: 0.1,
        y: 0.1,
        hit_target_id: 'h1',
      }),
      ev({
        id: 'e3',
        event_type: 'frame_enter',
        frame_id: 'fB',
        seq: 3,
        client_ts: tsAt(1000),
      }),
      ev({
        id: 'e4',
        event_type: 'tap',
        frame_id: 'fB',
        seq: 4,
        client_ts: tsAt(1500),
        x: 0.9,
        y: 0.9,
        hit_target_id: null,
      }),
    ];
    const result = playbackTimeline(events);
    expect(result.clicks).toHaveLength(2);
    expect(result.clicks[0]!.frameId).toBe('fA');
    expect(result.clicks[1]!.frameId).toBe('fB');
    expect(result.clicks[1]!.hit).toBe(false);
  });
});

describe('findFrameAt', () => {
  it('returns null when frameEnters is empty', () => {
    expect(findFrameAt([], 0)).toBeNull();
    expect(findFrameAt([], 9999)).toBeNull();
  });

  it('returns null when the playhead is before the first frame_enter', () => {
    const frameEnters = [
      { frameId: 'fA', tsMs: 500 },
      { frameId: 'fB', tsMs: 1500 },
    ];
    expect(findFrameAt(frameEnters, 0)).toBeNull();
    expect(findFrameAt(frameEnters, 499)).toBeNull();
  });

  it('returns the matching frame when playhead is exactly at an enter time', () => {
    const frameEnters = [
      { frameId: 'fA', tsMs: 0 },
      { frameId: 'fB', tsMs: 1000 },
      { frameId: 'fC', tsMs: 2000 },
    ];
    expect(findFrameAt(frameEnters, 1000)).toEqual({ frameId: 'fB', tsMs: 1000 });
    expect(findFrameAt(frameEnters, 2000)).toEqual({ frameId: 'fC', tsMs: 2000 });
  });

  it('returns the last frame whose tsMs ≤ playheadMs (between transitions)', () => {
    const frameEnters = [
      { frameId: 'fA', tsMs: 0 },
      { frameId: 'fB', tsMs: 1000 },
      { frameId: 'fC', tsMs: 2000 },
    ];
    expect(findFrameAt(frameEnters, 500)).toEqual({ frameId: 'fA', tsMs: 0 });
    expect(findFrameAt(frameEnters, 1500)).toEqual({ frameId: 'fB', tsMs: 1000 });
    expect(findFrameAt(frameEnters, 9999)).toEqual({ frameId: 'fC', tsMs: 2000 });
  });
});
