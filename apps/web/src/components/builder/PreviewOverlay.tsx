/**
 * <PreviewOverlay> — Plan 01-03 Task 8 / Plan 01-05 Task 5 / UI-SPEC.md §"Preview" + D-12.
 *
 * Full-screen overlay that mounts the REAL `<RunnerShell mode="preview" />`
 * (Plan 01-05 swapped this from the Plan 01-03 stub). Designer clicks "Preview"
 * in the workspace top bar → this opens → respondent-flavoured rendering
 * against the in-flight draft blocks, no Supabase writes.
 *
 * On open: capture window.scrollY so close can restore it.
 * On close: window.scrollTo(0, previewOverlayScrollY).
 * On reaching thanks block within the runner: `onComplete` closes the overlay
 * so the designer sees the builder again with scroll preserved.
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';
import { RunnerShell } from '@/components/runner/RunnerShell';

export function PreviewOverlay() {
  const open = useUiStore((s) => s.previewOverlayOpen);
  const setOpen = useUiStore((s) => s.setPreviewOverlayOpen);
  const scrollY = useUiStore((s) => s.previewOverlayScrollY);
  const setScrollY = useUiStore((s) => s.setPreviewOverlayScrollY);
  const blocks = useBuilderStore((s) => s.blocks);

  // Capture scroll on open; restore on close.
  useEffect(() => {
    if (open) {
      setScrollY(window.scrollY);
    } else if (scrollY) {
      // Defer to next tick so the layout has settled.
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Test preview"
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-300"
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <p className="text-small text-muted-foreground">
          Preview — your changes aren&rsquo;t visible to respondents yet
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          aria-label="Close preview"
        >
          <X className="mr-2 size-4" />
          Close preview
        </Button>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        <RunnerShell
          mode="preview"
          blocks={blocks}
          onComplete={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
