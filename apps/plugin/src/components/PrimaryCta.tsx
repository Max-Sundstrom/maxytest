// apps/plugin/src/components/PrimaryCta.tsx — Phase 02.2 Plan 05 Task 3.
//
// UI-SPEC §"Component Inventory" #3 — pill-shaped primary action button,
// 48 px tall, full-width inside its parent. Five states per UI-SPEC:
// active / hover / focus-visible / disabled / pending.
//
// Focus-visible styling lives in styles.css.ts so the same accent ring
// applies to every focusable element in the plugin. Hover uses inline
// onMouseEnter/Leave to swap background — keeps the component self-
// contained without a runtime CSS-in-JS dependency.
//
// `aria-busy={pending}` + `aria-disabled` per UI-SPEC §"PrimaryCta" bullet
// 6. The button is functionally disabled while pending OR disabled is true,
// but we keep `aria-disabled` reflecting the union so screen readers
// announce the state consistently.

import { useState } from 'react';

import DotsLoader from './DotsLoader';

interface PrimaryCtaProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  /** Override width (default 100% — full-width fill). Used by ErrorCard
   *  for the centered 240 px "Попробовать снова" button. */
  width?: number | string;
}

export default function PrimaryCta({
  label,
  onClick,
  disabled = false,
  pending = false,
  width = '100%',
}: PrimaryCtaProps) {
  const [hover, setHover] = useState(false);
  const inactive = disabled || pending;

  // Background palette — active / hover / disabled per UI-SPEC §"PrimaryCta"
  let bg = 'var(--color-accent)';
  if (inactive) bg = 'var(--color-accent-disabled)';
  else if (hover) bg = 'var(--color-accent-hover)';

  return (
    <button
      type="button"
      onClick={inactive ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={inactive}
      aria-busy={pending || undefined}
      aria-disabled={inactive || undefined}
      style={{
        height: 48,
        width,
        borderRadius: 9999,
        padding: '0 24px',
        border: 'none',
        background: bg,
        color: 'var(--color-text-invert)',
        fontSize: 16,
        fontWeight: 500,
        // Always show pointer on active; disabled/pending → not-allowed.
        cursor: inactive ? 'not-allowed' : 'pointer',
        opacity: inactive ? 0.85 : 1,
        // Smooth color transition per UI-SPEC §"Animation & Motion" row 5
        // (120ms ease-out hover). prefers-reduced-motion override in
        // styles.css.ts collapses this to 0.001ms (effectively instant).
        transition: 'background 120ms ease-out',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {pending ? <DotsLoader color="var(--color-text-invert)" /> : label}
    </button>
  );
}
