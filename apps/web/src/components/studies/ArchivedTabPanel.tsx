/**
 * <ArchivedTabPanel> — Plan 01-04 Task 4 / UI-SPEC.md §"Test list" Archived tab.
 *
 * Lists soft-deleted studies for the current workspace with retention copy
 * ("Will be permanently deleted in N days") and a Restore action (D-29). The
 * hard-delete cron (Edge Function in Task 5) sweeps rows whose `archived_at`
 * is older than 30 days, so the local countdown is computed against the
 * persisted `archived_at` timestamp client-side.
 *
 * Phase 1 deliberately does NOT render a "Delete permanently" button — the
 * cron is the single hard-delete pathway in Phase 1 (D-28). An immediate-
 * delete UX lands in Phase 4 polish.
 */

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRestoreStudy, useStudiesArchived, type StudyRow } from '@/lib/queries/studies';

export interface ArchivedTabPanelProps {
  workspaceId: string | null;
}

/**
 * Computes the remaining-day countdown to hard-delete. The cron uses
 *   archived_at < now() - interval '30 days'
 * so the row will go on the FIRST cron run after `archived_at + 30d`.
 * We floor the difference so 29.5 days → "30 days remaining" reads as
 * generously as users expect, while 0.1 days → "1 day" never says "0".
 */
function daysUntilDeletion(archivedAtIso: string | null): number {
  if (!archivedAtIso) return 30;
  const archivedAt = new Date(archivedAtIso).getTime();
  if (Number.isNaN(archivedAt)) return 30;
  const cutoff = archivedAt + 30 * 24 * 60 * 60 * 1000;
  const remainingMs = cutoff - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

function formatRetention(days: number): string {
  if (days <= 0) {
    return 'Pending permanent deletion';
  }
  if (days === 1) {
    return 'Will be permanently deleted in 1 day';
  }
  return `Will be permanently deleted in ${days} days`;
}

export function ArchivedTabPanel({ workspaceId }: ArchivedTabPanelProps) {
  const { studies, isLoading, error } = useStudiesArchived(workspaceId);
  const restore = useRestoreStudy();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-body text-muted-foreground">
        Couldn&rsquo;t load archived tests. Try refreshing the page.
      </p>
    );
  }

  if (studies.length === 0) {
    return <p className="py-12 text-center text-body text-muted-foreground">No archived tests.</p>;
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Archived tests">
      {studies.map((study) => (
        <ArchivedRow
          key={study.id}
          study={study}
          workspaceId={workspaceId}
          onRestore={(studyId) => restore.mutate({ studyId, workspaceId })}
          isRestoring={restore.isPending && restore.variables?.studyId === study.id}
        />
      ))}
    </ul>
  );
}

interface ArchivedRowProps {
  study: StudyRow;
  workspaceId: string | null;
  onRestore: (studyId: string) => void;
  isRestoring: boolean;
}

function ArchivedRow({ study, onRestore, isRestoring }: ArchivedRowProps) {
  const days = daysUntilDeletion(study.archived_at);
  return (
    <li>
      <Card className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h3 font-semibold text-muted-foreground">
            {study.title || 'Untitled test'}
          </h2>
          <p className="mt-1 text-small text-muted-foreground">{formatRetention(days)}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onRestore(study.id)}
          disabled={isRestoring}
          aria-busy={isRestoring || undefined}
        >
          {isRestoring ? 'Restoring…' : 'Restore'}
        </Button>
      </Card>
    </li>
  );
}
