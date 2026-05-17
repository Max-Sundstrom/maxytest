// apps/plugin/src/components/Toggle.tsx — handoff pill toggle.
//
// Source: handoff `.fp-toggle*` rules. 36×20 pill with 16×16 knob; left=2 in
// off, left=18 in on. Background swaps gray ↔ accent (moss). Animated via
// `transition: left 160ms`.
//
// Accessible button — role=switch, aria-checked, focus-visible accent ring.

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  'aria-label': string;
  disabled?: boolean;
}

export default function Toggle({
  checked,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: checked ? 'var(--color-accent)' : '#D1D5DB',
        position: 'relative',
        flexShrink: 0,
        border: 0,
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 160ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          transition: 'left 160ms cubic-bezier(.2,.7,.3,1)',
        }}
      />
    </button>
  );
}
