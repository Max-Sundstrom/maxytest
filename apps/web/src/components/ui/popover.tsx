/**
 * <Popover /> — shadcn-style wrapper around Radix Popover primitive.
 *
 * Plan 03.1-02 — first consumer is `DateRangeControl` (report sidebar
 * «Дата» trigger). Future consumers (e.g. `ResponsesView` row actions
 * menu in 03.1-04) inherit this primitive without re-templating.
 *
 * Built on the `radix-ui` umbrella package (1.4.3) — same import shape as
 * `Dialog` in `apps/web/src/components/ui/dialog.tsx`. The umbrella ships
 * every Radix namespace under one entry-point so we don't have to add a
 * separate `@radix-ui/react-popover` dependency.
 *
 * Theming:
 *   - CSS vars only (`--bg-card`, `--border-1`, `--radius`, `--sh-md`).
 *   - No hardcoded hex literals — works across the paper / white / dark
 *     skins without changes.
 *   - Inline `style` for the design-token surfaces; Radix's data-state
 *     attributes are kept available for callers that want CSS-anim hooks.
 *
 * Accessibility:
 *   - Radix Popover handles focus-trap-on-open, ESC to close, outside-click
 *     dismissal, and `prefers-reduced-motion` (no opt-out animation in
 *     this wrapper — we keep Radix defaults so the system honour applies).
 */

import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Portal>) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ style, sideOffset = 4, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        sideOffset={sideOffset}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--sh-md)',
          padding: 6,
          color: 'var(--text-1)',
          font: '400 13px var(--font-sans)',
          zIndex: 70,
          outline: 'none',
          ...style,
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});

export { Popover, PopoverTrigger, PopoverPortal, PopoverAnchor, PopoverContent };
