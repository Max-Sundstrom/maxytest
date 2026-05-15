/**
 * RLS test harness — STACK.md §7.2 (supabase-js test client, NOT pgTAP).
 *
 * Goals:
 *   - Each test runs against the **live** Supabase project (Cloud or local)
 *     because RLS is enforced at the Postgres + PostgREST layer; mocking
 *     defeats the purpose.
 *   - Tests construct **real** auth users via service-role then sign them in
 *     to obtain JWTs that downstream `userClient(jwt)` injects into the
 *     `Authorization: Bearer` header. This exercises the same code path the
 *     production app uses.
 *   - Service-role key is read from `process.env.SUPABASE_SERVICE_ROLE_KEY`;
 *     if absent, the test suite SKIPS (returns early with a friendly message)
 *     so CI / parallel agents without secrets stay green. Plan 01-06 will
 *     wire CI to inject the key from GitHub secrets.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/supabase/types.gen';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * True when the environment is fully provisioned to run RLS tests. Each
 * test file uses this to skip gracefully when secrets are missing instead
 * of failing hard.
 */
export const rlsCredentialsAvailable: boolean =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && Boolean(SERVICE_ROLE);

export function requireCreds(): asserts rlsCredentialsAvailable {
  if (!rlsCredentialsAvailable) {
    throw new Error(
      'RLS tests require VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local. ' +
        'Skip these tests via `pnpm test --exclude tests/rls/` when running without Supabase credentials.',
    );
  }
}

/**
 * Service-role client — bypasses RLS. Used to create test users and clean
 * them up. NEVER use this client to assert RLS behaviour (it will pass
 * everything).
 */
export function adminClient(): SupabaseClient<Database> {
  requireCreds();
  return createClient<Database>(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Per-user client — anon key + Authorization: Bearer JWT. This is the client
 * shape PostgREST sees from the browser, so RLS policies evaluate against
 * the JWT's `sub` claim (== auth.uid()).
 */
export function userClient(jwt: string): SupabaseClient<Database> {
  requireCreds();
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Anonymous client — anon key, no JWT. Represents an unauthenticated visitor.
 * RLS policies should treat this as `auth.uid() IS NULL`.
 */
export function anonClient(): SupabaseClient<Database> {
  requireCreds();
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  jwt: string;
}

/**
 * Creates a real auth user (email_confirm: true to skip the magic-link flow),
 * signs them in via password to obtain a JWT, and returns the credentials.
 * The bootstrap trigger from 00001_init.sql fires AFTER INSERT on auth.users,
 * so by the time this function returns the user has:
 *   - a public.users row
 *   - a public.workspaces row named '<email-local>'s workspace'
 *   - a public.memberships row with role = 'owner'
 *
 * Password is a fixed test secret — RLS tests are not security-sensitive
 * because they run against ephemeral users that are deleted in afterAll.
 */
export async function createTestUser(email: string): Promise<TestUser> {
  const admin = adminClient();
  const password = 'rls-test-password-do-not-use-elsewhere';

  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  if (!userData.user) throw new Error('createUser returned no user');

  // Use the anon client (with password auth flow) to obtain a JWT. The admin
  // client cannot sign in; it just minted the user.
  const anon = anonClient();
  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  if (!signInData.session) throw new Error('signInWithPassword returned no session');

  return {
    id: userData.user.id,
    email,
    password,
    jwt: signInData.session.access_token,
  };
}

/**
 * Deletes a test user via the admin client. CASCADE on auth.users →
 * public.users → public.workspaces / public.memberships cleans the
 * bootstrap-trigger rows automatically.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

/**
 * Helper: read the workspace_id for a test user via the admin client (bypassing
 * RLS). Used by tests to know "what should be visible to user A and invisible
 * to user B".
 */
export async function getWorkspaceIdForUser(userId: string): Promise<string | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.workspace_id ?? null;
}

/** Generates a unique throwaway email for each test run. */
export function uniqueTestEmail(label: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `rls-${label}-${ts}-${rand}@maxytest-rls-test.invalid`;
}
