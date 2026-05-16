/**
 * simpleheat adapter — letterbox-safe canvas heatmap.
 *
 * Plan: 02-flagship-prototype-block-heatmap / 02-10 / Task 1.
 * Source: https://github.com/mourner/simpleheat (BSD-2-Clause).
 *
 * Requirement: ANALYTICS-01 — per-frame click heatmap.
 *
 * Why a thin wrapper class and not the raw `simpleheat()` call site?
 *
 * 1. **Letterbox safety (Pitfall 5).** The events table stores normalized
 *    coordinates in [0, 1]. The canvas is sized to the frame's native pixel
 *    dimensions × devicePixelRatio. When a designer's viewport is wider than
 *    the frame's aspect ratio, the rendered `<canvas>` element is letterboxed
 *    by CSS (`object-fit: contain`-equivalent). The hotspot bbox coordinates
 *    in the DB are also normalized — so the projection MUST be
 *    `point.x * frame.width * dpr` (NOT `point.x * canvas.clientWidth`),
 *    which keeps the heatmap aligned with the hotspot overlays regardless
 *    of CSS scaling. The unit test in `Heatmap.test.ts` locks this invariant.
 *
 * 2. **DPR (devicePixelRatio) handling.** On a Retina display the canvas's
 *    backing-store must be 2× the CSS size for sharp rendering. We size the
 *    canvas to `frame.{w,h} * dpr` and let CSS scale it back down to 100%.
 *    The radius math is also multiplied by `dpr` so the blob size in CSS
 *    pixels is constant across DPRs.
 *
 * 3. **React-friendly lifecycle.** The wrapper exposes `init`, `render`, and
 *    `dispose` so a `useEffect` can hold a single Heatmap instance per
 *    selected frame and clean it up on unmount or frame change.
 *
 * Note: `simpleheat` is a CommonJS module — the `@types/simpleheat` package
 * declares `export = simpleheat`, so we import it as a default with
 * `esModuleInterop: true` (set in tsconfig.base.json).
 */

import simpleheat from 'simpleheat';

/** A single click sample for the heatmap. */
export interface HeatmapPoint {
  /** Normalized [0,1] x coordinate (from `events.x`). */
  x: number;
  /** Normalized [0,1] y coordinate (from `events.y`). */
  y: number;
  /** Intensity multiplier (1 per click; collapse duplicates by bumping). */
  value: number;
}

/** Native pixel dimensions of the frame the heatmap renders over. */
export interface HeatmapFrame {
  width: number;
  height: number;
}

/** Optional rendering toggles. */
export interface HeatmapRenderOptions {
  /**
   * When true (N < 30 — see D-14 + ANALYTICS-03), draw with the reduced
   * minOpacity 0.2 so the canvas reads as "preliminary" rather than
   * conclusive. When false, use simpleheat's default 0.05.
   */
  lowN?: boolean;
}

/** Resolve the browser's devicePixelRatio in an SSR-safe way. */
function resolveDpr(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

export class Heatmap {
  private heat: simpleheat.Instance | null = null;
  private frame: HeatmapFrame | null = null;
  private dpr = 1;

  /**
   * Bind the wrapper to a `<canvas>` element. MUST be called before
   * `render()`. Subsequent calls reset both the canvas backing store and
   * the simpleheat radius/gradient settings — call this when the selected
   * frame changes (different width/height) or when the DPR changes.
   *
   * @param canvas  The HTMLCanvasElement to draw into.
   * @param frame   The frame's native pixel dimensions.
   * @param dpr     devicePixelRatio (defaults to window.devicePixelRatio).
   */
  init(canvas: HTMLCanvasElement, frame: HeatmapFrame, dpr: number = resolveDpr()): void {
    this.frame = frame;
    this.dpr = dpr;

    // Size the backing store to native frame pixels × dpr; let CSS scale
    // the element to 100% width of its container (object-contain handles
    // the letterboxing on the wrapping <img>).
    canvas.width = frame.width * dpr;
    canvas.height = frame.height * dpr;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    this.heat = simpleheat(canvas);
    // Pitfall 5 — radius is computed against frame.width, NOT canvas.width.
    // The two happen to be equal at dpr=1, but at dpr=2 the same CSS-radius
    // requires twice the backing-store radius. Multiplying by dpr keeps the
    // visual blob size constant across DPRs.
    const r = 0.025 * frame.width * dpr;
    const blur = r * 0.6;
    this.heat.radius(r, blur);
    this.heat.gradient({ 0.4: 'blue', 0.65: 'lime', 0.85: 'yellow', 1: 'red' });
  }

  /**
   * Project the normalized points to canvas-pixel coordinates, push to
   * simpleheat, and draw. Safe to call repeatedly — clears the previous
   * frame's data first.
   */
  render(points: HeatmapPoint[], opts: HeatmapRenderOptions = {}): void {
    if (!this.heat || !this.frame) return;

    const data: Array<[number, number, number]> = points.map((p) => [
      p.x * this.frame!.width * this.dpr,
      p.y * this.frame!.height * this.dpr,
      p.value,
    ]);

    this.heat.clear();
    this.heat.data(data);
    // Normalize `max` against point count so heatmaps don't saturate to
    // pure red when N grows large. /10 is empirically reasonable for the
    // gradient stops we picked above; tune if reports look too dim.
    this.heat.max(Math.max(1, points.length / 10));
    this.heat.draw(opts.lowN ? 0.2 : 0.05);
  }

  /**
   * Release internal references so the GC can reclaim the simpleheat
   * instance + its 256×1 gradient canvas. Call from a `useEffect` cleanup.
   * Note: the canvas element itself is owned by React, not this wrapper.
   */
  dispose(): void {
    this.heat = null;
    this.frame = null;
  }
}
