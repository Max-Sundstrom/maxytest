/**
 * `<MagicLinkSentScreen>` — design-system v1 rewrite (2026-05-17).
 *
 * Source: design-system handoff (paper bg, moss accent, IBM Plex, 48px CTA).
 * Old indigo + English copy gone — RU throughout.
 *
 * Behavior contract preserved from Phase 1 (D-01):
 *   - 60s countdown on the Resend button
 *   - "Use a different email" link → /auth/login
 *   - Resend triggers `useSignInWithOtp` against the email in sessionStorage
 *     (set by <LoginForm>). If the key is missing (direct nav), Resend is
 *     disabled and the link is the only escape hatch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { readLastOtpEmail, useSignInWithOtp } from '@/lib/queries/auth';

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

  useEffect(() => {
    startCountdown();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startCountdown]);

  const onResend = useCallback(async () => {
    const email = readLastOtpEmail();
    if (!email) {
      toast.error('Войди под другим email — начнём заново.');
      navigate({ to: '/auth/login' });
      return;
    }
    try {
      await signInWithOtp.mutateAsync({ email });
      toast.success('Отправлено. Проверь почту ещё раз.');
      startCountdown();
    } catch {
      toast.error('Не получилось отправить ссылку. Попробуй через секунду.');
    }
  }, [navigate, signInWithOtp, startCountdown]);

  const resendDisabled = secondsRemaining > 0 || signInWithOtp.isPending || !readLastOtpEmail();
  const resendLabel =
    secondsRemaining > 0
      ? `Отправить снова через ${secondsRemaining}с`
      : signInWithOtp.isPending
        ? 'Отправляю…'
        : 'Отправить снова';

  return (
    <>
      <span
        style={{
          font: '500 11px/16px var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
        }}
      >
        Maxytest · Письмо отправлено
      </span>
      <h1
        style={{
          font: '500 32px/38px var(--font-sans)',
          color: 'var(--text-1)',
          letterSpacing: '-0.01em',
          margin: '8px 0 12px',
        }}
      >
        Проверь почту
      </h1>
      <p
        style={{
          font: '400 14px/20px var(--font-sans)',
          color: 'var(--text-2)',
          margin: '0 0 32px',
        }}
      >
        Магическая ссылка ушла на{' '}
        <span
          style={{
            font: '500 14px/20px var(--font-mono)',
            color: 'var(--text-1)',
          }}
        >
          {maskedEmail}
        </span>
        . Действует 15 минут.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          disabled={resendDisabled}
          aria-busy={signInWithOtp.isPending || undefined}
          onClick={onResend}
          style={{
            height: 48,
            background: resendDisabled
              ? 'var(--color-accent-disabled, var(--bg-chip))'
              : 'var(--color-accent)',
            color: resendDisabled ? 'var(--text-3)' : '#fff',
            border: 0,
            borderRadius: 'var(--radius)',
            font: '500 14px var(--font-sans)',
            cursor: resendDisabled ? 'not-allowed' : 'pointer',
            opacity: resendDisabled ? 0.85 : 1,
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => {
            if (!resendDisabled) e.currentTarget.style.filter = 'brightness(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none';
          }}
        >
          {resendLabel}
        </button>

        <button
          type="button"
          onClick={() => navigate({ to: '/auth/login' })}
          style={{
            background: 'transparent',
            border: 0,
            padding: '8px 0',
            font: '400 13px/20px var(--font-sans)',
            color: 'var(--text-2)',
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
          }}
        >
          Войти под другим email
        </button>
      </div>
    </>
  );
}
