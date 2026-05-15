/**
 * <PreviewOverlay> — Plan 01-03 Task 8 stub (filled in next commit).
 */

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useUiStore } from '@/lib/stores/ui';

export function PreviewOverlay() {
  const open = useUiStore((s) => s.previewOverlayOpen);
  const setOpen = useUiStore((s) => s.setPreviewOverlayOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="fixed inset-0 max-w-none w-screen h-screen rounded-none p-0">
        <div className="p-8 text-body text-muted-foreground">
          (Preview overlay wired in Plan 01-03 Task 8.)
        </div>
      </DialogContent>
    </Dialog>
  );
}
