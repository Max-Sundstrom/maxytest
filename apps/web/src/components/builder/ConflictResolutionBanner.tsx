/**
 * <ConflictResolutionBanner> — Plan 01-03 Task 7 / UI-SPEC.md §"<ConflictResolutionBanner>".
 *
 * Rendered inside <BlockCard> body when saveState === 'conflict'. "Use my
 * version" triggers a destructive confirm dialog before calling onUseMine.
 *
 * D-17 contract: while ANY block is in conflict state, undo/redo are
 * disabled — that gating is implemented in useBuilderHotkeys via
 * useHasAnyConflict, not here.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConflictResolutionBannerProps {
  onUseServer: () => void;
  onUseMine: () => void;
}

export function ConflictResolutionBanner({
  onUseServer,
  onUseMine,
}: ConflictResolutionBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="rounded-md border border-warning/30 bg-warning-bg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-5 text-warning"
        />
        <div className="flex-1">
          <p className="text-body font-medium text-foreground">
            This block was edited in another window.
          </p>
          <p className="mt-1 text-small text-muted-foreground">
            Choose which version to keep.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={onUseServer}>
              Use server version
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
            >
              Use my version
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite the changes made elsewhere?</DialogTitle>
            <DialogDescription>
              Your version will replace whatever was saved from the other
              window.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onUseMine();
              }}
            >
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
