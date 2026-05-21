/**
 * <InsertRowButton> — inline "+" between BlockSidebarRow items in the
 * left sidebar. Matches the user-provided reference (2026-05-22):
 *
 *   ───────────── [+] ─────────────
 *
 * - Always visible at low opacity so the click target is discoverable
 *   without hover (no layout-shift / cursor jitter — the row's height is
 *   fixed at 24px and never collapses).
 * - On hover: lines + icon transition to the moss accent.
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
      style={{
        listStyle: 'none',
        height: 24,
        margin: 0,
        padding: 0,
      }}
    >
      <button
        type="button"
        aria-label={`Добавить блок после: ${afterLabel}`}
        onClick={() => {
          setPosition(position);
          setOpen(true);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={{
          width: '100%',
          height: '100%',
          padding: '0 8px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 8,
          // Subtle by default — fades in on row-strip hover (the parent
          // <ul> doesn't currently track hover, so we keep base opacity
          // visible enough for discoverability without being noisy).
          opacity: hovered ? 1 : 0.55,
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
