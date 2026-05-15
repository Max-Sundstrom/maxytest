/**
 * RLS test suite — workspaces (WS-02 / T-01-02-02 mitigation).
 *
 * Asserts the workspaces RLS perimeter (workspaces_member_read +
 * studies_*_write update/delete policies) against the live Supabase project.
 *
 * Skip protocol: when SUPABASE_SERVICE_ROLE_KEY is not in the env, every `it`
 * is `.skip`'d via `describe.skipIf(...)` so parallel agents and forks
 * without secrets stay green. CI in Plan 01-06 injects the key.
 *
 * STACK.md §7.2 — `supabase-js` test client, NOT pgTAP.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  getWorkspaceIdForUser,
  rlsCredentialsAvailable,
  uniqueTestEmail,
  userClient,
  type TestUser,
} from './setup';

describe.skipIf(!rlsCredentialsAvailable)('RLS / workspaces', () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    userA = await createTestUser(uniqueTestEmail('userA'));
    userB = await createTestUser(uniqueTestEmail('userB'));
    workspaceA = (await getWorkspaceIdForUser(userA.id))!;
    workspaceB = (await getWorkspaceIdForUser(userB.id))!;
    expect(workspaceA).toBeTruthy();
    expect(workspaceB).toBeTruthy();
    expect(workspaceA).not.toBe(workspaceB);
  });

  afterAll(async () => {
    if (userA?.id) await deleteTestUser(userA.id);
    if (userB?.id) await deleteTestUser(userB.id);
  });

  it('owner can SELECT their own workspace', async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('workspaces')
      .select('id, name, slug')
      .eq('id', workspaceA)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(workspaceA);
  });

  it('bootstrap trigger created the workspace + membership rows for the new user', async () => {
    // This stands in for "owner cannot INSERT workspace directly" — the
    // bootstrap trigger is the only sanctioned creation path in Phase 1.
    // We verify the trigger fired correctly: workspace exists AND
    // membership(role='owner') exists.
    const client = userClient(userA.jwt);
    const { data: ws } = await client
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceA)
      .maybeSingle();
    expect(ws).toBeTruthy();
    expect(ws?.name).toMatch(/'s workspace$/);

    const { data: m } = await client
      .from('memberships')
      .select('role')
      .eq('workspace_id', workspaceA)
      .eq('user_id', userA.id)
      .maybeSingle();
    expect(m?.role).toBe('owner');
  });

  it('anon cannot SELECT any workspace (RLS returns empty, not 401)', async () => {
    const client = anonClient();
    const { data, error } = await client.from('workspaces').select('id').eq('id', workspaceA);
    // RLS returns an empty array — NOT an auth error — because the policy
    // simply doesn't grant SELECT to anonymous JWTs.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("user A cannot SELECT user B's workspace", async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client.from('workspaces').select('id').eq('id', workspaceB);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("user A cannot UPDATE user B's workspace (RLS filters the row)", async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('workspaces')
      .update({ name: 'pwned' })
      .eq('id', workspaceB)
      .select();
    // PostgREST returns success with an empty data array because the RLS
    // policy excludes the target row from the UPDATE statement's purview.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("user A cannot DELETE user B's workspace", async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client.from('workspaces').delete().eq('id', workspaceB).select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    // Verify the workspace still exists via admin path (not RLS).
    const stillThere = await getWorkspaceIdForUser(userB.id);
    expect(stillThere).toBe(workspaceB);
  });
});
