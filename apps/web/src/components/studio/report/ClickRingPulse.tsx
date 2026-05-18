/**
 * `ClickRingPulse` — single click-ring overlay for the playback player.
 *
 * Plan 03-05 (Wave 4) Task 2. Leaf component (no React state, no RAF, no
 * imports beyond React + tokens). Plan 03-06 consumes this inside the
 * `<PlaybackPlayer>` frame stage — one `<ClickRingPulse>` per
 * `TimelineClick` in the active frame's click set.
 *
 * Two visual states, determined by `ageMs = playheadMs - startMs`:
 *
 *   1. `ageMs < 0`     → returns null (the click hasn't happened yet on the
 *                        playhead; nothing to render).
 *   2. `0 ≤ ageMs < 600` → "active pulse": 24×24 px circle in the success
 *                          (hit) or error (miss) color, animated via the
 *                          `click-ring-pulse` keyframe (defined in
 *                          `apps/web/src/styles/tokens.css`). The keyframe
 *                          scales 0.6 → 1.6 + fades to opacity 0 over 600 ms.
 *   3. `ageMs ≥ 600`   → "footprint dot": 8×8 px static circle at opacity
 *                        0.25, same color, no animation. Acts as a
 *                        persistent trace so the designer can read the
 *                        click history at a glance.
 *
 * Locked semantics — see 03-CONTEXT.md §D-63:
 *   - hit (`hit_target_id != null`) → `var(--color-success)` (moss-toned green).
 *   - miss → `var(--color-danger)` (terracotta red, aliased to --color-error
 *     here per token name; tokens.css line 206-207 defines both).
 *   - Pulse duration 600 ms (matches Maze/Useberry visual cadence).
 *   - Footprint opacity 0.25 (per RESEARCH lines 1657-1659).
 *
 * Accessibility: `aria-hidden="true"` on the wrapper. The pulse is purely
 * visual; designers learn from the surrounding controls + thumbnail
 * timeline, not from screen-reader narration of every ring.
 *
 * Reduced motion: the `click-ring-pulse` keyframe has a
 * `@media (prefers-reduced-motion: reduce)` override in tokens.css that
 * collapses the animation to a static dot — no work needed here.
 *
 * Source: 03-RESEARCH.md lines 1604-1663 (canonical impl).
 */

import type { JSX } from 'react';

const PULSE_DURATION_MS = 600;
const FOOTPRINT_OPACITY = 0.25;

export interface ClickRingPulseProps {
  /** Normalized [0, 1] x coordinate within the frame stage. */
  x: number;
  /** Normalized [0, 1] y coordinate within the frame stage. */
  y: number;
  /** D-63: true → green success ring; false → red error ring. */
  hit: boolean;
  /** When this click happened in the playback timeline (ms from session start). */
  startMs: number;
  /** Current playhead position (ms from session start). */
  playheadMs: number;
}

export function ClickRingPulse({
  x,
  y,
  hit,
  startMs,
  playheadMs,
}: ClickRingPulseProps): JSX.Element | null {
  const ageMs = playheadMs - startMs;
  if (ageMs < 0) return null;

  const inPulseWindow = ageMs < PULSE_DURATION_MS;
  // Tokens.css defines --color-success (moss green) and --color-danger
  // (terracotta red); we use --color-danger as the "error/miss" signal.
  const color = hit ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {inPulseWindow ? (
        <span
          style={{
            display: 'block',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: color,
            opacity: 0.7,
            animation: `click-ring-pulse ${PULSE_DURATION_MS}ms cubic-bezier(.2,.7,.3,1) forwards`,
          }}
        />
      ) : (
        <span
          style={{
            display: 'block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            opacity: FOOTPRINT_OPACITY,
          }}
        />
      )}
    </div>
  );
}
