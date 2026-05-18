/**
 * `playbackTimeline` — pure session-level event-to-timeline transformer.
 *
 * Plan 03-05 (Wave 4) — foundations for ANALYTICS-09 per-respondent playback.
 * The full user-visible playback UX (PlaybackPlayer + PlaybackDrawer +
 * ReportShell wiring) lands in Plan 03-06. This file ships ONLY the
 * pure-fn data layer that 03-06 will compose into the RAF-driven player.
 *
 * Locked semantics — see 03-CONTEXT.md §"Per-respondent playback (GA4, D-60..D-64)":
 *   - **D-62 Scrubber by wall-clock.** Relative `tsMs` offsets are computed
 *     from `client_ts` (NOT `seq`) so respondent pauses read as long empty
 *     stretches on the scrubber. `totalMs = lastClientTs − firstClientTs`.
 *   - **D-63 Click overlay semantics.** Each `tap` event becomes a
 *     `TimelineClick` with `hit: hit_target_id !== null`. The downstream
 *     `ClickRingPulse` colors green-success / red-error based on this flag.
 *   - **frame_enter precedence.** A `tap` without a preceding `frame_enter`
 *     is IGNORED (no `currentFrame` anchor → orphan click that can't be
 *     positioned over a real PNG). A `tap` with null x or null y is also
 *     IGNORED (no coordinates → nothing to render).
 *   - **Sort by seq, NOT client_ts.** Clocks can skew; `seq` is per-session
 *     monotonic by construction (Phase 2 runner allocator). `tsMs` offsets
 *     are then computed from the post-sort `client_ts` sequence.
 *
 * Pure function: no React, no Supabase, no DOM. Tested via Vitest in
 * `__tests__/playback-timeline.test.ts` (≥7 cases). The RAF loop and DOM
 * positioning live in `components/studio/report/PlaybackPlayer.tsx` (03-06).
 *
 * Source: 03-RESEARCH.md lines 1518-1599 (canonical impl), pasted with the
 * input row type adjusted from `FrameEventRow` to the Phase 3 driver row
 * `BlockEventRow` (events-designer vs block-events — same column set for the
 * fields we read here; `block-events` is the canonical "all events for a
 * block" hook per Pitfall 9 namespace conventions).
 */

import type { BlockEventRow } from '@/lib/queries/block-events';

export interface TimelineFrameEnter {
  /** Figma frame id (`frames.frame_id`) the respondent navigated to. */
  frameId: string;
  /** Offset from the first event in the session, in milliseconds. */
  tsMs: number;
}

export interface TimelineClick {
  /** `events.id` — stable React `key` for the click-ring overlay. */
  eventId: string;
  /** Offset from session start in ms (used by RAF playhead). */
  tsMs: number;
  /** Normalized [0,1] x coordinate within the frame stage. */
  x: number;
  /** Normalized [0,1] y coordinate within the frame stage. */
  y: number;
  /** D-63: true → green-success ring; false → red-error ring. */
  hit: boolean;
  /**
   * Frame the click belongs to (last `frame_enter` seen). Used by 03-06's
   * PlaybackPlayer to filter clicks down to "only clicks on the active frame"
   * — clicks from prior frames don't show through after a transition.
   */
  frameId: string;
}

export interface PlaybackTimeline {
  /** `lastClientTs − firstClientTs` in ms; 0 for empty input. */
  totalMs: number;
  frameEnters: TimelineFrameEnter[];
  clicks: TimelineClick[];
  /** ISO string of the first event (sorted by seq). Empty string for empty input. */
  firstClientTs: string;
  /** ISO string of the last event (sorted by seq). Empty string for empty input. */
  lastClientTs: string;
}

/**
 * Transform a session's events into a playback-ready timeline.
 *
 * Empty input → all-zeros struct with empty strings for timestamps.
 *
 * @param events — events for ONE session (call site filters by session_id).
 */
export function playbackTimeline(events: BlockEventRow[]): PlaybackTimeline {
  if (events.length === 0) {
    return { totalMs: 0, frameEnters: [], clicks: [], firstClientTs: '', lastClientTs: '' };
  }

  // Per-session sort by seq — Phase 2 runner guarantees monotonic seq within
  // a session, so this is total-order safe even under clock skew (Pitfall in
  // classify-outcome.ts:55-56 — same rationale).
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const firstClientTs = sorted[0]!.client_ts;
  const firstMs = new Date(firstClientTs).getTime();
  const lastClientTs = sorted[sorted.length - 1]!.client_ts;
  const lastMs = new Date(lastClientTs).getTime();

  const frameEnters: TimelineFrameEnter[] = [];
  const clicks: TimelineClick[] = [];

  // Track the current frame — a `tap` without a prior `frame_enter` is dropped.
  let currentFrame: string | null = null;
  for (const ev of sorted) {
    const relMs = new Date(ev.client_ts).getTime() - firstMs;
    if (ev.event_type === 'frame_enter' && ev.frame_id !== null) {
      frameEnters.push({ frameId: ev.frame_id, tsMs: relMs });
      currentFrame = ev.frame_id;
    } else if (ev.event_type === 'tap' && currentFrame !== null && ev.x !== null && ev.y !== null) {
      clicks.push({
        eventId: ev.id,
        tsMs: relMs,
        x: ev.x,
        y: ev.y,
        hit: ev.hit_target_id !== null,
        frameId: currentFrame,
      });
    }
    // frame_exit / task_finish events: skipped for playback rendering. They
    // matter for outcome classification (classify-outcome.ts) and time-on-
    // frame (frame-timings.ts) but contribute nothing visual to playback.
  }

  return {
    totalMs: lastMs - firstMs,
    frameEnters,
    clicks,
    firstClientTs,
    lastClientTs,
  };
}

/**
 * Find the active frame at a given playhead offset.
 *
 * Linear O(N) scan — sessions have ≤ ~30 frame_enter events typically (one
 * per navigation), so a binary-search optimisation would be premature. The
 * scan returns the LAST entry whose `tsMs ≤ playheadMs`, or `null` if the
 * playhead is before the first frame_enter.
 *
 * Pre-condition: `frameEnters` is sorted ascending by `tsMs` (which it
 * always is — `playbackTimeline` only ever pushes in seq order).
 */
export function findFrameAt(
  frameEnters: TimelineFrameEnter[],
  playheadMs: number,
): TimelineFrameEnter | null {
  if (frameEnters.length === 0) return null;
  let result: TimelineFrameEnter | null = null;
  for (const fe of frameEnters) {
    if (fe.tsMs <= playheadMs) {
      result = fe;
    } else {
      break;
    }
  }
  return result;
}
