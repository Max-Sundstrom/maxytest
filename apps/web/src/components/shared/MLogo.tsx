/**
 * <MLogo /> — 28×28 dark-accent logo with terra dot top-right.
 *
 * Source: design-system handoff `index.html` .mx-logo (lines 187-188).
 * Used in the topbar of every authenticated screen + the plugin header.
 *
 * Pure CSS — no SVG, no asset. The "M" is a 500-weight monospace glyph
 * sized to fit the 28×28 ink-0 square. The 5px accent dot is drawn via
 * absolute positioning so it's identical to the `.mx-logo::after` rule
 * in the handoff CSS.
 */

export interface MLogoProps {
  size?: number;
}

export function MLogo({ size = 28 }: MLogoProps) {
  const dotSize = Math.round(size * 0.18);
  const dotInset = Math.round(size * 0.14);
  return (
    <div
      aria-label="Maxytest"
      role="img"
      style={{
        width: size,
        height: size,
        background: 'var(--ink-0)',
        color: 'var(--bg-page)',
        borderRadius: 'var(--radius)',
        display: 'grid',
        placeItems: 'center',
        font: `600 ${Math.round(size * 0.5)}px/1 var(--font-sans)`,
        letterSpacing: '-0.02em',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      M
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: dotInset,
          right: dotInset,
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: 'var(--color-accent)',
        }}
      />
    </div>
  );
}
