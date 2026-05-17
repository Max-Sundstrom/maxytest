/**
 * Design-system preferences store — adopted 2026-05-17 with design-system v1.
 *
 * Holds runtime-tweakable design-system values that the user can swap via the
 * future Tweaks panel (Phase 6+) and that are persisted to `localStorage` so
 * the choice survives a reload.
 *
 * Currently exposes:
 *   - `skin`: paper (default, warm) / white (clean neutral) / dark.
 *     A subscriber on this store writes the value to `<html data-skin="…">`
 *     so the CSS skin overrides in tokens.css activate.
 *
 * The `subscribeWithSelector` middleware is intentional: the DOM sync
 * subscription in main.tsx runs ONCE per skin change, not on every state
 * mutation (e.g. setting an unrelated future field wouldn't retrigger).
 *
 * Why a separate store from useUiStore: prefs are user-tunable design
 * choices (think "appearance" panel). useUiStore is per-session app state
 * (collapsed sidebar, open panel). Different audiences, different persist
 * keys, different reset semantics.
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';

export type Skin = 'paper' | 'white' | 'dark';

interface PrefsState {
  skin: Skin;
  setSkin: (skin: Skin) => void;
}

export const usePrefsStore = create<PrefsState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        skin: 'paper',
        setSkin: (skin) => set({ skin }),
      }),
      {
        name: 'maxytest:prefs',
      },
    ),
  ),
);

/**
 * Apply the current skin to <html data-skin="…"> and subscribe to changes.
 * Call once at app boot from main.tsx.
 *
 * Safe to call before React mounts — only touches document.documentElement,
 * which exists at <script type="module"> parse time.
 */
export function initSkin(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Apply persisted-or-default value before the first paint.
  root.setAttribute('data-skin', usePrefsStore.getState().skin);
  // Subscribe to future swaps.
  usePrefsStore.subscribe(
    (state) => state.skin,
    (skin) => {
      root.setAttribute('data-skin', skin);
    },
  );
}
