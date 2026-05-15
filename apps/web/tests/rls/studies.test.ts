/**
 * RLS test suite — studies (Plan 01-03 Task 9 / T-01-03-02 mitigation).
 *
 * Asserts the studies RLS perimeter against the live Supabase project:
 *   1. owner can SELECT own studies
 *   2. editor can SELECT own studies (Phase 6 prerequisite; verified via
 *      service-role insert of a role='editor' membership)
 *   3. anon cannot SELECT non-published studies
 *   4. anon CAN SELECT a published study via studies_runtoken_read
 *   5. user A cannot SELECT user B's studies
 *   6. user A cannot INSERT a study into user B's workspace
 *
 * Skip protocol: when SUPABASE_SERVICE_ROLE_KEY is absent, every `it` is
 * `.skip`'d so parallel agents and forks without secrets stay green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  getWorkspaceIdForUser,
  rlsCredentialsAvailable,
  uniqueTestEmail,
  userClient,
  type TestUser,
} from './setup';

describe.skipIf(!rlsCredentialsAvailable)('RLS / studies', () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: string;
  let workspaceB: string;

  // Studies seeded via service-role for cross-perimeter tests.
  let userAStudyId: string;
  let userBStudyId: string;
  let publishedRunToken: string;
  let publishedStudyId: string;

  beforeAll(async () => {
    userA = await createTestUser(uniqueTestEmail('studyA'));
    userB = await createTestUser(uniqueTestEmail('studyB'));
    workspaceA = (await getWorkspaceIdForUser(userA.id))!;
    workspaceB = (await getWorkspaceIdForUser(userB.id))!;

    const admin = adminClient();

    // Seed userA's workspace with a draft study.
    const { data: a, error: aErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Draft A',
        created_by: userA.id,
      })
      .select()
      .single();
    expect(aErr).toBeNull();
    userAStudyId = a!.id;

    // Seed userB's workspace with a draft study.
    const { data: b } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceB,
        title: 'Draft B',
        created_by: userB.id,
      })
      .select()
      .single();
    userBStudyId = b!.id;

    // Seed userA's workspace with a published study + run_token so the
    // anonymous-runner RLS path can be exercised.
    publishedRunToken = `rls-test-token-${Date.now()}`;
    const { data: p } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Published A',
        status: 'published',
        run_token: publishedRunToken,
        published_at: new Date().toISOString(),
        created_by: userA.id,
      })
      .select()
      .single();
    publishedStudyId = p!.id;
  });

  afterAll(async () => {
    if (userA?.id) await deleteTestUser(userA.id);
    if (userB?.id) await deleteTestUser(userB.id);
  });

  it('owner can SELECT their own studies', async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('studies')
      .select('id, title')
      .eq('workspace_id', workspaceA);
    expect(error).toBeNull();
    const ids = (data ?? []).map((s) => s.id);
    expect(ids).toContain(userAStudyId);
    expect(ids).toContain(publishedStudyId);
  });

  it('editor (role inserted via admin) can SELECT studies in that workspace', async () => {
    // Add userB to userA's workspace as 'editor', then verify userB sees userA's draft.
    const admin = adminClient();
    const { error: insErr } = await admin.from('memberships').insert({
      workspace_id: workspaceA,
      user_id: userB.id,
      role: 'editor',
    });
    expect(insErr).toBeNull();

    const client = userClient(userB.jwt);
    const { data, error } = await client
      .from('studies')
      .select('id')
      .eq('id', userAStudyId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(userAStudyId);

    // Clean up — remove the editor membership before subsequent tests.
    await admin.from('memberships').delete().eq('workspace_id', workspaceA).eq('user_id', userB.id);
  });

  it('anon cannot SELECT non-published studies', async () => {
    const client = anonClient();
    const { data, error } = await client.from('studies').select('id').eq('id', userAStudyId);
    expect(error).toBeNull();
    // Draft studies are NOT covered by studies_runtoken_read.
    expect(data ?? []).toHaveLength(0);
  });

  it('anon CAN SELECT a published study via studies_runtoken_read', async () => {
    const client = anonClient();
    const { data, error } = await client
      .from('studies')
      .select('id, status, run_token')
      .eq('run_token', publishedRunToken)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(publishedStudyId);
    expect(data?.status).toBe('published');
  });

  it("user A cannot SELECT user B's drafts", async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client.from('studies').select('id').eq('id', userBStudyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("user A cannot INSERT a study into user B's workspace", async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('studies')
      .insert({
        workspace_id: workspaceB,
        title: 'cross-workspace pwnage',
      })
      .select();
    // PostgREST returns either an error (WITH CHECK rejection) or empty data;
    // either way the insert MUST NOT succeed.
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
    // Verify via admin that no extra row landed.
    const admin = adminClient();
    const { data: rows } = await admin
      .from('studies')
      .select('id, title')
      .eq('workspace_id', workspaceB)
      .eq('title', 'cross-workspace pwnage');
    expect(rows ?? []).toHaveLength(0);
  });
});
