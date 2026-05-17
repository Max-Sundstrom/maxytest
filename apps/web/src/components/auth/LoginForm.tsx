/**
 * `<LoginForm>` — designer magic-link entry, design-system v1 rewrite (2026-05-17).
 *
 * Source: design-system handoff (paper bg, IBM Plex pair, moss accent, 32px
 * input + 48px CTA). Old indigo + slate + English copy from Phase 1 is gone —
 * RU copy throughout matches the rest of the redesigned app.
 *
 * Functional contract preserved from Phase 1:
 *   - RHF + Zod validation
 *   - useSignInWithOtp mutation, threads optional `next` into emailRedirectTo
 *   - Success → /auth/sent?to=<masked email>
 *   - Error → setError on email field (no separate error banner)
 *   - maskEmail export remains so /auth/sent's search-param contract stays the
 *     same (no test or route change required)
 *
 * Pitfall 2 (default test template asks for email): this form COLLECTS email
 * because the designer is authenticating; unrelated to the respondent privacy
 * posture covered by Pitfall 2.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { useSignInWithOtp } from '@/lib/queries/auth';

const loginSchema = z.object({
  email: z.string().min(1, 'Введи email, чтобы продолжить.').email('Это не похоже на email.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Mask an email so it can be displayed on /auth/sent without leaking the
 * full address into the URL bar history.
 * "max@hotmail.com" → "m***@hotmail.com"
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
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
      // Deliberately use the locked server-error string — don't leak the
      // Supabase rate-limit copy that would duplicate the resend countdown.
      form.setError('email', {
        type: 'server',
        message: 'Не получилось отправить ссылку. Попробуй через секунду.',
      });
    }
  });

  const isSubmitting = signInWithOtp.isPending || form.formState.isSubmitting;
  const emailError = form.formState.errors.email?.message;

  return (
    <>
      <Eyebrow>Maxytest · Войти</Eyebrow>
      <h1
        style={{
          font: '500 32px/38px var(--font-sans)',
          color: 'var(--text-1)',
          letterSpacing: '-0.01em',
          margin: '8px 0 12px',
        }}
      >
        Войти в Maxytest
      </h1>
      <p
        style={{
          font: '400 14px/20px var(--font-sans)',
          color: 'var(--text-2)',
          margin: '0 0 32px',
        }}
      >
        Пришлём magic-link на email. Без пароля — клик в письме и ты внутри.
      </p>

      <form
        noValidate
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="login-email"
            style={{
              font: '400 12.5px/16px var(--font-sans)',
              color: 'var(--text-2)',
              letterSpacing: '0.01em',
            }}
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'login-email-error' : undefined}
            disabled={isSubmitting}
            {...form.register('email')}
            style={{
              height: 40,
              padding: '0 12px',
              background: 'var(--bg-input)',
              border: `1px solid ${emailError ? 'var(--color-danger)' : 'var(--border-1)'}`,
              borderRadius: 'var(--radius)',
              font: '400 14px/20px var(--font-sans)',
              color: 'var(--text-1)',
              outline: 'none',
              transition:
                'border-color 120ms cubic-bezier(.2,.7,.3,1), background 120ms cubic-bezier(.2,.7,.3,1)',
              width: '100%',
            }}
            onFocus={(e) => {
              if (!emailError) {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.background = 'var(--bg-input-strong)';
              }
            }}
            onBlur={(e) => {
              if (!emailError) {
                e.currentTarget.style.borderColor = 'var(--border-1)';
                e.currentTarget.style.background = 'var(--bg-input)';
              }
            }}
          />
          {emailError ? (
            <p
              id="login-email-error"
              role="alert"
              style={{
                font: '400 12px/18px var(--font-sans)',
                color: 'var(--color-danger)',
                margin: 0,
              }}
            >
              {emailError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
          style={{
            height: 48,
            background: 'var(--color-accent)',
            color: '#fff',
            border: 0,
            borderRadius: 'var(--radius)',
            font: '500 14px var(--font-sans)',
            cursor: isSubmitting ? 'wait' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
            transition: 'filter 120ms cubic-bezier(.2,.7,.3,1)',
            marginTop: 8,
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) e.currentTarget.style.filter = 'brightness(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none';
          }}
        >
          {isSubmitting ? 'Отправляю…' : 'Получить ссылку'}
        </button>
      </form>

      <p
        style={{
          font: '400 12px/18px var(--font-sans)',
          color: 'var(--text-3)',
          margin: '24px 0 0',
          textAlign: 'center',
        }}
      >
        Письмо приходит за 5-30 секунд. Если не пришло — посмотри в Спам.
      </p>
    </>
  );
}

// ─── Eyebrow ─────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        font: '500 11px/16px var(--font-mono)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-accent)',
      }}
    >
      {children}
    </span>
  );
}
