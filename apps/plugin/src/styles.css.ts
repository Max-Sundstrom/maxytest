// apps/plugin/src/styles.css.ts — design-system v1 (handoff-aligned, 2026-05-17).
//
// Single global CSS string injected once by ui.tsx via
// `<style>{cssString}</style>`. This lives as a TS module (not a .css file)
// for three reasons:
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
// Token names mirror apps/web/src/styles/tokens.css so the plugin and the
// web app share the same vocabulary. Skin model: paper (default) / white /
// dark — swap by writing `data-skin` on <html>. The plugin's "header strip"
// uses --color-bg-header = #9E5E72 (plum, handoff §Plugin spec).
//
// IMPORTANT: do not add Tailwind directives, @import statements, or any
// rule that depends on external resources. Figma's iframe ships a system
// font fallback; IBM Plex Sans is the design target, system-ui fallback
// handles the rest (Figma doesn't expose @fontsource self-hosting).

export const cssString = `
/* ═══ Skin: paper (default — warm researcher mood) ═══ */
:root,
:root[data-skin='paper'] {
  --paper-0: #FBF8F3;
  --paper-1: #F4EFE7;
  --paper-2: #EBE4D7;
  --paper-3: #E0D7C7;

  --ink-0: #1C1A15;
  --ink-1: #3D3833;
  --ink-2: #6B645B;
  --ink-3: #9A9388;
  --ink-4: #C7BBA8;

  --bg-page:         var(--paper-0);
  --bg-card:         #FFFFFF;
  --bg-input:        var(--paper-1);
  --bg-input-strong: var(--paper-2);
  --bg-chip:         var(--paper-2);

  --text-1: var(--ink-0);
  --text-2: var(--ink-2);
  --text-3: var(--ink-3);

  --border-1:      var(--paper-3);
  --border-2:      var(--paper-2);
  --border-strong: var(--ink-4);
}

/* ═══ Skin: white (clean neutral) ═══ */
:root[data-skin='white'] {
  --paper-0: #FFFFFF;
  --paper-1: #FAFAFA;
  --paper-2: #F4F4F5;
  --paper-3: #E5E7EB;

  --ink-0: #111111;
  --ink-1: #1F2328;
  --ink-2: #6B7280;
  --ink-3: #9CA3AF;
  --ink-4: #D1D5DB;

  --bg-page:         var(--paper-0);
  --bg-card:         #FFFFFF;
  --bg-input:        var(--paper-1);
  --bg-input-strong: var(--paper-2);
  --bg-chip:         var(--paper-2);

  --text-1: var(--ink-0);
  --text-2: var(--ink-2);
  --text-3: var(--ink-3);

  --border-1:      var(--paper-3);
  --border-2:      var(--paper-2);
  --border-strong: var(--ink-4);
}

/* ═══ Skin: dark ═══ */
:root[data-skin='dark'] {
  --paper-0: #14130F;
  --paper-1: #1B1A15;
  --paper-2: #25231D;
  --paper-3: #34312A;

  --ink-0: #F4EFE7;
  --ink-1: #D8D0C2;
  --ink-2: #9A9388;
  --ink-3: #6B645B;
  --ink-4: #3D3833;

  --bg-page:         var(--paper-0);
  --bg-card:         var(--paper-1);
  --bg-input:        var(--paper-2);
  --bg-input-strong: var(--paper-3);
  --bg-chip:         var(--paper-2);

  --text-1: var(--ink-0);
  --text-2: var(--ink-1);
  --text-3: var(--ink-2);

  --border-1:      var(--paper-3);
  --border-2:      var(--paper-2);
  --border-strong: var(--ink-4);
}

/* ═══ Constants — accents, functional, plugin header, spacing ═══ */
:root {
  /* Accent — constant across skins (moss).
     Swapped from terra 2026-05-17 per user preference; terra demoted to --color-accent-2. */
  --color-accent:          #7A9F6E;
  --color-accent-hover:    #6A8B5E;
  --color-accent-disabled: #B5C9AB;
  --color-accent-2:        #D97757;
  --color-accent-3:        #5E8CB2;
  --color-accent-4:        #C8A04A;
  --color-accent-5:        #9E5E72;

  /* Functional */
  --color-success:    #5C8A4A;
  --color-warn:       #C68A2E;
  --color-danger:     #B85450;

  /* Plugin-specific: dark plum header strip (handoff §Plugin spec) */
  --color-bg-header:    #9E5E72;
  --color-text-invert:  #FFFFFF;

  /* Back-compat aliases for existing plugin components
     (PluginHeader/PrimaryCta/ErrorCard/DotsLoader/HelpPill/SignInView). */
  --color-bg:            var(--bg-page);
  --color-bg-muted:      var(--bg-input);
  --color-text:          var(--text-1);
  --color-text-muted:    var(--text-2);
  --color-border:        var(--border-1);
  --color-border-strong: var(--border-strong);

  --color-error-bg:     #FCE8E6;
  --color-error-border: #F5C2C0;
  --color-error-text:   var(--text-1);
  --color-error-icon:   var(--text-1);

  --color-success-bg:   var(--bg-card);
  --color-warning-mark: #EF4444;

  /* Spacing scale (4 px grid) */
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

  /* Geometry constants — handoff §"Form-control geometry — 32px height" */
  --control-h: 32px;
  --touch-h:   44px;
  --cta-h:     48px;
  --plugin-header-h: 44px;

  /* Radius — 8px lock */
  --radius-sm: 4px;
  --radius:    8px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}

/* Reset — minimal; Figma iframe defaults are sane but margins on body
   would push content off-screen in the 360×540 surface. */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  font-family: 'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--text-1);
  background: var(--bg-page);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  /* Soft cross-fade when data-skin swaps. */
  transition:
    background-color 240ms cubic-bezier(0.2, 0.7, 0.3, 1),
    color 240ms cubic-bezier(0.2, 0.7, 0.3, 1);
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

/* Focus-visible — accent ring on all keyboard-focusable elements */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(122, 159, 110, 0.22);
}

/* Default button reset — components apply their own styles inline. */
button {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  cursor: pointer;
}

/* DotsLoader pulse animation. 1.2s cycle; each dot offsets by 0 / 160ms / 320ms. */
@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.3; }
  40%           { opacity: 1; }
}

/* Reduced-motion override — handoff §"prefers-reduced-motion".
   Replaces the animated dots with static opacity and disables every
   transition/animation app-wide. */
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
