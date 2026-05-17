// apps/plugin/src/ui.tsx — Phase 02.2 Plan 05 Task 4.
//
// UI iframe entry point. Replaces the Plan 01 smoke shell with a real
// state machine that decides between:
//
//   loading                  — silent restoreCachedSession() roundtrip
//   sign-in                  — SignInView (S1)
//   authenticated-placeholder — Plan 07 will replace this with the real
//                              flow picker (S2-S5). For Plan 05 it just
//                              proves the handshake worked.
//
// CSS strategy: the global stylesheet (`cssString` from styles.css.ts) is
// injected ONCE via a `<style>` element in document.head from a top-level
// useEffect. Components stay free of Tailwind and `<style>` tags.
//
// IPC fire-and-forget helper `sendIpc` wraps `parent.postMessage` so the
// individual handlers stay tiny. The sandbox receives these and routes
// them via code.ts (Plan 05 Task 1).

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import DotsLoader from './components/DotsLoader';
import HelpPill from './components/HelpPill';
import PluginHeader from './components/PluginHeader';
import SignInView from './components/SignInView';
import { restoreCachedSession, signOut } from './lib/auth';
import { cssString } from './styles.css';

// Placeholder README URL. Plan 07 will finalise this when the public repo
// is stable; until then it just demonstrates the open-external IPC plumbing.
const HELP_URL =
  'https://github.com/anthropics/maxytest-placeholder/blob/main/apps/plugin/README.md';

type Screen = 'loading' | 'sign-in' | 'authenticated-placeholder';

function sendIpc(message: { type: string; [k: string]: unknown }): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  // === Effect 1: inject the global stylesheet ONCE on mount.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = cssString;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // === Effect 2: silent cached-session reuse on first mount (D-02b).
  // Reads supabase-js's session via the custom storage adapter; if a valid
  // (or refreshable) session exists, skip SignIn entirely. Otherwise drop
  // straight to S1.
  useEffect(() => {
    void (async () => {
      const ok = await restoreCachedSession();
      setScreen(ok ? 'authenticated-placeholder' : 'sign-in');
    })();
  }, []);

  // === Effect 3: Esc closes the plugin (UI-SPEC §"Interaction Details"
  // keyboard shortcuts). We attach at the window level so any focus state
  // catches the keypress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sendIpc({ type: 'close' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closePlugin = () => sendIpc({ type: 'close' });

  // === Render branches.
  // The outer wrapper is position:relative so HelpPill's absolute pinning
  // is anchored to the plugin surface (not document.body).
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      {screen === 'loading' && (
        // Silent check — no UI noise per UI-SPEC §"Cached-session silent
        // reuse". A bare DotsLoader gives a visual hint if the round trip
        // takes longer than ~200 ms (rare; clientStorage is essentially
        // instant once the iframe boots).
        <main
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DotsLoader />
        </main>
      )}

      {screen === 'sign-in' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <SignInView onSignedIn={() => setScreen('authenticated-placeholder')} />
          <HelpPill onClick={() => sendIpc({ type: 'open-external', url: HELP_URL })} />
        </>
      )}

      {screen === 'authenticated-placeholder' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <main
            style={{
              flex: 1,
              padding: '32px 24px 96px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 16,
            }}
          >
            <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
              Plan 07: Prototype flow picker и publish pipeline
            </h1>
            <p
              style={{
                fontSize: 14,
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              Сессия восстановлена через figma.clientStorage. В Plan 07 этот экран превратится в
              flow-picker (S2) + progress (S3) + success (S4) / error (S5).
            </p>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                setScreen('sign-in');
              }}
              style={{
                marginTop: 16,
                height: 36,
                padding: '0 16px',
                borderRadius: 9999,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: 14,
                fontWeight: 500,
                alignSelf: 'flex-start',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </main>
          <HelpPill onClick={() => sendIpc({ type: 'open-external', url: HELP_URL })} />
        </>
      )}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
