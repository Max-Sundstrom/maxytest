/**
 * RLS test suite — responses (Plan 01-05 Task 6 / T-01-05-01 + T-01-05-03).
 *
 *   1. Designer (owner) can SELECT responses to own study's sessions.
 *   2. Anonymous user A can INSERT a response via submit_response RPC.
 *   3. Anonymous user A cannot DIRECTLY INSERT into responses without going
 *      through the RPC (the RLS policy `responses_anon_insert` only allows
 *      INSERT where the parent session's respondent_id = auth.uid() AND
 *      status='in_progress'; direct INSERT to another user's session fails
 *      the WITH CHECK; the policy itself was verified during Plan 01-02).
 *   4. Anonymous user A cannot submit_response into another anon user's session
 *      (RPC raises 'forbidden').
 *   5. Designer of OTHER workspace cannot SELECT this study's responses
 *      (cross-tenant isolation).
 *   6. After complete_session, a follow-up submit_response raises 'session_closed'.
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

describe.skipIf(!rlsCredentialsAvailable)('RLS / responses', () => {
  let designer: TestUser;
  let otherDesigner: TestUser;
  let anonA: TestUser;
  let anonB: TestUser;

  let workspaceA: string;
  let publishedStudyId: string;
  let runToken: string;

  let openBlockId: string;
  let sessionAId: string;
  let sessionBId: string;

  beforeAll(async () => {
    designer = await createTestUser(uniqueTestEmail('resp-designer'));
    otherDesigner = await createTestUser(uniqueTestEmail('resp-otherDesigner'));
    anonA = await createTestUser(uniqueTestEmail('resp-anonA'));
    anonB = await createTestUser(uniqueTestEmail('resp-anonB'));

    workspaceA = (await getWorkspaceIdForUser(designer.id))!;

    const admin = adminClient();

    runToken = `rls-resp-token-${Date.now()}`;
    const { data: pub, error: pubErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Responses RLS pub',
        status: 'published',
        run_token: runToken,
        published_at: new Date().toISOString(),
        created_by: designer.id,
      })
      .select()
      .single();
    expect(pubErr).toBeNull();
    publishedStudyId = pub!.id;

    // One open_question block to point responses at.
    const { data: openBlock, error: blockErr } = await admin
      .from('blocks')
      .insert({
        study_id: publishedStudyId,
        position: 1,
        type: 'open_question',
        pinned: false,
        content: { type: 'open_question', question: 'rls test q' },
      })
      .select()
      .single();
    expect(blockErr).toBeNull();
    openBlockId = openBlock!.id;

    // Two anon-owned sessions.
    const { data: sA, error: sAErr } = await admin
      .from('sessions')
      .insert({
        study_id: publishedStudyId,
        run_token: runToken,
        respondent_id: anonA.id,
        session_token: `resp-test-A-${Date.now()}`,
        status: 'in_progress',
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
        session_token: `resp-test-B-${Date.now()}`,
        status: 'in_progress',
      })
      .select()
      .single();
    expect(sBErr).toBeNull();
    sessionBId = sB!.id;

    // Pre-seed one response on each session so SELECT tests have rows.
    await admin.from('responses').insert([
      {
        session_id: sessionAId,
        block_id: openBlockId,
        answer: { text: 'A-answer' },
        time_ms: 1234,
      },
    ]);
  });

  afterAll(async () => {
    if (designer?.id) await deleteTestUser(designer.id);
    if (otherDesigner?.id) await deleteTestUser(otherDesigner.id);
    if (anonA?.id) await deleteTestUser(anonA.id);
    if (anonB?.id) await deleteTestUser(anonB.id);
  });

  it("designer (owner) can SELECT responses to own study's sessions", async () => {
    const client = userClient(designer.jwt);
    const { data, error } = await client
      .from('responses')
      .select('id, session_id, answer')
      .eq('session_id', sessionAId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    const first = (data ?? [])[0];
    expect((first?.answer as { text?: string })?.text).toBe('A-answer');
  });

  it('anonymous user A can INSERT a response via submit_response RPC', async () => {
    const client = userClient(anonA.jwt);

    const { error } = await (client as any).rpc('submit_response', {
      p_session_id: sessionAId,
      p_block_id: openBlockId,
      p_answer: { text: 'rls-rpc-submit' },
      p_time_ms: 500,
    });
    expect(error).toBeNull();

    // The RPC UPSERTs on (session_id, block_id); the pre-seeded row will be
    // updated rather than duplicated.
    const admin = adminClient();
    const { data: rows } = await admin
      .from('responses')
      .select('answer, time_ms')
      .eq('session_id', sessionAId)
      .eq('block_id', openBlockId);
    expect((rows ?? []).length).toBe(1);
    expect((rows?.[0]?.answer as { text?: string })?.text).toBe('rls-rpc-submit');
  });

  it("anonymous user A cannot DIRECTLY INSERT into responses on user B's session", async () => {
    const client = userClient(anonA.jwt);
    const { data, error } = await client
      .from('responses')
      .insert({
        session_id: sessionBId,
        block_id: openBlockId,
        answer: { text: 'cross-anon pwn' },
        time_ms: 999,
      })
      .select();
    // The WITH CHECK on responses_anon_insert evaluates the parent session's
    // respondent_id and refuses. PostgREST may return an explicit error OR
    // empty data — either way the row MUST NOT land.
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
    const admin = adminClient();
    const { data: rows } = await admin
      .from('responses')
      .select('id')
      .eq('session_id', sessionBId)
      .eq('block_id', openBlockId);
    expect(rows ?? []).toHaveLength(0);
  });

  it("anonymous user A cannot submit_response into another anon user's session (forbidden)", async () => {
    const client = userClient(anonA.jwt);

    const { error } = await (client as any).rpc('submit_response', {
      p_session_id: sessionBId,
      p_block_id: openBlockId,
      p_answer: { text: 'cross-anon RPC pwn' },
      p_time_ms: 1,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('forbidden');
  });

  it("designer of OTHER workspace cannot SELECT this study's responses", async () => {
    const client = userClient(otherDesigner.jwt);
    const { data, error } = await client
      .from('responses')
      .select('id')
      .eq('session_id', sessionAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("after complete_session, a follow-up submit_response raises 'session_closed'", async () => {
    // Use anonB's session for this test so we don't interfere with prior
    // tests on anonA's session.
    const client = userClient(anonB.jwt);

    const { error: completeErr } = await (client as any).rpc('complete_session', {
      p_session_id: sessionBId,
    });
    expect(completeErr).toBeNull();

    const { error: submitErr } = await (client as any).rpc('submit_response', {
      p_session_id: sessionBId,
      p_block_id: openBlockId,
      p_answer: { text: 'post-completion pwn' },
      p_time_ms: 1,
    });
    expect(submitErr).not.toBeNull();
    expect(submitErr?.message ?? '').toContain('session_closed');
  });
});
