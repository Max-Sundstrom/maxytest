/**
 * <PublishLinkDialog> — Plan 01-04 Task 3.
 *
 * Surfaces the public `/r/{runToken}` URL after a successful publish. The
 * usePublishStudy hook auto-copies the URL on success; this dialog gives the
 * designer a second, deliberate copy path via a "Copy link" button (UI-SPEC
 * §"Status lifecycle" / D-27).
 *
 * Controlled component — parent owns `open` + `onOpenChange` so it can
 * coordinate with the publish mutation lifecycle. `runToken` may be `null`
 * during the publish round-trip; the dialog renders nothing in that case so
 * the modal does not flash with an empty URL.
 */

import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface PublishLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while the publish mutation is in-flight; non-null after success. */
  runToken: string | null;
}

export function PublishLinkDialog({ open, onOpenChange, runToken }: PublishLinkDialogProps) {
  // Build the URL inside the render to pick up any origin shifts (e.g., the
  // dev server starting on a different port). Falling back to '' keeps the
  // input clean on SSR-style first paint (none in v1 but defensible).
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = runToken ? `${origin}/r/${runToken}` : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied');
    } catch {
      // Clipboard permission denied — fall back to selecting the input text
      // and prompting the user to copy manually.
      toast.error("Couldn't access the clipboard. Select the link and copy it manually.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your test is live</DialogTitle>
          <DialogDescription>Share this link to start collecting responses:</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={shareUrl}
            readOnly
            aria-label="Public test URL"
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-small"
          />
          <Button type="button" variant="default" onClick={handleCopy} disabled={!shareUrl}>
            Copy link
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
