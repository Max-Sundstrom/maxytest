/**
 * RLS test suite — sessions (Plan 01-05 Task 6 / T-01-05-01 + T-01-05-03).
 *
 * Asserts the sessions RLS perimeter against the live Supabase project:
 *   1. Designer (owner) can SELECT sessions of own studies.
 *   2. Anonymous user A can INSERT a session via the create_session RPC.
 *   3. Anonymous user A cannot SELECT another anon user's session row
 *      (cross-respondent isolation).
 *   4. Anonymous user A can UPDATE their own session (last_seen_at via the
 *      sessions_anon_self_update policy).
 *   5. Anonymous user A cannot UPDATE another anon user's session
 *      (silent RLS filter; rowCount = 0).
 *   6. Designer of OTHER workspace cannot SELECT this study's sessions
 *      (cross-tenant isolation).
 *
 * Skip protocol: when SUPABASE_SERVICE_ROLE_KEY is absent, every `it` is
 * `.skip`'d so parallel agents without secrets stay green.
 *
 * Anonymous-respondent simulation note: the test harness uses
 * `admin.auth.admin.createUser({ email, password, email_confirm: true })` +
 * `signInWithPassword` to mint test users. RLS policies key on `auth.uid()`,
 * NOT on the user's email domain or auth method, so a password-authed user
 * is functionally identical to a signInAnonymously-authed user for the
 * purposes of these tests. Plan 01-02 setup.ts documents this.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  getWorkspaceIdForUser,
  rlsCredentialsAvailable,
  uniqueTestEmail,
  userClient,
  type TestUser,
} from './setup';

describe.skipIf(!rlsCredentialsAvailable)('RLS / sessions', () => {
  let designer: TestUser;
  let otherDesigner: TestUser;
  let anonA: TestUser;
  let anonB: TestUser;

  let workspaceA: string;
  let publishedStudyId: string;
  let runToken: string;

  // Two real session rows (one per anon user), inserted via service-role so
  // they exist before the RLS-flavoured assertions run.
  let sessionAId: string;
  let sessionBId: string;

  beforeAll(async () => {
    designer = await createTestUser(uniqueTestEmail('sess-designer'));
    otherDesigner = await createTestUser(uniqueTestEmail('sess-otherDesigner'));
    anonA = await createTestUser(uniqueTestEmail('sess-anonA'));
    anonB = await createTestUser(uniqueTestEmail('sess-anonB'));

    workspaceA = (await getWorkspaceIdForUser(designer.id))!;

    const admin = adminClient();

    // Designer owns a published study with a run_token.
    runToken = `rls-sess-token-${Date.now()}`;
    const { data: pub, error: pubErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Sessions RLS pub',
        status: 'published',
        run_token: runToken,
        published_at: new Date().toISOString(),
        created_by: designer.id,
      })
      .select()
      .single();
    expect(pubErr).toBeNull();
    publishedStudyId = pub!.id;

    // Pre-seed two sessions owned by the two anon users so SELECT/UPDATE
    // RLS tests have rows to address.
    const { data: sA, error: sAErr } = await admin
      .from('sessions')
      .insert({
        study_id: publishedStudyId,
        run_token: runToken,
        respondent_id: anonA.id,
        session_token: `sess-test-A-${Date.now()}`,
        status: 'in_progress',
        device_type: 'mobile',
        user_agent: 'rls-test',
      })
      .select()
      .single();
    expect(sAErr).toBeNull();
    sessionAId = sA!.id;

    const { data: sB, error: sBErr } = await admin
      .from('sessions')
      .insert({
        study_id: publishedStudyId,
        run_token: runToken,
        respondent_id: anonB.id,
        session_token: `sess-test-B-${Date.now()}`,
        status: 'in_progress',
        device_type: 'mobile',
        user_agent: 'rls-test',
      })
      .select()
      .single();
    expect(sBErr).toBeNull();
    sessionBId = sB!.id;
  });

  afterAll(async () => {
    if (designer?.id) await deleteTestUser(designer.id);
    if (otherDesigner?.id) await deleteTestUser(otherDesigner.id);
    if (anonA?.id) await deleteTestUser(anonA.id);
    if (anonB?.id) await deleteTestUser(anonB.id);
  });

  it('designer (owner) can SELECT sessions of own studies', async () => {
    const client = userClient(designer.jwt);
    const { data, error } = await client
      .from('sessions')
      .select('id, respondent_id')
      .eq('study_id', publishedStudyId);
    expect(error).toBeNull();
    const ids = (data ?? []).map((s) => s.id);
    expect(ids).toContain(sessionAId);
    expect(ids).toContain(sessionBId);
  });

  it('anonymous user A can INSERT a session via create_session RPC', async () => {
    const client = userClient(anonA.jwt);
    // Use a SECOND token-equivalent flow: call create_session for the
    // existing published study. The RPC inserts under respondent_id =
    // auth.uid() and returns the new session id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any).rpc('create_session', {
      p_run_token: runToken,
      p_device_type: 'mobile',
      p_user_agent: 'rls-test',
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');

    // Confirm via admin that the row landed under anonA's respondent_id.
    const admin = adminClient();
    const { data: row } = await admin
      .from('sessions')
      .select('respondent_id')
      .eq('id', data as string)
      .maybeSingle();
    expect(row?.respondent_id).toBe(anonA.id);
  });

  it("anonymous user A cannot SELECT another anon user's session row", async () => {
    const client = userClient(anonA.jwt);
    const { data, error } = await client
      .from('sessions')
      .select('id')
      .eq('id', sessionBId);
    expect(error).toBeNull();
    // sessions_designer_read requires workspace membership; sessions_anon_*
    // policies only grant INSERT + UPDATE — there is no SELECT policy for
    // anonymous users, so the row is silently filtered.
    expect(data ?? []).toHaveLength(0);
  });

  it('anonymous user A can UPDATE their own session (last_seen_at)', async () => {
    const client = userClient(anonA.jwt);
    const newSeen = new Date().toISOString();
    const { data, error } = await client
      .from('sessions')
      .update({ last_seen_at: newSeen })
      .eq('id', sessionAId)
      .select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);

    // Confirm via admin (cross-check).
    const admin = adminClient();
    const { data: row } = await admin
      .from('sessions')
      .select('last_seen_at')
      .eq('id', sessionAId)
      .maybeSingle();
    expect(row?.last_seen_at).toBe(newSeen);
  });

  it("anonymous user A cannot UPDATE another anon user's session (silent RLS filter)", async () => {
    const client = userClient(anonA.jwt);
    const { data, error } = await client
      .from('sessions')
      .update({ user_agent: 'pwn' })
      .eq('id', sessionBId)
      .select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Confirm via admin that user_agent on sessionB is unchanged.
    const admin = adminClient();
    const { data: row } = await admin
      .from('sessions')
      .select('user_agent')
      .eq('id', sessionBId)
      .maybeSingle();
    expect(row?.user_agent).toBe('rls-test');
  });

  it("designer of OTHER workspace cannot SELECT this study's sessions", async () => {
    const client = userClient(otherDesigner.jwt);
    const { data, error } = await client
      .from('sessions')
      .select('id')
      .eq('study_id', publishedStudyId);
    expect(error).toBeNull();
    // Cross-tenant isolation: otherDesigner is NOT a member of workspaceA
    // and is NOT the respondent on any of these sessions, so RLS silently
    // filters everything out.
    expect(data ?? []).toHaveLength(0);
  });
});
