/**
 * <BlockSidebarRow /> — design-system v1 rewrite (2026-05-17).
 *
 * Source: handoff `js/maxitest-builder.jsx` <Row /> + index.html `.mx-row*`
 * rules.
 *
 * Geometry: 32px tall, `grid-template-columns: 12px 20px 1fr`, padding 0 8px.
 *   col 1: 6-dot grip (3px×3px×6 dots in 2×3, hidden until row hover)
 *   col 2: 20×20 chip with the block-type icon (12px)
 *   col 3: title — 400 13/16, truncated single-line
 *
 * States:
 *   - default: transparent bg, 1px transparent border (preserves layout)
 *   - hover:   bg-card + border-2
 *   - active:  bg-card + border-1 + shadow-card
 *
 * Right-side kebab (lucide MoreVertical) is opacity:0 by default, opacity:1
 * on row hover — keeps the row clean per handoff "grip-dots fade in on hover"
 * interaction note.
 *
 * dnd-kit, pinned-row Pin tooltip, delete-confirm Dialog — preserved from
 * Phase 1. Drag listener is wired into the grip cell so it doesn't conflict
 * with the click-to-scroll on the title.
 */

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Pin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { Block } from '@/lib/blocks/types';

export interface BlockSidebarRowProps {
  block: Block;
  index: number;
  isActive: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSelect: () => void;
}

export function BlockSidebarRow(props: BlockSidebarRowProps) {
  const {
    block,
    index,
    isActive,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onDelete,
    onSelect,
  } = props;

  const entry = BLOCK_REGISTRY[block.type];
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: block.pinned,
  });

  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const blockTitle =
    (block.content as { title?: string; question?: string }).title?.toString().trim() ||
    (block.content as { title?: string; question?: string }).question?.toString().trim() ||
    entry.label;

  const showGrip = !block.pinned && hovered;
  const showKebab = !block.pinned && hovered;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      transition ??
      'background 120ms cubic-bezier(.2,.7,.3,1), border-color 120ms cubic-bezier(.2,.7,.3,1)',
    opacity: isDragging ? 0.5 : 1,
    width: '100%',
    height: 32,
    display: 'grid',
    gridTemplateColumns: '12px 20px 1fr auto',
    columnGap: 8,
    alignItems: 'center',
    padding: '0 8px',
    background: isActive ? 'var(--bg-card)' : hovered ? 'var(--bg-card)' : 'transparent',
    border: `1px solid ${isActive ? 'var(--border-1)' : hovered ? 'var(--border-2)' : 'transparent'}`,
    borderRadius: 'var(--radius)',
    boxShadow: isActive ? 'var(--shadow-card)' : 'none',
    cursor: 'pointer',
    listStyle: 'none',
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Col 1 — grip (or Pin for pinned rows) */}
      {block.pinned ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text-3)',
              }}
            >
              <Pin size={10} strokeWidth={1.5} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">Закреплён — нельзя двигать или удалить</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          aria-label={`Drag to reorder ${entry.label}`}
          {...attributes}
          {...listeners}
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            width: 12,
            height: 12,
            cursor: 'grab',
            display: 'grid',
            gridTemplateColumns: '3px 3px',
            gridTemplateRows: 'repeat(3, 3px)',
            gap: 2,
            opacity: showGrip ? 1 : 0,
            transition: 'opacity 100ms cubic-bezier(.2,.7,.3,1)',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                width: 2.5,
                height: 2.5,
                borderRadius: '50%',
                background: 'var(--text-3)',
              }}
            />
          ))}
        </button>
      )}

      {/* Col 2 — 20×20 chip with block-type icon */}
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: 'var(--radius-sm)',
          background: visual.chipBg,
          color: visual.chipFg,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <ChipIcon size={12} strokeWidth={1.5} />
      </span>

      {/* Col 3 — title (click to scroll-into-view) */}
      <button
        type="button"
        onClick={() => {
          onSelect();
          const el = document.getElementById(`block-card-${block.id}`);
          el?.scrollIntoView({ block: 'start' });
        }}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          textAlign: 'left',
          font: '400 13px/16px var(--font-sans)',
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--text-3)', marginRight: 6 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        {blockTitle}
      </button>

      {/* Col 4 — kebab actions (non-pinned only) */}
      {!block.pinned ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Действия для ${entry.label}`}
            style={{
              width: 20,
              height: 20,
              background: 'transparent',
              border: 0,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-3)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              opacity: showKebab ? 1 : 0,
              transition: 'opacity 100ms cubic-bezier(.2,.7,.3,1)',
            }}
          >
            <MoreVertical size={12} strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
              Переместить вверх
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
              Переместить вниз
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>Дублировать</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
              variant="destructive"
            >
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span style={{ width: 20 }} aria-hidden="true" />
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить этот блок?</DialogTitle>
            <DialogDescription>
              {blockTitle} будет удалён. Можно вернуть через ⌘Z.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Удалить блок
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
