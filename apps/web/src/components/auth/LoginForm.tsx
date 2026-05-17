import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useSignInWithOtp } from '@/lib/queries/auth';

/**
 * `<LoginForm>` — designer magic-link entry.
 *
 * Copy locked in UI-SPEC.md §"Copy Lock" → "Auth flow":
 *   heading       — "Sign in to Maxytest"
 *   body          — "We'll email you a magic link. No password."
 *   email label   — "Email"
 *   placeholder   — "you@example.com"
 *   CTA           — "Send magic link"
 *   CTA loading   — "Sending…"
 *   empty error   — "Enter your email to continue."
 *   invalid error — "That doesn't look like an email address."
 *   server error  — "Couldn't send the link. Try again in a moment."
 *
 * On success: navigate to /auth/sent?to=<masked-email>.
 *
 * Pitfall 2 (default test template asks for email): this form COLLECTS email
 * because the designer is authenticating; this is unrelated to the respondent
 * privacy posture covered by Pitfall 2.
 */

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Enter your email to continue.')
    .email("That doesn't look like an email address."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Mask an email so it can be displayed on /auth/sent without leaking the
 * full address into the URL bar history.
 * "max@hotmail.com" → "m***@hotmail.com"
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email; // defensive — shouldn't happen post-Zod
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length === 0) return email;
  return `${local[0]}***${domain}`;
}

type NavigateLoose = (opts: { to: string; search?: unknown }) => unknown;

export interface LoginFormProps {
  /**
   * Optional same-origin path that the magic-link `emailRedirectTo` should
   * round-trip back to after `/auth/callback` finishes the PKCE exchange.
   * Default = unset → `useSignInWithOtp` falls back to `/app` (Phase 1
   * behaviour). H4 fix wired in Phase 02.2 Plan 04 for the plugin-callback
   * handshake.
   */
  next?: string;
}

export function LoginForm({ next }: LoginFormProps = {}) {
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '' },
  });

  const signInWithOtp = useSignInWithOtp();
  const navigate = useNavigate() as unknown as NavigateLoose;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await signInWithOtp.mutateAsync({ email, next });
      navigate({
        to: '/auth/sent',
        search: { to: maskEmail(email) },
      });
    } catch {
      // Surface the locked server-error string. We deliberately avoid
      // leaking Supabase error messages (could include rate-limit copy that
      // duplicates what the user already sees in the resend countdown).
      form.setError('email', {
        type: 'server',
        message: "Couldn't send the link. Try again in a moment.",
      });
    }
  });

  const isSubmitting = signInWithOtp.isPending || form.formState.isSubmitting;

  return (
    <div className="mx-auto w-full max-w-[400px] py-16">
      <h1 className="mb-1 text-h2 font-semibold tracking-tight">Maxytest</h1>
      <h2 className="mb-2 text-display font-semibold tracking-tight">Sign in to Maxytest</h2>
      <p className="mb-8 text-body text-muted-foreground">
        We&rsquo;ll email you a magic link. No password.
      </p>

      <Form {...form}>
        <form noValidate onSubmit={onSubmit} className="space-y-6">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="default"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
