/**
 * RLS test suite — B-03 re-import-pin safety
 * (Plan 02-07 Task 3 / set_session_prototype_pin + sessions.prototype_version_pin).
 *
 * Proves that re-imports of a Figma prototype do NOT corrupt the events of
 * a respondent who is currently mid-task. The invariant is:
 *
 *     submit_events reads prototype_version_id from sessions.prototype_version_pin,
 *     NOT from the LIVE block payload (blocks.content).
 *
 * Once `set_session_prototype_pin(session, pvA)` is called at PrototypeRunner
 * mount, all events for that session attach to pvA — even if the designer
 * re-imports and mutates the prototype block's content to point at pvB
 * (a new prototype_versions row) while the respondent is still tapping.
 *
 * Test cases:
 *   1. Happy path — re-import mid-flight does not corrupt the session's pv.
 *   2. set_session_prototype_pin is idempotent on retry (no overwrite).
 *   3. set_session_prototype_pin rejects mismatched-study pv → invalid_prototype_version.
 *   4. set_session_prototype_pin cross-session rejection → forbidden.
 *
 * Skip protocol: gated on `rlsCredentialsAvailable` like every RLS suite.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
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

interface EventPayload {
  id: string;
  frame_id: string;
  event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish';
  seq: number;
  client_ts: string;
  x?: number;
  y?: number;
}

function makeEvent(seq: number, frame_id = 'f1'): EventPayload {
  return {
    id: uuidv7(),
    frame_id,
    event_type: 'tap',
    seq,
    client_ts: new Date().toISOString(),
    x: 0.5,
    y: 0.5,
  };
}

describe.skipIf(!rlsCredentialsAvailable)('RLS / reimport-pin (B-03)', () => {
  let designerA: TestUser;
  let anonA: TestUser;
  let anonB: TestUser;

  let workspaceA: string;

  // Test 1 setup
  let studyId: string;
  let blockPrototypeId: string;
  let pvAId: string;
  let pvBId: string;

  // Test 3 setup — a separate study used to forge a cross-study pv pin attempt
  let otherStudyId: string;
  let pvOtherStudyId: string;

  beforeAll(async () => {
    designerA = await createTestUser(uniqueTestEmail('reimport-designerA'));
    anonA = await createTestUser(uniqueTestEmail('reimport-anonA'));
    anonB = await createTestUser(uniqueTestEmail('reimport-anonB'));

    workspaceA = (await getWorkspaceIdForUser(designerA.id))!;
    const admin = adminClient();

    // ---- primary study, pvA (initial) + prototype block --------------------
    const runToken = `rls-reimport-${Date.now()}`;
    const { data: study } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'B-03 reimport-pin study',
        status: 'published',
        run_token: runToken,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    studyId = study!.id;

    const { data: pvA } = await admin
      .from('prototype_versions')
      .insert({
        study_id: studyId,
        figma_file_key: 'reimport-A',
        status: 'complete',
      })
      .select()
      .single();
    pvAId = pvA!.id;

    const { data: blk } = await admin
      .from('blocks')
      .insert({
        study_id: studyId,
        position: 1,
        type: 'prototype',
        pinned: false,
        content: {
          type: 'prototype',
          prototype_version_id: pvAId,
          starting_frame_id: 'f1',
          task_instruction: 'B-03 task',
        },
      })
      .select()
      .single();
    blockPrototypeId = blk!.id;

    // pvB is the "re-imported" prototype_versions row created mid-test in
    // Test 1; we seed it here so Test 1 doesn't have to insert a pv.
    const { data: pvB } = await admin
      .from('prototype_versions')
      .insert({
        study_id: studyId,
        figma_file_key: 'reimport-B-after-reimport',
        status: 'complete',
      })
      .select()
      .single();
    pvBId = pvB!.id;

    // ---- separate study + pv for cross-study Test 3 ------------------------
    const otherToken = `rls-reimport-other-${Date.now()}`;
    const { data: otherStudy } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'B-03 other study',
        status: 'published',
        run_token: otherToken,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    otherStudyId = otherStudy!.id;

    const { data: pvOther } = await admin
      .from('prototype_versions')
      .insert({
        study_id: otherStudyId,
        figma_file_key: 'reimport-other-study',
        status: 'complete',
      })
      .select()
      .single();
    pvOtherStudyId = pvOther!.id;
  });

  afterAll(async () => {
    if (designerA?.id) await deleteTestUser(designerA.id);
    if (anonA?.id) await deleteTestUser(anonA.id);
    if (anonB?.id) await deleteTestUser(anonB.id);
  });

  it('Test 1 — re-import mid-flight does NOT corrupt pinned session events', async () => {
    const admin = adminClient();
    const client = userClient(anonA.jwt);

    // Create a fresh session for anonA on the primary study.
    const { data: sess } = await admin
      .from('sessions')
      .insert({
        study_id: studyId,
        run_token: `rls-reimport-sess-${Date.now()}`,
        respondent_id: anonA.id,
        session_token: `sess-${Date.now()}`,
        status: 'in_progress',
      })
      .select()
      .single();
    const sessionId = sess!.id;

    // Step 1: anonA pins to pvA (PrototypeRunner mount).
    const { error: pinErr } = await (client as any).rpc('set_session_prototype_pin', {
      p_session_id: sessionId,
      p_pv_id: pvAId,
    });
    expect(pinErr).toBeNull();

    // Step 2: submit 2 events — should land with prototype_version_id = pvA.
    const batch1 = [makeEvent(1), makeEvent(2)];
    const { data: c1, error: e1 } = await (client as any).rpc('submit_events', {
      p_session_id: sessionId,
      p_block_id: blockPrototypeId,
      p_events: batch1,
    });
    expect(e1).toBeNull();
    expect(c1).toBe(2);

    // Step 3: simulate re-import — service-role flips the BLOCK's content
    // to point at pvB. This is the destructive update we're proving the
    // session pin defends against.
    await admin
      .from('blocks')
      .update({
        content: {
          type: 'prototype',
          prototype_version_id: pvBId,
          starting_frame_id: 'f1',
          task_instruction: 'B-03 task (re-imported)',
        },
      })
      .eq('id', blockPrototypeId);

    // Step 4: anonA submits 2 MORE events AFTER the block payload has
    // been mutated. They should STILL pin to pvA via sessions.prototype_version_pin.
    const batch2 = [makeEvent(3), makeEvent(4)];
    const { data: c2, error: e2 } = await (client as any).rpc('submit_events', {
      p_session_id: sessionId,
      p_block_id: blockPrototypeId,
      p_events: batch2,
    });
    expect(e2).toBeNull();
    expect(c2).toBe(2);

    // Step 5: all 4 events have prototype_version_id = pvAId, NONE pvBId.
    const allIds = [...batch1, ...batch2].map((e) => e.id);
    const { data: rows } = await (admin as any)
      .from('events')
      .select('id, prototype_version_id')
      .in('id', allIds);
    expect((rows ?? []).length).toBe(4);
    for (const row of rows ?? []) {
      expect(row.prototype_version_id).toBe(pvAId);
      expect(row.prototype_version_id).not.toBe(pvBId);
    }

    // Restore the block to point back at pvAId so subsequent tests can
    // create fresh sessions on a sane block.
    await admin
      .from('blocks')
      .update({
        content: {
          type: 'prototype',
          prototype_version_id: pvAId,
          starting_frame_id: 'f1',
          task_instruction: 'B-03 task',
        },
      })
      .eq('id', blockPrototypeId);
  });

  it('Test 2 — set_session_prototype_pin is idempotent (set-once, retry-safe)', async () => {
    const admin = adminClient();
    const client = userClient(anonA.jwt);

    // Fresh session for anonA.
    const { data: sess } = await admin
      .from('sessions')
      .insert({
        study_id: studyId,
        run_token: `rls-reimport-idem-${Date.now()}`,
        respondent_id: anonA.id,
        session_token: `sess-idem-${Date.now()}`,
        status: 'in_progress',
      })
      .select()
      .single();
    const sessionId = sess!.id;

    // Pin to pvA.
    const { error: e1 } = await (client as any).rpc('set_session_prototype_pin', {
      p_session_id: sessionId,
      p_pv_id: pvAId,
    });
    expect(e1).toBeNull();

    // Call AGAIN with the same pvA — must no-op silently.
    const { error: e2 } = await (client as any).rpc('set_session_prototype_pin', {
      p_session_id: sessionId,
      p_pv_id: pvAId,
    });
    expect(e2).toBeNull();

    // Call AGAIN with a different pv (pvB) — also no-op (set-once contract).
    const { error: e3 } = await (client as any).rpc('set_session_prototype_pin', {
      p_session_id: sessionId,
      p_pv_id: pvBId,
    });
    expect(e3).toBeNull();

    // Pin should still be pvAId (NOT pvBId).
    const { data: row } = await admin
      .from('sessions')
      .select('prototype_version_pin')
      .eq('id', sessionId)
      .maybeSingle();
    expect((row as { prototype_version_pin?: string } | null)?.prototype_version_pin).toBe(pvAId);
  });

  it('Test 3 — set_session_prototype_pin rejects mismatched-study pv → invalid_prototype_version', async () => {
    const admin = adminClient();
    const client = userClient(anonA.jwt);

    // Fresh session for anonA on the PRIMARY study (studyId).
    const { data: sess } = await admin
      .from('sessions')
      .insert({
        study_id: studyId,
        run_token: `rls-reimport-mismatch-${Date.now()}`,
        respondent_id: anonA.id,
        session_token: `sess-mismatch-${Date.now()}`,
        status: 'in_progress',
      })
      .select()
      .single();
    const sessionId = sess!.id;

    // Try to pin to a pv that belongs to a DIFFERENT study.
    const { error } = await (client as any).rpc('set_session_prototype_pin', {
      p_session_id: sessionId,
      p_pv_id: pvOtherStudyId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('invalid_prototype_version');

    // Pin should still be NULL (never set).
    const { data: row } = await admin
      .from('sessions')
      .select('prototype_version_pin')
      .eq('id', sessionId)
      .maybeSingle();
    expect((row as { prototype_version_pin?: string | null } | null)?.prototype_version_pin).toBe(
      null,
    );
  });

  it('Test 4 — set_session_prototype_pin cross-session rejection → forbidden', async () => {
    const admin = adminClient();

    // Session owned by anonA.
    const { data: sess } = await admin
      .from('sessions')
      .insert({
        study_id: studyId,
        run_token: `rls-reimport-cross-${Date.now()}`,
        respondent_id: anonA.id,
        session_token: `sess-cross-${Date.now()}`,
        status: 'in_progress',
      })
      .select()
      .single();
    const sessionId = sess!.id;

    // anonB attempts to pin anonA's session.
    const clientB = userClient(anonB.jwt);
    const { error } = await (clientB as any).rpc('set_session_prototype_pin', {
      p_session_id: sessionId,
      p_pv_id: pvAId,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('forbidden');
  });
});
