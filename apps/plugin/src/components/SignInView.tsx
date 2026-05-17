// apps/plugin/src/components/SignInView.tsx — Phase 02.2 Plan 05 Task 4.
//
// Screen S1 — UI-SPEC §"Screen S1 — Sign-in (no cached session)" + §"Component
// Inventory" #10. Title + body helper + PrimaryCta + ErrorCard on timeout.
//
// Click flow (CRITICAL — Pitfall 3 user-gesture):
//   handleSignIn → setPending(true) → signInWithMagicLink(VIEWER_URL).
//   signInWithMagicLink ITSELF synchronously posts the open-external IPC
//   as its FIRST statement (see apps/plugin/src/lib/auth.ts) — no await
//   happens in this component before that call. Re-ordering this handler
//   to await anything before signInWithMagicLink would silently break the
//   OS-browser launch on Figma Desktop.
//
// VIEWER_URL: literal-substituted by esbuild --define (apps/plugin/build.mjs
// provides the http://localhost:5173 fallback when env unset; the H2 fix
// keeps that fallback out of source so production builds never accidentally
// ship a localhost URL).

import { useState } from 'react';

import { signInWithMagicLink } from '../lib/auth';

import ErrorCard from './ErrorCard';
import PrimaryCta from './PrimaryCta';

// VIEWER_URL is build-time-injected via esbuild --define (Plan 01 build.mjs).
// The 'http://localhost:5173' fallback lives in build.mjs, NOT here (H2 fix).
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
    // signInWithMagicLink synchronously fires the open-external IPC on its
    // first line; no awaits live BEFORE that postMessage in either this
    // component or the orchestrator. Pitfall 3 invariant.
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
            ? 'Сессия входа истекла за 10 минут. Попробуйте снова.'
            : 'Не удалось завершить вход. Попробуйте снова.',
      });
      return;
    }
    if (session) onSignedIn();
  };

  // Timeout/error UI replaces the main content per UI-SPEC §"Screen S1"
  // Edge cases. ErrorCard exposes its own retry CTA that clears the error
  // and returns the view to the fresh S1 state.
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
        padding: '32px 24px 96px', // bottom padding leaves room for HelpPill
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <h1
        id="signin-title"
        style={{
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.3,
          color: 'var(--color-text)',
          marginBottom: 12,
        }}
      >
        Войдите в Maxytest
      </h1>

      <p
        style={{
          fontSize: 14,
          fontWeight: 400,
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
          maxWidth: 320,
          marginBottom: 32,
        }}
      >
        Мы откроем ваш браузер для входа. После входа вернитесь сюда — плагин запомнит вход.
      </p>

      <PrimaryCta label="Войти в Maxytest" onClick={handleSignIn} pending={pending} />
    </main>
  );
}
