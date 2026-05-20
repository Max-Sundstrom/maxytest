// apps/web/eslint.config.js — extends the root flat config with the
// workspace-specific trust-boundary rules from Plan 01-06.
//
// Two-Supabase-client boundary (RESEARCH.md Pattern 1 / Plan 01-05 §"Affects"):
//   - Designer code (anything under _app/* + components/builder + components/studies)
//     imports `@/lib/supabase/auth`.
//   - Runner code (everything under _public/* + components/runner + the public
//     query helpers in lib/queries/sessions.ts + lib/queries/responses.ts)
//     imports `@/lib/supabase/anon`.
// Crossing those imports tramples the runner's `maxytest-runner-auth` storageKey
// onto the designer's session (and vice versa) — see Anti-Pattern 5 in RESEARCH.md.
//
// Service-role boundary (T-01-06-01):
//   - `SUPABASE_SERVICE_ROLE_KEY` must never appear in client bundle code.
//     It lives in Edge Functions (supabase/functions/**) and tests/rls/setup.ts
//     where the literal name is referenced for `process.env.SUPABASE_SERVICE_ROLE_KEY`.
//
// Phase 2 (Plan 02-01): extended runner-tree glob to cover PrototypeViewer/,
// lib/queries/events.ts, lib/queries/prototypes-runner.ts (W-06), lib/runner/.
// See RESEARCH.md Pitfall 6 — explicit Wave 1 task, never bundle later.
//
// Phase 4 (Plan 04-07): extended the same glob to cover the public-share
// surface — components/public/** (PublicReportShell) + the matching route
// files _public.share.$token.tsx + _public.share.gone.tsx are already
// covered by the existing _public.** glob, but components/public/** is a
// NEW tree introduced in 04-07 that must respect the anon-tier boundary.

import rootConfig from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...rootConfig,

  // 1. Runner-tree trust boundary — never import the designer auth client.
  {
    files: [
      'src/routes/_public.**',
      'src/routes/_public/**',
      'src/components/runner/**',
      'src/components/runner/blocks/PrototypeViewer/**',
      // Phase 4 (Plan 04-07): public-share component tree.
      'src/components/public/**',
      'src/lib/queries/sessions.ts',
      'src/lib/queries/responses.ts',
      'src/lib/queries/events.ts',
      'src/lib/queries/prototypes-runner.ts',
      'src/lib/runner/**',
      'src/lib/stores/runner.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase/auth',
              message:
                'Runner / public-share code must use supabaseAnon from @/lib/supabase/anon, never the designer auth client. See RESEARCH.md Anti-Pattern 5.',
            },
          ],
        },
      ],
    },
  },

  // 2. Browser-bundle service-role-key boundary.
  //    Forbid the literal string `SUPABASE_SERVICE_ROLE_KEY` AND direct
  //    `process.env.*` access in `apps/web/src/**`. The Vite browser bundle
  //    has no `process.env`; use `import.meta.env.VITE_*` instead.
  //    Tests/, edge functions, and configs are exempt.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Keep the dangerouslySetInnerHTML rule from the root config — flat
        // config rule overrides replace the entire array, so we re-state it.
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML is banned by default — escape user input via React text nodes.',
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'process.env is not available in the Vite browser bundle. Use import.meta.env.VITE_* (only VITE_-prefixed vars are exposed to the client).',
        },
        {
          selector: "Literal[value='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            'Service-role key must not appear in client code — it lives only in supabase/functions/* Edge Functions. The browser bundle uses the anon key (VITE_SUPABASE_ANON_KEY) gated by RLS.',
        },
        {
          selector: 'TemplateElement[value.raw=/SUPABASE_SERVICE_ROLE_KEY/]',
          message:
            'Service-role key must not appear in client code (even inside a template literal). See T-01-06-01.',
        },
      ],
    },
  },
);
