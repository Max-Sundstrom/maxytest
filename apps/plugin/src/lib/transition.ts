// apps/plugin/src/lib/transition.ts — Phase 02.2 Plan 06.
//
// Maps Figma's `transition.type` strings to Maxytest's 4-value enum.
// BYTE-IDENTICAL to supabase/functions/figma-import-worker/index.ts:191-212.
//
// Why byte-identity matters (threat T-02.2-06-02): the same Figma reaction
// imported via plugin and via REST MUST produce the same transition_kind
// in the hotspots table; otherwise the runner animation and any analytics
// slice on transition_kind (Phase 3+) diverge based on import path —
// silently — and reports drift in ways no test catches until a user
// complains. Test 4 in __tests__/transition.test.ts asserts a wide enum
// surface; threat-register mitigation depends on these tests staying
// authoritative.

export type TransitionKind = 'slide' | 'push' | 'smart_animate' | 'dissolve';

/** Figma transition.type → our 4-value enum. Smart Animate is recorded as
 *  its own kind (not approximated to 'dissolve') so the report can flag
 *  honestly. INSTANT_TRANSITION and unknown types fall through to 'dissolve'
 *  which is the worker's default.
 *
 *  Input shape mirrors the worker: an object with optional `type` string,
 *  the SAME slot that the worker reads from `action.transition`.
 *
 *  Copy-verbatim from supabase/functions/figma-import-worker/index.ts:191-212.
 */
export function mapTransition(t?: { type?: string } | null): TransitionKind {
  const raw = (t?.type ?? '').toUpperCase();
  if (
    raw === 'SLIDE_FROM_LEFT' ||
    raw === 'SLIDE_FROM_RIGHT' ||
    raw === 'SLIDE_FROM_TOP' ||
    raw === 'SLIDE_FROM_BOTTOM' ||
    raw === 'SLIDE_IN' ||
    raw === 'SLIDE_OUT'
  )
    return 'slide';
  if (
    raw === 'PUSH_FROM_LEFT' ||
    raw === 'PUSH_FROM_RIGHT' ||
    raw === 'PUSH_FROM_TOP' ||
    raw === 'PUSH_FROM_BOTTOM' ||
    raw === 'PUSH'
  )
    return 'push';
  if (raw === 'SMART_ANIMATE') return 'smart_animate';
  return 'dissolve';
}
