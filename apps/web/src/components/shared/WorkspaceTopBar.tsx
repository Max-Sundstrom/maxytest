import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/queries/auth';
import { useSignOut } from '@/lib/queries/auth';
import { useCurrentWorkspace } from '@/lib/queries/workspaces';

/**
 * `<WorkspaceTopBar>` — sticky header for every `_app/*` route.
 *
 * Phase 1 surface (D-03 / D-04 + UI-SPEC.md §"Builder workspace bar"):
 *   - Left: workspace name from `useCurrentWorkspace()` (skeleton while loading)
 *   - Right: avatar circle (initial of email local part) wrapped in a
 *            DropdownMenu with one item: "Sign out"
 *
 * Plan 01-03 will add "Preview" + "Publish" buttons; we intentionally do not
 * scaffold them now so this component stays Plan 01-02-pure.
 */
export function WorkspaceTopBar() {
  const { workspace, isLoading } = useCurrentWorkspace();
  const { session } = useSession();
  const signOut = useSignOut();

  // Avatar initial derived from the user's email local part (Phase 1 has no
  // display-name field on the signup path; D-03 names the workspace after the
  // same string).
  const email = session?.user.email ?? '';
  const emailLocal = email.split('@')[0] ?? '';
  const initial = (emailLocal.charAt(0) || '?').toUpperCase();

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-6"
    >
      <div className="text-h3 font-semibold text-muted-foreground">
        {isLoading || !workspace ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          workspace.name
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
              // Prevent the menu from closing before mutate resolves so we keep
              // a visible busy state if signOut is slow.
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
