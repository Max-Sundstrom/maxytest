/**
 * <BlockCard /> — design-system v1 rewrite (2026-05-17).
 *
 * Source: handoff `js/maxitest-builder.jsx` <Card /> + index.html `.mx-card*`
 * rules.
 *
 *   Card: bg-card, 1px border-1, var(--radius), shadow-card, padding 24/28/28.
 *   Header (18px bottom margin):
 *     [num "01."] [28×28 chip with block-type icon] [editable title 500 16/24]
 *     [Добавить логику button — push right, hidden on welcome/thanks]
 *   Body: 16px gap; editor components own their own fields.
 *
 * Save-state state machine, conflict resolution, and editor selection logic
 * are preserved from Phase 1 — only the visual chrome changed.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { useUiStore } from '@/lib/stores/ui';
import { useForceUpdateBlock, useUpdateBlock, ConflictError } from '@/lib/queries/blocks';
import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
import { blockVisualOf } from '@/lib/blocks/visual';
import type { Block } from '@/lib/blocks/types';
import type { BlockContent } from '@/lib/blocks/schemas';
import { ConflictResolutionBanner } from './ConflictResolutionBanner';
import { SaveStateIndicator, type SaveState } from './SaveStateIndicator';
import { WelcomeEditor } from './editors/WelcomeEditor';
import { OpenQuestionEditor } from './editors/OpenQuestionEditor';
import { ThanksEditor } from './editors/ThanksEditor';
import { PrototypeEditor } from './editors/PrototypeEditor';
import { ChoiceEditor } from './editors/ChoiceEditor';
import { ScaleEditor } from './editors/ScaleEditor';
import { NpsEditor } from './editors/NpsEditor';
import { AgreementEditor } from './editors/AgreementEditor';
import { ContextEditor } from './editors/ContextEditor';
import { SeqEditor } from './editors/SeqEditor';
import { UmuxLiteEditor } from './editors/UmuxLiteEditor';
import { NasaTlxEditor } from './editors/NasaTlxEditor';

export interface BlockCardProps {
  block: Block;
  index: number;
  studyId: string;
  workspaceId: string;
}

export function BlockCard({ block, index, studyId, workspaceId }: BlockCardProps) {
  const entry = BLOCK_REGISTRY[block.type];
  const visual = blockVisualOf(block.type);
  const ChipIcon = visual.icon;

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

  // Editor dispatch — single source of truth for "which editor renders for
  // which block.type". Phase 4 adds 5 new survey blocks (choice / scale /
  // nps / agreement / context); the unsupported-type fallback at the end
  // catches future blocks that haven't shipped their editor yet.
  let editor: React.ReactNode;
  switch (block.type) {
    case 'welcome':
      editor = (
        <WelcomeEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'open_question':
      editor = (
        <OpenQuestionEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'prototype':
      editor = (
        <PrototypeEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'choice':
      editor = (
        <ChoiceEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'scale':
      editor = (
        <ScaleEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'nps':
      editor = (
        <NpsEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'agreement':
      editor = (
        <AgreementEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'context':
      editor = (
        <ContextEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'seq':
      editor = (
        <SeqEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'umux_lite':
      editor = (
        <UmuxLiteEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'nasa_tlx':
      editor = (
        <NasaTlxEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    case 'thanks':
      editor = (
        <ThanksEditor
          block={block}
          disabled={isConflict}
          onSave={handleSave}
          serverVersion={block.version}
        />
      );
      break;
    default:
      editor = (
        <p
          style={{
            font: '400 13px/18px var(--font-sans)',
            color: 'var(--text-2)',
            margin: 0,
          }}
        >
          Этот тип блока ещё не реализован — появится в следующих фазах.
        </p>
      );
  }

  const blockTitle =
    (block.content as { title?: string; question?: string }).title?.toString().trim() ||
    (block.content as { title?: string; question?: string }).question?.toString().trim() ||
    entry.label;

  const showLogic = !block.pinned;

  return (
    <section
      id={`block-card-${block.id}`}
      aria-label={`${blockTitle} block`}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--border-1)'}`,
        borderRadius: 'var(--radius)',
        boxShadow: isActive
          ? '0 0 0 2px color-mix(in oklab, var(--color-accent) 18%, transparent), var(--shadow-card)'
          : 'var(--shadow-card)',
        padding: '24px 28px 28px',
        transition:
          'border-color 120ms cubic-bezier(.2,.7,.3,1), box-shadow 120ms cubic-bezier(.2,.7,.3,1)',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            font: '500 16px var(--font-sans)',
            color: 'var(--text-2)',
            minWidth: 22,
          }}
        >
          {String(index + 1).padStart(2, '0')}.
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius)',
            background: visual.chipBg,
            color: visual.chipFg,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <ChipIcon size={14} strokeWidth={1.5} />
        </span>
        <span
          style={{
            flex: 1,
            font: '500 16px/24px var(--font-sans)',
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {blockTitle}
        </span>
        <SaveStateIndicator state={saveState} lastSavedAt={lastSavedAt} onRetry={handleRetry} />
        {showLogic ? (
          <button
            type="button"
            onClick={() => toast.info('Логика блоков появится в Phase 4.')}
            style={{
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              background: 'transparent',
              border: 0,
              borderRadius: 'var(--radius)',
              color: 'var(--text-2)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-chip)';
              e.currentTarget.style.color = 'var(--text-1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-2)';
            }}
          >
            <GitBranch size={14} strokeWidth={1.5} />
            <span>Добавить логику</span>
          </button>
        ) : null}
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isConflict ? (
          <>
            <ConflictResolutionBanner onUseServer={handleUseServer} onUseMine={handleUseMine} />
            <div style={{ pointerEvents: 'none', opacity: 0.6 }}>{editor}</div>
          </>
        ) : (
          editor
        )}
      </div>
    </section>
  );
}
