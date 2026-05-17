// apps/plugin/src/components/PrimaryCta.tsx — design-system v1 rewrite (2026-05-17).
//
// Source: handoff `.fp-cta` — 44px tall full-width pill (border-radius 999px),
// moss accent bg, white text, brightness(1.05) on hover, disabled state at
// 50% opacity. Loading state replaces the label with DotsLoader (visual cue
// for the auth-handshake roundtrip — Plan 05 Pitfall 3 invariant unchanged).

import DotsLoader from './DotsLoader';

interface PrimaryCtaProps {
  label: string;
  onClick: () => void | Promise<void>;
  pending?: boolean;
  disabled?: boolean;
}

export default function PrimaryCta({
  label,
  onClick,
  pending = false,
  disabled = false,
}: PrimaryCtaProps) {
  const isDisabled = pending || disabled;
  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      style={{
        display: 'block',
        width: '100%',
        height: 44,
        background: 'var(--color-accent)',
        color: '#FFFFFF',
        border: 0,
        borderRadius: 999,
        font: '500 14px var(--font-sans, "IBM Plex Sans"), system-ui',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) e.currentTarget.style.filter = 'brightness(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none';
      }}
    >
      {pending ? <DotsLoader /> : label}
    </button>
  );
}
