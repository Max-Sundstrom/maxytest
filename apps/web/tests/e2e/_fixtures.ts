/**
 * E2E fixtures — Plan 01-06 Task 2.
 *
 * Centralises three pieces of setup the specs share:
 *   1. `serviceRoleClient()` — a service-role Supabase client used to create
 *      test users + studies + publish them. Mirrors the helper in
 *      `tests/rls/setup.ts` so the RLS suite and the E2E suite both go
 *      through the same trust boundary.
 *   2. `setupPublishedStudy(page)` — provisions a fresh designer user,
 *      workspace, study with welcome + open_question + thanks blocks,
 *      then publishes it. Returns the run_token + raw IDs.
 *   3. `injectDesignerSession(page, jwt, userId)` — writes the Supabase
 *      session into `localStorage` under the key the designer client uses
 *      (`sb-<ref>-auth-token`). This proxies the magic-link round-trip —
 *      Playwright cannot intercept the actual email click.
 *
 * Magic-link E2E reality check (Plan 01-06 §"E2E REALITY CHECK"):
 *   - Real magic-link flows are out of scope for CI (would require an email
 *     interceptor like Mailosaur or a Supabase webhook). The auth.spec.ts
 *     tests that depend on a live session use `injectDesignerSession`.
 *   - The open-redirect rejection test does NOT need a session — it tests
 *     the `next=` validator before/during the callback exchange.
 *
 * If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` /
 * `SUPABASE_SERVICE_ROLE_KEY` are not in env, fixtures throw with a clear
 * message; the spec then `test.skip()`s the case. The plan ships with
 * specs ready-to-run; CI can mark them `test.fixme` until secrets land.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import type { Database } from '../../src/lib/supabase/types.gen';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const e2eCredentialsAvailable: boolean = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE,
);

export function serviceRoleClient(): SupabaseClient<Database> {
  if (!e2eCredentialsAvailable) {
    throw new Error(
      'E2E fixtures require VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY. ' +
        'Set in CI secrets (GitHub Actions) or `apps/web/.env.local` for local runs.',
    );
  }
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The Supabase JS client stores sessions in localStorage under
 * `sb-<projectRef>-auth-token` by default. Extract `<projectRef>` from the
 * URL (the host is `<ref>.supabase.co`).
 *
 * Lazy so module import doesn't throw when SUPABASE_URL is unset (forks /
 * no-creds CI runs that just want to *list* tests).
 */
function projectRef(): string {
  if (!SUPABASE_URL) return 'local';
  try {
    const u = new URL(SUPABASE_URL);
    return u.host.split('.')[0] ?? 'local';
  } catch {
    return 'local';
  }
}

export function designerAuthStorageKey(): string {
  return `sb-${projectRef()}-auth-token`;
}

/**
 * Create a unique test user via service-role + sign them in to capture a
 * JWT. Returns the user ID + access_token usable for client-side session
 * injection (browser-side: `localStorage.setItem(DESIGNER_AUTH_STORAGE_KEY, ...)`).
 */
export async function createDesignerUser(): Promise<{
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}> {
  const admin = serviceRoleClient();
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.maxytest.local`;
  const password = `e2e-${Math.random().toString(36).slice(2, 18)}-PW1!`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message ?? 'no user'}`);
  }

  // Sign in via password to obtain a JWT (mirrors what the magic-link
  // callback would produce after the PKCE exchange).
  const anon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signinErr || !signin.session) {
    throw new Error(`signIn failed: ${signinErr?.message ?? 'no session'}`);
  }

  return {
    userId: created.user.id,
    email,
    accessToken: signin.session.access_token,
    refreshToken: signin.session.refresh_token,
  };
}

/**
 * Inject the designer Supabase session into the page so the subsequent
 * navigation lands in the authenticated `_app` tree without going through
 * the magic-link flow.
 */
export async function injectDesignerSession(
  page: Page,
  session: { accessToken: string; refreshToken: string; userId: string; email: string },
): Promise<void> {
  // Navigate to origin first so localStorage is on the right domain.
  await page.goto('/');
  const key = designerAuthStorageKey();
  await page.evaluate(
    ({ key, accessToken, refreshToken, userId, email }) => {
      const payload = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: userId, email },
      };
      localStorage.setItem(key, JSON.stringify(payload));
    },
    {
      key,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
      email: session.email,
    },
  );
}

