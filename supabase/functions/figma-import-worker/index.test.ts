/**
 * Integration test for the figma-import-worker Edge Function.
 *
 * Plan: 02-flagship-prototype-block-heatmap / 02-03 / Task 3.
 *
 * Asserts two load-bearing invariants:
 *
 *   1. W-08 — Workspace membership gate (always-on test, no Figma PAT needed):
 *      Designer B (in workspace WS-B) calls the function with a study_id that
 *      belongs to workspace WS-A. The function MUST respond 403
 *      `{ error: 'workspace_membership_required' }` AND no prototype_imports
 *      row may be created.
 *
 *   2. B-05 — render_path existence (gated by FIGMA_TEST_PAT + share link):
 *      Designer A (in workspace WS-A) imports a small Figma file. After the
 *      job reaches a terminal status, every frames.render_path_1x and
 *      frames.render_path_2x value MUST correspond to an actual object in
 *      the `prototype-renders` bucket, AND the produced prototype_versions
 *      row MUST be at status='complete'.
 *
 * The test runs in Node via Vitest and HTTP-calls the DEPLOYED Edge Function.
 * Run from apps/web/ with:
 *
 *   pnpm vitest run --no-file-parallelism \
 *     ../../supabase/functions/figma-import-worker/index.test.ts
 *
 * Skip behaviour:
 *   - Missing Supabase env (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
 *     VITE_SUPABASE_ANON_KEY) → entire suite skipped via rlsCredentialsAvailable.
 *   - Missing FIGMA_TEST_PAT or FIGMA_TEST_SHARE_LINK → tests 2-4 skipped.
 *     Test 1 still runs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  getWorkspaceIdForUser,
  rlsCredentialsAvailable,
  uniqueTestEmail,
  type TestUser,
} from '../../../apps/web/tests/rls/setup';

// We can't resolve apps/web's node_modules from this path, so use Node's
// built-in randomUUID (UUIDv4). The Edge Function only requires the
// idempotency_key to be a UUID — it validates against a canonical regex
// that accepts v4 and v7 alike.
import { randomUUID } from 'node:crypto';
function uuidv7(): string {
  return randomUUID();
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const FIGMA_TEST_PAT = process.env.FIGMA_TEST_PAT;
const FIGMA_TEST_SHARE_LINK = process.env.FIGMA_TEST_SHARE_LINK;
const FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/figma-import-worker` : '';

describe.skipIf(!rlsCredentialsAvailable)('figma-import-worker — W-08 + B-05', () => {
  let designerA: TestUser;
  let designerB: TestUser;
  let workspaceA: string;
  let studyA: string;

  beforeAll(async () => {
    designerA = await createTestUser(uniqueTestEmail('fiw-designerA'));
    designerB = await createTestUser(uniqueTestEmail('fiw-designerB'));
    const wsA = await getWorkspaceIdForUser(designerA.id);
    if (!wsA) throw new Error('designerA workspace not found');
    workspaceA = wsA;

    // Service-role: create a draft study in workspace A. The Edge Function's
    // workspace-membership gate runs BEFORE checking study.status, so a draft
    // study is sufficient to exercise the 403 path. The happy-path test
    // (gated below) will work against this same study.
    const admin = adminClient();
    const { data: study, error } = await admin
      .from('studies')
      .insert({
        workspace_id: workspaceA,
        title: 'figma-import-worker integration',
        status: 'draft',
        created_by: designerA.id,
      })
      .select('id')
      .single();
    if (error || !study) throw error ?? new Error('study insert returned no row');
    studyA = study.id;
  }, 60_000);

  afterAll(async () => {
    // Cascade: studies → prototype_versions → frames/hotspots/prototype_imports
    // all DELETE via FK cascade when we drop the workspace. deleteTestUser
    // cascades auth.users → public.users → workspaces → memberships.
    if (designerA) await deleteTestUser(designerA.id).catch(() => {});
    if (designerB) await deleteTestUser(designerB.id).catch(() => {});
  }, 60_000);

  // -------------------------------------------------------------------------
  // Test 1 (W-08) — always-on; no Figma PAT needed.
  // -------------------------------------------------------------------------
  it('rejects 403 when caller is not a workspace member (W-08)', async () => {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerB.jwt}`,
        apikey: ANON_KEY!,
      },
      body: JSON.stringify({
        share_link: 'https://www.figma.com/proto/abcdefghijklmnopqrstuv/Test',
        pat: 'figd_dummy_value_for_403_test_only',
        study_id: studyA,
        idempotency_key: uuidv7(),
      }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('workspace_membership_required');

    // No prototype_imports row may exist for this study yet.
    const admin = adminClient();
    const { count } = await admin
      .from('prototype_imports')
      .select('id', { count: 'exact', head: true })
      .eq('study_id', studyA);
    expect(count ?? 0).toBe(0);
  }, 30_000);

  // -------------------------------------------------------------------------
  // Test 2 (W-08 happy path + B-05 render_path existence) — gated.
  // -------------------------------------------------------------------------
  it.skipIf(!FIGMA_TEST_PAT || !FIGMA_TEST_SHARE_LINK)(
    'accepts 202 + render_paths exist after completion (B-05)',
    async () => {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${designerA.jwt}`,
          apikey: ANON_KEY!,
        },
        body: JSON.stringify({
          share_link: FIGMA_TEST_SHARE_LINK!,
          pat: FIGMA_TEST_PAT!,
          study_id: studyA,
          idempotency_key: uuidv7(),
        }),
      });
      expect(res.status).toBe(202);
      const accepted = (await res.json()) as { import_id?: string };
      expect(typeof accepted.import_id).toBe('string');
      const importId = accepted.import_id!;

      const admin = adminClient();

      // Poll for terminal status (≤ 60s).
      let job: {
        status: string;
        prototype_version_id: string | null;
      } | null = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { data } = await admin
          .from('prototype_imports')
          .select('status, prototype_version_id')
          .eq('id', importId)
          .single();
        if (data && ['done', 'partial', 'failed'].includes(data.status)) {
          job = data;
          break;
        }
      }
      expect(job, 'import job did not reach a terminal status in 60s').not.toBeNull();
      expect(job!.status).toMatch(/^(done|partial)$/);
      expect(job!.prototype_version_id).toBeTruthy();

      // B-05.a: prototype_versions row is at status='complete' (not lingering
      // at 'importing' or 'failed').
      const { data: pv } = await admin
        .from('prototype_versions')
        .select('status')
        .eq('id', job!.prototype_version_id!)
        .single();
      expect(pv?.status).toBe('complete');

      // B-05.b: every render_path key MUST exist as an object in the bucket.
      const { data: frames } = await admin
        .from('frames')
        .select('render_path_1x, render_path_2x')
        .eq('prototype_version_id', job!.prototype_version_id!);
      expect(frames, 'frames returned null').not.toBeNull();
      for (const f of frames ?? []) {
        for (const p of [f.render_path_1x, f.render_path_2x]) {
          const dir = p.split('/').slice(0, -1).join('/');
          const name = p.split('/').slice(-1)[0]!;
          const { data: listing } = await admin.storage.from('prototype-renders').list(dir);
          const found = (listing ?? []).some((o) => o.name === name);
          expect(found, `missing storage object for ${p}`).toBe(true);
        }
      }
    },
    90_000,
  );
});
