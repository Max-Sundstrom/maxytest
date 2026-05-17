/**
 * <BuilderSidebar /> — design-system v1 rewrite (2026-05-17).
 *
 * Source: handoff `js/maxitest-builder.jsx` <Sidebar /> + index.html
 * `.mx-side` rules. Sidebar background is now `var(--bg-page)` (shared with
 * canvas) and only separated by a 1px right border (`--border-2`) — per
 * handoff README §"Updates since v1".
 *
 * Geometry (12/8 padding, 2px gap between rows; each row exactly 32px tall
 * with `12px 20px 1fr` grid + 0/8 padding) is enforced inside <BlockSidebarRow>.
 *
 * dnd-kit semantics unchanged from Phase 1: PointerSensor(delay:150,
 * tolerance:5), KeyboardSensor (Space+Arrows), restrictTo* modifiers, ARIA
 * announcements. Pinned welcome/thanks are non-sortable per D-11.
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
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
import { useDeleteBlock, useDuplicateBlock, useReorderBlocks } from '@/lib/queries/blocks';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';
import { BlockSidebarRow } from './BlockSidebarRow';

export interface BuilderSidebarProps {
  studyId: string;
  workspaceId: string | null;
}

export function BuilderSidebar({ studyId, workspaceId }: BuilderSidebarProps) {
  const blocks = useBuilderStore((s) => s.blocks);
  const reorderBlocksLocal = useBuilderStore((s) => s.reorderBlocks);
  const selectedBlockId = useUiStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const setCatalogPanelOpen = useUiStore((s) => s.setCatalogPanelOpen);

  const reorderMutation = useReorderBlocks(studyId, workspaceId ?? '');
  const deleteMutation = useDeleteBlock(studyId, workspaceId ?? '');
  const duplicateMutation = useDuplicateBlock(studyId, workspaceId ?? '');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const unpinned = blocks.filter((b) => !b.pinned);
  const unpinnedIds = unpinned.map((b) => b.id);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromUnpinnedIndex = unpinnedIds.indexOf(String(active.id));
    const toUnpinnedIndex = unpinnedIds.indexOf(String(over.id));
    if (fromUnpinnedIndex < 0 || toUnpinnedIndex < 0) return;

    const newUnpinnedIds = arrayMove(unpinnedIds, fromUnpinnedIndex, toUnpinnedIndex);
    const oldFullIndex = blocks.findIndex((b) => b.id === active.id);
    const newFullIndex = blocks.findIndex((b) => b.id === newUnpinnedIds[toUnpinnedIndex]);
    if (oldFullIndex >= 0 && newFullIndex >= 0) {
      reorderBlocksLocal(oldFullIndex, newFullIndex);
    }
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
    <aside
      style={{
        // The parent grid in BuilderShell already height-constrains the
        // sidebar to "viewport minus topbar" via flex:1 + overflow:hidden,
        // so we DON'T need position:sticky or a calc() height. We just
        // fill the grid cell and own the internal scroll.
        background: 'var(--bg-page)',
        borderRight: '1px solid var(--border-2)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
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
        <ul
          aria-label="Test blocks"
          style={{
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflow: 'auto',
            flex: 1,
            margin: 0,
            listStyle: 'none',
          }}
        >
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

      {/* "+ Добавить блок" bottom button (32px, handoff .mx-add) */}
      <button
        type="button"
        onClick={() => setCatalogPanelOpen(true)}
        style={{
          marginTop: 6,
          marginBottom: 12,
          marginLeft: 16,
          height: 32,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 8px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: 'var(--text-2)',
          alignSelf: 'flex-start',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-1)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-1)',
          }}
        >
          <Plus size={12} strokeWidth={1.5} />
        </span>
        <span style={{ font: '400 13px/16px var(--font-sans)' }}>Добавить блок</span>
      </button>
    </aside>
  );
}
