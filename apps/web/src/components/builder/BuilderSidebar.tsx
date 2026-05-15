/**
 * <BuilderSidebar> — Plan 01-03 Task 6 stub (filled in next commit).
 *
 * For Task 5 we render just enough to compile and pass typecheck. Task 6
 * adds dnd-kit sortable rows, keyboard sensors, hover actions, and the
 * click-to-scroll behaviour.
 */

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/stores/ui';
import { useBuilderStore } from '@/lib/stores/builder';

export interface BuilderSidebarProps {
  studyId: string;
  workspaceId: string;
}

export function BuilderSidebar(_props: BuilderSidebarProps) {
  const setCatalogPanelOpen = useUiStore((s) => s.setCatalogPanelOpen);
  const blocks = useBuilderStore((s) => s.blocks);

  return (
    <aside className="sticky top-14 flex h-[calc(100dvh-56px)] flex-col border-r border-border bg-surface px-4 py-6">
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Blocks">
        {blocks.map((b, i) => (
          <li
            key={b.id}
            className="flex h-touch items-center gap-2 rounded-md px-2 text-small text-muted-foreground"
          >
            <span className="font-mono text-caption">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="truncate">{b.type}</span>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        className="mt-4 w-full justify-start text-accent"
        onClick={() => setCatalogPanelOpen(true)}
      >
        <Plus className="mr-2 size-4" />
        Add block
      </Button>
    </aside>
  );
}
