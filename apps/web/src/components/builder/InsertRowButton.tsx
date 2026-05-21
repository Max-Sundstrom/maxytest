/**
 * <InsertRowButton> — inline "+" between BlockSidebarRow items in the
 * left sidebar. Matches the user-provided reference (2026-05-22):
 *
 *   ───────────── [+] ─────────────
 *
 * - Idle: 4px tall sliver — barely a gap, no visible button. Gives the
 *   user a slim hover target between rows.
 * - On hover (or keyboard focus): the sliver expands to 28px AND its
 *   button fades in — neighbouring rows physically slide apart to make
 *   room for the new "Add block" affordance.
 * - Height transition is 120ms cubic-bezier; matches design-system v1
 *   motion easing so the slide feels integrated with the rest of the UI.
 * - Click sets `useUiStore.catalogInsertPosition = position` and opens
 *   the catalog drawer. The chosen block lands at that exact slot.
 *
 * Replaces the two reverted attempts (commits ee0c589 / 9c713c0) that
 * placed the button in the wrong surface (main canvas BlockCards
 * instead of sidebar rows). See memory entry
 * [[project_phase_5_runner_polish]] §4 for the history.
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useUiStore } from '@/lib/stores/ui';

export interface InsertRowButtonProps {
  /**
   * Insert slot — the new block lands at this position; everything from
   * this position onward shifts +1. Welcome is always position 0 and
   * thanks is always last, so valid slots are 1..thanksIdx (i.e. the
   * caller must NOT render this button after thanks).
   */
  position: number;
  /**
   * Friendly label for the block that precedes this slot — used in
   * `aria-label` so screen readers announce "Insert after Welcome" etc.
   */
  afterLabel: string;
}

export function InsertRowButton({ position, afterLabel }: InsertRowButtonProps) {
  const setOpen = useUiStore((s) => s.setCatalogPanelOpen);
  const setPosition = useUiStore((s) => s.setCatalogInsertPosition);
  const [hovered, setHovered] = useState(false);

  // Three colours derived from the design-system v1 token set:
  //   idle   — muted ink-2 (low contrast) so the button doesn't compete
  //            with adjacent row chrome.
  //   hover  — moss accent (var(--color-accent)) per skin.
  const idleColor = 'var(--text-2)';
  const accentColor = 'var(--color-accent)';
  const lineColor = hovered ? accentColor : 'var(--border-1)';
  const iconColor = hovered ? accentColor : idleColor;

  return (
    <li
      // Keep <li> so the parent <ul aria-label="Test blocks"> stays
      // semantically valid (children must be <li>). aria-hidden on the
      // outer li prevents screen readers from announcing the visual
      // separator twice — the inner <button> still gets the aria-label.
      aria-hidden="false"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        listStyle: 'none',
        // Idle 4px sliver = barely a gap; expands to 28px on hover so
        // adjacent rows slide apart and the button fits inside. The 4px
        // idle height is intentional: 0 would have no hover target, but
        // 4px is enough for the cursor to reliably land on between two
        // 32px-tall BlockSidebarRow neighbours.
        height: hovered ? 28 : 4,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        transition: 'height 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <button
        type="button"
        aria-label={`Добавить блок после: ${afterLabel}`}
        onClick={() => {
          setPosition(position);
          setOpen(true);
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={{
          width: '100%',
          height: 28,
          padding: '0 8px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 8,
          // The button itself is always 28px tall, but it lives inside a
          // <li> that's 4px (idle) → 28px (hover) with overflow:hidden, so
          // visually the button is hidden until the parent expands. The
          // opacity fade gives the icon/lines a soft entrance even after
          // the height transition lands.
          opacity: hovered ? 1 : 0,
          transition:
            'opacity 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
        }}
      >
        {/* Left rule */}
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            height: 1,
            background: lineColor,
            transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        />
        {/* Plus icon */}
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            placeItems: 'center',
            color: iconColor,
            transition: 'color 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        >
          <Plus size={14} strokeWidth={1.75} />
        </span>
        {/* Right rule */}
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            height: 1,
            background: lineColor,
            transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
          }}
        />
      </button>
    </li>
  );
}
