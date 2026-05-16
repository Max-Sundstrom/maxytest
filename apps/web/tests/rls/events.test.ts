/**
 * RLS test suite — events (Plan 02-07 Task 2 / INGEST-01..05 + B-02 + B-03).
 *
 * Asserts the events RLS + submit_events RPC perimeter against the live
 * Supabase project. Every load-bearing security property must hold:
 *
 *   1. designer can SELECT events for their workspace's studies
 *   2. designer of OTHER workspace cannot SELECT this study's events (isolation)
 *   3. anon CANNOT direct-INSERT into events bypassing the RPC
 *   4. submit_events happy path returns inserted_count = 1
 *   5. submit_events refuses cross-session calls (forbidden / 42501)
 *   6. submit_events is idempotent on replay (UUIDv7 PK + ON CONFLICT)
 *   7. UNIQUE(session_id, seq) rejects duplicate seq with new id (INGEST-03)
 *   8. (B-02) submit_events with p_block_id of DIFFERENT study → invalid_block
 *   9. (B-02) submit_events with p_block_id of NON-prototype block → invalid_block
 *  10. (B-03) submit_events on session WITHOUT pin → session_pin_missing
 *
 * Skip protocol: when SUPABASE_SERVICE_ROLE_KEY is absent, every test is
 * `.skip`'d (per `describe.skipIf`) so parallel agents without secrets stay
 * green. The plan was authored in a worktree without credentials; tests
 * execute when CI / operator runs with `apps/web/.env.local` populated.
 *
 * Note on types: `events`, `submit_events`, and `set_session_prototype_pin`
 * are added by migration 00009. `types.gen.ts` will be regenerated once the
 * Supabase toolchain is available (Plan 02-07 Task 4). Until then, the
 * untyped `(client as any).rpc(...)` cast — same pattern responses.test.ts
 * uses for submit_response — keeps tests buildable.
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
  hotspot_id?: string;
  hit_target_id?: string;
  event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish';
  x?: number;
  y?: number;
  seq: number;
  client_ts: string;
}

function makeEvent(seq: number, opts: Partial<EventPayload> = {}): EventPayload {
  return {
    id: uuidv7(),
    frame_id: opts.frame_id ?? 'figma-frame-1',
    hotspot_id: opts.hotspot_id ?? 'hs-1',
    hit_target_id: opts.hit_target_id ?? 'hs-1',
    event_type: opts.event_type ?? 'tap',
    x: opts.x ?? 0.5,
    y: opts.y ?? 0.5,
    seq,
    client_ts: opts.client_ts ?? new Date().toISOString(),
  };
}

describe.skipIf(!rlsCredentialsAvailable)('RLS / events', () => {
  let designerA: TestUser;
  let designerB: TestUser; // other workspace
  let anonA: TestUser;
  let anonB: TestUser;

  let workspaceA: string;

  // study #1 — anonA's primary session lives here
  let studyAId: string;
  let runTokenA: string;
  let blockAPrototypeId: string;
  let blockAWelcomeId: string; // for B-02 Test 9 (non-prototype block id)
  let pvAId: string;
  let sessionAId: string;

  // study #2 — distinct study so B-02 Test 8 can pass a block from a
  // DIFFERENT study to submit_events on anonA's session.
  let studyA2Id: string;
  let blockA2PrototypeId: string;
  let pvA2Id: string;

  // sessions for anonB and the pin-missing session
  let sessionBId: string;
  let sessionNoPinId: string;

  beforeAll(async () => {
    designerA = await createTestUser(uniqueTestEmail('evt-designerA'));
    designerB = await createTestUser(uniqueTestEmail('evt-designerB'));
    anonA = await createTestUser(uniqueTestEmail('evt-anonA'));
    anonB = await createTestUser(uniqueTestEmail('evt-anonB'));

    workspaceA = (await getWorkspaceIdForUser(designerA.id))!;

    const admin = adminClient();

    // ---- study #1 + prototype + welcome + pv + session for anonA ----------
    runTokenA = `rls-evt-A-${Date.now()}`;
    const { data: studyA, error: studyAErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Events RLS study A',
        status: 'published',
        run_token: runTokenA,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    expect(studyAErr).toBeNull();
    studyAId = studyA!.id;

    // welcome (pinned) and a prototype block on study A.
    const { data: welcomeA } = await admin
      .from('blocks')
      .insert({
        study_id: studyAId,
        position: 0,
        type: 'welcome',
        pinned: true,
        content: { type: 'welcome', title: 'W', body: '', cta_label: 'Start' },
      })
      .select()
      .single();
    blockAWelcomeId = welcomeA!.id;

    // prototype_versions row first (FK from prototype block content semantically,
    // but the DB only enforces FK via events / sessions.prototype_version_pin).
    const { data: pvA } = await admin
      .from('prototype_versions')
      .insert({
        study_id: studyAId,
        figma_file_key: 'evt-test-A',
        status: 'complete',
      })
      .select()
      .single();
    pvAId = pvA!.id;

    const { data: blockA } = await admin
      .from('blocks')
      .insert({
        study_id: studyAId,
        position: 1,
        type: 'prototype',
        pinned: false,
        // Use cast: the runtime CHECK accepts 'prototype' (migration 00008).
        // Content has prototype_version_id + starting_frame_id + instruction.
        content: {
          type: 'prototype',
          prototype_version_id: pvAId,
          starting_frame_id: 'figma-frame-1',
          task_instruction: 'Tap the button.',
        },
      })
      .select()
      .single();
    blockAPrototypeId = blockA!.id;

    // anonA's session pinned to pvA.
    const { data: sA } = await admin
      .from('sessions')
      .insert({
        study_id: studyAId,
        run_token: runTokenA,
        respondent_id: anonA.id,
        session_token: `evt-A-${Date.now()}`,
        status: 'in_progress',
        prototype_version_pin: pvAId,
      } as never)
      .select()
      .single();
    sessionAId = sA!.id;

    // anonB's session also under study A (cross-respondent tests).
    const { data: sB } = await admin
      .from('sessions')
      .insert({
        study_id: studyAId,
        run_token: runTokenA,
        respondent_id: anonB.id,
        session_token: `evt-B-${Date.now()}`,
        status: 'in_progress',
        prototype_version_pin: pvAId,
      } as never)
      .select()
      .single();
    sessionBId = sB!.id;

    // Session with NO pin — exercises B-03 session_pin_missing path.
    const { data: sNoPin } = await admin
      .from('sessions')
      .insert({
        study_id: studyAId,
        run_token: runTokenA,
        respondent_id: anonA.id,
        session_token: `evt-A-nopin-${Date.now()}`,
        status: 'in_progress',
        // prototype_version_pin intentionally NULL
      })
      .select()
      .single();
    sessionNoPinId = sNoPin!.id;

    // ---- study #2 + prototype + pv (for B-02 Test 8) ----------------------
    const runTokenA2 = `rls-evt-A2-${Date.now()}`;
    const { data: studyA2 } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Events RLS study A2',
        status: 'published',
        run_token: runTokenA2,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    studyA2Id = studyA2!.id;

    const { data: pvA2 } = await admin
      .from('prototype_versions')
      .insert({
        study_id: studyA2Id,
        figma_file_key: 'evt-test-A2',
        status: 'complete',
      })
      .select()
      .single();
    pvA2Id = pvA2!.id;

    const { data: blockA2 } = await admin
      .from('blocks')
      .insert({
        study_id: studyA2Id,
        position: 1,
        type: 'prototype',
        pinned: false,
        content: {
          type: 'prototype',
          prototype_version_id: pvA2Id,
          starting_frame_id: 'figma-frame-1',
          task_instruction: 'Other study task.',
        },
      })
      .select()
      .single();
    blockA2PrototypeId = blockA2!.id;
  });

  afterAll(async () => {
    if (designerA?.id) await deleteTestUser(designerA.id);
    if (designerB?.id) await deleteTestUser(designerB.id);
    if (anonA?.id) await deleteTestUser(anonA.id);
    if (anonB?.id) await deleteTestUser(anonB.id);
  });

  // -------------------------------------------------------------------------
  // SELECT-side RLS perimeter
  // -------------------------------------------------------------------------

  it('Test 1 — designer can SELECT events for own studies (happy path)', async () => {
    const admin = adminClient();
    // Seed 3 events via service-role (bypasses RLS).
    const seedEventIds = [uuidv7(), uuidv7(), uuidv7()];
    await (admin as any).from('events').insert(
      seedEventIds.map((id, i) => ({
        id,
        session_id: sessionAId,
        study_id: studyAId,
        block_id: blockAPrototypeId,
        prototype_version_id: pvAId,
        frame_id: 'figma-frame-1',
        event_type: 'tap',
        x: 0.5,
        y: 0.5,
        seq: 100 + i,
        client_ts: new Date().toISOString(),
      })),
    );

    const client = userClient(designerA.jwt);
    const { data, error } = await (client as any)
      .from('events')
      .select('id, session_id')
      .eq('session_id', sessionAId)
      .in('id', seedEventIds);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(3);
  });

  it("Test 2 — designer of OTHER workspace cannot SELECT this study's events", async () => {
    const client = userClient(designerB.jwt);
    const { data, error } = await (client as any)
      .from('events')
      .select('id')
      .eq('study_id', studyAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('Test 3 — anon CANNOT direct-INSERT into events (bypassing RPC)', async () => {
    const client = userClient(anonA.jwt);
    const directId = uuidv7();
    const { data, error } = await (client as any)
      .from('events')
      .insert({
        id: directId,
        session_id: sessionAId,
        study_id: studyAId,
        block_id: blockAPrototypeId,
        prototype_version_id: pvAId,
        frame_id: 'figma-frame-1',
        event_type: 'tap',
        x: 0.1,
        y: 0.1,
        seq: 999,
        client_ts: new Date().toISOString(),
      })
      .select();
    // No INSERT policy means the row gets refused — either explicit error,
    // or empty data. The admin cross-check confirms nothing landed.
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
    const admin = adminClient();
    const { data: rows } = await (admin as any).from('events').select('id').eq('id', directId);
    expect(rows ?? []).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // submit_events RPC: happy path, ownership, idempotency, seq uniqueness
  // -------------------------------------------------------------------------

  it('Test 4 — submit_events happy path returns inserted_count = 1', async () => {
    const client = userClient(anonA.jwt);
    const ev = makeEvent(200);
    const { data, error } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAPrototypeId,
      p_events: [ev],
    });
    expect(error).toBeNull();
    expect(data).toBe(1);

    // Cross-check via admin: row has server-enriched study_id + block_id + pv_id.
    const admin = adminClient();
    const { data: row } = await (admin as any)
      .from('events')
      .select('id, study_id, block_id, prototype_version_id')
      .eq('id', ev.id)
      .maybeSingle();
    expect(row?.study_id).toBe(studyAId);
    expect(row?.block_id).toBe(blockAPrototypeId);
    expect(row?.prototype_version_id).toBe(pvAId);
  });

  it('Test 5 — submit_events refuses cross-session call (forbidden)', async () => {
    // anonB's JWT trying to write into anonA's session.
    const client = userClient(anonB.jwt);
    const { error } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAPrototypeId,
      p_events: [makeEvent(300)],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('forbidden');
  });

  it('Test 6 — submit_events is idempotent on replay (UUIDv7 PK + ON CONFLICT)', async () => {
    const client = userClient(anonA.jwt);
    // Batch of 3 events with stable ids.
    const batch = [makeEvent(400), makeEvent(401), makeEvent(402)];

    const { data: first, error: e1 } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAPrototypeId,
      p_events: batch,
    });
    expect(e1).toBeNull();
    expect(first).toBe(3);

    // Replay with EXACT same ids → 0 inserted.
    const { data: second, error: e2 } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAPrototypeId,
      p_events: batch,
    });
    expect(e2).toBeNull();
    expect(second).toBe(0);

    // DB row count for those 3 ids is exactly 3, not 6.
    const admin = adminClient();
    const { data: rows } = await (admin as any)
      .from('events')
      .select('id')
      .in(
        'id',
        batch.map((e) => e.id),
      );
    expect((rows ?? []).length).toBe(3);
  });

  it('Test 7 — UNIQUE(session_id, seq) rejects duplicate seq with new id (INGEST-03)', async () => {
    const client = userClient(anonA.jwt);
    // Seq 500 + 501 land cleanly.
    const okBatch = [makeEvent(500), makeEvent(501)];
    const { error: eOk } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAPrototypeId,
      p_events: okBatch,
    });
    expect(eOk).toBeNull();

    // Now try seq=500 with a NEW id — UNIQUE(session_id, seq) MUST raise.
    const dup = makeEvent(500); // new uuid, same seq
    const { error: eDup } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAPrototypeId,
      p_events: [dup],
    });
    expect(eDup).not.toBeNull();
    // Postgres unique_violation = 23505; PostgREST surfaces the code or the
    // word "duplicate" in the message.
    const msg = (eDup?.message ?? '') + ' ' + ((eDup as { details?: string })?.details ?? '');
    expect(/23505|duplicate|unique/i.test(msg)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // B-02 — submit_events validates p_block_id per study + type='prototype'
  // -------------------------------------------------------------------------

  it('Test 8 — (B-02) submit_events with p_block_id of DIFFERENT study → invalid_block', async () => {
    const client = userClient(anonA.jwt);
    // anonA's session is on study #1; pass a block from study #2.
    const { error } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockA2PrototypeId,
      p_events: [makeEvent(600)],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('invalid_block');
  });

  it('Test 9 — (B-02) submit_events with p_block_id of NON-prototype block → invalid_block', async () => {
    const client = userClient(anonA.jwt);
    // Pass anonA's own study's WELCOME block (right study, wrong type).
    const { error } = await (client as any).rpc('submit_events', {
      p_session_id: sessionAId,
      p_block_id: blockAWelcomeId,
      p_events: [makeEvent(601)],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('invalid_block');
  });

  // -------------------------------------------------------------------------
  // B-03 — submit_events requires sessions.prototype_version_pin
  // -------------------------------------------------------------------------

  it('Test 10 — (B-03) submit_events on session WITHOUT pin → session_pin_missing', async () => {
    const client = userClient(anonA.jwt);
    const { error } = await (client as any).rpc('submit_events', {
      p_session_id: sessionNoPinId,
      p_block_id: blockAPrototypeId,
      p_events: [makeEvent(700)],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toContain('session_pin_missing');
  });
});
