/**
 * RLS / integration test suite — publish_prototype_from_plugin RPC
 * (Plan 02.2-02 Task 3 / D-03 / PROTO-04 / INGEST-01).
 *
 * Validates the atomic SECURITY DEFINER function added by migration
 * `00013_phase02_2_plugin_rpc.sql`. The RPC is the plugin's single
 * server-side write path — without it, Plan 07 (in-Figma plugin) cannot
 * commit a prototype-import. Every load-bearing security + correctness
 * property must hold:
 *
 *   1. Non-member workspace publish attempt → 42501 forbidden
 *      (T-02.2-02-01 in threat register).
 *   2. Viewer-role member publish attempt → 42501 forbidden
 *      (T-02.2-02-02 in threat register).
 *   3. Owner-role happy path → returns { prototype_version_id, study_id,
 *      replayed: false } AND atomically inserts prototype_versions +
 *      frames + hotspots + prototype_imports rows. prototype_imports.path
 *      = 'plugin'.
 *   4. Replay (same idempotency_key + same study_id) → returns the
 *      existing prototype_version_id with replayed=true; no duplicate
 *      rows in any of the four tables (T-02.2-02-03 — idempotency).
 *   5. Cross-workspace study rejection — owner of workspace A presents
 *      a workspace_id of A but a study_id from workspace B → 02000
 *      'study not found in workspace' (T-02.2-02-04).
 *   6. Unauthenticated client (anon JWT, no auth.uid()) → PostgREST 401
 *      (the function is GRANTed only to `authenticated`, so the anon
 *      role cannot even invoke it).
 *   7. frame_node_id → frames.id (UUID) resolution. A payload with two
 *      frames and a hotspot pointing at the SECOND frame must land in
 *      `hotspots.frame_id` = (frames row whose `frame_id` = node id of
 *      the second frame). This validates Step 6/7 of the RPC where the
 *      plpgsql jsonb map is built and consulted.
 *
 * Skip protocol: gated by `rlsCredentialsAvailable`. If
 * `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
 * are missing the whole describe block is `.skip`'d so parallel agents
 * without secrets stay green. Same convention as every other RLS suite
 * (`events.test.ts`, `reimport-pin.test.ts`, etc.).
 *
 * Schema-push dependency: assumes migration 00013 is LIVE on the
 * Supabase project pointed to by VITE_SUPABASE_URL. Plan 02.2-02 Task 2
 * is the blocking checkpoint that applies it (operator runs
 * `supabase db push --linked` OR pastes the SQL into the cloud Studio).
 * If the migration is NOT applied the tests will fail with PostgREST
 * `PGRST202 function not found` — that is the documented RED state.
 *
 * Note on types: types.gen.ts has not yet been regenerated (no live
 * supabase CLI on the operator box). The untyped `(client as any).rpc(...)`
 * cast — same pattern as `events.test.ts` (submit_events) and
 * `reimport-pin.test.ts` (set_session_prototype_pin) — keeps the file
 * compilable until the next `pnpm gen-types` run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
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

/* -------------------------------------------------------------------------- */
/* Payload helpers                                                            */
/* -------------------------------------------------------------------------- */

interface FramePayload {
  frame_id: string;
  name: string;
  width: number;
  height: number;
  render_path_1x: string;
  render_path_2x: string;
  position: number;
}

interface HotspotPayload {
  hotspot_id: string;
  frame_node_id: string; // == FramePayload.frame_id of the PARENT frame
  target_frame_id: string;
  transition_kind: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  z_index?: number;
  source_layer?: string;
}

interface PublishPayload {
  study_id: string;
  workspace_id: string;
  prototype_version_id: string;
  file_key: string;
  file_name: string;
  starting_frame_id?: string;
  figma_node_tree: Record<string, unknown>;
  frames: FramePayload[];
  hotspots: HotspotPayload[];
  warnings?: unknown[];
}

function makeFrame(nodeId: string, position: number): FramePayload {
  return {
    frame_id: nodeId,
    name: `Frame ${nodeId}`,
    width: 375,
    height: 812,
    render_path_1x: `plugin/${nodeId}@1x.png`,
    render_path_2x: `plugin/${nodeId}@2x.png`,
    position,
  };
}

