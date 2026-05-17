// apps/plugin/src/components/SignOutMenu.tsx — Phase 02.2 Plan 07 Task 3.
//
// Kebab (⋮) menu trigger in the top-right of the content area on
// authenticated screens (S2/S4). One menuitem: "Выйти". Per UI-SPEC §12
// (Component Inventory) + §"Focus order".
//
// Layout:
//   - 28×28 transparent button with a 3-dot-vertical SVG icon
//   - On click: toggle a small dropdown (absolute-positioned, right-anchored)
//   - Outside-click closes the menu (useEffect mousedown listener)
//   - Escape key closes the menu (separate handler)
//
// A11y:
//   - aria-haspopup="menu", aria-expanded={open}
//   - role="menu" + role="menuitem" on the dropdown
//   - Focus is NOT moved into the menu in v1 — the menu is single-item, the
//     user clicks it directly. Phase 7 polish could add full keyboard nav
//     (Up/Down arrows + Enter), out of scope here.

import { useEffect, useRef, useState } from 'react';

interface SignOutMenuProps {
  onSignOut: () => void;
}

export default function SignOutMenu({ onSignOut }: SignOutMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent): void {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Меню"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          background: 'transparent',
          border: 0,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-2)',
          cursor: 'pointer',
          transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-input)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {open && (
        <ul
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 140,
            listStyle: 'none',
            padding: 4,
            background: '#FFFFFF',
            border: '1px solid var(--border-1)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            zIndex: 10,
          }}
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 0,
                borderRadius: 4,
                textAlign: 'left',
                font: '400 14px var(--font-sans, "IBM Plex Sans"), system-ui',
                color: 'var(--text-1)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-input)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Выйти
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
