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

/**
 * Return the current cached anon access token, if any. Returns `null` on
 * missing-session, getSession error, or thrown exceptions — never throws.
 *
 * Plan 02-08 W-05: EventBuffer's pagehide handler used to parse
 * `localStorage['maxytest-runner-auth']` JSON directly to set the
 * `Authorization` header on `fetch keepalive` / `sendBeacon`. That coupled
 * the buffer to supabase-js's internal storage shape, which is allowed to
 * change between minor versions. This helper isolates the coupling to one
 * well-tested function.
 *
 * Implementation: supabase-js caches the session in memory after the first
 * `getSession()` call; subsequent calls are effectively synchronous (Map
 * lookup). We `await` it anyway so the helper is typed
 * `Promise<string | null>` — callers in fast-paths can chain `.then(...)`
 * without an extra microtask penalty in the cached case.
 */
export async function getCurrentAnonAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAnon.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
