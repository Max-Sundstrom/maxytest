/**
 * <WorkspaceTopBar> — sticky h-14 header for every `_app/*` route.
 *
 * Plan 01-02 surface: workspace name + avatar dropdown with "Sign out".
 * Plan 01-03 surface: when the active route is the builder
 *   (`/_app/studies/$id/edit`), additionally render:
 *     - inline-editable test name (click to edit, blur/Enter saves, Esc cancels)
 *     - status badge
 *     - "Preview" button → toggles `useUiStore.previewOverlayOpen`
 *     - "Publish" button (Plan 01-04 wires the mutation; stub with tooltip here)
 */

import { useEffect, useRef, useState } from 'react';
import { useMatchRoute, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSession, useSignOut } from '@/lib/queries/auth';
import { useStudy, useUpdateStudyTitle } from '@/lib/queries/studies';
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
            <BuilderTitleAndChrome studyId={studyId} />
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
// Builder-only chrome: inline title + status badge + Preview + Publish
// ----------------------------------------------------------------------------

function BuilderTitleAndChrome({ studyId }: { studyId: string }) {
  const studyQuery = useStudy(studyId);
  const updateTitle = useUpdateStudyTitle(studyId);
  const setPreviewOverlayOpen = useUiStore((s) => s.setPreviewOverlayOpen);

  const study = studyQuery.data;
  const status = study?.status ?? 'draft';

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
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPreviewOverlayOpen(true)}
        >
          Preview
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="default" disabled aria-disabled>
              {status === 'published' ? 'Move to draft' : 'Publish'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Publish flow available after Plan 01-04
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') {
    return <Badge className="bg-success-bg text-success">Published</Badge>;
  }
  if (status === 'archived') {
    return <Badge className="bg-muted text-muted-foreground">Archived</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground">Draft</Badge>;
}

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
