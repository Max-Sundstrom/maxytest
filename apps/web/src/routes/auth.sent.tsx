import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MagicLinkSentScreen } from '@/components/auth/MagicLinkSentScreen';

/**
 * `/auth/sent?to=<masked>` — confirmation screen after a magic link is sent.
 *
 * `to` is intentionally validated as a plain string (not an email) because
 * `<LoginForm>` already masks it (e.g. `m***@hotmail.com`). We accept the
 * empty string defensively so direct navigations don't hard-crash; the
 * Resend button is then gated by the presence of the original email in
 * sessionStorage (set by `<LoginForm>`).
 */

const searchSchema = z.object({
  to: z.string().optional().default(''),
});

function AuthSentRoute() {
  const { to } = Route.useSearch();
  return (
    <main className="min-h-[100dvh] bg-background px-4">
      <MagicLinkSentScreen maskedEmail={to} />
    </main>
  );
}

export const Route = createFileRoute('/auth/sent')({
  validateSearch: searchSchema,
  component: AuthSentRoute,
});
