import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthShell } from '@/components/auth/AuthShell';
import { CallbackHandler } from '@/components/auth/CallbackHandler';

/**
 * `/auth/callback` — landing pad for the magic-link click (D-02).
 *
 * Supabase's `detectSessionInUrl: true` (Pattern 1) automatically exchanges
 * the PKCE `code` from the URL for a session. `<CallbackHandler>` then
 * validates the `next` query against `isSameOriginPath` (Pitfall 10) and
 * routes the user to the validated target (or DEFAULT_NEXT = '/app').
 *
 * The search schema is permissive on the Supabase params (`code`, `token_hash`,
 * `type`) because Supabase JS handles them transparently — we only care about
 * `next`.
 */

const searchSchema = z.object({
  next: z.string().optional(),
  // Pass-through fields Supabase puts in the URL — kept in the schema so
  // TanStack Router's strict-search-validation doesn't strip them before
  // Supabase JS reads window.location.
  code: z.string().optional(),
  token_hash: z.string().optional(),
  type: z.string().optional(),
});

function AuthCallbackRoute() {
  const { next } = Route.useSearch();
  return (
    <AuthShell>
      <CallbackHandler next={next} />
    </AuthShell>
  );
}

export const Route = createFileRoute('/auth/callback')({
  validateSearch: searchSchema,
  component: AuthCallbackRoute,
});
