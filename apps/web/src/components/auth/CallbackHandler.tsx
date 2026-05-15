import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/auth';
import { DEFAULT_NEXT, isSameOriginPath } from '@/lib/auth/next-validate';

/**
 * `<CallbackHandler>` — runs after Supabase's `detectSessionInUrl: true` has
 * already exchanged the PKCE `code` query for a session (Pattern 1).
 *
 * Flow (D-02):
 *   1. Call `supabase.auth.getSession()` to confirm the session now exists.
 *   2. Validate `next` via `isSameOriginPath` (Pitfall 10 / T-01-02-01).
 *   3. Navigate to the validated path with `replace: true` so the magic-link
 *      query string disappears from history.
 *
 * Loading / error copy locked in UI-SPEC.md §"Copy Lock" Auth flow.
 */

type NavigateLoose = (opts: { to: string; replace?: boolean }) => unknown;

export interface CallbackHandlerProps {
  next?: string;
}

export function CallbackHandler({ next }: CallbackHandlerProps) {
  const navigate = useNavigate() as unknown as NavigateLoose;
  const [error, setError] = useState<null | 'expired' | 'invalid'>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) {
          // Supabase reports invalid / expired links here.
          setError('expired');
          return;
        }
        if (!data.session) {
          // detectSessionInUrl: true should have populated this. A missing
          // session means the link is stale (clicked twice / past expiry).
          setError('expired');
          return;
        }
        const target = isSameOriginPath(next) ? next : DEFAULT_NEXT;
        navigate({ to: target, replace: true });
      } catch {
        if (cancelled) return;
        setError('invalid');
      }
    }

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  if (error) {
    const heading =
      error === 'expired'
        ? 'This link expired. Request a new one.'
        : "This link isn't valid. Try signing in again.";
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[400px] flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-6 text-h1 font-semibold tracking-tight">{heading}</h1>
        <Button
          variant="default"
          size="lg"
          onClick={() => navigate({ to: '/auth/login' })}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[400px] flex-col items-center justify-center px-4 text-center">
      <Loader2
        className="mb-4 size-8 animate-spin text-muted-foreground"
        aria-hidden
      />
      <p className="text-body text-muted-foreground" role="status" aria-live="polite">
        Signing you in…
      </p>
    </div>
  );
}
