// apps/plugin/src/components/HelpPill.tsx — Phase 02.2 Plan 05 Task 3.
//
// UI-SPEC §"Component Inventory" #11 — secondary-pill style "Помощь" button
// pinned to the bottom-left of the plugin window. Opens the README via
// figma.openExternal (parent IPC → sandbox handler).
//
// Position is `absolute` per UI-SPEC; the parent (ui.tsx) sets
// position:relative on its main wrapper so the pill anchors correctly
// inside the 360×540 surface.

import { useState } from 'react';

interface HelpPillProps {
  onClick: () => void;
}

export default function HelpPill({ onClick }: HelpPillProps) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Открыть помощь"
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        height: 36,
        padding: '0 16px',
        borderRadius: 9999,
        border: '1px solid var(--color-border)',
        background: hover ? 'var(--color-bg-muted)' : 'var(--color-bg)',
        color: 'var(--color-text)',
        fontSize: 14,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        transition: 'background 120ms ease-out',
      }}
    >
      {/* Inline SVG `?` 14×14 — UI-SPEC §"Iconography" row 7 */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
      <span>Помощь</span>
    </button>
  );
}
