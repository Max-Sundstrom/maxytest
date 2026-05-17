/**
 * <BuilderShell> — design-system v1 rewrite (2026-05-17).
 *
 * Source: handoff `js/maxitest-builder.jsx` page composition + index.html
 * `.mx-bld` / `.mx-side` / `.mx-canvas` rules.
 *
 * Layout:
 *   - BuilderTopbar (2-row, owns its own background).
 *   - Grid `288px 1fr`: BuilderSidebar (32px block rows + add button) on left,
 *     canvas (24/24/64 padding, 16px gap) on right with BlockCards stacked.
 *   - Floating 44×44 help FAB bottom-right (over canvas).
 *
 * Old WorkspaceTopBar is gone — this shell now owns its top chrome.
 */

import { useEffect } from 'react';
import { HelpCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useBlocks } from '@/lib/queries/blocks';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';
import { useBlockSavesSubscription } from '@/lib/broadcast/block-saves';
import { useBuilderHotkeys } from '@/lib/undo/hotkeys';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';
import { useMediaQuery } from '@/lib/utils';
import { BuilderTopbar } from './BuilderTopbar';
import { BuilderSidebar } from './BuilderSidebar';
import { BlockCard } from './BlockCard';
import { BlockCatalogPanel } from './BlockCatalogPanel';
import { MobileBuilderBlocked } from './MobileBuilderBlocked';
import { PreviewOverlay } from './PreviewOverlay';

export interface BuilderShellProps {
  studyId: string;
}

export function BuilderShell({ studyId }: BuilderShellProps) {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const { workspace } = useCurrentWorkspace();
  const blocksQuery = useBlocks(studyId);
  const setBlocks = useBuilderStore((s) => s.setBlocks);
  const setStudyId = useBuilderStore((s) => s.setStudyId);
  const blocks = useBuilderStore((s) => s.blocks);
  const setCatalogPanelOpen = useUiStore((s) => s.setCatalogPanelOpen);

  // Hydrate the store from server data whenever it lands or refetches.
  useEffect(() => {
    setStudyId(studyId);
    if (blocksQuery.data) {
      setBlocks(blocksQuery.data);
    }
  }, [studyId, blocksQuery.data, setBlocks, setStudyId]);

  useBlockSavesSubscription(workspace?.id, studyId);
  useBuilderHotkeys({ studyId });

  if (isMobile) {
    return <MobileBuilderBlocked />;
  }

  return (
    <div
      style={{
        // height (not minHeight) — locks the shell to viewport so the topbar
        // never scrolls off. The inner main + sidebar own their own scroll.
        height: '100dvh',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <BuilderTopbar studyId={studyId} workspaceId={workspace?.id ?? null} active="test" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '288px 1fr',
          // flex:1 + min-height:0 is the canonical "constrain to remaining
          // height + let children scroll" pattern. min-height:0 is critical:
          // grid items default to min-content, which would force the grid to
          // grow beyond its parent's available space.
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <BuilderSidebar studyId={studyId} workspaceId={workspace?.id ?? null} />

        <main
          data-testid="builder-main"
          style={{
            padding: '24px 24px 64px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minWidth: 0,
            position: 'relative',
          }}
        >
          {!workspace || blocksQuery.isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              {blocks.map((block, index) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={index}
                  studyId={studyId}
                  workspaceId={workspace.id}
                />
              ))}
              <button
                type="button"
                onClick={() => setCatalogPanelOpen(true)}
                style={{
                  width: '100%',
                  height: 48,
                  background: 'transparent',
                  border: '1.5px dashed var(--border-strong)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-2)',
                  font: '400 14px var(--font-sans)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition:
                    'border-color 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.color = 'var(--color-accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.color = 'var(--text-2)';
                }}
              >
                <Plus size={16} strokeWidth={1.5} />
                <span>Добавить блок</span>
              </button>
            </>
          )}
        </main>
      </div>

      {/* Floating help FAB (handoff §"Builder" / .mx-fab) */}
      <button
        type="button"
        aria-label="Помощь"
        onClick={() => toast.info('Документация по конструктору — Phase 6.')}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 72, // sit above SkinPicker (16+chip ~32 = 48; 72 leaves comfortable gap)
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--ink-0)',
          color: 'var(--bg-page)',
          border: 0,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-md)',
          zIndex: 30,
        }}
      >
        <HelpCircle size={18} strokeWidth={1.5} />
      </button>

      <BlockCatalogPanel studyId={studyId} workspaceId={workspace?.id ?? ''} />
      <PreviewOverlay />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        height: 200,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        opacity: 0.6,
      }}
    />
  );
}
