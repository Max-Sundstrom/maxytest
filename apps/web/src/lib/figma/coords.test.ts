/**
 * `normalizeCoords` unit tests — Plan 02-01 Task 3.
 *
 * Locks the PATTERNS.md verbatim math:
 *   x = (clientX - rect.left) / rect.width;
 *   y = (clientY - rect.top)  / rect.height;
 *   if x|y outside [0, 1] → null (letterbox region).
 *
 * Pitfall 5 (RESEARCH.md lines 746-758) mandates a viewport-invariance test
 * — the same LOGICAL click must return the same normalized coords regardless
 * of viewport / scale. That's Test 6.
 *
 * Object literals are cast as DOMRect / PointerEvent because the function
 * reads only `{ left, top, width, height }` from the rect and
 * `{ clientX, clientY }` from the event.
 */

import { describe, expect, it } from 'vitest';
import { normalizeCoords } from './coords';

describe('normalizeCoords', () => {
  it('returns {x:0.5, y:0.5} for a click at the rect center (origin at 0,0)', () => {
    const rect = { left: 0, top: 0, width: 100, height: 200 } as DOMRect;
    const evt = { clientX: 50, clientY: 100 } as PointerEvent;
    expect(normalizeCoords(rect, evt)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('accounts for rect offset (rect not at viewport origin)', () => {
    const rect = { left: 10, top: 20, width: 100, height: 200 } as DOMRect;
    const evt = { clientX: 60, clientY: 120 } as PointerEvent;
    expect(normalizeCoords(rect, evt)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('returns null when clientX is left of the rect (letterbox region)', () => {
    const rect = { left: 0, top: 0, width: 100, height: 200 } as DOMRect;
    const evt = { clientX: -5, clientY: 100 } as PointerEvent;
    expect(normalizeCoords(rect, evt)).toBeNull();
  });

  it('returns {x:1, y:1} for a click exactly on the bottom-right edge (inclusive)', () => {
    const rect = { left: 0, top: 0, width: 100, height: 200 } as DOMRect;
    const evt = { clientX: 100, clientY: 200 } as PointerEvent;
    expect(normalizeCoords(rect, evt)).toEqual({ x: 1, y: 1 });
  });

  it('returns null just outside the right edge (letterbox region)', () => {
    const rect = { left: 0, top: 0, width: 100, height: 200 } as DOMRect;
    const evt = { clientX: 101, clientY: 100 } as PointerEvent;
    expect(normalizeCoords(rect, evt)).toBeNull();
  });

  it('is viewport-width-invariant: the same logical click returns the same coords at two scales (Pitfall 5)', () => {
    // Same LOGICAL click (center) at two different rect widths.
    const rectSmall = { left: 0, top: 0, width: 100, height: 200 } as DOMRect;
    const evtSmall = { clientX: 50, clientY: 100 } as PointerEvent;

    const rectLarge = { left: 0, top: 0, width: 300, height: 600 } as DOMRect;
    const evtLarge = { clientX: 150, clientY: 300 } as PointerEvent;

    expect(normalizeCoords(rectSmall, evtSmall)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizeCoords(rectLarge, evtLarge)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizeCoords(rectSmall, evtSmall)).toEqual(normalizeCoords(rectLarge, evtLarge));
  });
});