function makeHotspot(
  hotspotId: string,
  parentNodeId: string,
  targetNodeId: string,
): HotspotPayload {
  return {
    hotspot_id: hotspotId,
    frame_node_id: parentNodeId,
    target_frame_id: targetNodeId,
    // Allowed values per migration 00007 hotspots_transition_kind_check:
    // 'slide' | 'dissolve' | 'push' | 'smart_animate'. The Plan 07 plugin
    // will normalise Figma's `INSTANT_TRANSITION` / `SMART_ANIMATE` / etc.
    // payload to this enum at the boundary.
    transition_kind: 'dissolve',
    bbox_x: 0.1,
    bbox_y: 0.1,
    bbox_w: 0.5,
    bbox_h: 0.2,
    z_index: 0,
    source_layer: `layer-${hotspotId}`,
  };
}

function makePayload(
  studyId: string,
  workspaceId: string,
  frameNodeIds: string[],
  hotspots: Array<{ id: string; parent: string; target: string }>,
): PublishPayload {
  return {
    study_id: studyId,
    workspace_id: workspaceId,
    prototype_version_id: uuidv7(),
    file_key: 'plugin-test-file-key',
    file_name: 'Plugin RLS Test File',
    starting_frame_id: frameNodeIds[0],
    figma_node_tree: {},
    frames: frameNodeIds.map((id, i) => makeFrame(id, i)),
    hotspots: hotspots.map((h) => makeHotspot(h.id, h.parent, h.target)),
    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Test suite                                                                 */
/* -------------------------------------------------------------------------- */

describe.skipIf(!rlsCredentialsAvailable)('publish_prototype_from_plugin RPC', () => {
  // Designer A owns workspace A — most tests run as designer A on a fresh
  // study in workspace A.
  let designerA: TestUser;
  let workspaceA: string;
  let studyA: string;

  // Designer B owns workspace B — used for Test 1 (non-member) + Test 5
  // (cross-workspace) where we need a study in a workspace designer A does
  // NOT belong to.
  let designerB: TestUser;
  let workspaceB: string;
  let studyB: string;

  // Viewer C is added to workspace A with role='viewer' — used for Test 2
  // to prove role gate rejects viewers (not just non-members).
  let viewerC: TestUser;

  beforeAll(async () => {
    designerA = await createTestUser(uniqueTestEmail('pub-designerA'));
    designerB = await createTestUser(uniqueTestEmail('pub-designerB'));
    viewerC = await createTestUser(uniqueTestEmail('pub-viewerC'));

    workspaceA = (await getWorkspaceIdForUser(designerA.id))!;
    workspaceB = (await getWorkspaceIdForUser(designerB.id))!;

    const admin = adminClient();

    // Study in workspace A — designer A is owner, viewer C is viewer.
    const { data: sA, error: sAErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'publish-from-plugin study A',
        status: 'draft',
        created_by: designerA.id,
      })
      .select()
      .single();
    if (sAErr) throw sAErr;
    studyA = sA!.id;

    // Add viewer C to workspace A as a viewer (NOT owner/editor).
    const { error: memErr } = await admin.from('memberships').insert({
      workspace_id: workspaceA,
      user_id: viewerC.id,
      role: 'viewer',
    });
    if (memErr) throw memErr;

    // Study in workspace B — used as the "foreign study" in cross-workspace
    // and non-member tests.
    const { data: sB, error: sBErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceB,
        title: 'publish-from-plugin study B',
        status: 'draft',
        created_by: designerB.id,
      })
      .select()
      .single();
    if (sBErr) throw sBErr;
    studyB = sB!.id;
  });

  afterAll(async () => {
    if (designerA?.id) await deleteTestUser(designerA.id);
    if (designerB?.id) await deleteTestUser(designerB.id);
    if (viewerC?.id) await deleteTestUser(viewerC.id);
  });

  /* ------------------------------------------------------------------------ */
  /* Test 1 — non-member forbidden                                            */
  /* ------------------------------------------------------------------------ */
  it('Test 1 — non-member publish attempt → 42501 forbidden', async () => {
    const client = userClient(designerB.jwt); // designer B is NOT in workspace A
    const payload = makePayload(studyA, workspaceA, ['nm-f1'], []);
    const { data, error } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload,
      p_idempotency_key: uuidv7(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message ?? '').toContain('forbidden');
  });

  /* ------------------------------------------------------------------------ */
  /* Test 2 — viewer-role forbidden                                           */
  /* ------------------------------------------------------------------------ */
  it('Test 2 — viewer-role publish attempt → 42501 forbidden', async () => {
    const client = userClient(viewerC.jwt); // viewer C is 'viewer' on workspace A
    const payload = makePayload(studyA, workspaceA, ['vc-f1'], []);
    const { data, error } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload,
      p_idempotency_key: uuidv7(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message ?? '').toContain('forbidden');
  });

  /* ------------------------------------------------------------------------ */
  /* Test 3 — owner success path                                              */
  /* ------------------------------------------------------------------------ */
  it('Test 3 — owner publish path → atomic insert + path=plugin row', async () => {
    const client = userClient(designerA.jwt);
    const admin = adminClient();

    const payload = makePayload(
      studyA,
      workspaceA,
      ['ok-f1'],
      [{ id: 'ok-h1', parent: 'ok-f1', target: 'ok-f1' }],
    );
    const idemKey = uuidv7();

    const { data, error } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload,
      p_idempotency_key: idemKey,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      prototype_version_id: payload.prototype_version_id,
      study_id: studyA,
      replayed: false,
    });

    // Side-effect assertions via admin client (RLS bypassed).
    const { data: pvRow } = await admin
      .from('prototype_versions')
      .select('id, study_id, figma_file_key, status')
      .eq('id', payload.prototype_version_id)
      .maybeSingle();
    expect(pvRow).not.toBeNull();
    expect(pvRow?.status).toBe('complete');

    const { data: frameRows } = await admin
      .from('frames')
      .select('id, frame_id')
      .eq('prototype_version_id', payload.prototype_version_id);
    expect((frameRows ?? []).length).toBe(1);
    expect(frameRows![0].frame_id).toBe('ok-f1');

    const { data: hotspotRows } = await admin
      .from('hotspots')
      .select('id, hotspot_id, frame_id')
      .eq('prototype_version_id', payload.prototype_version_id);
    expect((hotspotRows ?? []).length).toBe(1);
    expect(hotspotRows![0].hotspot_id).toBe('ok-h1');
    // hotspot.frame_id must resolve to the frames-row UUID (not the figma
    // node id) — exercises the jsonb map built in RPC step 6.
    expect(hotspotRows![0].frame_id).toBe(frameRows![0].id);

    const { data: importRows } = await (admin as any)
      .from('prototype_imports')
      .select('id, path, status, prototype_version_id, idempotency_key, frames_total, frames_done')
      .eq('prototype_version_id', payload.prototype_version_id);
    expect((importRows ?? []).length).toBe(1);
    expect(importRows![0].path).toBe('plugin');
    expect(importRows![0].status).toBe('done');
    expect(importRows![0].idempotency_key).toBe(idemKey);
    expect(importRows![0].frames_total).toBe(1);
    expect(importRows![0].frames_done).toBe(1);
  });

  /* ------------------------------------------------------------------------ */
  /* Test 4 — idempotency replay (same key → no duplicates)                   */
  /* ------------------------------------------------------------------------ */
  it('Test 4 — replay with same idempotency_key → replayed=true, no duplicates', async () => {
    const client = userClient(designerA.jwt);
    const admin = adminClient();

    const payload1 = makePayload(
      studyA,
      workspaceA,
      ['idem-f1'],
      [{ id: 'idem-h1', parent: 'idem-f1', target: 'idem-f1' }],
    );
    const idemKey = uuidv7();

    const { data: first, error: e1 } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload1,
      p_idempotency_key: idemKey,
    });
    expect(e1).toBeNull();
    expect(first?.replayed).toBe(false);
    const firstPvId = first?.prototype_version_id as string;

    // Second call — different prototype_version_id in the payload to prove
    // the replay branch returns the FIRST one (not the second).
    const payload2 = makePayload(
      studyA,
      workspaceA,
      ['idem-f2'],
      [{ id: 'idem-h2', parent: 'idem-f2', target: 'idem-f2' }],
    );
    const { data: second, error: e2 } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload2,
      p_idempotency_key: idemKey, // same key → triggers replay branch
    });
    expect(e2).toBeNull();
    expect(second?.replayed).toBe(true);
    expect(second?.prototype_version_id).toBe(firstPvId);
    expect(second?.study_id).toBe(studyA);

    // No duplicate prototype_versions row — second call must NOT have
    // created one.
    const { data: pvRows } = await admin
      .from('prototype_versions')
      .select('id')
      .in('id', [payload1.prototype_version_id, payload2.prototype_version_id]);
    expect((pvRows ?? []).length).toBe(1);
    expect(pvRows![0].id).toBe(firstPvId);

    // No duplicate prototype_imports row for this idempotency_key.
    const { data: importRows } = await (admin as any)
      .from('prototype_imports')
      .select('id')
      .eq('study_id', studyA)
      .eq('idempotency_key', idemKey);
    expect((importRows ?? []).length).toBe(1);

    // Frames + hotspots counts unchanged — only the first payload's children
    // exist; payload2's frames/hotspots were NOT inserted.
    const { data: frameRows } = await admin
      .from('frames')
      .select('id, frame_id')
      .eq('prototype_version_id', firstPvId);
    expect((frameRows ?? []).length).toBe(1);
    expect(frameRows![0].frame_id).toBe('idem-f1');

    const { data: hotspotRows } = await admin
      .from('hotspots')
      .select('id, hotspot_id')
      .eq('prototype_version_id', firstPvId);
    expect((hotspotRows ?? []).length).toBe(1);
    expect(hotspotRows![0].hotspot_id).toBe('idem-h1');
  });

  /* ------------------------------------------------------------------------ */
  /* Test 5 — cross-workspace study rejection                                 */
  /* ------------------------------------------------------------------------ */
  it('Test 5 — cross-workspace study_id rejection → 02000', async () => {
    // designer A presents workspace_id = A (they own it, so role gate
    // passes) but a study_id from workspace B (forged). Step 3 of the RPC
    // must reject with 02000.
    const client = userClient(designerA.jwt);
    const payload = makePayload(studyB, workspaceA, ['xw-f1'], []);
    const { data, error } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload,
      p_idempotency_key: uuidv7(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // PostgREST surfaces SQLSTATE codes as `error.code` on RPC failures.
    expect(error?.code).toBe('02000');
    expect(error?.message ?? '').toContain('study not found in workspace');
  });

  /* ------------------------------------------------------------------------ */
  /* Test 6 — unauthenticated rejection                                       */
  /* ------------------------------------------------------------------------ */
  it('Test 6 — anonymous client publish attempt → rejected (no JWT)', async () => {
    // GRANT EXECUTE is only to `authenticated` (REVOKEd from PUBLIC). The
    // anon role cannot invoke the function at all — PostgREST surfaces this
    // as either an authorization failure (401/42501) or a function-not-found
    // (PGRST202) depending on the deployment. Either is acceptable; we just
    // assert that the call DOES NOT succeed and DOES NOT mutate the DB.
    const client = anonClient();
    const payload = makePayload(studyA, workspaceA, ['anon-f1'], []);
    const { data, error } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload,
      p_idempotency_key: uuidv7(),
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    // Verify side-effect-free: no prototype_versions row was created with
    // that id.
    const admin = adminClient();
    const { data: pvRow } = await admin
      .from('prototype_versions')
      .select('id')
      .eq('id', payload.prototype_version_id)
      .maybeSingle();
    expect(pvRow).toBeNull();
  });

  /* ------------------------------------------------------------------------ */
  /* Test 7 — frame_node_id → frames.id resolution                            */
  /* ------------------------------------------------------------------------ */
  it('Test 7 — hotspot.frame_id resolves via jsonb map (multi-frame case)', async () => {
    // Two frames; hotspot points at the SECOND frame via its node id.
    // After insert, hotspots.frame_id (UUID) must equal the SECOND frame's
    // UUID — NOT the first frame's, NOT the figma node id.
    const client = userClient(designerA.jwt);
    const admin = adminClient();

    const payload = makePayload(
      studyA,
      workspaceA,
      ['multi-f1', 'multi-f2'],
      [{ id: 'multi-h1', parent: 'multi-f2', target: 'multi-f1' }],
    );

    const { data, error } = await (client as any).rpc('publish_prototype_from_plugin', {
      p_payload: payload,
      p_idempotency_key: uuidv7(),
    });
    expect(error).toBeNull();
    expect(data?.replayed).toBe(false);

    const { data: frameRows } = await admin
      .from('frames')
      .select('id, frame_id, position')
      .eq('prototype_version_id', payload.prototype_version_id)
      .order('position');
    expect((frameRows ?? []).length).toBe(2);
    expect(frameRows![0].frame_id).toBe('multi-f1');
    expect(frameRows![1].frame_id).toBe('multi-f2');

    const secondFrameDbId = frameRows![1].id;
    const firstFrameDbId = frameRows![0].id;

    const { data: hotspotRows } = await admin
      .from('hotspots')
      .select('id, hotspot_id, frame_id')
      .eq('prototype_version_id', payload.prototype_version_id);
    expect((hotspotRows ?? []).length).toBe(1);
    expect(hotspotRows![0].hotspot_id).toBe('multi-h1');
    expect(hotspotRows![0].frame_id).toBe(secondFrameDbId);
    expect(hotspotRows![0].frame_id).not.toBe(firstFrameDbId);
  });
});
