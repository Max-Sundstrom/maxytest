/**
 * <BlockCard> — Plan 01-03 Task 7 / UI-SPEC.md §"<BlockCard>".
 *
 * Header: block number + type icon + type label + <SaveStateIndicator>.
 * Body: per-type editor inside a wrapper that switches to
 *   <ConflictResolutionBanner> when saveState === 'conflict'.
 *
 * Save-state state machine derived from the per-card useUpdateBlock mutation:
 *   - mount       → 'idle'
 *   - user edit   → 'dirty' (driven by RHF isDirty inside the editor)
 *   - debounced .mutate fired → 'saving' (mutation.isPending)
 *   - mutation success        → 'saved' + lastSavedAt = now
 *   - mutation error          →
 *       - ConflictError → 'conflict' (banner)
 *       - other         → 'error'
 *
 * Conflict resolution:
 *   - Use server  → invalidateQueries(['blocks', studyId]) → refetch → reset
 *                   the local editor's defaultValues via the editor's effect.
 *   - Use mine    → useForceUpdateBlock → bumps version + broadcasts → 'saved'.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/lib/stores/ui';
import { useForceUpdateBlock, useUpdateBlock, ConflictError } from '@/lib/queries/blocks';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
import type { Block } from '@/lib/blocks/types';
import type { BlockContent } from '@/lib/blocks/schemas';
import { ConflictResolutionBanner } from './ConflictResolutionBanner';
import { SaveStateIndicator, type SaveState } from './SaveStateIndicator';
import { WelcomeEditor } from './editors/WelcomeEditor';
import { OpenQuestionEditor } from './editors/OpenQuestionEditor';
import { ThanksEditor } from './editors/ThanksEditor';

export interface BlockCardProps {
  block: Block;
  index: number;
  studyId: string;
  workspaceId: string;
}

export function BlockCard({ block, index, studyId, workspaceId }: BlockCardProps) {
  const entry = BLOCK_REGISTRY[block.type];
  const Icon = entry.icon;

  const updateMutation = useUpdateBlock(studyId, workspaceId);
  const forceMutation = useForceUpdateBlock(studyId, workspaceId);
  const qc = useQueryClient();
  const selectedBlockId = useUiStore((s) => s.selectedBlockId);
  const isActive = selectedBlockId === block.id;

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastInputRef = useRef<{
    content: BlockContent;
    idempotencyKey: string;
  } | null>(null);

  const isConflict = saveState === 'conflict';

  // Watch the mutation lifecycle so the indicator stays in sync. The mutation
  // is per-component (each BlockCard owns one `useUpdateBlock`).
  useEffect(() => {
    if (updateMutation.isPending) {
      setSaveState('saving');
    } else if (updateMutation.isError) {
      const err = updateMutation.error;
      setSaveState(err instanceof ConflictError ? 'conflict' : 'error');
    } else if (updateMutation.isSuccess) {
      setSaveState('saved');
      setLastSavedAt(new Date());
    }
  }, [
    updateMutation.isPending,
    updateMutation.isError,
    updateMutation.isSuccess,
    updateMutation.error,
  ]);

  const handleSave = (input: {
    content: BlockContent;
    version: number;
    idempotencyKey: string;
  }) => {
    lastInputRef.current = {
      content: input.content,
      idempotencyKey: input.idempotencyKey,
    };
    setSaveState('saving');
    updateMutation.mutate({
      blockId: block.id,
      content: input.content,
      version: input.version,
      idempotencyKey: input.idempotencyKey,
    });
  };

  const handleRetry = () => {
    if (!lastInputRef.current) return;
    setSaveState('saving');
    updateMutation.mutate({
      blockId: block.id,
      content: lastInputRef.current.content,
      version: block.version,
      idempotencyKey: lastInputRef.current.idempotencyKey,
    });
  };

  const handleUseServer = () => {
    // Reset the mutation state then refetch so the editor reloads from the
    // freshly-fetched server content.
    updateMutation.reset();
    qc.invalidateQueries({ queryKey: ['blocks', studyId] });
    setSaveState('idle');
  };

  const handleUseMine = () => {
    if (!lastInputRef.current) return;
    forceMutation.mutate(
      {
        blockId: block.id,
        content: lastInputRef.current.content,
      },
      {
        onSuccess: () => {
          updateMutation.reset();
          setSaveState('saved');
          setLastSavedAt(new Date());
        },
        onError: () => {
          setSaveState('error');
        },
      },
    );
  };

  const editor =
    block.type === 'welcome' ? (
      <WelcomeEditor
        block={block}
        disabled={isConflict}
        onSave={handleSave}
        serverVersion={block.version}
      />
    ) : block.type === 'open_question' ? (
      <OpenQuestionEditor
        block={block}
        disabled={isConflict}
        onSave={handleSave}
        serverVersion={block.version}
      />
    ) : (
      <ThanksEditor
        block={block}
        disabled={isConflict}
        onSave={handleSave}
        serverVersion={block.version}
      />
    );

  return (
    <Card
      id={`block-card-${block.id}`}
      className={cn(
        'rounded-lg border border-border bg-card shadow-sm transition-shadow duration-200',
        isActive && 'ring-1 ring-accent ring-offset-2',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <span className="text-caption font-mono text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="text-h3 font-semibold text-foreground">
            {entry.label}
          </span>
        </div>
        <SaveStateIndicator
          state={saveState}
          lastSavedAt={lastSavedAt}
          onRetry={handleRetry}
        />
      </div>
      <div className="p-6">
        {isConflict ? (
          <div className="flex flex-col gap-4">
            <ConflictResolutionBanner
              onUseServer={handleUseServer}
              onUseMine={handleUseMine}
            />
            <div className="pointer-events-none opacity-60">{editor}</div>
          </div>
        ) : (
          editor
        )}
      </div>
    </Card>
  );
}
