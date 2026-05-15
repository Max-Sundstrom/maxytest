/**
 * <StudyList> — Plan 01-03 Task 4 / UI-SPEC.md §"Test list".
 *
 * Renders the designer's studies as a vertical list of cards. Each card:
 *   - title
 *   - status badge (draft / published / archived — text-only per UI-SPEC)
 *   - last-edit relative time
 *   - "Open" action (links to /studies/$id/edit)
 *   - DropdownMenu stub for Move to draft / Archive / Duplicate (Plan 01-04 wires)
 */

import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/utils';
import type { StudyRow } from '@/lib/queries/studies';

// Route-tree-agnostic navigate type — see comment in lib/queries/auth.ts.
type LooseNavigate = (opts: {
  to: string;
  params?: Record<string, string>;
}) => unknown;

export interface StudyListProps {
  studies: StudyRow[];
}

function statusBadge(status: string) {
  if (status === 'published') {
    return (
      <Badge className="bg-success-bg text-success">Published</Badge>
    );
  }
  if (status === 'archived') {
    return (
      <Badge className="bg-muted text-muted-foreground">Archived</Badge>
    );
  }
  return (
    <Badge className="bg-muted text-muted-foreground">Draft</Badge>
  );
}

export function StudyList({ studies }: StudyListProps) {
  const navigate = useNavigate() as unknown as LooseNavigate;

  return (
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem disabled aria-disabled>
                      {study.status === 'published'
                        ? 'Move to draft'
                        : 'Archive'}
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    Available after publish flow
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem disabled aria-disabled>
                      Duplicate
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    Available after publish flow
                  </TooltipContent>
                </Tooltip>
              </DropdownMenuContent>
            </DropdownMenu>
          </Card>
        </li>
      ))}

      {/* Empty list inside the populated branch shouldn't happen — caller swaps in EmptyTestsState — but defend anyway. */}
      {studies.length === 0 && (
        <li className="py-8 text-center text-body text-muted-foreground">
          No tests yet.
        </li>
      )}
    </ul>
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
