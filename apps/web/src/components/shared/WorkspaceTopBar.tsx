/**
 * <WorkspaceTopBar> — sticky h-14 header for every `_app/*` route.
 *
 * Plan 01-02 surface: workspace name + avatar dropdown with "Sign out".
 * Plan 01-03 surface: when on the builder route, additionally render:
 *   - inline-editable test name (click to edit, blur/Enter saves, Esc cancels)
 *   - status badge, "Preview" button, "Publish" stub
 * Plan 01-04 surface: wire the status lifecycle controls. Status-keyed UI:
 *   - draft     → "Publish" (default) → calls usePublishStudy → opens PublishLinkDialog on success
 *   - published → "Published ▾" DropdownMenu (Copy link, Move to draft, Archive [confirm])
 *   - archived  → "Restore" button → calls useRestoreStudy
 *   "Preview" remains visible across all three states (carried from 01-03).
 */

import { useEffect, useRef, useState } from 'react';
import { useMatchRoute, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PublishLinkDialog } from '@/components/studies/PublishLinkDialog';
import { useSession, useSignOut } from '@/lib/queries/auth';
import {
  useArchiveStudy,
  useMoveStudyToDraft,
  usePublishStudy,
  useRestoreStudy,
  useStudy,
  useUpdateStudyTitle,
} from '@/lib/queries/studies';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';
import { useUiStore } from '@/lib/stores/ui';

export function WorkspaceTopBar() {
  const { workspace, isLoading } = useCurrentWorkspace();
  const { session } = useSession();
  const signOut = useSignOut();

  // Detect the builder route. `useMatchRoute` returns a matcher that we call
  // with the desired routeId; truthy match → we're inside the builder.
  const matchRoute = useMatchRoute();
  const builderMatch = matchRoute({ to: '/studies/$id/edit', fuzzy: false });
  const isBuilder = !!builderMatch;
  const params = useParams({ strict: false }) as { id?: string };
  const studyId = isBuilder ? params.id ?? null : null;

  const email = session?.user.email ?? '';
  const emailLocal = email.split('@')[0] ?? '';
  const initial = (emailLocal.charAt(0) || '?').toUpperCase();

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="text-h3 font-semibold text-muted-foreground">
          {isLoading || !workspace ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            workspace.name
          )}
        </div>
        {isBuilder && studyId && (
          <>
            <span className="text-muted-foreground">/</span>
            <BuilderTitleAndChrome
              studyId={studyId}
              workspaceId={workspace?.id ?? null}
            />
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open workspace menu"
          className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground text-small font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {initial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              signOut.mutate();
            }}
            disabled={signOut.isPending}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

// ----------------------------------------------------------------------------
// Builder-only chrome: inline title + status badge + Preview + status-keyed
// publish/archive/restore controls (Plan 01-04).
// ----------------------------------------------------------------------------

interface BuilderTitleAndChromeProps {
  studyId: string;
  workspaceId: string | null;
}

function BuilderTitleAndChrome({
  studyId,
  workspaceId,
}: BuilderTitleAndChromeProps) {
  const studyQuery = useStudy(studyId);
  const updateTitle = useUpdateStudyTitle(studyId);
  const setPreviewOverlayOpen = useUiStore((s) => s.setPreviewOverlayOpen);

  const publish = usePublishStudy();
  const moveToDraft = useMoveStudyToDraft();
  const archive = useArchiveStudy();
  const restore = useRestoreStudy();

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishedRunToken, setPublishedRunToken] = useState<string | null>(
    null,
  );
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const study = studyQuery.data;
  const status = (study?.status ?? 'draft') as
    | 'draft'
    | 'published'
    | 'archived';

  const handlePublish = () => {
    publish.mutate(
      { studyId, workspaceId },
      {
        onSuccess: (data) => {
          setPublishedRunToken(data.run_token);
          setPublishDialogOpen(true);
        },
      },
    );
  };

  const handleMoveToDraft = () => {
    moveToDraft.mutate({ studyId, workspaceId });
  };

  const handleCopyLink = async () => {
    const token = study?.run_token;
    if (!token) {
      toast.error('No share link yet — publish the test first.');
      return;
    }
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't access the clipboard.");
    }
  };

  const handleArchive = () => {
    archive.mutate(
      { studyId, workspaceId },
      {
        onSuccess: () => setArchiveConfirmOpen(false),
        onError: () => setArchiveConfirmOpen(false),
      },
    );
  };

  const handleRestore = () => {
    restore.mutate({ studyId, workspaceId });
  };

  return (
    <>
      <div className="min-w-0 flex-1">
        {study ? (
          <InlineTitleEditor
            value={study.title}
            disabled={updateTitle.isPending}
            onSave={(next) => {
              if (next === study.title) return;
              updateTitle.mutate(
                { title: next },
                {
                  onError: (err: unknown) => {
                    const message =
                      err instanceof Error
                        ? err.message
                        : 'Try again in a moment.';
                    toast.error("Couldn't rename the test", {
                      description: message,
                    });
                  },
                },
              );
            }}
          />
        ) : (
          <Skeleton className="h-5 w-48" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <StatusBadge status={status} />

        {/* Preview is available in all three states. */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPreviewOverlayOpen(true)}
        >
          Preview
        </Button>

        {status === 'draft' && (
          <Button
            size="sm"
            variant="default"
            onClick={handlePublish}
            disabled={publish.isPending}
            aria-busy={publish.isPending || undefined}
          >
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        )}

        {status === 'published' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="default">
                Published ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={handleCopyLink}>
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={handleMoveToDraft}
                disabled={moveToDraft.isPending}
              >
                Move to draft
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setArchiveConfirmOpen(true);
                }}
                variant="destructive"
              >
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {status === 'archived' && (
          <Button
            size="sm"
            variant="default"
            onClick={handleRestore}
            disabled={restore.isPending}
            aria-busy={restore.isPending || undefined}
          >
            {restore.isPending ? 'Restoring…' : 'Restore'}
          </Button>
        )}
      </div>

      <PublishLinkDialog
        open={publishDialogOpen}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) setPublishedRunToken(null);
        }}
        runToken={publishedRunToken}
      />

      <ArchiveConfirmDialog
        open={archiveConfirmOpen}
        onOpenChange={setArchiveConfirmOpen}
        onConfirm={handleArchive}
        isPending={archive.isPending}
      />
    </>
  );
}

// ----------------------------------------------------------------------------
// Status badge
// ----------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') {
    return <Badge className="bg-success-bg text-success">Published</Badge>;
  }
  if (status === 'archived') {
    return <Badge className="bg-muted text-muted-foreground">Archived</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
}

// ----------------------------------------------------------------------------
// Archive confirm dialog — copy-locked to UI-SPEC.md §"Status lifecycle"
// ----------------------------------------------------------------------------

interface ArchiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
}

function ArchiveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: ArchiveConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this test?</DialogTitle>
          <DialogDescription>
            Existing responses are preserved. Respondents won&rsquo;t be able to
            start new sessions. You have 30 days to restore.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending || undefined}
          >
            {isPending ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Inline title editor (carried over from Plan 01-03)
// ----------------------------------------------------------------------------

interface InlineTitleEditorProps {
  value: string;
  disabled?: boolean;
  onSave: (next: string) => void;
}

function InlineTitleEditor({ value, disabled, onSave }: InlineTitleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next.length === 0) {
            setDraft(value);
            setEditing(false);
            return;
          }
          onSave(next);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full bg-transparent text-h1 font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        aria-label="Test name"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="truncate text-h1 font-semibold tracking-tight text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {value || 'Untitled test'}
    </button>
  );
}
