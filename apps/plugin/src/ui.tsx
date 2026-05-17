// apps/plugin/src/ui.tsx — design-system v1 rewrite (2026-05-17).
//
// State machine for the full 4-screen handoff Pathway flow plus the pre-flow
// sign-in (our integration needs auth first; handoff pre-supposes signed-in).
//
//   loading       — silent restoreCachedSession() roundtrip
//   sign-in       — SignInView (Screen 0; pre-flow auth)
//   paste-url     — PasteUrlView (Screen 1; handoff S01)
//   choose-proto  — ChoosePrototypeView (Screen 2; handoff S02)
//   importing     — interstitial during the publish RPC; DotsLoader
//   success       — SuccessView (Screen 3; handoff S03)
//   error         — ImportErrorView (Screen 4; handoff S04)
//
// Plan 02.2-06 contract preserved (auth handshake + IPC plumbing). Plan
// 02.2-07 wires the actual sandbox import pipeline into `runImport()` below
// — currently stubbed so the visual flow is end-to-end testable in browser
// preview.
//
// Pitfall 3 (user-gesture) reinforced inside SignInView's handleSignIn —
// figma.openExternal must fire synchronously from the click. The state
// machine merely transitions screens.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import ChoosePrototypeView from './components/ChoosePrototypeView';
import DotsLoader from './components/DotsLoader';
import ImportErrorView from './components/ImportErrorView';
import PasteUrlView from './components/PasteUrlView';
import PluginHeader from './components/PluginHeader';
import SignInView from './components/SignInView';
import SuccessView from './components/SuccessView';
import { restoreCachedSession, signOut } from './lib/auth';
import { cssString } from './styles.css';

// Placeholder README URL. Plan 02.2-08 will finalise this when the public
// repo is stable.
const HELP_URL =
  'https://github.com/anthropics/maxytest-placeholder/blob/main/apps/plugin/README.md';

interface PrototypeChoice {
  id: string;
  name: string;
}

type Screen =
  | { kind: 'loading' }
  | { kind: 'sign-in' }
  | { kind: 'paste-url' }
  | { kind: 'choose-proto'; url: string; prototypes: PrototypeChoice[] }
  | { kind: 'importing' }
  | { kind: 'success'; shareCode: string }
  | { kind: 'error'; protoName?: string; heading: string; body: string };

