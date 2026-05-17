// apps/plugin/src/lib/supabase.ts — Phase 02.2 Plan 05 Task 2.
//
// UI-iframe Supabase client. Distinct from the designer client
// (apps/web/src/lib/supabase/auth.ts) — different runtime, different
// storage backend (figma.clientStorage via the IPC bridge), different
// auth flow (magic-link + Realtime broadcast, NOT pkce in-iframe).
//
// CRITICAL — DO NOT IMPORT FROM apps/web/* ANYWHERE IN apps/plugin/src/*.
// The plugin runs in a Figma iframe; the web app is irrelevant at runtime
// and a static cross-app import would also trip the workspace ESLint rule
// installed in Plan 01 Task 2.
//
// Env injection (build-time):
//   `process.env.{SUPABASE_URL,SUPABASE_ANON_KEY,VIEWER_URL}` are literal-
//   substituted by esbuild's `--define` in apps/plugin/build.mjs. The
//   `declare const process` below gives TypeScript the shape so the build
//   does not need `@types/node`. We list ALL three keys here (even though
//   this file only consumes the first two) so any file in the UI bundle
//   that imports from `./supabase` inherits the typing — SignInView (Task
//   4) reads `process.env.VIEWER_URL` and would otherwise need a duplicate
//   `declare`.

declare const process: {
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    VIEWER_URL: string;
  };
};

import { createClient } from '@supabase/supabase-js';

import { figmaClientStorage } from './storage-bridge';

/**
 * Plugin Supabase client.
 *
 * Configuration choices (per PATTERNS §8 + RESEARCH §"figma.clientStorage as
 * supabase-js Custom Storage Adapter"):
 *
 * - `storage: figmaClientStorage` — persist the session JSON via the IPC
 *   round-trip to the sandbox, which stores it under
 *   `figma.clientStorage` (per-Figma-user, survives across files).
 * - `persistSession: true` — same semantics as the web client; supabase-js
 *   will write to our custom storage on sign-in and read it on init.
 * - `autoRefreshToken: true` — silent refresh before access-token expiry;
 *   refresh path also flows through our custom storage so the rotated
 *   refresh_token is persisted.
 * - `detectSessionInUrl: false` — the plugin iframe has no URL bar; magic
 *   link is handled by the web route (Plan 04) which broadcasts the
 *   session over Realtime. Leaving the default `true` here would have
 *   supabase-js attempt to parse `window.location` on init — harmless but
 *   noisy.
 * - No `flowType: 'pkce'` — we are NOT running a magic-link redirect flow
 *   INSIDE the plugin; we are receiving the session via Realtime broadcast.
 *   PKCE would require a redirect URL that the iframe never owns.
 * - No `<Database>` generic — the plugin does not run `supabase gen types`
 *   (it never queries application tables directly; it only uses auth +
 *   realtime + RPC, all of which accept loose argument typing).
 */
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    storage: figmaClientStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
