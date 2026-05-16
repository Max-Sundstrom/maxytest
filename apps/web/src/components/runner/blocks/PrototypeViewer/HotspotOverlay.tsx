/**
 * HotspotOverlay — DEV-only visualization of hotspot bounding boxes.
 *
 * Plan 02-09 Task 2 / PATTERNS.md lines 1047-1077.
 *
 * Production mode (`debug=false`): renders nothing. Math-only hotspots
 * are invisible to respondents — they tap "the button" and the runner
 * fires a hit event under the hood.
 *
 * Debug mode (`?debug=coords` + DEV build only, gated by PrototypeRunner):
 * renders pink outlines around each hotspot's bbox with a small "z={N}"
 * label so designers can verify hit-targets visually. Outlines are
 * `pointer-events: none` so they never absorb the respondent's tap —
 * the tap still goes through to FrameLayer's onPointerDown handler.
 *
 * CONTEXT specifics line 494: production builds cannot enable the
 * overlay; the import.meta.env.DEV gate lives in PrototypeRunner.
 */
import type { HotspotShape } from './FrameLayer';

export interface HotspotOverlayProps {
  hotspots: HotspotShape[];
  debug?: boolean;
}

export function HotspotOverlay({ hotspots, debug = false }: HotspotOverlayProps) {
  if (!debug) return null;
  return (
    <>
      {hotspots.map((h) => (
        <div
          key={h.id}
          aria-hidden
          // pointer-events-none — outline must never absorb the tap.
          className="absolute border-2 border-pink-500/60 pointer-events-none"
          style={{
            left: `${h.bbox_x * 100}%`,
            top: `${h.bbox_y * 100}%`,
            width: `${h.bbox_w * 100}%`,
            height: `${h.bbox_h * 100}%`,
          }}
        >
          <span className="absolute top-0 left-0 bg-pink-500 text-white text-[10px] px-1">
            z={h.z_index}
          </span>
        </div>
      ))}
    </>
  );
}
