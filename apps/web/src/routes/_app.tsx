import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/lib/supabase/auth';
import { WorkspaceTopBar } from '@/components/shared/WorkspaceTopBar';

/**
 * `_app` layout route — the underscore prefix makes it a pathless layout route
 * (does not appear in URLs). RESEARCH.md Pattern 2.
 *
 * Trust boundary: every child route under `_app/*` requires a Supabase session.
 * `beforeLoad` runs server-thinking-paths-before-render so unauthenticated
 * visitors are redirected to /auth/login without ever seeing a flash of the
 * gated UI (AUTH-01..03).
 */

function AppLayout() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <WorkspaceTopBar />
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw redirect({ to: '/auth/login' });
    }
    // Make the session available to descendant routes via `Route.useRouteContext()`.
    return { session: data.session };
  },
  component: AppLayout,
});
