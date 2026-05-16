// apps/plugin/src/ui.tsx — Phase 02.2 Plan 01 SMOKE entrypoint.
//
// Smoke version — full 5-screen UI in Plan 05 (S1 Sign-in) + Plan 07
// (S2 Picker → S3 Progress → S4 Success → S5 Error).
//
// Runs in the Figma plugin UI IFRAME (regular browser context with DOM +
// fetch). Renders a minimal "Hello Maxytest" page + a Close button that
// posts back to the sandbox (code.ts) so figma.closePlugin() runs there.
//
// Styling uses inline CSS / inline <style> per 02.2-UI-SPEC §"CSS-delivery"
// (no CDN — manifest.networkAccess forbids external URLs). Minimal palette
// lifted from UI-SPEC §"Color": white surface, near-black text, Inter
// font with system-ui fallback (Inter is loaded by Figma; no @fontsource
// needed in the iframe).

import { createRoot } from 'react-dom/client';

function SmokeApp() {
  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: 24,
        background: '#FFFFFF',
        color: '#18181B',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        Hello Maxytest
      </h1>

      <p
        style={{
          margin: 0,
          color: '#71717A',
          fontSize: 12,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        Smoke render — Phase 02.2 Plan 01. The real sign-in flow lands in Plan 05.
      </p>

      <button
        type="button"
        onClick={() => {
          parent.postMessage({ pluginMessage: { type: 'close' } }, '*');
        }}
        style={{
          appearance: 'none',
          height: 48,
          minWidth: 200,
          padding: '0 20px',
          borderRadius: 9999,
          border: 'none',
          background: '#3D5BFE',
          color: '#FFFFFF',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<SmokeApp />);
}
