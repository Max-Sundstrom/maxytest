/**
 * <PreviewOverlay> — Plan 01-03 Task 8 / UI-SPEC.md §"Preview" + D-12.
 *
 * Full-screen overlay that, in Plan 01-05, will mount the real `<RunnerShell
 * mode="preview" />`. Plan 01-03 ships a STUB so the Preview button is
 * functional end-to-end during builder verification.
 *
 * Contract for Plan 01-05:
 *   - `<RunnerShell mode="preview" blocks={Block[]} initialBlockIndex={0}
 *      onComplete={() => setPreviewOverlayOpen(false)} />`
 *   - When Plan 01-05 ships the real component, swap the stub block below
 *     with the import + invocation — no contract change.
 *
 * On open: capture window.scrollY so close can restore it.
 * On close: window.scrollTo(0, previewOverlayScrollY).
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBuilderStore } from '@/lib/stores/builder';
import { useUiStore } from '@/lib/stores/ui';

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

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <RunnerShellStub blocks={blocks} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stub: Plan 01-05 will replace this with the real <RunnerShell mode="preview">.
// ----------------------------------------------------------------------------

interface RunnerShellStubProps {
  blocks: { id: string; type: string }[];
}

function RunnerShellStub({ blocks }: RunnerShellStubProps) {
  return (
    <div className="mx-auto max-w-[480px] rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-2 text-h2 font-semibold">Preview placeholder</h2>
      <p className="mb-4 text-body text-muted-foreground">
        [Preview will mount the runner here once Plan 01-05 ships RunnerShell]
      </p>
      <p className="text-small text-muted-foreground">
        Current draft: {blocks.length} block{blocks.length === 1 ? '' : 's'} —{' '}
        {blocks.map((b) => b.type).join(' → ')}
      </p>
    </div>
  );
}
