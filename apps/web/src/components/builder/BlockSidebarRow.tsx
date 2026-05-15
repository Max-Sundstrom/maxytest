/**
 * <BlockSidebarRow> — Plan 01-03 Task 6 / UI-SPEC.md §"Component Contracts".
 *
 * dnd-kit `useSortable` (disabled for pinned welcome/thanks per D-11).
 * Hover-revealed DropdownMenu with Move up / Move down / Duplicate / Delete
 * (hidden for pinned rows). Click row → smooth-scroll to matching `<BlockCard>`
 * via `scrollIntoView({behavior:'smooth', block:'start'})` (BUILDER-10).
 */

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical, Pin } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
import type { Block } from '@/lib/blocks/types';

export interface BlockSidebarRowProps {
  block: Block;
  index: number;
  /** Whether this row is currently selected (active in the editor). */
  isActive: boolean;
  /** Move up/down callbacks (no-op for boundary positions). */
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
  const Icon = entry.icon;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled: block.pinned });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  const blockName =
    (block.content as { title?: string; question?: string }).title ??
    (block.content as { title?: string; question?: string }).question ??
    entry.label;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-touch items-center gap-2 rounded-md px-2 transition-colors duration-100',
        'hover:bg-slate-100',
        isActive && 'bg-slate-100 ring-1 ring-accent ring-offset-1',
      )}
    >
      {/* Left: drag handle (Pin icon for pinned rows). */}
      {block.pinned ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-4 items-center justify-center text-muted-foreground">
              <Pin aria-hidden="true" className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            This block can&rsquo;t be moved or deleted
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          aria-label={`Drag to reorder ${entry.label}`}
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      {/* Middle: block icon + name (click to scroll & select) */}
      <button
        type="button"
        onClick={() => {
          onSelect();
          // BUILDER-10: smooth-scroll the matching card into view.
          const el = document.getElementById(`block-card-${block.id}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="truncate text-small font-medium text-foreground">
          {String(index + 1).padStart(2, '0')} · {blockName}
        </span>
      </button>

      {/* Right: hover-revealed action menu — hidden for pinned rows. */}
      {!block.pinned && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${entry.label}`}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity duration-100 hover:bg-slate-200 group-hover:opacity-100 focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Delete confirmation dialog (UI-SPEC copy lock). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this block?</DialogTitle>
            <DialogDescription>
              {blockName} will be removed. You can undo with ⌘Z.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Delete block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
