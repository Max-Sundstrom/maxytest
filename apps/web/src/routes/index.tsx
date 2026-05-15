import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/lib/supabase/auth';

/**
 * `/` — root router. No UI in Plan 01-02; redirects based on session presence.
 *
 * Plan 01-01 shipped a smoke-test landing card here. Plan 01-02 replaces it
 * because the deployed product has no use for a landing page at the root URL
 * yet — signed-in designers want /app, signed-out designers want /auth/login.
 *
 * Plan 01-06 adds a marketing landing page when the product ships its first
 * public-facing surface; for now '/' is a router.
 */
function IndexComponent() {
  return null;
}

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? '/app' : '/auth/login' });
  },
  component: IndexComponent,
});
