// apps/plugin/src/__tests__/transition.test.ts — Phase 02.2 Plan 06 (TDD).
//
// Locks down mapTransition() against the worker reference at
// supabase/functions/figma-import-worker/index.ts:191-212. THIS IS THE
// BYTE-IDENTITY CONTRACT — any drift between plugin and worker on the same
// Figma reaction means the SAME prototype imported via plugin vs REST
// produces DIFFERENT transition_kind values in the hotspots table, which
// surfaces as different runner animations (or worse, a wrong analytics
// classification when Phase 3+ slices reports by transition_kind).
//
// Worker behavior the tests assert (copied from worker:191-212):
//
//   1. Input is `{ type?: string } | null | undefined` (the .transition slot
//      from a Figma reaction action), NOT a bare string. We mirror the same
//      signature so callers pass the same value the worker would.
//   2. The string is uppercased before matching — so case-insensitivity is
//      handled by normalization, not by the switch.
//   3. SLIDE_* and PUSH_* families each have 4 directional members PLUS the
//      worker also recognizes SLIDE_IN, SLIDE_OUT, PUSH (legacy names that
//      Figma's API has emitted at various times). We must include them.
//   4. SMART_ANIMATE → 'smart_animate'.
//   5. Anything else — including missing / null / undefined / unknown
//      strings AND the legacy DISSOLVE/INSTANT_TRANSITION names — falls
//      through to 'dissolve'. (Worker default.)
//
// PLAN DEVIATION NOTE (Rule 1 — plan-spec bug fix):
// The Plan 02.2-06 task spec lists 13 tests, one of which (Test 13) asserts
// that lowercase 'slide_from_right' returns 'dissolve' because "the worker
// is uppercase only". That is INCORRECT — the worker explicitly uppercases
// its input first (`(t?.type ?? '').toUpperCase()`), so lowercase input
// normalizes to 'slide'. We follow the WORKER (byte-identity is the
// authoritative contract per the threat register T-02.2-06-02) and adjust
// Test 13 to assert the real worker behavior. Documented in SUMMARY.md
// under "Deviations from Plan".

import { describe, expect, it } from 'vitest';
import { mapTransition } from '../lib/transition';

describe('mapTransition', () => {
  it('Test 1: SLIDE_FROM_RIGHT → slide', () => {
    expect(mapTransition({ type: 'SLIDE_FROM_RIGHT' })).toBe('slide');
  });
  it('Test 2: SLIDE_FROM_LEFT → slide', () => {
    expect(mapTransition({ type: 'SLIDE_FROM_LEFT' })).toBe('slide');
  });
  it('Test 3: SLIDE_FROM_TOP → slide', () => {
    expect(mapTransition({ type: 'SLIDE_FROM_TOP' })).toBe('slide');
  });
  it('Test 4: SLIDE_FROM_BOTTOM → slide', () => {
    expect(mapTransition({ type: 'SLIDE_FROM_BOTTOM' })).toBe('slide');
  });

  it('Test 5: PUSH_FROM_RIGHT → push', () => {
    expect(mapTransition({ type: 'PUSH_FROM_RIGHT' })).toBe('push');
  });
  it('Test 6: PUSH_FROM_LEFT → push', () => {
    expect(mapTransition({ type: 'PUSH_FROM_LEFT' })).toBe('push');
  });
  it('Test 7: PUSH_FROM_TOP → push', () => {
    expect(mapTransition({ type: 'PUSH_FROM_TOP' })).toBe('push');
  });
  it('Test 8: PUSH_FROM_BOTTOM → push', () => {
    expect(mapTransition({ type: 'PUSH_FROM_BOTTOM' })).toBe('push');
  });

  it('Test 9: SMART_ANIMATE → smart_animate', () => {
    expect(mapTransition({ type: 'SMART_ANIMATE' })).toBe('smart_animate');
  });

  it('Test 10: DISSOLVE → dissolve (worker default fallthrough)', () => {
    expect(mapTransition({ type: 'DISSOLVE' })).toBe('dissolve');
  });

  it('Test 11: INSTANT_TRANSITION → dissolve (worker default fallthrough)', () => {
    expect(mapTransition({ type: 'INSTANT_TRANSITION' })).toBe('dissolve');
  });

  it('Test 12: undefined / null / unknown string → dissolve (safe fallback)', () => {
    expect(mapTransition(undefined)).toBe('dissolve');
    expect(mapTransition(null)).toBe('dissolve');
    expect(mapTransition({})).toBe('dissolve');
    expect(mapTransition({ type: undefined })).toBe('dissolve');
    expect(mapTransition({ type: 'NOT_A_REAL_FIGMA_TRANSITION' })).toBe('dissolve');
  });

  it('Test 13: lowercase input is normalized to uppercase before matching', () => {
    // Worker behavior: `(t?.type ?? '').toUpperCase()` — so lowercase
    // 'slide_from_right' becomes 'SLIDE_FROM_RIGHT' and maps to 'slide'.
    // (See header comment for the plan-vs-worker reconciliation.)
    expect(mapTransition({ type: 'slide_from_right' })).toBe('slide');
    expect(mapTransition({ type: 'Push_From_Left' })).toBe('push');
    expect(mapTransition({ type: 'smart_animate' })).toBe('smart_animate');
  });

  it('Test 14 (extra): worker-only legacy aliases SLIDE_IN / SLIDE_OUT → slide', () => {
    expect(mapTransition({ type: 'SLIDE_IN' })).toBe('slide');
    expect(mapTransition({ type: 'SLIDE_OUT' })).toBe('slide');
  });

  it('Test 15 (extra): worker-only legacy alias PUSH → push', () => {
    expect(mapTransition({ type: 'PUSH' })).toBe('push');
  });
});
