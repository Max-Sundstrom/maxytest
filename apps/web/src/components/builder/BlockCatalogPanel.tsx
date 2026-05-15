/**
 * <BlockCatalogPanel> — Plan 01-03 Task 8 stub (filled in next commit).
 *
 * For Task 5 we render an empty Sheet so the route compiles.
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useUiStore } from '@/lib/stores/ui';

export interface BlockCatalogPanelProps {
  studyId: string;
  workspaceId: string;
}

export function BlockCatalogPanel(_props: BlockCatalogPanelProps) {
  const open = useUiStore((s) => s.catalogPanelOpen);
  const setOpen = useUiStore((s) => s.setCatalogPanelOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[360px] max-w-[90vw] p-0">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>Add block</SheetTitle>
        </SheetHeader>
        <div className="p-6 text-body text-muted-foreground">
          (Catalog rows wired in Plan 01-03 Task 8.)
        </div>
      </SheetContent>
    </Sheet>
  );
}
