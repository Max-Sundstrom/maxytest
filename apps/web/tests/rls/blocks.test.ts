/**
 * RLS test suite — blocks (Plan 01-03 Task 9 / T-01-03-02 mitigation).
 *
 *   1. owner can SELECT blocks of own studies
 *   2. owner can UPDATE non-pinned blocks (rowCount=1)
 *   3. owner cannot DELETE pinned blocks (blocks_delete `NOT pinned`)
 *   4. owner CAN DELETE non-pinned blocks
 *   5. user A cannot UPDATE user B's blocks (silent RLS filter; rowCount=0)
 *   6. anon CAN SELECT blocks of a published study (via blocks_read OR-clause)
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

describe.skipIf(!rlsCredentialsAvailable)('RLS / blocks', () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: string;
  let workspaceB: string;

  let publishedStudyId: string;
  let userBDraftStudyId: string;

  // Block ids seeded via admin so we can address them in every test.
  let welcomeBlockA: string; // pinned welcome on userA's published study
  let openBlockA: string; // non-pinned open_question on userA's published study
  let openBlockB: string; // non-pinned open_question on userB's draft

  beforeAll(async () => {
    userA = await createTestUser(uniqueTestEmail('blkA'));
    userB = await createTestUser(uniqueTestEmail('blkB'));
    workspaceA = (await getWorkspaceIdForUser(userA.id))!;
    workspaceB = (await getWorkspaceIdForUser(userB.id))!;

    const admin = adminClient();

    // userA → published study with welcome (pinned) + open_question + thanks (pinned).
    const runToken = `rls-blocks-token-${Date.now()}`;
    const { data: pub } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Block test pub',
        status: 'published',
        run_token: runToken,
        published_at: new Date().toISOString(),
        created_by: userA.id,
      })
      .select()
      .single();
    publishedStudyId = pub!.id;

    const { data: w } = await admin
      .from('blocks')
      .insert({
        study_id: publishedStudyId,
        position: 0,
        type: 'welcome',
        pinned: true,
        content: { type: 'welcome', title: 'W', body: '', cta_label: 'Start' },
      })
      .select()
      .single();
    welcomeBlockA = w!.id;

    const { data: oq } = await admin
      .from('blocks')
      .insert({
        study_id: publishedStudyId,
        position: 1,
        type: 'open_question',
        pinned: false,
        content: { type: 'open_question', question: 'Why?' },
      })
      .select()
      .single();
    openBlockA = oq!.id;

    await admin.from('blocks').insert({
      study_id: publishedStudyId,
      position: 2,
      type: 'thanks',
      pinned: true,
      content: { type: 'thanks', title: 'Thanks', body: '' },
    });

    // userB → draft study with one non-pinned open_question block.
    const { data: draft } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceB,
        title: 'Block test draft',
        created_by: userB.id,
      })
      .select()
      .single();
    userBDraftStudyId = draft!.id;

    const { data: bOpen } = await admin
      .from('blocks')
      .insert({
        study_id: userBDraftStudyId,
        position: 0,
        type: 'open_question',
        pinned: false,
        content: { type: 'open_question', question: 'Cross?' },
      })
      .select()
      .single();
    openBlockB = bOpen!.id;
  });

  afterAll(async () => {
    if (userA?.id) await deleteTestUser(userA.id);
    if (userB?.id) await deleteTestUser(userB.id);
  });

  it('owner can SELECT blocks of own studies', async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('blocks')
      .select('id, type, pinned')
      .eq('study_id', publishedStudyId)
      .order('position');
    expect(error).toBeNull();
    const ids = (data ?? []).map((b) => b.id);
    expect(ids).toContain(welcomeBlockA);
    expect(ids).toContain(openBlockA);
  });

  it('owner can UPDATE non-pinned blocks (rowCount = 1)', async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('blocks')
      .update({
        content: {
          type: 'open_question',
          question: 'Updated by owner',
        },
      })
      .eq('id', openBlockA)
      .select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect((data?.[0]?.content as { question?: string })?.question).toBe('Updated by owner');
  });

  it('owner cannot DELETE pinned blocks (silent RLS filter; rowCount = 0)', async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client.from('blocks').delete().eq('id', welcomeBlockA).select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Confirm via admin that the pinned welcome is still present.
    const admin = adminClient();
    const { data: stillThere } = await admin
      .from('blocks')
      .select('id')
      .eq('id', welcomeBlockA)
      .maybeSingle();
    expect(stillThere?.id).toBe(welcomeBlockA);
  });

  it('owner CAN DELETE non-pinned blocks', async () => {
    // Use a fresh non-pinned block so we don't corrupt the rest of the suite.
    const admin = adminClient();
    const { data: toDelete } = await admin
      .from('blocks')
      .insert({
        study_id: publishedStudyId,
        position: 99,
        type: 'open_question',
        pinned: false,
        content: { type: 'open_question', question: 'Delete me' },
      })
      .select()
      .single();
    const blockId = toDelete!.id;

    const client = userClient(userA.jwt);
    const { data, error } = await client.from('blocks').delete().eq('id', blockId).select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0]?.id).toBe(blockId);
  });

  it("user A cannot UPDATE user B's blocks (silent RLS filter; rowCount = 0)", async () => {
    const client = userClient(userA.jwt);
    const { data, error } = await client
      .from('blocks')
      .update({
        content: { type: 'open_question', question: 'pwn' },
      })
      .eq('id', openBlockB)
      .select();
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Verify via admin that the content is unchanged.
    const admin = adminClient();
    const { data: row } = await admin
      .from('blocks')
      .select('content')
      .eq('id', openBlockB)
      .maybeSingle();
    expect((row?.content as { question?: string })?.question).toBe('Cross?');
  });

  it('anon CAN SELECT blocks of a published study (via blocks_read OR-clause)', async () => {
    const client = anonClient();
    const { data, error } = await client
      .from('blocks')
      .select('id, type')
      .eq('study_id', publishedStudyId);
    expect(error).toBeNull();
    expect(data ?? []).not.toHaveLength(0);
  });
});
