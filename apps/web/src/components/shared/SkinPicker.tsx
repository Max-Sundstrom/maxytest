/**
 * SkinPicker — floating 3-dot toggle to swap design-system skins at runtime.
 *
 * Pinned bottom-right, above the future help FAB. Three swatch buttons that
 * preview the paper/white/dark surface color, with the active one ring-marked.
 *
 * Wired to `usePrefsStore` → `lib/stores/prefs.ts`, which syncs the choice to
 * `<html data-skin="…">` and persists via Zustand `persist`. The choice
 * survives reload.
 *
 * Intended to live in the app root layout (RootComponent in `routes/__root.tsx`)
 * so it's visible on every screen, including the auth/login routes — that's the
 * point: the user can compare every screen across skins without leaving it.
 *
 * Future: Phase 6+ will replace this with the full Tweaks panel from the
 * design-system handoff (accent picker, type pairing, language). Until then,
 * this 3-dot affordance is the minimum viable surface for live theme testing.
 */

import { usePrefsStore, type Skin } from '@/lib/stores/prefs';

const SKINS: Array<{ id: Skin; label: string; preview: string }> = [
  { id: 'paper', label: 'Paper (warm)', preview: '#FBF8F3' },
  { id: 'white', label: 'White (neutral)', preview: '#FFFFFF' },
  { id: 'dark', label: 'Dark', preview: '#14130F' },
];

export function SkinPicker() {
  const skin = usePrefsStore((s) => s.skin);
  const setSkin = usePrefsStore((s) => s.setSkin);

  return (
    <div
      role="group"
      aria-label="Design skin"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-md)',
        font: '500 11px / 16px var(--font-mono)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
      }}
    >
      <span style={{ paddingLeft: 4 }}>skin</span>
      {SKINS.map((s) => {
        const active = s.id === skin;
        return (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            aria-pressed={active}
            onClick={() => setSkin(s.id)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              border: active ? '2px solid var(--color-accent)' : '1px solid var(--border-strong)',
              background: s.preview,
              padding: 0,
              cursor: 'pointer',
              transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
            }}
          />
        );
      })}
    </div>
  );
}
