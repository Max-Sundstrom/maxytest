/**
 * <BlockCard> — Plan 01-03 Task 7 stub (filled in next commit).
 *
 * For Task 5 we render a minimal card so the route compiles; Task 7 adds
 * SaveStateIndicator, ConflictResolutionBanner, and per-type editors.
 */

import { Card } from '@/components/ui/card';
import type { Block } from '@/lib/blocks/types';
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';

export interface BlockCardProps {
  block: Block;
  index: number;
  studyId: string;
  workspaceId: string;
}

export function BlockCard({ block, index }: BlockCardProps) {
  const entry = BLOCK_REGISTRY[block.type];
  const Icon = entry.icon;

  return (
    <Card
      id={`block-card-${block.id}`}
      className="rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <span className="text-caption text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="text-h3 font-semibold text-foreground">
            {entry.label}
          </span>
        </div>
      </div>
      <div className="p-6">
        <p className="text-body text-muted-foreground">
          (Editor wired in Plan 01-03 Task 7.)
        </p>
      </div>
    </Card>
  );
}
