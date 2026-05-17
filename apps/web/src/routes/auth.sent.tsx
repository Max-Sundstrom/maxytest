import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthShell } from '@/components/auth/AuthShell';
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
    <AuthShell>
      <MagicLinkSentScreen maskedEmail={to} />
    </AuthShell>
  );
}

export const Route = createFileRoute('/auth/sent')({
  validateSearch: searchSchema,
  component: AuthSentRoute,
});
