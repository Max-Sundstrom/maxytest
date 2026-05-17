/**
 * <UserAvatarMenu /> — accent-color circular avatar with sign-out dropdown.
 *
 * Extracted from the deleted WorkspaceTopBar so every per-route header can
 * compose it (AppTopbar on /app, BuilderTopbar on /studies/$id/edit, etc.)
 * without depending on a global layout.
 *
 * Visuals: 32×32 round chip, --color-accent bg, white-on-accent initial of
 * the local-part of the session email. Click opens shadcn DropdownMenu with
 * "Выйти" → triggers `useSignOut`.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession, useSignOut } from '@/lib/queries/auth';

export interface UserAvatarMenuProps {
  size?: number;
}

export function UserAvatarMenu({ size = 32 }: UserAvatarMenuProps) {
  const { session } = useSession();
  const signOut = useSignOut();

  const email = session?.user.email ?? '';
  const emailLocal = email.split('@')[0] ?? '';
  const initial = (emailLocal.charAt(0) || '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Меню профиля"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          color: 'var(--color-accent-foreground)',
          font: '500 13px / 1 var(--font-sans)',
          display: 'grid',
          placeItems: 'center',
          border: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
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
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
