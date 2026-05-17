/**
 * <Drawer /> — generic slide-in side panel.
 *
 * Source: design-system handoff ADDENDUM-v3 §"Goal screen drawer" — slide-in
 * panel anchored right with a scrim fading the rest of the canvas. Same
 * underlying pattern will be reused by future heavy editors (logic builder
 * in Phase 4, conditional-flow editor, etc.) — see [[project_drawer_pattern_pending]]
 * memory note.
 *
 * Built on Radix Dialog for accessibility:
 *   - focus-trap inside the drawer while open
 *   - ESC closes (configurable via `onEscapeKeyDown`)
 *   - scrim click closes (configurable via `onPointerDownOutside`)
 *   - inert background — screen readers + keyboard navigation skip it
 *
 * Geometry overrides Radix defaults:
 *   - Anchored to the right edge of the viewport
 *   - max-width: 1040px (handoff drawer width), but full-width below
 *     1080px viewports so the drawer doesn't peek over its own scrim
 *   - height: 100dvh (drawer fills viewport vertically)
 *   - slides in from x:100% → x:0 over 240ms cubic-bezier(.2,.7,.3,1)
 *     (matches --duration-standard + --ease-out)
 *   - scrim: ink-0 @ 40% opacity + 2px backdrop-blur
 *
 * Animation respects `prefers-reduced-motion` — both the slide and the
 * scrim fade collapse to 0ms.
 *
 * Why not use shadcn `Sheet`: shadcn's Sheet ships fixed widths via
 * Tailwind variants and assumes a single CSS-class theme. We want the
 * drawer to slot into the design-token system (paper/white/dark skins)
 * without re-templating, and to express the 1040px-with-graceful-fallback
 * width in a single place. A bare Radix wrapper is simpler.
 */

import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';

export type DrawerSide = 'right' | 'left';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: DrawerSide;
  ariaLabel: string;
  children: React.ReactNode;
  /** Max-width in px. Defaults to 1040 (handoff goal-screen drawer). */
  maxWidth?: number;
}

export function Drawer({
  open,
  onOpenChange,
  side = 'right',
  ariaLabel,
  children,
  maxWidth = 1040,
}: DrawerProps) {
  const anchorX = side === 'right' ? '100%' : '-100%';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklab, var(--ink-0) 40%, transparent)',
            backdropFilter: 'blur(2px)',
            zIndex: 80,
            animation: 'drawer-scrim-in 240ms cubic-bezier(.2,.7,.3,1)',
          }}
        />
        <DialogPrimitive.Content
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            top: 0,
            [side]: 0,
            height: '100dvh',
            width: '100%',
            maxWidth,
            background: 'var(--bg-page)',
            borderLeft: side === 'right' ? '1px solid var(--border-2)' : undefined,
            borderRight: side === 'left' ? '1px solid var(--border-2)' : undefined,
            boxShadow:
              side === 'right' ? '-24px 0 60px rgba(0,0,0,0.18)' : '24px 0 60px rgba(0,0,0,0.18)',
            zIndex: 81,
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
            // Slide-in animation. The `--drawer-from-x` custom prop is set by
            // the @keyframes block below; we toggle the sign per `side`.
            animation: `drawer-slide-${side} 240ms cubic-bezier(.2,.7,.3,1)`,
            ['--drawer-from-x' as never]: anchorX,
          }}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      {/*
        Keyframes live in a side-effect <style>. Cheap inline injection since
        the Drawer is rare (one mount per app at most).
      */}
      <style>{`
        @keyframes drawer-scrim-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes drawer-slide-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes drawer-slide-left {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes drawer-scrim-in { from, to { opacity: 1; } }
          @keyframes drawer-slide-right { from, to { transform: translateX(0); } }
          @keyframes drawer-slide-left  { from, to { transform: translateX(0); } }
        }
      `}</style>
    </DialogPrimitive.Root>
  );
}

/**
 * Standard drawer header — title + meta cluster + close X.
 * Matches handoff `.gs-dr-hd` geometry (24/32/18 padding).
 */
export interface DrawerHeaderProps {
  title: string;
  meta?: React.ReactNode;
  onClose: () => void;
}

export function DrawerHeader({ title, meta, onClose }: DrawerHeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '24px 32px 18px',
        borderBottom: '1px solid var(--border-2)',
      }}
    >
      <DialogPrimitive.Title
        style={{
          font: '600 22px/28px var(--font-sans)',
          color: 'var(--text-1)',
          margin: 0,
          letterSpacing: '-0.005em',
        }}
      >
        {title}
      </DialogPrimitive.Title>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {meta ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              font: '400 13px var(--font-sans)',
              color: 'var(--text-2)',
            }}
          >
            {meta}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            width: 32,
            height: 32,
            background: 'transparent',
            border: 0,
            borderRadius: 'var(--radius)',
            color: 'var(--text-2)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-chip)';
            e.currentTarget.style.color = 'var(--text-1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-2)';
          }}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}

/**
 * Drawer footer — flex justify-between row with 18/32/24 padding (handoff
 * `.gs-dr-foot`). Caller composes primary CTA + ancillary content.
 */
export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '18px 32px 24px',
        borderTop: '1px solid var(--border-2)',
      }}
    >
      {children}
    </footer>
  );
}
