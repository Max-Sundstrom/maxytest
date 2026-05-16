// apps/plugin/eslint.config.js — Phase 02.2 Plan 01 scaffold.
//
// Extends ONLY the repo-root flat config (../../eslint.config.js). It does NOT
// inherit `apps/web/eslint.config.js`'s two-Supabase-client trust-boundary rule
// (D-04c, D-05e in 02.2-CONTEXT.md):
//
//   - The plugin has a single dedicated supabase client wired to a custom
//     `clientStorage` storage adapter — it is neither the "runner anon" client
//     nor the "studio auth" client of apps/web/. The two-client rule would
//     fire false-positives here.
//
//   - The plugin uses `process.env.SUPABASE_URL` / `SUPABASE_ANON_KEY` /
//     `VIEWER_URL` literally substituted at build time via esbuild --define
//     (see build.mjs). apps/web's `process.env` ban is scoped to
//     `apps/web/src/**` via its own `files:` array — it does not apply here.
//
// What this config DOES add on top of the root:
//
//   1. `no-restricted-imports` patterns forbidding any import that walks into
//      `**/apps/web/**`. Per D-04b, Zod schemas are physically duplicated
//      between apps/web and apps/plugin (accepted debt — extraction to
//      packages/blocks deferred to Phase 7). Cross-app imports would defeat
//      that boundary.
//
//   2. `no-restricted-syntax` selector that bans the literal string
//      `SUPABASE_SERVICE_ROLE_KEY` anywhere in plugin source. The plugin
//      writes via SECURITY DEFINER RPC using the caller's JWT — the
//      service-role key has no legitimate reason to appear in the plugin
//      bundle. This mirrors apps/web's protection T-01-06-01 / T-02.2-01-02.

import rootConfig from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...rootConfig,

  // Plugin-scoped rules — apply only inside apps/plugin/src/.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/web/**'],
              message:
                'Plugin must not import from apps/web/. Duplicate schemas physically per D-04b (02.2-CONTEXT.md).',
            },
          ],
        },
      ],

      'no-restricted-syntax': [
        'error',
        // Keep the root dangerouslySetInnerHTML ban (flat config rule overrides
        // replace the entire array, so we re-state it here).
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML is banned by default — escape user input via React text nodes.',
        },
        {
          selector: "Literal[value='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            'Service-role key must not appear in plugin bundle — plugin uses caller JWT via SECURITY DEFINER RPC (T-02.2-01-02).',
        },
        {
          selector: 'TemplateElement[value.raw=/SUPABASE_SERVICE_ROLE_KEY/]',
          message:
            'Service-role key must not appear in plugin bundle (even inside a template literal). See T-02.2-01-02.',
        },
      ],
    },
  },
);
