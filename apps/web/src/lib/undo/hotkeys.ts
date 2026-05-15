/**
 * Builder undo/redo hotkeys — Plan 01-03 Task 3.
 *
 * D-17 contract:
 *   - Cmd+Z (Mac) / Ctrl+Z (Windows/Linux) → temporal.undo()
 *   - Cmd+Shift+Z / Ctrl+Shift+Z          → temporal.redo()
 *   - Disabled (no-op) while any block is in `conflict` state
 *     (`useHasAnyConflict(studyId)` returns true).
 *   - Skipped when focus is on an INPUT/TEXTAREA so the browser's native
 *     text-level undo takes precedence (autosave debounce ensures the
 *     store catches the post-debounce snapshot).
 */

import { useEffect } from 'react';
import { useHasAnyConflict } from '@/lib/queries/blocks';
import { useBuilderStore } from '@/lib/stores/builder';

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  return ua === 'macOS' || /Mac/i.test(navigator.platform);
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export interface UseBuilderHotkeysOptions {
  /**
   * When `useHasAnyConflict` returns true for the active study, Cmd+Z and
   * Cmd+Shift+Z become no-ops (D-17).
   */
  studyId: string | null;
}

export function useBuilderHotkeys(options: UseBuilderHotkeysOptions): {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const hasConflict = useHasAnyConflict(options.studyId);

  const undo = () => {
    if (hasConflict) return;
    useBuilderStore.temporal.getState().undo();
  };
  const redo = () => {
    if (hasConflict) return;
    useBuilderStore.temporal.getState().redo();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key !== 'z' && e.key !== 'Z') return;

      // Don't fight the browser's native text-undo while a field is focused.
      if (isTextField(document.activeElement)) return;

      e.preventDefault();
      if (hasConflict) return;
      if (e.shiftKey) {
        useBuilderStore.temporal.getState().redo();
      } else {
        useBuilderStore.temporal.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasConflict]);

  const past = useBuilderStore.temporal.getState().pastStates;
  const future = useBuilderStore.temporal.getState().futureStates;

  return {
    undo,
    redo,
    canUndo: past.length > 0 && !hasConflict,
    canRedo: future.length > 0 && !hasConflict,
  };
}
