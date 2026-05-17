import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/auth';
import { DEFAULT_NEXT, isSameOriginPath } from '@/lib/auth/next-validate';

/**
 * `<CallbackHandler>` — design-system v1 rewrite (2026-05-17).
 *
 * Runs after Supabase's `detectSessionInUrl: true` has already exchanged the
 * PKCE `code` query for a session (Pattern 1).
 *
 * Flow (D-02):
 *   1. Call `supabase.auth.getSession()` to confirm the session now exists.
 *   2. Validate `next` via `isSameOriginPath` (Pitfall 10 / T-01-02-01).
 *   3. Navigate to the validated path with `replace: true` so the magic-link
 *      query string disappears from history.
 *
 * Visual: a centered spinner + RU status copy, with the error branch landing
 * on the same handoff styling as the rest of the auth flow. Designed to live
 * inside <AuthShell>.
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
          setError('expired');
          return;
        }
        if (!data.session) {
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
    const heading = error === 'expired' ? 'Ссылка устарела' : 'Ссылка не сработала';
    const body =
      error === 'expired'
        ? 'Magic-link действует 15 минут. Запроси новую — это бесплатно и быстро.'
        : 'Скорее всего ссылка повреждена или ты её уже использовал. Запроси новую.';
    return (
      <>
        <span
          style={{
            font: '500 11px/16px var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-danger)',
          }}
        >
          Maxytest · Ошибка
        </span>
        <h1
          style={{
            font: '500 32px/38px var(--font-sans)',
            color: 'var(--text-1)',
            letterSpacing: '-0.01em',
            margin: '8px 0 12px',
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            font: '400 14px/20px var(--font-sans)',
            color: 'var(--text-2)',
            margin: '0 0 24px',
          }}
        >
          {body}
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: '/auth/login' })}
          style={{
            height: 48,
            background: 'var(--color-accent)',
            color: '#fff',
            border: 0,
            borderRadius: 'var(--radius)',
            font: '500 14px var(--font-sans)',
            cursor: 'pointer',
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
        >
          Запросить новую ссылку
        </button>
      </>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: '24px 0',
      }}
    >
      <Loader2
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          color: 'var(--color-accent)',
          animation: 'spin 1s linear infinite',
        }}
      />
      <p
        role="status"
        aria-live="polite"
        style={{
          font: '400 14px/20px var(--font-sans)',
          color: 'var(--text-2)',
          margin: 0,
        }}
      >
        Подключаю тебя…
      </p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
