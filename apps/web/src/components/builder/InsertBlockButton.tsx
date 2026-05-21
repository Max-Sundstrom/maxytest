/**
 * <InsertBlockButton> — inline "+" between BlockCards in Builder.
 *
 * Hot-fix introduced during Phase 4 UAT 2026-05-21 — user expected to be able
 * to insert blocks at a specific slot, not only at the end of the list. This
 * thin row sits between adjacent BlockCards; clicking it opens the catalog
 * with `catalogInsertPosition = position` so handleAdd inserts there.
 *
 * Visual contract:
 *   - 24px tall row spanning the canvas width.
 *   - Centered button: 24×24 circle with a `+` icon, accent border on hover,
 *     and a faint horizontal rule on either side that becomes accent-coloured
 *     on hover.
 *   - Idle state is subtle (low-contrast). Hover state matches the rest of
 *     the design-system v1 moss-accent treatment.
 *
 * Accessibility:
 *   - `aria-label` describes the exact slot ("Вставить блок после Welcome").
 *   - Keyboard-focusable; same hover styling under :focus-visible.
 */

import { Plus } from 'lucide-react';
import { useUiStore } from '@/lib/stores/ui';

export interface InsertBlockButtonProps {
  /**
   * Insert slot — the new block lands at this position; everything from
   * this position onward shifts +1. Welcome is always position 0 and
   * thanks is always last, so valid slots are 1..thanksIdx.
   */
  position: number;
  /**
   * Friendly label for the block that precedes this slot — used in
   * `aria-label` so screen readers announce "Insert after Welcome" etc.
   */
  afterLabel: string;
}

export function InsertBlockButton({ position, afterLabel }: InsertBlockButtonProps) {
  const setOpen = useUiStore((s) => s.setCatalogPanelOpen);
  const setPosition = useUiStore((s) => s.setCatalogInsertPosition);

  return (
    <div
      style={{
        position: 'relative',
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Negative margin pulls the row tight against neighbouring 16px gap
        // of BuilderShell main flex — net spacing stays around 8px on each
        // side so the button feels integrated.
        margin: '-4px 0',
      }}
    >
      <button
        type="button"
        aria-label={`Вставить блок после: ${afterLabel}`}
        onClick={() => {
          setPosition(position);
          setOpen(true);
        }}
        className="mx-insert-block-btn"
        style={{
          // Sized to match the bottom dashed "Добавить блок" button rhythm:
          // 24×24 puck with the icon centered.
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-1)',
          color: 'var(--text-2)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          zIndex: 1,
          opacity: 0.55,
          transition:
            'opacity 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1), transform 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.borderColor = 'var(--color-accent)';
          e.currentTarget.style.color = 'var(--color-accent)';
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.55';
          e.currentTarget.style.borderColor = 'var(--border-1)';
          e.currentTarget.style.color = 'var(--text-2)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onFocus={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.borderColor = 'var(--color-accent)';
          e.currentTarget.style.color = 'var(--color-accent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.opacity = '0.55';
          e.currentTarget.style.borderColor = 'var(--border-1)';
          e.currentTarget.style.color = 'var(--text-2)';
        }}
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
