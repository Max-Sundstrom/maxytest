/**
 * TransitionAnimator — CSS-keyframe transition wrapper with pointer-events
 * lockout window. Plan 02-09 Task 2 / PATTERNS.md lines 1082-1109 /
 * Pitfall 8 (RESEARCH.md lines 772-796).
 *
 * Why CSS keyframes (not framer-motion / spring):
 *   - Three transitions ship in v1 (slide / dissolve / push); each is a
 *     single keyframe pair. A 50-line CSS keyframe is cheaper than a
 *     ~50 KB animation library on a Phase 5 bundle budget.
 *   - smart_animate degrades to dissolve (CONTEXT D-10): Figma's runtime
 *     property tweens would require Embed Kit and we already opted out
 *     of that for hit-test fidelity.
 *
 * Pointer-events lockout (Pitfall 8 — Maze-style):
 *   - The wrapper applies `pointer-events: none` for the FULL animation
 *     duration. Without this, a respondent who mashes the screen during
 *     the 200-400 ms transition can register a tap on the OLD frame's
 *     hotspots while the visual is on the NEW frame.
 *   - PrototypeRunner.handleTap also guards `if (transition) return;`
 *     as belt-and-suspenders — defence in depth.
 *
 * Lifecycle:
 *   - `keyValue` is the transition's identity (target_frame_id + Date.now()).
 *     Changing it remounts the wrapper which re-runs the keyframe animation.
 *   - `onComplete` fires once after `DURATION_MS[kind]` ms via setTimeout.
 *     The CSS `animation-fill-mode: forwards` (in globals.css) holds the
 *     final frame state until the parent re-renders.
 *
 * Reduced motion (a11y, WCAG 2.3.3):
 *   - `prefers-reduced-motion: reduce` collapses the animation duration
 *     to 0 ms via a CSS rule in globals.css. The lockout still fires
 *     (pointer-events: none + setTimeout) but the visual is instant.
 */
import { useEffect } from 'react';

export type TransitionKind = 'slide' | 'dissolve' | 'push' | 'smart_animate';

/**
 * Lockout durations per CONTEXT D-10:
 *   - dissolve 200ms (also the smart_animate fallback)
 *   - slide    300ms
 *   - push     400ms
 */
const DURATION_MS: Record<TransitionKind, number> = {
  slide: 300,
  dissolve: 200,
  push: 400,
  smart_animate: 200,
};

export interface TransitionAnimatorProps {
  kind: TransitionKind;
  /** Identity of this transition — change to re-trigger. */
  keyValue: string;
  children: React.ReactNode;
  onComplete: () => void;
}

export function TransitionAnimator({
  kind,
  keyValue,
  children,
  onComplete,
}: TransitionAnimatorProps) {
  const duration = DURATION_MS[kind] ?? DURATION_MS.dissolve;

  useEffect(() => {
    // keyValue identifies this transition; back-to-back transitions to the
    // same kind with the same duration would not re-fire if we depended on
    // duration/onComplete alone — keyValue is the parent-controlled identity.
    const t = setTimeout(onComplete, duration);
    return () => clearTimeout(t);
  }, [keyValue, duration, onComplete]);

  const animClass =
    kind === 'slide'
      ? 'animate-prototype-slide'
      : kind === 'push'
        ? 'animate-prototype-push'
        : 'animate-prototype-dissolve';

  return (
    <div
      key={keyValue}
      // pointer-events: none for the FULL animation window (Pitfall 8).
      className={`${animClass} pointer-events-none`}
      style={{ animationDuration: `${duration}ms` }}
      aria-live="polite"
    >
      {children}
    </div>
  );
}
