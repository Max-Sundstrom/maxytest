// Root ESLint flat config (Plan 01-06 Task 1).
// Shared across the workspace; apps/web/eslint.config.js extends this set
// with workspace-specific boundary rules.
//
// Migration ref: https://eslint.org/docs/latest/use/configure/migration-guide
// typescript-eslint flat config: https://typescript-eslint.io/getting-started

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // 1. Ignore generated + build outputs everywhere.
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.tsbuildinfo',
      'apps/web/src/routeTree.gen.ts',
      'supabase/.temp/**',
      'node_modules/**',
    ],
  },

  // 2. Base JS rules.
  js.configs.recommended,

  // 3. TypeScript rules (non-type-checked variant — fast, suitable for CI).
  ...tseslint.configs.recommended,

  // 4. React Hooks + React Refresh — register plugin so existing
  //    `eslint-disable-next-line react-hooks/exhaustive-deps` directives in
  //    Phase 1 source code resolve. react-hooks v7 ships
  //    `configs.recommended.rules` keyed under the `react-hooks/*` prefix.
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
  },
  {
    files: ['apps/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // 5. Workspace defaults.
  {
    rules: {
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Allow {} for object intersection types — needed in TanStack Router
      // generated tree and route options.
      '@typescript-eslint/no-empty-object-type': 'off',
      // Forbid <element dangerouslySetInnerHTML> outside explicit allow-list
      // (currently nothing in Phase 1 needs it; revisit per-file if Phase 2+
      // ships rich text that requires raw HTML).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML is banned by default — escape user input via React text nodes. If you must use it, add an explicit ESLint disable with a security review note.',
        },
      ],
    },
  },

  // 6. Test files get a slightly looser rule set so unused fixtures and
  //    `any` in supabase-js generated types don't drown out signal.
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
