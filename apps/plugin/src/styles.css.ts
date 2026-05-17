// apps/plugin/src/styles.css.ts — Phase 02.2 Plan 05 Task 3.
//
// Single global CSS string injected once by ui.tsx via
// `<style>{cssString}</style>` (PATTERNS §"styles.css.ts"). This lives as
// a TS module (not a .css file) for three reasons:
//
//   1. esbuild's UI bundle is inlined into a single HTML file — adding a
//      separate .css file would require a second build step and a `<link>`
//      tag, but Figma's manifest.networkAccess forbids non-allow-listed
//      origins; everything has to ship inside dist/ui.html.
//   2. Keeping the CSS as a TS string lets us export the type and import
//      it from ui.tsx with the rest of the React modules — no special
//      bundler loader configuration.
//   3. CSS variables (defined in :root here) are the single source of truth
//      for ALL component inline styles. Components reference them as
//      `var(--color-accent)` etc., so any palette tweak in this file is
//      automatically picked up by every component.
//
// CSS variables mirror UI-SPEC §"Полная палитра" (lines 119-155) and
// §"Spacing Scale". Animation rules cover §"Animation & Motion" — pulse-dot
// keyframes for DotsLoader + prefers-reduced-motion overrides.
//
// IMPORTANT: do not add Tailwind directives, @import statements, or any
// rule that depends on external resources. Inter font is shipped by
// Figma's iframe shell — system-ui fallback handles the rest.

export const cssString = `
:root {
  /* Surface (UI-SPEC §"60/30/10 base") */
  --color-bg:            #FFFFFF;
  --color-bg-muted:      #F4F4F5;
  --color-bg-header:     #0E0E0E;

  /* Text */
  --color-text:          #18181B;
  --color-text-muted:    #71717A;
  --color-text-invert:   #FFFFFF;

  /* Border */
  --color-border:        #E4E4E7;
  --color-border-strong: #D4D4D8;

  /* Accent (10% — reserved per UI-SPEC §"Accent") */
  --color-accent:          #3D5BFE;
  --color-accent-hover:    #2F4AE5;
  --color-accent-disabled: #A8B4FE;

  /* Semantic — error (alert-card) */
  --color-error-bg:     #FCE8E6;
  --color-error-border: #F5C2C0;
  --color-error-text:   #18181B;
  --color-error-icon:   #18181B;

  /* Semantic — success */
  --color-success:    #10B981;
  --color-success-bg: #FFFFFF;

  /* Semantic — warning mark */
  --color-warning-mark: #EF4444;

  /* Spacing scale (4 px grid; UI-SPEC §"Spacing Scale") */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-7:  32px;
  --space-8:  40px;
  --space-9:  48px;
  --space-10: 52px;
  --space-11: 64px;
  --space-12: 96px;
}

/* Reset — minimal; Figma iframe defaults are sane but margins on body
   would push content off-screen in the 360×540 surface. */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

body {
  /* 360×540 iframe — content scrolls vertically if it overflows */
  min-height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
}

#root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Focus-visible — accent ring on all keyboard-focusable elements
   (UI-SPEC §"PrimaryCta" + §"Interaction Details" focus order). */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(61, 91, 254, 0.2);
}

/* Default button reset — components apply their own styles inline. */
button {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  cursor: pointer;
}

/* DotsLoader pulse animation — UI-SPEC §"Animation & Motion" row 1.
   1.2s cycle; each dot offsets by 0 / 160ms / 320ms. */
@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.3; }
  40%           { opacity: 1; }
}

/* Reduced-motion override — UI-SPEC §"No motion preference".
   We replace the animated dots with static opacity and disable every
   transition/animation app-wide so users with vestibular sensitivities
   are not bombarded. */
@media (prefers-reduced-motion: reduce) {
  .dots-loader span {
    animation: none !important;
    opacity: 0.6 !important;
  }
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
`;
