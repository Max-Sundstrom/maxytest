/**
 * Heatmap.ts unit tests — Plan 02-10 Task 1.
 *
 * The projection math is the single most error-prone part of the heatmap
 * pipeline (Pitfall 5). These tests lock the invariants:
 *
 *   1. (0.5, 0.5) on a 375×812 frame projects to canvas-pixel (w/2, h/2).
 *   2. (0, 0) projects to (0, 0).
 *   3. (1, 1) projects to (canvas.width, canvas.height).
 *   4. The same logical (0.5, 0.5) projects to (frame.width * 0.5 * dpr, …)
 *      regardless of frame.width — verified across two frame widths and
 *      across dpr=1 and dpr=2. This is the actual "Pitfall 5" guarantee:
 *      radius and projection MUST scale with frame.width, never with
 *      canvas.clientWidth (which depends on CSS layout).
 *   5. `lowN: true` draws with minOpacity=0.2; default draws with 0.05.
 *
 * simpleheat is mocked so we can spy on the `.data(...)` and `.draw(...)`
 * call args. No real canvas pixels are drawn; jsdom doesn't implement
 * 2D canvas anyway.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock factory MUST be hoisted (vi.mock is) — declare the instance shape
// here so each `new Heatmap()` gets a fresh spy bag.
const radiusSpy = vi.fn().mockReturnThis();
const gradientSpy = vi.fn().mockReturnThis();
const clearSpy = vi.fn().mockReturnThis();
const dataSpy = vi.fn().mockReturnThis();
const maxSpy = vi.fn().mockReturnThis();
const drawSpy = vi.fn().mockReturnThis();

vi.mock('simpleheat', () => ({
  default: vi.fn(() => ({
    radius: radiusSpy,
    gradient: gradientSpy,
    clear: clearSpy,
    data: dataSpy,
    max: maxSpy,
    draw: drawSpy,
  })),
}));

import simpleheat from 'simpleheat';
import { Heatmap, type HeatmapPoint } from './Heatmap';

const simpleheatMock = simpleheat as unknown as Mock;

/** jsdom does not implement getContext for 2D — build a bare canvas stub
 *  whose `width` / `height` setters behave like the real DOM. */
function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  // jsdom default is 300×150; the wrapper overrides on init().
  return c;
}

/** Pull the most recent argument passed to `data(...)`. */
function lastDataCall(): Array<[number, number, number]> {
  const calls = dataSpy.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('data() was never called');
  return last[0] as Array<[number, number, number]>;
}

/** Pull the most recent argument passed to `draw(...)`. */
function lastDrawCall(): number | undefined {
  const calls = drawSpy.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('draw() was never called');
  return last[0] as number | undefined;
}

/** Pull the most recent argument tuple passed to `radius(...)`. */
function lastRadiusCall(): [number, number?] {
  const calls = radiusSpy.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('radius() was never called');
  return last as [number, number?];
}

/** Helper: assert a tuple element exists, narrowing `T | undefined` → `T`. */
function tuple3(arr: Array<[number, number, number]>): [number, number, number] {
  const first = arr[0];
  if (!first) throw new Error('expected at least one tuple in data() call');
  return first;
}

describe('Heatmap projection (Pitfall 5)', () => {
  beforeEach(() => {
    simpleheatMock.mockClear();
    radiusSpy.mockClear();
    gradientSpy.mockClear();
    clearSpy.mockClear();
    dataSpy.mockClear();
    maxSpy.mockClear();
    drawSpy.mockClear();
  });

  it('projects (x=0.5, y=0.5) on 375×812 @ dpr=1 to (187.5, 406)', () => {
    const h = new Heatmap();
    h.init(makeCanvas(), { width: 375, height: 812 }, 1);
    const points: HeatmapPoint[] = [{ x: 0.5, y: 0.5, value: 1 }];
    h.render(points);

    const data = lastDataCall();
    expect(data).toHaveLength(1);
    const t = tuple3(data);
    expect(t[0]).toBeCloseTo(375 * 0.5 * 1, 5);
    expect(t[1]).toBeCloseTo(812 * 0.5 * 1, 5);
    expect(t[2]).toBe(1);
  });

  it('projects (x=0, y=0) to (0, 0)', () => {
    const h = new Heatmap();
    h.init(makeCanvas(), { width: 375, height: 812 }, 1);
    h.render([{ x: 0, y: 0, value: 1 }]);
    const t = tuple3(lastDataCall());
    expect(t[0]).toBe(0);
    expect(t[1]).toBe(0);
  });

  it('projects (x=1, y=1) to (canvas.width, canvas.height)', () => {
    const canvas = makeCanvas();
    const h = new Heatmap();
    h.init(canvas, { width: 375, height: 812 }, 1);
    h.render([{ x: 1, y: 1, value: 1 }]);
    const t = tuple3(lastDataCall());
    expect(t[0]).toBe(canvas.width);
    expect(t[1]).toBe(canvas.height);
    expect(canvas.width).toBe(375);
    expect(canvas.height).toBe(812);
  });

  it('projects (0.5, 0.5) consistently across frame widths AND dpr values', () => {
    for (const frameWidth of [375, 1024]) {
      for (const dpr of [1, 2]) {
        dataSpy.mockClear();
        const frameHeight = Math.round(frameWidth * (812 / 375));
        const h = new Heatmap();
        h.init(makeCanvas(), { width: frameWidth, height: frameHeight }, dpr);
        h.render([{ x: 0.5, y: 0.5, value: 1 }]);
        const t = tuple3(lastDataCall());
        expect(t[0]).toBeCloseTo(frameWidth * 0.5 * dpr, 5);
        expect(t[1]).toBeCloseTo(frameHeight * 0.5 * dpr, 5);

        // Bonus invariant: radius() was called with frame.width * 0.025 * dpr.
        // This is the Pitfall 5 guarantee — radius scales with frame.width,
        // never with canvas.clientWidth.
        const radiusCall = lastRadiusCall();
        expect(radiusCall[0]).toBeCloseTo(0.025 * frameWidth * dpr, 5);
      }
    }
  });

  it('uses minOpacity 0.2 in lowN mode and 0.05 by default', () => {
    const h = new Heatmap();
    h.init(makeCanvas(), { width: 375, height: 812 }, 1);

    h.render([{ x: 0.5, y: 0.5, value: 1 }], { lowN: true });
    expect(lastDrawCall()).toBe(0.2);

    h.render([{ x: 0.5, y: 0.5, value: 1 }]);
    expect(lastDrawCall()).toBe(0.05);
  });

  it('sets canvas backing-store to frame.width * dpr', () => {
    const canvas = makeCanvas();
    const h = new Heatmap();
    h.init(canvas, { width: 375, height: 812 }, 2);
    expect(canvas.width).toBe(750);
    expect(canvas.height).toBe(1624);
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('auto');
  });

  it('dispose() drops internal refs and render() becomes a no-op', () => {
    const h = new Heatmap();
    h.init(makeCanvas(), { width: 375, height: 812 }, 1);
    h.dispose();
    dataSpy.mockClear();
    h.render([{ x: 0.5, y: 0.5, value: 1 }]);
    expect(dataSpy).not.toHaveBeenCalled();
  });
});
