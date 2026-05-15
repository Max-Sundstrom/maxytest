/**
 * <BuilderSidebar> — Plan 01-03 Task 6 / UI-SPEC.md §"Layout Contracts → Sidebar".
 *
 * dnd-kit-powered sortable list with:
 *   - PointerSensor(delay: 150, tolerance: 5) — touch-friendly per Pitfall 5
 *   - KeyboardSensor — Space to grab, Arrow keys to move, Space to drop
 *   - restrictToVerticalAxis + restrictToParentElement modifiers
 *   - ARIA Announcements for screen-reader users
 *
 * Pinned welcome (top) and thanks (bottom) are non-sortable per D-11; only the
 * unpinned blocks participate in the SortableContext. The reorder mutation
 * propagates to the server via `useReorderBlocks` (uses the `reorder_blocks`
 * RPC for atomic position updates).
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
import { useDeleteBlock, useDuplicateBlock, useReorderBlocks } from '@/lib/queries/blocks';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';
import { BlockSidebarRow } from './BlockSidebarRow';

export interface BuilderSidebarProps {
  studyId: string;
  workspaceId: string;
}

export function BuilderSidebar({ studyId, workspaceId }: BuilderSidebarProps) {
  const blocks = useBuilderStore((s) => s.blocks);
  const reorderBlocksLocal = useBuilderStore((s) => s.reorderBlocks);
  const selectedBlockId = useUiStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const setCatalogPanelOpen = useUiStore((s) => s.setCatalogPanelOpen);

  const reorderMutation = useReorderBlocks(studyId, workspaceId);
  const deleteMutation = useDeleteBlock(studyId, workspaceId);
  const duplicateMutation = useDuplicateBlock(studyId, workspaceId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Compute unpinned subset + its dnd-kit `items` array.
  const unpinned = blocks.filter((b) => !b.pinned);
  const unpinnedIds = unpinned.map((b) => b.id);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromUnpinnedIndex = unpinnedIds.indexOf(String(active.id));
    const toUnpinnedIndex = unpinnedIds.indexOf(String(over.id));
    if (fromUnpinnedIndex < 0 || toUnpinnedIndex < 0) return;

    // Compute the new full ordering: pinned welcome stays at 0, unpinned
    // blocks reorder in their subset, pinned thanks stays at last position.
    const newUnpinnedIds = arrayMove(unpinnedIds, fromUnpinnedIndex, toUnpinnedIndex);

    // Local store reorder (synchronous; powers the UI immediately + zundo history).
    // Translate the unpinned indices back to full-list indices.
    const oldFullIndex = blocks.findIndex((b) => b.id === active.id);
    const newFullIndex = blocks.findIndex((b) => b.id === newUnpinnedIds[toUnpinnedIndex]);
    if (oldFullIndex >= 0 && newFullIndex >= 0) {
      reorderBlocksLocal(oldFullIndex, newFullIndex);
    }

    // Server reorder via RPC.
    reorderMutation.mutate({ orderedBlockIds: newUnpinnedIds });
  };

  const handleMoveUp = (blockId: string) => {
    const idx = unpinnedIds.indexOf(blockId);
    if (idx <= 0) return;
    const newOrder = arrayMove(unpinnedIds, idx, idx - 1);
    const fullFrom = blocks.findIndex((b) => b.id === blockId);
    const fullTo = blocks.findIndex((b) => b.id === newOrder[idx - 1]);
    if (fullFrom >= 0 && fullTo >= 0) reorderBlocksLocal(fullFrom, fullTo);
    reorderMutation.mutate({ orderedBlockIds: newOrder });
  };

  const handleMoveDown = (blockId: string) => {
    const idx = unpinnedIds.indexOf(blockId);
    if (idx < 0 || idx >= unpinnedIds.length - 1) return;
    const newOrder = arrayMove(unpinnedIds, idx, idx + 1);
    const fullFrom = blocks.findIndex((b) => b.id === blockId);
    const fullTo = blocks.findIndex((b) => b.id === newOrder[idx + 1]);
    if (fullFrom >= 0 && fullTo >= 0) reorderBlocksLocal(fullFrom, fullTo);
    reorderMutation.mutate({ orderedBlockIds: newOrder });
  };

  return (
    <aside className="sticky top-14 flex h-[calc(100dvh-56px)] flex-col border-r border-border bg-surface px-4 py-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => {
              const b = blocks.find((x) => x.id === active.id);
              return `Picked up ${BLOCK_REGISTRY[b?.type ?? 'open_question'].label}.`;
            },
            onDragOver: ({ active, over }) => {
              if (!over) return undefined;
              const fromIdx = unpinnedIds.indexOf(String(active.id)) + 1;
              const toIdx = unpinnedIds.indexOf(String(over.id)) + 1;
              if (fromIdx === 0 || toIdx === 0) return undefined;
              return `Moving from position ${fromIdx} to ${toIdx}.`;
            },
            onDragEnd: ({ active, over }) => {
              if (!over) return `Dropped ${active.id} back at its original position.`;
              const newIdx = unpinnedIds.indexOf(String(over.id)) + 1;
              return `Dropped at position ${newIdx}.`;
            },
            onDragCancel: () => 'Drag cancelled.',
          },
        }}
      >
        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Test blocks">
          {/* Pinned welcome (top, non-sortable) */}
          {blocks
            .filter((b) => b.pinned && b.type === 'welcome')
            .map((b) => (
              <BlockSidebarRow
                key={b.id}
                block={b}
                index={blocks.indexOf(b)}
                isActive={selectedBlockId === b.id}
                canMoveUp={false}
                canMoveDown={false}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
                onDuplicate={() => {}}
                onDelete={() => {}}
                onSelect={() => setSelectedBlockId(b.id)}
              />
            ))}

          <SortableContext items={unpinnedIds} strategy={verticalListSortingStrategy}>
            {unpinned.map((b) => {
              const fullIdx = blocks.findIndex((x) => x.id === b.id);
              const subIdx = unpinnedIds.indexOf(b.id);
              return (
                <BlockSidebarRow
                  key={b.id}
                  block={b}
                  index={fullIdx}
                  isActive={selectedBlockId === b.id}
                  canMoveUp={subIdx > 0}
                  canMoveDown={subIdx < unpinnedIds.length - 1}
                  onMoveUp={() => handleMoveUp(b.id)}
                  onMoveDown={() => handleMoveDown(b.id)}
                  onDuplicate={() => duplicateMutation.mutate({ blockId: b.id })}
                  onDelete={() => deleteMutation.mutate({ blockId: b.id })}
                  onSelect={() => setSelectedBlockId(b.id)}
                />
              );
            })}
          </SortableContext>

          {/* Pinned thanks (bottom, non-sortable) */}
          {blocks
            .filter((b) => b.pinned && b.type === 'thanks')
            .map((b) => (
              <BlockSidebarRow
                key={b.id}
                block={b}
                index={blocks.indexOf(b)}
                isActive={selectedBlockId === b.id}
                canMoveUp={false}
                canMoveDown={false}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
                onDuplicate={() => {}}
                onDelete={() => {}}
                onSelect={() => setSelectedBlockId(b.id)}
              />
            ))}
        </ul>
      </DndContext>

      <Button
        variant="ghost"
        className="mt-4 w-full justify-start text-accent hover:bg-slate-100"
        onClick={() => setCatalogPanelOpen(true)}
      >
        <Plus className="mr-2 size-4" />
        Add block
      </Button>
    </aside>
  );
}
