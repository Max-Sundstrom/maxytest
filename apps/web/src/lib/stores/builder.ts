/**
 * Builder store — Zustand + zundo `temporal()` middleware (RESEARCH Pattern 5).
 *
 * Plan 01-03 Task 3 contract:
 *   - `blocks` mirrors the server's authoritative block list. The DataLayer
 *     (TanStack Query) is still the source of truth for persistence; this
 *     store exists ONLY to power undo/redo (zundo) and the dnd-kit drag
 *     callbacks that want a synchronous reorder before the mutation lands.
 *   - History scope: only `blocks`. `selectedBlockId` is excluded via
 *     `partialize` so clicking a sidebar row doesn't bloat the undo stack.
 *   - History depth: 50 (D-17).
 *   - `setBlocks(blocks)` (hydration from server) clears history AFTER set
 *     so a fresh load isn't an undoable "edit".
 *
 * Consumers:
 *   - `<BuilderShell>` calls `setBlocks(blocks)` from `useBlocks` data.
 *   - `<BuilderSidebar>` `onDragEnd` calls `reorderBlocks(from, to)` AND
 *     fires `useReorderBlocks.mutate(...)` so the server is updated in lockstep.
 *   - Per-type editors call `updateBlockContent(id, content)` AFTER the
 *     debounced server save succeeds so undo state matches what's persisted.
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import { arrayMove } from '@dnd-kit/sortable';
import type { Block } from '@/lib/blocks/types';
import type { BlockContent } from '@/lib/blocks/schemas';

interface BuilderState {
  studyId: string | null;
  blocks: Block[];

  /** Hydrate from server. Clears the temporal history AFTER set. */
  setBlocks: (blocks: Block[]) => void;

  /** Edit a block's content; debounced autosave in the editor pushes this. */
  updateBlockContent: (id: string, content: BlockContent) => void;

  /** Reorder via dnd-kit `arrayMove`; positions are recomputed. */
  reorderBlocks: (fromIndex: number, toIndex: number) => void;

  /** Add at position; subsequent positions shift up by 1. */
  addBlock: (block: Block, position: number) => void;

  /** Delete by id; subsequent positions shift down. */
  deleteBlock: (id: string) => void;

  /** Duplicate; clone goes immediately after the source. */
  duplicateBlock: (id: string) => void;

  /** Set active study (called when route mounts). */
  setStudyId: (id: string | null) => void;
}

function recalcPositions(blocks: Block[]): Block[] {
  return blocks.map((b, i) => (b.position === i ? b : { ...b, position: i }));
}

export const useBuilderStore = create<BuilderState>()(
  temporal(
    (set) => ({
      studyId: null,
      blocks: [],

      setStudyId: (id) => set({ studyId: id }),

      setBlocks: (blocks) => {
        set({ blocks });
        // Hydration is NOT an undoable edit. Clear history after set so the
        // user can't "undo to empty state".
        useBuilderStore.temporal.getState().clear();
      },

      updateBlockContent: (id, content) =>
        set((state) => ({
          blocks: state.blocks.map((b) =>
            b.id === id ? { ...b, content } : b,
          ),
        })),

      reorderBlocks: (fromIndex, toIndex) =>
        set((state) => {
          const next = arrayMove(state.blocks, fromIndex, toIndex);
          return { blocks: recalcPositions(next) };
        }),

      addBlock: (block, position) =>
        set((state) => {
          const next = [...state.blocks];
          next.splice(position, 0, block);
          return { blocks: recalcPositions(next) };
        }),

      deleteBlock: (id) =>
        set((state) => {
          const next = state.blocks.filter((b) => b.id !== id);
          return { blocks: recalcPositions(next) };
        }),

      duplicateBlock: (id) =>
        set((state) => {
          const idx = state.blocks.findIndex((b) => b.id === id);
          if (idx < 0) return state;
          const src = state.blocks[idx];
          if (!src) return state;
          // The cloned id is a placeholder until the server mutation returns
          // the real id; the builder hydrates back from `useBlocks` on success.
          const clone: Block = {
            ...src,
            id: `${src.id}-dup-${Date.now()}`,
            pinned: false,
          };
          const next = [...state.blocks];
          next.splice(idx + 1, 0, clone);
          return { blocks: recalcPositions(next) };
        }),
    }),
    {
      limit: 50,
      partialize: (state) => ({ blocks: state.blocks }),
      // Deep-equal blocks array to coalesce rapid keystrokes into one history
      // entry. zundo's default `Object.is` would push every character, but the
      // 700ms autosave debounce already coalesces — keep this simple and
      // rely on the debounce.
    },
  ),
);

// ----------------------------------------------------------------------------
// Selectors (stable references so consumers can avoid re-renders)
// ----------------------------------------------------------------------------

export const selectBlocks = (s: BuilderState) => s.blocks;
export const selectStudyId = (s: BuilderState) => s.studyId;
export const selectBlockById = (id: string | null | undefined) =>
  (s: BuilderState) =>
    id ? s.blocks.find((b) => b.id === id) ?? null : null;
