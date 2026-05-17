// apps/plugin/src/components/SignInView.tsx — design-system v1 rewrite (2026-05-17).
//
// Visual: handoff plugin body styling (white bg via plugin-shell, 20px
// padding, IBM Plex pair, 14/20 body copy, 44px pill CTA). Stays as the
// pre-flow Screen 0 — handoff plugin pre-supposes auth; our integration runs
// the magic-link Realtime handshake here first.
//
// CRITICAL — Pitfall 3 (user-gesture):
//   handleSignIn → setPending(true) → signInWithMagicLink(VIEWER_URL).
//   signInWithMagicLink ITSELF synchronously posts the open-external IPC as
//   its FIRST statement (see apps/plugin/src/lib/auth.ts). No await happens
//   in this component BEFORE that call. Re-ordering this handler to await
//   anything before signInWithMagicLink would silently break the OS-browser
//   launch on Figma Desktop. Plan 05 contract preserved.

import { useState } from 'react';

import { signInWithMagicLink } from '../lib/auth';

import ErrorCard from './ErrorCard';
import PrimaryCta from './PrimaryCta';

declare const process: { env: { VIEWER_URL: string } };

interface SignInViewProps {
  onSignedIn: () => void;
}

interface SignInError {
  code: string;
  title: string;
  message: string;
}

export default function SignInView({ onSignedIn }: SignInViewProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);

  const handleSignIn = async () => {
    setPending(true);
    setError(null);
    const VIEWER_URL = process.env.VIEWER_URL;
    const { session, error: authError } = await signInWithMagicLink(VIEWER_URL);
    setPending(false);
    if (authError) {
      const code = authError.message === 'auth_timeout' ? 'auth_timeout' : 'unknown_error';
      setError({
        code,
        title: 'Вход не удался',
        message:
          code === 'auth_timeout'
            ? 'Сессия входа истекла за 10 минут. Попробуй снова.'
            : 'Не получилось завершить вход. Попробуй снова.',
      });
      return;
    }
    if (session) onSignedIn();
  };

  if (error) {
    return (
      <ErrorCard
        code={error.code}
        title={error.title}
        message={error.message}
        onRetry={() => setError(null)}
      />
    );
  }

  return (
    <main
      aria-labelledby="signin-title"
      style={{
        flex: 1,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#FFFFFF',
        overflow: 'auto',
      }}
    >
      <span
        style={{
          font: '500 11px/16px var(--font-mono, "IBM Plex Mono"), monospace',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
        }}
      >
        Maxytest · Вход
      </span>
      <h1
        id="signin-title"
        style={{
          font: '600 22px/28px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: '#1F2328',
          letterSpacing: '-0.005em',
          margin: 0,
        }}
      >
        Войди в Maxytest
      </h1>
      <p
        style={{
          font: '400 14px/20px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: '#6B7280',
          margin: 0,
        }}
      >
        Откроем браузер для входа magic-link. После входа вернись в Figma — плагин запомнит сессию.
      </p>

      <div style={{ marginTop: 16 }}>
        <PrimaryCta label="Войти в Maxytest" onClick={handleSignIn} pending={pending} />
      </div>
    </main>
  );
}
