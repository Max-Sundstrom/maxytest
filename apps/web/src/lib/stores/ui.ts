/**
 * UI-state store — Plan 01-03 Task 3.
 *
 * Zustand (NO zundo) for ephemeral UI state that:
 *   - is not a URL parameter (TanStack Router would own that)
 *   - is not server data (TanStack Query would own that)
 *   - is not local form state (react-hook-form would own that)
 *
 * Only `sidebarCollapsed` is persisted (UI-SPEC.md D-06 collapsibility
 * survives a reload). All other state resets on full navigation.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** D-06: sidebar shrinks to icon-only at viewports <1200px. Persisted. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;

  /** BUILDER-06: catalog panel slides in from right. */
  catalogPanelOpen: boolean;
  setCatalogPanelOpen: (value: boolean) => void;

  /** D-12: full-screen preview overlay. */
  previewOverlayOpen: boolean;
  setPreviewOverlayOpen: (value: boolean) => void;

  /** Scroll-Y of the builder main column captured when preview opens (D-12). */
  previewOverlayScrollY: number;
  setPreviewOverlayScrollY: (value: number) => void;

  /** Active block in the builder (BUILDER-10 click-to-scroll). */
  selectedBlockId: string | null;
  setSelectedBlockId: (value: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

      catalogPanelOpen: false,
      setCatalogPanelOpen: (value) => set({ catalogPanelOpen: value }),

      previewOverlayOpen: false,
      setPreviewOverlayOpen: (value) => set({ previewOverlayOpen: value }),

      previewOverlayScrollY: 0,
      setPreviewOverlayScrollY: (value) => set({ previewOverlayScrollY: value }),

      selectedBlockId: null,
      setSelectedBlockId: (value) => set({ selectedBlockId: value }),
    }),
    {
      name: 'maxytest:ui',
      // Persist only sidebarCollapsed; catalog/preview/selected are ephemeral.
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
