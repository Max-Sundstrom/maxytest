import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.gen';

/**
 * Designer Supabase client — RESEARCH.md Pattern 1 (two-client boundary).
 *
 * Used by every `_app/*` route + Studio-side code paths. Holds the designer's
 * authenticated JWT in `localStorage` under Supabase's default storageKey
 * (`sb-<ref>-auth-token`).
 *
 * Distinct from `supabaseAnon` (./anon.ts) which uses a separate storageKey so
 * the runner's anonymous session never overwrites the designer session in the
 * same browser (Anti-Pattern 5).
 *
 * Auth flags (Pattern 1):
 *   - persistSession: keep the session across reloads (AUTH-02)
 *   - autoRefreshToken: silent refresh before JWT expiry
 *   - detectSessionInUrl: handles the magic-link callback in /auth/callback
 *   - flowType: 'pkce' — required for SPAs per Supabase Auth docs and the
 *                        single most important PKCE-related flag for D-02
 */
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);
