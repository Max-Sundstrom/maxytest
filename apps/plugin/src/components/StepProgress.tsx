// apps/plugin/src/components/StepProgress.tsx — Phase 02.2 Plan 07 Task 3.
//
// Two-step progress indicator: sign-in (1) → publish (2). Used at the top
// of S1 (showing 1/2) and the top of S2 (showing 2/2).
//
// UI-SPEC §"Component Inventory" #2:
//   - Active: 22×22 dark circle with white digit (12/600).
//   - Inactive: 22×22 muted bg with muted digit (12/400).
//   - Connector: 1px solid muted line, 16px wide, 4px horizontal margin.
//   - aria-current="step" marks the active circle for screen readers.
//
// We keep the design-system v1 token vocabulary (moss accent, ink/paper
// scale) so the component visually parses with PluginHeader and the
// PasteUrlView's Stepper used elsewhere in the plugin.

interface StepProgressProps {
  current: 1 | 2;
  total?: 2;
}

export default function StepProgress({ current }: StepProgressProps) {
  return (
    <nav
      aria-label="Plugin progress"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Dot n={1} active={current === 1} done={current > 1} />
      <Connector />
      <Dot n={2} active={current === 2} done={false} />
    </nav>
  );
}

function Dot({ n, active, done }: { n: 1 | 2; active: boolean; done: boolean }) {
  // Three visual states: done (filled accent + check), active (filled
  // dark + number), todo (muted bg + muted digit).
  const isFilled = done || active;
  const bg = done ? 'var(--color-accent)' : active ? '#1F1F1F' : 'var(--bg-chip)';
  const fg = isFilled ? '#FFFFFF' : 'var(--text-2)';
  return (
    <span
      aria-current={active ? 'step' : undefined}
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: bg,
        color: fg,
        font: '600 12px var(--font-sans, "IBM Plex Sans"), system-ui',
        flexShrink: 0,
      }}
    >
      {done ? (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

function Connector() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 1,
        background: 'var(--border-1)',
        flexShrink: 0,
      }}
    />
  );
}
