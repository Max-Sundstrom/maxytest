// apps/plugin/build.mjs — Phase 02.2 Plan 01 esbuild pipeline.
//
// Two entry points, one self-contained dist/ui.html. The recommended pattern
// per 02.2-RESEARCH.md §"esbuild Build Pipeline" and 02.2-PATTERNS.md §5:
//
//   1. code.ts → dist/code.js (Figma sandbox bundle — IIFE, target ES2017,
//      no DOM, no React).
//   2. ui.tsx → bundled to a JS string in memory, then inlined as a single
//      <script> tag inside dist/ui.html (Figma requires a self-contained
//      HTML file for the UI iframe — no external URLs except those
//      declared in manifest.networkAccess.allowedDomains; CSS/JS CDNs are
//      forbidden — see RESEARCH §"Pitfalls" #9).
//
// Watch mode:
//   - esbuild context-watch keeps code.ts continuously rebuilt.
//   - The UI inlining is poll-rebuilt every 1.5s via setInterval. KISS
//     pattern (RESEARCH lines 296-303): we do NOT add chokidar / @chialab
//     /esbuild-plugin-html — those are heavier than this 50-line script
//     and add supply-chain surface (RESEARCH Pitfall 7).
//
// Build-time env injection (esbuild --define):
//   - SUPABASE_URL, SUPABASE_ANON_KEY — required at plugin runtime so the
//     iframe-side supabase-js client can connect. Designer sets them in
//     their shell before running `pnpm --filter @maxytest/plugin build`.
//   - VIEWER_URL — the web origin the plugin opens via figma.openExternal
//     for magic-link sign-in. Defaults to http://localhost:5173 (Vite dev
//     server). The fallback lives ONLY here — plugin src code reads
//     `process.env.VIEWER_URL` as a literal-replaced constant (H2 fix
//     per plan; plugin sandbox/iframe has no real process.env at runtime).
//
// Smoke-build acceptability:
//   When env vars are unset (e.g. CI / first-time clone), the --define
//   substitutes empty strings ('') for SUPABASE_URL and SUPABASE_ANON_KEY.
//   That is OK for the smoke build (Plan 01) — the supabase client is not
//   instantiated until Plan 05. The smoke UI does not depend on these.

import { build, context } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const defineEnv = {
  'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL ?? ''),
  'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
  'process.env.VIEWER_URL': JSON.stringify(process.env.VIEWER_URL ?? 'http://localhost:5173'),
};

// 1. Bundle code.ts → dist/code.js (Figma sandbox — IIFE, no DOM, no React).
const codeOpts = {
  entryPoints: [resolve(__dirname, 'src/code.ts')],
  outfile: resolve(__dirname, 'dist/code.js'),
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'browser', // closest match; Figma sandbox is a JS-only runtime
  define: defineEnv,
};

// 2. Bundle ui.tsx → JS string in memory for HTML inlining.
//
// `jsx: 'automatic'` matches tsconfig.ui.json (`"jsx": "react-jsx"`) so esbuild
// emits `import { jsx as _jsx } from 'react/jsx-runtime'` calls instead of the
// classic `React.createElement(...)` form that would require `import React
// from 'react'` in every JSX file. Without this option the smoke UI bundle
// throws `Uncaught ReferenceError: React is not defined` at runtime in the
// Figma iframe — the heading would partial-render before the error halts
// the rest of the tree (Task 4 deviation, second iteration).
const uiOpts = {
  entryPoints: [resolve(__dirname, 'src/ui.tsx')],
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'browser',
  jsx: 'automatic',
  write: false, // hand back the JS as a string for HTML inlining
  define: defineEnv,
};

async function buildOnce() {
  await mkdir(resolve(__dirname, 'dist'), { recursive: true });
  await build(codeOpts);
  const uiResult = await build(uiOpts);
  const uiJs = uiResult.outputFiles[0].text;
  const template = await readFile(resolve(__dirname, 'src/ui.template.html'), 'utf8');
  const html = template.replace('<!--INLINE_JS-->', `<script>${uiJs}</script>`);
  await writeFile(resolve(__dirname, 'dist/ui.html'), html);
  console.log('[plugin] build complete');
}

if (watch) {
  // esbuild context-watch for code.ts; UI handled by a simple poll-rebuild
  // loop. Total cost: ~50ms per rebuild on a modern machine; trivial.
  const ctx = await context(codeOpts);
  await ctx.watch();
  console.log('[plugin] watching src/code.ts and rebuilding dist/ui.html every 1.5s');
  await buildOnce();
  setInterval(() => {
    buildOnce().catch((err) => {
      console.error('[plugin] watch rebuild failed:', err);
    });
  }, 1500);
} else {
  await buildOnce();
}
