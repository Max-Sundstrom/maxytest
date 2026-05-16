/**
 * RLS test suite — prototype_versions + frames + hotspots
 * (Plan 02-07 Task 2 / Plan 02-02 RLS contract / PROTO-04 immutability).
 *
 * Asserts the prototype schema RLS perimeter:
 *
 *   1. designer-A SELECTs own-workspace prototype_versions → rows visible
 *   2. designer-B SELECTs designer-A's prototype_versions → 0 rows (isolation)
 *   3. frames_runner_read on PUBLISHED study + COMPLETE pv → anon sees frames
 *   4. frames_runner_read on DRAFT study → anon sees 0 frames
 *   5. (B-05) frames_runner_read on IMPORTING pv → anon sees 0 frames
 *   6. (PROTO-04) designer cannot UPDATE prototype_versions (immutability)
 *
 * Skip protocol: same as events.test.ts — gated by `rlsCredentialsAvailable`.
 *
 * Note: PROTO-04 is enforced by ABSENCE of an UPDATE policy on
 * prototype_versions. An UPDATE attempt by a designer-role JWT returns
 * `data = []` (silent RLS filter) rather than an explicit error, because
 * PostgREST applies the missing policy as "no rows match".
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

describe.skipIf(!rlsCredentialsAvailable)('RLS / prototype_versions + frames', () => {
  let designerA: TestUser;
  let designerB: TestUser;
  let workspaceA: string;

  // designer A owns a PUBLISHED study (pvA, frames seeded).
  let publishedStudyId: string;
  let pvAId: string;
  let pvAFrameIds: string[] = [];

  // designer A also owns a DRAFT study (pvDraft, frames seeded) for Test 4.
  let draftStudyId: string;
  let pvDraftId: string;

  // designer A's PUBLISHED study with an IMPORTING pv for Test 5 (B-05).
  let publishedStudyImportingId: string;
  let pvImportingId: string;

  beforeAll(async () => {
    designerA = await createTestUser(uniqueTestEmail('proto-designerA'));
    designerB = await createTestUser(uniqueTestEmail('proto-designerB'));
    workspaceA = (await getWorkspaceIdForUser(designerA.id))!;

    const admin = adminClient();

    // ---- published study + complete pv + 3 frames ------------------------
    const tokenP = `rls-proto-pub-${Date.now()}`;
    const { data: pubStudy } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Prototypes RLS published',
        status: 'published',
        run_token: tokenP,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    publishedStudyId = pubStudy!.id;

    const { data: pvA } = await admin
      .from('prototype_versions')
      .insert({
        study_id: publishedStudyId,
        figma_file_key: 'rls-proto-A',
        status: 'complete',
      })
      .select()
      .single();
    pvAId = pvA!.id;

    const { data: frames } = await admin
      .from('frames')
      .insert([
        {
          prototype_version_id: pvAId,
          frame_id: 'f1',
          name: 'Frame 1',
          width: 375,
          height: 812,
          render_path_1x: 'p/f1@1x.png',
          render_path_2x: 'p/f1@2x.png',
          position: 0,
        },
        {
          prototype_version_id: pvAId,
          frame_id: 'f2',
          name: 'Frame 2',
          width: 375,
          height: 812,
          render_path_1x: 'p/f2@1x.png',
          render_path_2x: 'p/f2@2x.png',
          position: 1,
        },
        {
          prototype_version_id: pvAId,
          frame_id: 'f3',
          name: 'Frame 3',
          width: 375,
          height: 812,
          render_path_1x: 'p/f3@1x.png',
          render_path_2x: 'p/f3@2x.png',
          position: 2,
        },
      ])
      .select();
    pvAFrameIds = (frames ?? []).map((f) => f.id);
    expect(pvAFrameIds).toHaveLength(3);

    // ---- draft study + complete pv + 1 frame (Test 4) --------------------
    const { data: draftStudy } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Prototypes RLS draft',
        status: 'draft',
        created_by: designerA.id,
      })
      .select()
      .single();
    draftStudyId = draftStudy!.id;

    const { data: pvDraft } = await admin
      .from('prototype_versions')
      .insert({
        study_id: draftStudyId,
        figma_file_key: 'rls-proto-draft',
        status: 'complete',
      })
      .select()
      .single();
    pvDraftId = pvDraft!.id;

    await admin.from('frames').insert({
      prototype_version_id: pvDraftId,
      frame_id: 'fd1',
      name: 'Draft Frame 1',
      width: 375,
      height: 812,
      render_path_1x: 'd/fd1@1x.png',
      render_path_2x: 'd/fd1@2x.png',
      position: 0,
    });

    // ---- published study + IMPORTING pv + 1 frame (Test 5, B-05) ---------
    const tokenImp = `rls-proto-importing-${Date.now()}`;
    const { data: pubImpStudy } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Prototypes RLS pub-importing',
        status: 'published',
        run_token: tokenImp,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    publishedStudyImportingId = pubImpStudy!.id;

    const { data: pvImp } = await admin
      .from('prototype_versions')
      .insert({
        study_id: publishedStudyImportingId,
        figma_file_key: 'rls-proto-importing',
        status: 'importing',
      })
      .select()
      .single();
    pvImportingId = pvImp!.id;

    await admin.from('frames').insert({
      prototype_version_id: pvImportingId,
      frame_id: 'imp1',
      name: 'Importing Frame 1',
      width: 375,
      height: 812,
      render_path_1x: 'i/imp1@1x.png',
      render_path_2x: 'i/imp1@2x.png',
      position: 0,
    });
  });

  afterAll(async () => {
    if (designerA?.id) await deleteTestUser(designerA.id);
    if (designerB?.id) await deleteTestUser(designerB.id);
  });

  it('Test 1 — designer A SELECTs own-workspace prototype_versions (visible)', async () => {
    const client = userClient(designerA.jwt);
    const { data, error } = await client
      .from('prototype_versions')
      .select('id, study_id, status')
      .eq('study_id', publishedStudyId);
    expect(error).toBeNull();
    expect((data ?? []).some((row) => row.id === pvAId)).toBe(true);
  });

  it("Test 2 — designer B SELECTs designer A's prototype_versions → 0 rows", async () => {
    const client = userClient(designerB.jwt);
    const { data, error } = await client
      .from('prototype_versions')
      .select('id')
      .eq('study_id', publishedStudyId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('Test 3 — anon CAN SELECT frames of PUBLISHED + COMPLETE prototype (runner-read)', async () => {
    const anon = anonClient();
    const { data, error } = await anon
      .from('frames')
      .select('id, frame_id')
      .eq('prototype_version_id', pvAId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(3);
  });

  it('Test 4 — anon CANNOT SELECT frames of a DRAFT study (runner-read blocked)', async () => {
    const anon = anonClient();
    const { data, error } = await anon
      .from('frames')
      .select('id')
      .eq('prototype_version_id', pvDraftId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('Test 5 — (B-05) anon CANNOT SELECT frames of an IMPORTING prototype', async () => {
    const anon = anonClient();
    const { data, error } = await anon
      .from('frames')
      .select('id')
      .eq('prototype_version_id', pvImportingId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('Test 6 — (PROTO-04) designer cannot UPDATE prototype_versions (immutability)', async () => {
    const client = userClient(designerA.jwt);
    // No UPDATE policy exists → either RLS rejection or 0 rows updated.
    const { data, error } = await client
      .from('prototype_versions')
      .update({ figma_file_key: 'hacked' })
      .eq('id', pvAId)
      .select();
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
    // Admin cross-check: figma_file_key is unchanged.
    const admin = adminClient();
    const { data: row } = await admin
      .from('prototype_versions')
      .select('figma_file_key')
      .eq('id', pvAId)
      .maybeSingle();
    expect(row?.figma_file_key).toBe('rls-proto-A');
  });
});
