import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginForm } from '@/components/auth/LoginForm';

/**
 * `/auth/login` — magic-link entry point (AUTH-01).
 *
 * Layout per UI-SPEC.md §"Auth screens": centered single-column, no sidebar,
 * no top bar. The text-only "Maxytest" wordmark + form lives inside
 * <LoginForm/>.
 *
 * H4 (Phase 02.2 Plan 04): the route accepts an optional `?next=` search
 * param and forwards it to `<LoginForm/>`, which threads it through
 * `useSignInWithOtp` into `emailRedirectTo`. Default behaviour is preserved
 * — when `next` is unset, the magic-link click still lands on `/app`. The
 * Phase 1 `/auth/callback` route applies `isSameOriginPath` before
 * navigating, so the same-origin guard still gates open redirects.
 */
const searchSchema = z.object({
  next: z.string().optional(),
});

function AuthLoginRoute() {
  const { next } = Route.useSearch();
  return (
    <main className="min-h-[100dvh] bg-background px-4">
      <LoginForm next={next} />
    </main>
  );
}

export const Route = createFileRoute('/auth/login')({
  validateSearch: searchSchema,
  component: AuthLoginRoute,
});