/**
 * Provision: designer user → workspace (via trigger or RPC) → study →
 * publish. Returns the `run_token` for the runner specs.
 *
 * The workspace + membership rows are created by the `on_auth_user_created`
 * trigger (Plan 01-02). If the project doesn't have that trigger applied,
 * we fall back to creating the rows directly via service-role.
 */
export async function setupPublishedStudy(): Promise<{
  designer: Awaited<ReturnType<typeof createDesignerUser>>;
  workspaceId: string;
  studyId: string;
  runToken: string;
}> {
  const admin = serviceRoleClient();
  const designer = await createDesignerUser();

  // Wait briefly for the user-created trigger to provision the workspace.
  // If the trigger hasn't run after 1s, create manually.
  let workspaceId: string | undefined;
  for (let i = 0; i < 5; i++) {
    const { data } = await admin
      .from('memberships')
      .select('workspace_id')
      .eq('user_id', designer.userId)
      .maybeSingle();
    if (data?.workspace_id) {
      workspaceId = data.workspace_id;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!workspaceId) {
    const slug = `e2e-${designer.userId.slice(0, 8)}-${Date.now()}`;
    const { data: ws, error: wsErr } = await admin
      .from('workspaces')
      .insert({ name: `e2e ${designer.userId.slice(0, 8)}`, slug, created_by: designer.userId })
      .select('id')
      .single();
    if (wsErr || !ws) throw new Error(`workspace insert failed: ${wsErr?.message}`);
    workspaceId = ws.id;
    await admin.from('memberships').insert({
      user_id: designer.userId,
      workspace_id: workspaceId,
      role: 'owner',
    });
  }

  // Create a study with default welcome + open_question + thanks blocks.
  const { data: study, error: studyErr } = await admin
    .from('studies')
    .insert({
      workspace_id: workspaceId,
      title: 'E2E Test Study',
      status: 'draft',
      created_by: designer.userId,
    })
    .select('id')
    .single();
  if (studyErr || !study) throw new Error(`study insert failed: ${studyErr?.message}`);

  await admin.from('blocks').insert([
    {
      study_id: study.id,
      type: 'welcome',
      position: 0,
      pinned: true,
      content: { title: 'Welcome to the test', body: '', cta_label: 'Start' },
    },
    {
      study_id: study.id,
      type: 'open_question',
      position: 1,
      pinned: false,
      content: { prompt: 'What did you think?', required: true, min_length: 1 },
    },
    {
      study_id: study.id,
      type: 'thanks',
      position: 2,
      pinned: true,
      content: { title: 'Thanks!', body: 'You completed the test.' },
    },
  ]);

  // Publish via SECURITY DEFINER RPC `publish_study` (Plan 01-04).
  // Use the designer's JWT so the RPC's auth.uid() check passes.
  const designerClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${designer.accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: pubRes, error: pubErr } = await designerClient.rpc('publish_study', {
    study_uuid: study.id,
  });
  if (pubErr) throw new Error(`publish failed: ${pubErr.message}`);

  // `publish_study` returns the row including `run_token` (length 22).
  const { data: refreshed, error: refreshErr } = await admin
    .from('studies')
    .select('run_token')
    .eq('id', study.id)
    .single();
  if (refreshErr || !refreshed?.run_token) {
    throw new Error(`run_token missing after publish: ${refreshErr?.message ?? 'null'} (rpc=${JSON.stringify(pubRes)})`);
  }

  return {
    designer,
    workspaceId,
    studyId: study.id,
    runToken: refreshed.run_token,
  };
}

/**
 * Best-effort cleanup. Deletes the test user — cascades clean up the
 * workspace, study, blocks, sessions, responses via FKs.
 */
export async function cleanupDesigner(userId: string): Promise<void> {
  const admin = serviceRoleClient();
  try {
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // Swallow — test runs leave stragglers if cleanup fails; the
    // service-role process can sweep them out-of-band.
  }
}
