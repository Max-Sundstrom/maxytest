/**
 * `_public` layout route — Plan 01-05.
 *
 * Pathless layout (the underscore prefix) for anonymous-respondent routes
 * (`/r/{token}`). Plan 01-02 removed an empty version of this file because it
 * collided with `index.tsx` on the `/` path; we re-introduce it here paired
 * with its first child (`_public.r.$token.tsx`), which makes the file router
 * happy.
 *
 * No-auth shell: this layout deliberately does NOT call `getSession()` /
 * redirect to /auth/login. Anonymous respondents must reach `/r/{token}` even
 * without a Supabase JWT — the runner's anon client signs them in
 * anonymously on mount (AUTH-04). The chrome here stays minimal so the
 * runner can own the full viewport.
 */

import { Outlet, createFileRoute } from '@tanstack/react-router';

function PublicLayout() {
  return <Outlet />;
}

export const Route = createFileRoute('/_public')({
  component: PublicLayout,
});
