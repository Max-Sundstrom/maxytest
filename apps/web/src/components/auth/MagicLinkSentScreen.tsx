import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { readLastOtpEmail, useSignInWithOtp } from '@/lib/queries/auth';

/**
 * `<MagicLinkSentScreen>` (D-01) — UI-SPEC.md §"Component Contracts".
 *
 * Props:
 *   - maskedEmail: string (e.g. "m***@hotmail.com")
 *
 * Behaviour:
 *   - 60s countdown on the Resend button (D-01)
 *   - "Use a different email" link → /auth/login
 *   - Resend triggers `useSignInWithOtp` against the email stored in
 *     sessionStorage by `<LoginForm>` (`maxytest:last-otp-email`). If the key
 *     is missing (e.g. user opened /auth/sent directly), Resend is disabled.
 *
 * Copy lock (UI-SPEC §"Copy Lock" Auth flow):
 *   heading            — "Check your email"
 *   body               — "We sent a link to {maskedEmail}. The link expires in 15 minutes."
 *   resend disabled    — "Resend in {N}s"
 *   resend enabled     — "Resend magic link"
 *   resend success     — "Sent. Check your inbox again." (toast)
 *   "different email"  — "Use a different email"
 */

const RESEND_COOLDOWN_SECONDS = 60;

type NavigateLoose = (opts: { to: string }) => unknown;

export interface MagicLinkSentScreenProps {
  maskedEmail: string;
}

export function MagicLinkSentScreen({ maskedEmail }: MagicLinkSentScreenProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(RESEND_COOLDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signInWithOtp = useSignInWithOtp();
  const navigate = useNavigate() as unknown as NavigateLoose;

  const startCountdown = useCallback(() => {
    setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  // Kick off countdown on first mount.
  useEffect(() => {
    startCountdown();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startCountdown]);

  const onResend = useCallback(async () => {
    const email = readLastOtpEmail();
    if (!email) {
      toast.error('Use a different email to start over.');
      navigate({ to: '/auth/login' });
      return;
    }
    try {
      await signInWithOtp.mutateAsync({ email });
      toast.success('Sent. Check your inbox again.');
      startCountdown();
    } catch {
      toast.error("Couldn't send the link. Try again in a moment.");
    }
  }, [navigate, signInWithOtp, startCountdown]);

  const resendDisabled =
    secondsRemaining > 0 || signInWithOtp.isPending || !readLastOtpEmail();
  const resendLabel =
    secondsRemaining > 0
      ? `Resend in ${secondsRemaining}s`
      : signInWithOtp.isPending
        ? 'Sending…'
        : 'Resend magic link';

  return (
    <div className="mx-auto w-full max-w-[400px] py-16">
      <h1 className="mb-1 text-h2 font-semibold tracking-tight">Maxytest</h1>
      <h2 className="mb-2 text-display font-semibold tracking-tight">
        Check your email
      </h2>
      <p className="mb-8 text-body text-muted-foreground">
        We sent a link to <span className="font-mono">{maskedEmail}</span>. The
        link expires in 15 minutes.
      </p>

      <div className="space-y-4">
        <Button
          variant="default"
          size="lg"
          className="w-full"
          disabled={resendDisabled}
          aria-busy={signInWithOtp.isPending}
          onClick={onResend}
        >
          {resendLabel}
        </Button>

        <button
          type="button"
          className="block w-full text-center text-small text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
          onClick={() => navigate({ to: '/auth/login' })}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
