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
//
// Task 4 deviation (Rule 1 — bug fix): the previous flex-centered layout
// with `minHeight: 100vh` + `gap: 24` overflowed the 540 px Figma iframe
// vertically, pushing the paragraph and Close button off-screen. Replaced
// with a deterministic top-to-bottom block layout (no flex, no 100vh, no
// gap), higher-contrast paragraph color (#18181B instead of muted #71717A),
// and a 2 px border on the Close button so the pill remains visible even
// if Figma's user-agent theming overrides the background fill.

import { createRoot } from 'react-dom/client';

function SmokeApp() {
  return (
    <main
      style={{
        // Predictable block layout — no flex, no 100vh, no gap.
        // Padding gives us breathing room from the iframe edges; margins
        // between children handle vertical rhythm.
        padding: 24,
        background: '#FFFFFF',
        color: '#18181B',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.3,
          // Top margin 0 (we already padded the main), bottom margin 16 px
          // separates heading from the paragraph below.
          marginTop: 0,
          marginBottom: 16,
          color: '#18181B',
        }}
      >
        Hello Maxytest
      </h1>

      <p
        style={{
          marginTop: 0,
          marginBottom: 24,
          // Bumped from muted #71717A (4.6:1 contrast) to primary #18181B
          // (16.1:1) so the smoke text cannot be missed during operator
          // verification — see Task 4 deviation.
          color: '#18181B',
          fontSize: 14,
          lineHeight: 1.5,
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
          // `display: block` makes the button a top-level block, so it
          // always sits below the paragraph regardless of inline-context.
          display: 'block',
          appearance: 'none',
          height: 48,
          minWidth: 200,
          padding: '0 20px',
          borderRadius: 9999,
          // 2 px solid border in the same accent — keeps the pill shape
          // visible even if Figma's iframe theming overrides `background`.
          border: '2px solid #3D5BFE',
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
