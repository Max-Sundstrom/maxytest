/**
 * <FolderCard /> — 56px-tall folder card from the studies-list home.
 *
 * Source: handoff `js/maxitest-list.jsx` <FolderCard /> + `.mx-folder*` CSS
 * (index.html lines 373-385).
 *
 * Four colour variants per handoff: `moss` (secondary), `sky` (info),
 * `ochre` (highlight), `ink` (muted/archive). Background tint derives via
 * `color-mix(in oklab, var(--accent-*) Xpct%, var(--bg-card))` so the chip
 * stays visually balanced across paper/white/dark skins.
 *
 * Phase 1 has no real `folders` table — the only "folder" rendered in the
 * landing view is the Archive folder (variant=ink), wired to the archived-
 * studies count and clickable to flip the tests list filter. A dashed
 * "+ Новая папка" pill in the section header is the placeholder for Phase 6+
 * team-collaboration when folders get a CRUD UI.
 */

import { Folder } from 'lucide-react';

export type FolderColor = 'moss' | 'sky' | 'ochre' | 'ink';

// Moss now resolves to --color-accent (the primary accent) since the brand
// swap on 2026-05-17 made moss the primary. Other folder colors still point
// at their named secondary tokens (sky/ochre/plum).
const ICON_BG: Record<FolderColor, string> = {
  moss: 'color-mix(in oklab, var(--color-accent) 22%, var(--bg-card))',
  sky: 'color-mix(in oklab, var(--color-accent-3) 22%, var(--bg-card))',
  ochre: 'color-mix(in oklab, var(--color-accent-4) 28%, var(--bg-card))',
  ink: 'var(--bg-chip)',
};

const ICON_FG: Record<FolderColor, string> = {
  moss: 'var(--color-accent)',
  sky: 'var(--color-accent-3)',
  ochre: 'var(--color-accent-4)',
  ink: 'var(--text-2)',
};

export interface FolderCardProps {
  name: string;
  count: number;
  color: FolderColor;
  muted?: boolean;
  active?: boolean;
  onClick?: () => void;
}

function ruPluralTests(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'тест';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 11 || mod100 > 14)) return 'теста';
  return 'тестов';
}

export function FolderCard({
  name,
  count,
  color,
  muted = false,
  active = false,
  onClick,
}: FolderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 14px',
        height: 56,
        background: muted ? 'transparent' : 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border-1)'}`,
        borderRadius: 'var(--radius)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
        width: '100%',
        font: 'inherit',
        color: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = 'var(--color-accent)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = 'var(--border-1)';
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-sm)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          background: ICON_BG[color],
          color: ICON_FG[color],
        }}
      >
        <Folder size={14} strokeWidth={1.5} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            font: '500 13.5px/16px var(--font-sans)',
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span
          style={{
            display: 'block',
            font: '400 12px/16px var(--font-sans)',
            color: 'var(--text-3)',
            marginTop: 2,
          }}
        >
          {count} {ruPluralTests(count)}
        </span>
      </span>
    </button>
  );
}
