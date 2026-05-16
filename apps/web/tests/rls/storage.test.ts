/**
 * RLS test suite — Storage `prototype-renders` bucket (Plan 02-02 Task 5 / B-04).
 *
 * Asserts the B-04 contract: bucket is PRIVATE, signed-URL roundtrip works,
 * and the W-09 malformed-path guard does not raise.
 *
 * Tests:
 *   1. Bucket privacy (`public: false`) is enforced at the bucket level.
 *   2. Designer (owner) can upload a 1×1 PNG to `{workspace_id}/{pv_id}/...`.
 *   3. Designer B CANNOT upload to designer A's workspace path (RLS deny).
 *   4. Anonymous client list() of the workspace path returns empty / denied.
 *   5. Signed-URL roundtrip: service-role mints a 24h signed URL → anon GET
 *      returns 200 with image bytes.
 *   6. W-09: upload to a non-UUID first-folder path is denied gracefully
 *      (no "invalid input syntax for type uuid" raise).
 *
 * Skip protocol: when SUPABASE_SERVICE_ROLE_KEY is absent, every `it` is
 * `.skip`'d (per `describe.skipIf`). Plan 02-02 was written in a worktree
 * without credentials; the test executes when CI / operator runs with
 * `apps/web/.env.local` populated.
 *
 * Setup notes:
 *   - We use `adminClient()` (service-role) to create a `prototype_versions`
 *     row in workspaceA so the {workspace_id}/{pv_id}/... path is meaningful.
 *     `prototype_versions` is immutable from RLS (no UPDATE/DELETE policy
 *     for designers) and the service-role bypasses RLS.
 *   - Test cleanup deletes the test users via cascade and removes any
 *     uploaded objects from the bucket.
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

// 1×1 transparent PNG (67 bytes). Constructed from a base64 literal to avoid
// any test-file dependency on a binary fixture. atob → Uint8Array via
// charCodeAt — works in both Node and browser test environments.
const ONE_PX_PNG: Uint8Array = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

const BUCKET = 'prototype-renders';

describe.skipIf(!rlsCredentialsAvailable)('RLS / storage / prototype-renders', () => {
  let designerA: TestUser;
  let designerB: TestUser;
  let workspaceA: string;
  let workspaceB: string;

  // A prototype_versions row seeded in workspaceA so the path
  // `{workspaceA}/{pvAId}/...` is semantically meaningful (it matches the
  // path scheme designers will use in production).
  let pvAId: string;
  let publishedStudyAId: string;

  // Object paths uploaded during the suite; cleaned up in afterAll.
  const uploadedPaths: string[] = [];

  beforeAll(async () => {
    designerA = await createTestUser(uniqueTestEmail('storeA'));
    designerB = await createTestUser(uniqueTestEmail('storeB'));
    workspaceA = (await getWorkspaceIdForUser(designerA.id))!;
    workspaceB = (await getWorkspaceIdForUser(designerB.id))!;

    const admin = adminClient();

    // Seed a published study in workspaceA so the runner-read RLS branch
    // (workspace has at least one published study) can be exercised in Test 5.
    const runToken = `rls-store-token-${Date.now()}`;
    const { data: pub, error: pubErr } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'Storage RLS pub',
        status: 'published',
        run_token: runToken,
        published_at: new Date().toISOString(),
        created_by: designerA.id,
      })
      .select()
      .single();
    expect(pubErr).toBeNull();
    publishedStudyAId = pub!.id;

    // Seed a prototype_versions row in workspaceA. Service-role bypasses RLS.
    const { data: pv, error: pvErr } = await admin
      .from('prototype_versions')
      .insert({
        study_id: publishedStudyAId,
        figma_file_key: 'rls-test-figma-key',
        status: 'complete',
      })
      .select()
      .single();
    expect(pvErr).toBeNull();
    pvAId = pv!.id;
  });

  afterAll(async () => {
    const admin = adminClient();

    // Clean up uploaded objects. Errors are non-fatal — the user-delete
    // CASCADE may have already cleared the workspace.
    if (uploadedPaths.length > 0) {
      await admin.storage.from(BUCKET).remove(uploadedPaths);
    }

    if (designerA?.id) await deleteTestUser(designerA.id);
    if (designerB?.id) await deleteTestUser(designerB.id);
  });

  it('Test 1 (bucket privacy): bucket reports public: false', async () => {
    const admin = adminClient();
    const { data, error } = await admin.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // The bucket MUST be private — direct path access bypasses the storage
    // HTTP layer's auth check, so privacy is the primary security boundary.
    expect(data!.public).toBe(false);
  });

  it('Test 2 (designer upload allowed): designerA can upload to their workspace path', async () => {
    const client = userClient(designerA.jwt);
    const path = `${workspaceA}/${pvAId}/F1-deadbeef@1x.png`;

    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, ONE_PX_PNG, { contentType: 'image/png', upsert: true });

    expect(error).toBeNull();
    uploadedPaths.push(path);
  });

  it("Test 3 (cross-workspace upload blocked): designerB cannot upload to designerA's workspace path", async () => {
    const client = userClient(designerB.jwt);
    const path = `${workspaceA}/${pvAId}/F1-cross-${Date.now()}@1x.png`;

    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, ONE_PX_PNG, { contentType: 'image/png', upsert: false });

    // RLS denial. Supabase storage returns an error with a 4xx-ish shape.
    expect(error).not.toBeNull();
    // Sanity: workspaceB is unrelated to workspaceA's path, so the upload
    // policy's CASE-then-current_workspace_role lookup returns NULL → false.
    expect(workspaceA).not.toBe(workspaceB);
  });

  it('Test 4 (anon cannot list): anonymous client list() of workspace path returns empty', async () => {
    const anon = anonClient();
    const { data, error } = await anon.storage.from(BUCKET).list(`${workspaceA}/`);

    // The list() call goes through the storage HTTP API. With a private
    // bucket and no signed URL, anon either gets an empty array (because RLS
    // filters everything) or an error. Either outcome satisfies the contract:
    // the anonymous user MUST NOT enumerate objects.
    if (error) {
      // Storage may return a 403 / 400 — also a pass.
      expect(error).toBeTruthy();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('Test 5 (signed-URL roundtrip): service-role mint → anon fetch returns 200', async () => {
    const admin = adminClient();
    const path = `${workspaceA}/${pvAId}/F1-signed-${Date.now()}@1x.png`;

    // Service-role upload (bypasses RLS).
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, ONE_PX_PNG, { contentType: 'image/png', upsert: true });
    expect(uploadErr).toBeNull();
    uploadedPaths.push(path);

    // Mint a signed URL (24h TTL — Plan 02-09 / 02-10 contract).
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 86400);
    expect(signErr).toBeNull();
    expect(signed?.signedUrl).toBeDefined();

    // Anonymous fetch with the signed URL — proves the bucket is reachable
    // WITHOUT being public.
    const res = await fetch(signed!.signedUrl);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Exactly the 67 bytes of the 1×1 PNG.
    expect(bytes.byteLength).toBe(ONE_PX_PNG.byteLength);
  });

  it('Test 6 (W-09 malformed path): upload to non-UUID first-folder is denied without raising', async () => {
    const client = userClient(designerA.jwt);
    const malformedPath = `not-a-uuid/foo/bar.png`;

    const { error } = await client.storage
      .from(BUCKET)
      .upload(malformedPath, ONE_PX_PNG, { contentType: 'image/png', upsert: false });

    // Must be denied (the W-09 CASE branch evaluates to `false`)…
    expect(error).not.toBeNull();
    // …but MUST NOT include the Postgres uuid-cast error message. If the
    // regex guard were missing, the policy would raise "invalid input syntax
    // for type uuid" on the `::uuid` cast — the regex-then-cast pattern is
    // what prevents that surface.
    expect(error?.message ?? '').not.toMatch(/invalid input syntax for type uuid/i);
  });
});
