/**
 * IndividualClicks — numbered-dot fallback for low-N reports.
 *
 * Plan: 02-flagship-prototype-block-heatmap / 02-10 / Task 1.
 * Requirement: ANALYTICS-03 + D-14 low-N confidence treatment.
 *
 * When unique visitors N < 10 the heatmap is statistically meaningless —
 * one outlier click dominates the gradient and the result reads as
 * conclusive when it isn't. PrototypeReport switches to this mode and
 * renders each click as a numbered pink pill positioned in time order, so
 * a designer can still scan "where did the first 3 people click?" without
 * being misled by a fake red blob.
 *
 * Positioning uses CSS percentages (normalized coords × 100%) inside a
 * `position: relative` parent — letterbox-safe like the canvas overlay,
 * no DPR math needed.
 *
 * The dots are `aria-hidden` because a screen reader would just hear a
 * meaningless sequence of numbers; the stats card to the side carries the
 * semantic information.
 */

export interface IndividualClicksEvent {
  /** Normalized [0,1] x coordinate. */
  x: number;
  /** Normalized [0,1] y coordinate. */
  y: number;
  /** ISO-8601 client timestamp used to order the numbered dots. */
  client_ts: string;
}

export interface IndividualClicksFrame {
  width: number;
  height: number;
}

export interface IndividualClicksProps {
  events: IndividualClicksEvent[];
  frame: IndividualClicksFrame;
}

export function IndividualClicks({ events }: IndividualClicksProps) {
  // Sort ascending by client_ts so dot #1 is the earliest click.
  // localeCompare on lexicographic ISO-8601 strings is total-order safe.
  const sorted = [...events].sort((a, b) => a.client_ts.localeCompare(b.client_ts));

  return (
    <>
      {sorted.map((e, i) => (
        <div
          key={`${e.client_ts}-${i}`}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 px-1.5 py-0.5 text-xs text-white shadow"
          style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}
          aria-hidden
        >
          {i + 1}
        </div>
      ))}
    </>
  );
}
