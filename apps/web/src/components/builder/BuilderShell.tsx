/**
 * <BuilderShell> — Plan 01-03 Task 5 / UI-SPEC.md §"Layout Contracts → Designer Builder".
 *
 * Behaviour:
 *   - Gate: viewports `<1024px` render `<MobileBuilderBlocked>` instead of the builder.
 *   - Hydrate `useBuilderStore` from `useBlocks(studyId)` data.
 *   - Subscribe to BroadcastChannel `block-saves-${workspaceId}` for cross-tab sync (D-15).
 *   - Activate `useBuilderHotkeys({ studyId })` so Cmd+Z is live (D-17).
 *
 * Layout: workspace top bar (rendered by the parent `_app.tsx`) +
 *   `grid grid-cols-[280px_1fr]` with sidebar on left and main card stack on right.
 */

import { useEffect } from 'react';
import { useBlocks } from '@/lib/queries/blocks';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';
import { useBlockSavesSubscription } from '@/lib/broadcast/block-saves';
import { useBuilderHotkeys } from '@/lib/undo/hotkeys';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';
import { useMediaQuery } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { BuilderSidebar } from './BuilderSidebar';
import { BlockCard } from './BlockCard';
import { BlockCatalogPanel } from './BlockCatalogPanel';
import { MobileBuilderBlocked } from './MobileBuilderBlocked';
import { PreviewOverlay } from './PreviewOverlay';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

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

  // Cross-tab BroadcastChannel sync.
  useBlockSavesSubscription(workspace?.id, studyId);

  // Cmd+Z / Cmd+Shift+Z (skipped in inputs; gated by useHasAnyConflict).
  useBuilderHotkeys({ studyId });

  if (isMobile) {
    return <MobileBuilderBlocked />;
  }

  if (!workspace || blocksQuery.isLoading) {
    return (
      <div className="grid grid-cols-[280px_1fr] min-h-[calc(100dvh-56px)]">
        <aside className="border-r border-border bg-surface px-4 py-6">
          <Skeleton className="mb-2 h-11 w-full" />
          <Skeleton className="mb-2 h-11 w-full" />
          <Skeleton className="mb-2 h-11 w-full" />
        </aside>
        <main className="px-8 py-8">
          <div className="mx-auto flex max-w-[800px] flex-col gap-6">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[280px_1fr] min-h-[calc(100dvh-56px)]">
      <BuilderSidebar studyId={studyId} workspaceId={workspace.id} />
      <main className="overflow-y-auto px-8 py-8" data-testid="builder-main">
        <div className="mx-auto flex max-w-[800px] flex-col gap-6">
          {blocks.map((block, index) => (
            <BlockCard
              key={block.id}
              block={block}
              index={index}
              studyId={studyId}
              workspaceId={workspace.id}
            />
          ))}
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCatalogPanelOpen(true)}
            >
              <Plus className="mr-2 size-4" />
              Add another block
            </Button>
          </div>
        </div>
      </main>

      <BlockCatalogPanel studyId={studyId} workspaceId={workspace.id} />
      <PreviewOverlay />
    </div>
  );
}
