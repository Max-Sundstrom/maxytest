// apps/plugin/src/components/DotsLoader.tsx — Phase 02.2 Plan 05 Task 3.
//
// UI-SPEC §"Component Inventory" #7 — three pulsing dots, 1.2s cycle,
// 0 / 160ms / 320ms delays. Used inside PrimaryCta pending state and
// (in Plan 07) inside ProgressView.
//
// The `dots-loader` className is load-bearing — it is the hook that the
// prefers-reduced-motion media query in styles.css.ts uses to swap the
// animation for a static muted opacity. Renaming this class would silently
// break the reduced-motion fallback for users with vestibular sensitivities.

interface DotsLoaderProps {
  /** Override the dot color. Defaults to muted text per UI-SPEC. */
  color?: string;
}

const delays = ['0s', '0.16s', '0.32s'];

export default function DotsLoader({ color = 'var(--color-text-muted)' }: DotsLoaderProps) {
  return (
    <div
      className="dots-loader"
      role="presentation"
      aria-hidden="true"
      style={{ display: 'inline-flex', gap: 6 }}
    >
      {delays.map((delay) => (
        <span
          key={delay}
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: color,
            // 1.2s cycle per UI-SPEC §"Animation & Motion" — staggered start
            // produces the wave/heart-rate feel of the inspiration screens.
            animation: `pulse-dot 1.2s ease-in-out ${delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}
