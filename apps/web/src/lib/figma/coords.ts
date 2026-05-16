/**
 * Pure DOMRect → normalized [0, 1] coordinate function.
 *
 * Letterbox-aware: returns `null` when the pointer falls outside the rect —
 * i.e., the click landed on a letterbox bar around the prototype image, not
 * on the image itself. Per CONTEXT.md D-discretion (line 248), null clicks
 * are DROPPED, not recorded as `region:letterbox`.
 *
 * IMPORTANT: pass the IMAGE element's `getBoundingClientRect()`, NOT the
 * wrapper element's rect. The wrapper may be larger than the image due to
 * `object-fit: contain` letterboxing — using the wrapper rect would treat
 * letterbox clicks as inside-image clicks and report misclick events at
 * fake coordinates (Pitfall 5, RESEARCH.md lines 746-758).
 *
 * Viewport-invariant by construction: dividing by `rect.width`/`rect.height`
 * normalizes the output, so the same logical click returns the same `(x, y)`
 * at any rendered scale (mobile portrait, desktop, zoom). Pitfall 5 unit
 * test mandate verified in `coords.test.ts` Test 6.
 *
 * Verbatim math from PATTERNS.md lines 374-392.
 */

export function normalizeCoords(rect: DOMRect, evt: PointerEvent): { x: number; y: number } | null {
  const x = (evt.clientX - rect.left) / rect.width;
  const y = (evt.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
