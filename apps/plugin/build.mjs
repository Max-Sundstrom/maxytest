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
//     iframe-side supabase-js client can connect. Resolved with the
//     following precedence (first non-empty wins):
//       1. Process env (`SUPABASE_URL` / `SUPABASE_ANON_KEY`)
//       2. apps/web/.env.local mapped from `VITE_SUPABASE_URL` /
//          `VITE_SUPABASE_ANON_KEY` (the same project the web app uses)
//     If both layers come back empty the build aborts with a friendly
//     error — supabase-js would otherwise throw `supabaseUrl is required`
//     synchronously at module load inside the Figma iframe, producing a
//     blank white screen with no visible diagnostic. See debug session
//     `plugin-blank-white-screen` (2026-05-17).
//   - VIEWER_URL — the web origin the plugin opens via figma.openExternal
//     for magic-link sign-in. Defaults to http://localhost:5173 (Vite dev
//     server). The fallback lives ONLY here — plugin src code reads
//     `process.env.VIEWER_URL` as a literal-replaced constant (H2 fix
//     per plan; plugin sandbox/iframe has no real process.env at runtime).

import { build, context } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// ─── Env resolution ──────────────────────────────────────────────────────
//
// Parse a minimal `KEY=VALUE` .env file. We do NOT pull in `dotenv` — this
// keeps the plugin build pipeline zero-dependency (RESEARCH Pitfall 7).
function parseDotenv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const webEnvLocal = parseDotenv(resolve(__dirname, '../web/.env.local'));

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() || webEnvLocal.VITE_SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY?.trim() || webEnvLocal.VITE_SUPABASE_ANON_KEY?.trim() || '';
const VIEWER_URL =
  process.env.VIEWER_URL?.trim() || webEnvLocal.VITE_VIEWER_URL?.trim() || 'http://localhost:5173';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    [
      '',
      '[plugin] BUILD ABORTED — Supabase credentials missing.',
      '',
      'The plugin UI bundle needs SUPABASE_URL and SUPABASE_ANON_KEY at build',
      'time. Otherwise supabase-js throws "supabaseUrl is required" at module',
      'load inside the Figma iframe and the plugin renders a blank white screen.',
      '',
      'Fix one of:',
      '  1. Make sure apps/web/.env.local has VITE_SUPABASE_URL and',
      '     VITE_SUPABASE_ANON_KEY filled in. The plugin reads them from there.',
      '  2. Or export them in your shell before building:',
      '     export SUPABASE_URL=https://...supabase.co',
      '     export SUPABASE_ANON_KEY=eyJhbGciOi...',
      '',
      `Resolved values:`,
      `  SUPABASE_URL      = ${SUPABASE_URL ? '<set>' : '<empty>'}`,
      `  SUPABASE_ANON_KEY = ${SUPABASE_ANON_KEY ? '<set>' : '<empty>'}`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const defineEnv = {
  'process.env.SUPABASE_URL': JSON.stringify(SUPABASE_URL),
  'process.env.SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
  'process.env.VIEWER_URL': JSON.stringify(VIEWER_URL),
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
  // CRITICAL: do NOT use `template.replace(needle, '<script>' + uiJs + '</script>')`.
  // String.prototype.replace interprets `$&`, `` $` ``, `$'`, `$n` and `$$` inside
  // the SECOND argument as replacement tokens. The Zod bundle contains template
  // literals with `$` followed by `` ` `` (regex anchors next to template-literal
  // closures), so `.replace()` would expand `` $` `` to "everything before the
  // marker" — silently splicing the entire HTML template back INTO the bundled
  // JS. The browser then encounters a stray `</script>` mid-bundle and the
  // plugin fails with "missing ) after argument list" in Figma's iframe.
  // Splitting + joining sidesteps the special-token machinery entirely.
  const parts = template.split('<!--INLINE_JS-->');
  if (parts.length !== 2) {
    throw new Error("[plugin] ui.template.html must contain exactly one '<!--INLINE_JS-->' marker");
  }
  // Also defensively escape `</script` inside the bundle. The closing-tag
  // sequence triggers HTML parser state-changes regardless of where it lives,
  // so even with the replace bug above gone, a literal `</script` inside a JS
  // string would break the inline <script>. We split it across a concatenation
  // that JS sees as the same string but the HTML parser doesn't recognise.
  const safeUiJs = uiJs.replaceAll('</script', '<\\/script');
  const html = parts[0] + '<script>' + safeUiJs + '</script>' + parts[1];
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
