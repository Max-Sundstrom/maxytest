/**
 * <StudyList> — Plan 01-03 Task 4 / UI-SPEC.md §"Test list".
 *
 * Renders the designer's studies as a vertical list of cards. Plan 01-04
 * activates the action-menu items that Plan 01-03 stubbed:
 *   - "Move to draft" (visible when status='published') → useMoveStudyToDraft
 *   - "Archive"       (visible when status in draft/published) → confirm dialog → useArchiveStudy
 *   - "Duplicate"     stays disabled with "Available in Phase 4" tooltip (TESTMGMT-04)
 */

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/utils';
import { useArchiveStudy, useMoveStudyToDraft, type StudyRow } from '@/lib/queries/studies';

// Route-tree-agnostic navigate type — see comment in lib/queries/auth.ts.
type LooseNavigate = (opts: { to: string; params?: Record<string, string> }) => unknown;

export interface StudyListProps {
  studies: StudyRow[];
  workspaceId: string | null;
}

function statusBadge(status: string) {
  if (status === 'published') {
    return <Badge className="bg-success-bg text-success">Published</Badge>;
  }
  if (status === 'archived') {
    return <Badge className="bg-muted text-muted-foreground">Archived</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
}

export function StudyList({ studies, workspaceId }: StudyListProps) {
  const navigate = useNavigate() as unknown as LooseNavigate;
  const archive = useArchiveStudy();
  const moveToDraft = useMoveStudyToDraft();

  const [archiveTarget, setArchiveTarget] = useState<StudyRow | null>(null);

  const handleArchive = () => {
    if (!archiveTarget) return;
    archive.mutate(
      { studyId: archiveTarget.id, workspaceId },
      {
        onSettled: () => setArchiveTarget(null),
      },
    );
  };

  return (
    <>
      <ul className="flex flex-col gap-3" aria-label="Tests">
        {studies.map((study) => (
          <li key={study.id}>
            <Card className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: '/studies/$id/edit',
                    params: { id: study.id },
                  })
                }
                className="flex flex-1 items-center gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-h3 font-semibold text-foreground">
                      {study.title || 'Untitled test'}
                    </h2>
                    {statusBadge(study.status)}
                  </div>
                  <p className="mt-1 text-small text-muted-foreground">
                    Last edited {formatRelativeTime(new Date(study.updated_at))}
                  </p>
                </div>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  aria-label={`Actions for ${study.title}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem
                    onSelect={() =>
                      navigate({
                        to: '/studies/$id/edit',
                        params: { id: study.id },
                      })
                    }
                  >
                    Open
                  </DropdownMenuItem>

                  {study.status === 'published' && (
                    <DropdownMenuItem
                      onSelect={() => moveToDraft.mutate({ studyId: study.id, workspaceId })}
                      disabled={moveToDraft.isPending}
                    >
                      Move to draft
                    </DropdownMenuItem>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem disabled aria-disabled>
                        Duplicate
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">Available in Phase 4</TooltipContent>
                  </Tooltip>

                  <DropdownMenuSeparator />

                  {(study.status === 'draft' || study.status === 'published') && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setArchiveTarget(study);
                      }}
                      variant="destructive"
                    >
                      Archive
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          </li>
        ))}

        {/* Empty list inside the populated branch shouldn't happen — caller swaps in EmptyTestsState — but defend anyway. */}
        {studies.length === 0 && (
          <li className="py-8 text-center text-body text-muted-foreground">No tests yet.</li>
        )}
      </ul>

      <Dialog
        open={!!archiveTarget}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this test?</DialogTitle>
            <DialogDescription>
              Existing responses are preserved. Respondents won&rsquo;t be able to start new
              sessions. You have 30 days to restore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={archive.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={archive.isPending}
              aria-busy={archive.isPending || undefined}
            >
              {archive.isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "New test" CTA used by the populated `/app` view. */
export function NewTestButton({
  onClick,
  isPending,
}: {
  onClick: () => void;
  isPending?: boolean;
}) {
  return (
    <Button onClick={onClick} disabled={isPending} aria-busy={isPending || undefined}>
      {isPending ? 'Creating…' : 'New test'}
    </Button>
  );
}
