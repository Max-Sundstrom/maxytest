import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/lib/supabase/auth';

/**
 * `_app` layout route — the underscore prefix makes it a pathless layout route
 * (does not appear in URLs). RESEARCH.md Pattern 2.
 *
 * Trust boundary: every child route under `_app/*` requires a Supabase session.
 * `beforeLoad` runs server-thinking-paths-before-render so unauthenticated
 * visitors are redirected to /auth/login without ever seeing a flash of the
 * gated UI (AUTH-01..03).
 *
 * 2026-05-17: The WorkspaceTopBar that previously rendered here was removed
 * as part of the design-system v1 rollout — each child route now owns its
 * own chrome (AppTopbar on /app, BuilderTopbar on /studies/$id/edit, etc.)
 * so the page background flows under a single header and there are no stacked
 * bars. Sign-out / workspace info lives in <UserAvatarMenu /> composed into
 * the per-route topbar.
 */

function AppLayout() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-page)' }}>
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