function sendIpc(message: { type: string; [k: string]: unknown }): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

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
  useEffect(() => {
    void (async () => {
      const ok = await restoreCachedSession();
      setScreen(ok ? { kind: 'paste-url' } : { kind: 'sign-in' });
    })();
  }, []);

  // === Effect 3: Esc closes the plugin (UI-SPEC §"Interaction Details").
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
  const openHelp = () => sendIpc({ type: 'open-external', url: HELP_URL });

  // ─── Flow callbacks ────────────────────────────────────────────────────

  /**
   * paste-url → choose-proto.
   *
   * Real implementation (Plan 02.2-07): post `{type:'inspect-url', url}` to
   * the sandbox, which parses prototype frames out of the active Figma file
   * (sandbox-side) OR falls back to a REST inspection. Sandbox replies with
   * `{type:'inspect-result', prototypes:[{id,name}, …]}` over postMessage.
   *
   * For Plan 02.3-06 (this commit) we stub: a single prototype synthesised
   * from the URL's file-key segment, so the UI flow is exerciseable in
   * browser preview before the import pipeline lands.
   */
  const onUrlContinue = (url: string) => {
    const fileKey = extractFileKey(url) ?? 'prototype';
    const prototypes: PrototypeChoice[] = [{ id: fileKey, name: deriveName(fileKey) }];
    setScreen({ kind: 'choose-proto', url, prototypes });
  };

  /**
   * choose-proto → importing → success | error.
   *
   * Real implementation (Plan 02.2-07): post `{type:'publish-prototype',
   * url, prototypeId, optimizeImages}` to the sandbox; sandbox calls
   * `publish_prototype_from_plugin` RPC + uploads frame PNGs; replies with
   * `{type:'publish-success', shareCode}` or `{type:'publish-error',
   * code, message}`.
   *
   * Stub for Plan 02.3-06: 1.4s simulated work, then either success with a
   * deterministic 6-char code derived from the prototype id, or error if
   * the URL contains the literal substring "error-demo" (handy for visual
   * QA of the error branch).
   */
  const onImport = (proto: PrototypeChoice, _optimizeImages: boolean) => {
    setScreen({ kind: 'importing' });
    // TODO Plan 02.2-07: replace setTimeout stub with sandbox IPC roundtrip.
    setTimeout(() => {
      if ((screen as { url?: string }).url?.includes('error-demo')) {
        setScreen({
          kind: 'error',
          protoName: proto.name,
          heading: 'Возникла ошибка во время импорта прототипа',
          body: 'Доступ к прототипу ограничен. Открой настройки шеринга в Figma и поставь «Anyone with the link can view».',
        });
        return;
      }
      const shareCode = makeShareCode(proto.id);
      setScreen({ kind: 'success', shareCode });
    }, 1400);
  };

  // ─── Render branches ───────────────────────────────────────────────────

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
      {screen.kind === 'loading' && (
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

      {screen.kind === 'sign-in' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <SignInView onSignedIn={() => setScreen({ kind: 'paste-url' })} />
        </>
      )}

      {screen.kind === 'paste-url' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <PasteUrlView onContinue={onUrlContinue} />
        </>
      )}

      {screen.kind === 'choose-proto' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <ChoosePrototypeView
            prototypes={screen.prototypes}
            onBack={() => setScreen({ kind: 'paste-url' })}
            onImport={onImport}
            onHelp={openHelp}
          />
        </>
      )}

      {screen.kind === 'importing' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              padding: 20,
              background: '#FFFFFF',
            }}
          >
            <DotsLoader />
            <p
              role="status"
              aria-live="polite"
              style={{
                font: '500 14px/20px var(--font-sans, "IBM Plex Sans"), system-ui',
                color: '#6B7280',
                margin: 0,
              }}
            >
              Импортирую прототип…
            </p>
            <p
              style={{
                font: '400 12px/18px var(--font-sans, "IBM Plex Sans"), system-ui',
                color: '#9CA3AF',
                margin: 0,
                textAlign: 'center',
                maxWidth: 260,
              }}
            >
              Парсю фреймы, рендерю PNG, загружаю в Maxytest. Обычно 5-15 секунд.
            </p>
          </main>
        </>
      )}

      {screen.kind === 'success' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <SuccessView
            shareCode={screen.shareCode}
            onBack={() => setScreen({ kind: 'paste-url' })}
          />
        </>
      )}

      {screen.kind === 'error' && (
        <>
          <PluginHeader onClose={closePlugin} />
          <ImportErrorView
            protoName={screen.protoName}
            errorHeading={screen.heading}
            errorBody={screen.body}
            onRetry={() => setScreen({ kind: 'paste-url' })}
          />
        </>
      )}

      {/* Sign-out affordance — only when signed in, away from the error path. */}
      {(screen.kind === 'paste-url' ||
        screen.kind === 'choose-proto' ||
        screen.kind === 'success') && (
        <SignOutPill
          onClick={async () => {
            await signOut();
            setScreen({ kind: 'sign-in' });
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Extract Figma file key from a share URL. Returns undefined if no match. */
function extractFileKey(url: string): string | undefined {
  const m = url.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/);
  return m?.[1];
}

/** Derive a human display name from a file key for the stub flow. */
function deriveName(fileKey: string): string {
  return fileKey.length > 10 ? `${fileKey.slice(0, 8)}…` : fileKey;
}

/** Deterministic 6-char share code from a prototype id (stub only). */
function makeShareCode(id: string): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[hash % chars.length];
    hash = Math.floor(hash / chars.length);
  }
  return out;
}

// ─── SignOut affordance ─────────────────────────────────────────────────

function SignOutPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        height: 28,
        padding: '0 12px',
        background: 'transparent',
        color: '#9CA3AF',
        border: '1px solid #E5E7EB',
        borderRadius: 999,
        font: '500 11px/16px var(--font-mono, "IBM Plex Mono"), monospace',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'border-color 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E5E7EB')}
    >
      Выйти
    </button>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
