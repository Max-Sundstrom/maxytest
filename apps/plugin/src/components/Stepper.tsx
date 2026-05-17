// apps/plugin/src/components/Stepper.tsx — handoff stepper for S1/S2 flow.
//
// Source: handoff `maxitest-plugin.jsx` <Steps /> + `.fp-stepper*` rules.
// Three per-step states:
//   - 'done' : accent circle with checkmark
//   - 'on'   : dark circle with the number, bold label
//   - 'todo' : gray circle with the number, label hidden
//
// Done steps are clickable (back-nav); current/future are not. The handoff's
// CSS hides .fp-stepper-line between steps when one of them is todo — we
// keep it always-visible because our two steps both have visible state at
// every render (done | on | todo), no jumping.

interface StepperProps {
  active: 1 | 2;
  labels: [string, string];
  onBack?: () => void;
}

export default function Stepper({ active, labels, onBack }: StepperProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const state = n < active ? 'done' : n === active ? 'on' : 'todo';
        const clickable = state === 'done' && onBack;
        return (
          <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && (
              <span
                aria-hidden="true"
                style={{ width: 16, height: 1, background: '#E5E7EB', flexShrink: 0 }}
              />
            )}
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? onBack : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px 4px 4px',
                background: 'transparent',
                border: 0,
                borderRadius: 999,
                cursor: clickable ? 'pointer' : 'default',
                font:
                  state === 'on'
                    ? '600 13px var(--font-sans, "IBM Plex Sans"), system-ui'
                    : '500 13px var(--font-sans, "IBM Plex Sans"), system-ui',
                color:
                  state === 'done' ? 'var(--color-accent)' : state === 'on' ? '#1F2328' : '#6B7280',
                transition:
                  'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
              }}
              onMouseEnter={(e) => {
                if (clickable) {
                  e.currentTarget.style.background = '#F4F4F5';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    state === 'done'
                      ? 'var(--color-accent)'
                      : state === 'on'
                        ? '#1F1F1F'
                        : '#F4F4F5',
                  color: state === 'todo' ? '#6B7280' : '#FFFFFF',
                  font: '500 12px var(--font-sans, "IBM Plex Sans"), system-ui',
                  flexShrink: 0,
                }}
              >
                {state === 'done' ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <span>{n}</span>
                )}
              </span>
              {state !== 'todo' ? <span style={{ whiteSpace: 'nowrap' }}>{label}</span> : null}
            </button>
          </span>
        );
      })}
    </div>
  );
}
