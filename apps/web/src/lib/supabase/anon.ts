import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.gen';

/**
 * Runner Supabase client — RESEARCH.md Pattern 1 (two-client boundary).
 *
 * Used ONLY by the public runner tree (`_public/r.$token.tsx` + descendants,
 * Plan 01-05). Acquires an anonymous JWT via `supabaseAnon.auth.signInAnonymously()`
 * on first visit (AUTH-04) and stores it under a DISTINCT `storageKey` so it
 * never overwrites the designer's session in `./auth.ts` (Anti-Pattern 5).
 *
 * Plan 01-06 adds an ESLint rule forbidding this module from being imported
 * outside `apps/web/src/routes/_public/**` + runner helpers.
 */
export const supabaseAnon = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      storageKey: 'maxytest-runner-auth',
    },
  },
);
