import { createFileRoute } from '@tanstack/react-router';
import { LoginForm } from '@/components/auth/LoginForm';

/**
 * `/auth/login` — magic-link entry point (AUTH-01).
 *
 * Layout per UI-SPEC.md §"Auth screens": centered single-column, no sidebar,
 * no top bar. The text-only "Maxytest" wordmark + form lives inside
 * <LoginForm/>.
 */
function AuthLoginRoute() {
  return (
    <main className="min-h-[100dvh] bg-background px-4">
      <LoginForm />
    </main>
  );
}

export const Route = createFileRoute('/auth/login')({
  component: AuthLoginRoute,
});
