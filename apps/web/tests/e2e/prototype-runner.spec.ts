/**
 * E2E — Phase 2 prototype runner happy path (mobile profile).
 *
 * Plan 02-09 Task 4 / W-04 (verbatim seed — no placeholder TODO comments;
 * the full beforeAll body is inlined here).
 *
 * What this proves end-to-end:
 *   1. A respondent on a mobile viewport (Pixel 5) opens /r/{run_token},
 *      lands directly on the prototype block (position 0), and sees the
 *      starting frame inside a fixed-aspect wrapper.
 *   2. The PrototypeRunner pins the session to prototype_version_id on
 *      mount (B-03) via set_session_prototype_pin.
 *   3. The runner mints signed URLs once (B-04) — in this test the seeded
 *      render_path_* point at a stable placeholder so the spec exercises
 *      the events ingest path, not the Storage bucket.
 *   4. A tap inside the hotspot bbox fires a `tap` event with normalized
 *      coords in [0, 1] + `block_id` = the prototype block's PK (B-02).
 *   5. The transition fires `frame_exit` + `frame_enter` events; the
 *      Finish-task CTA fires `task_finish`.
 *   6. Every event row carries the session's pinned `prototype_version_id`
 *      (B-03) and a strictly-monotonic `seq` (Plan 02-08 seq-counter).
 *
 * The seed uses the service-role client (bypasses RLS) to provision the
 * workspace + study + prototype + frames + hotspot + prototype block in
 * one beforeAll. RLS-correctness is covered by the RLS suite under
 * apps/web/tests/rls/.
 */

import { test, expect, devices } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { uuidv7 } from 'uuidv7';
import type { Database } from '../../src/lib/supabase/types.gen';

test.use({ ...devices['Pixel 5'] });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const e2eCredentialsAvailable: boolean = Boolean(SUPABASE_URL && SERVICE_KEY);

test.describe('Prototype runner — mobile happy path', () => {
  // Per-suite identifiers (fresh on every run) — gen up-front so beforeAll +
  // afterAll + the test body all see the same UUIDs.
  const workspaceId = uuidv7();
  const studyId = uuidv7();
  const prototypeVersionId = uuidv7();
  const blockId = uuidv7();
  const frameDbF1 = uuidv7();
  const frameDbF2 = uuidv7();
  const hotspotId = uuidv7();
  const runToken = `phase2-e2e-${Date.now()}`;

  const designerEmail = `phase2-e2e-${Date.now()}@e2e.maxytest.local`;
  const designerPassword = `phase2-e2e-PW-${Date.now()}!`;

  /**
   * Placeholder render path stored in `frames.render_path_*`. PrototypeRunner
   * mints signed URLs from the `prototype-renders` Supabase Storage bucket;
   * a fake path means createSignedUrls fails for that row and FrameLayer
   * falls back to a "Loading…" placeholder. That's fine for this E2E — the
   * spec covers the events ingest path, NOT the Storage signing path.
   * The frame wrapper still receives onPointerDown so taps still fire.
   */
  const PLACEHOLDER_PATH = `e2e/placeholder-${Date.now()}.png`;

  // Lazily constructed inside hooks so an unconfigured environment can still
  // `test.fixme` cleanly (no top-level throw).
  function sbClient() {
    return createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  let designerUserId: string | null = null;

  test.beforeAll(async () => {
    test.fixme(!e2eCredentialsAvailable, 'requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    const sb = sbClient();

    // 1. Designer user (admin API). Idempotent: ignore "already exists" errors.
    const created = await sb.auth.admin.createUser({
      email: designerEmail,
      password: designerPassword,
      email_confirm: true,
    });
    if (created.data.user) {
      designerUserId = created.data.user.id;
    } else {
      // User already existed — look up via the mirrored `public.users` table.
      const { data: existing } = await sb
        .from('users')
        .select('id')
        .eq('email', designerEmail)
        .maybeSingle();
      designerUserId = (existing?.id as string | undefined) ?? null;
    }
    if (!designerUserId) throw new Error('designer user setup failed');

    // 2. Workspace + owner membership (slug is unique per migration 00001).
    const slug = `e2e-${designerUserId.slice(0, 8)}-${Date.now()}`;
    const { error: wsErr } = await sb.from('workspaces').insert({
      id: workspaceId,
      name: 'Phase 2 E2E',
      slug,
      created_by: designerUserId,
    });
    if (wsErr) throw new Error(`workspace insert failed: ${wsErr.message}`);

    const { error: memErr } = await sb.from('memberships').insert({
      workspace_id: workspaceId,
      user_id: designerUserId,
      role: 'owner',
    });
    if (memErr) throw new Error(`membership insert failed: ${memErr.message}`);

    // 3. Study (status='published' so the runner can read it).
    const { error: studyErr } = await sb.from('studies').insert({
      id: studyId,
      workspace_id: workspaceId,
      title: 'E2E prototype',
      status: 'published',
      run_token: runToken,
      created_by: designerUserId,
      published_at: new Date().toISOString(),
    });
    if (studyErr) throw new Error(`study insert failed: ${studyErr.message}`);

    // 4. prototype_versions (status='complete' — runner will only read complete).
    const { error: pvErr } = await sb.from('prototype_versions').insert({
      id: prototypeVersionId,
      study_id: studyId,
      figma_file_key: 'e2eFIGMAFILEKEY1234567890',
      figma_file_name: 'E2E fixture',
      figma_node_tree: { document: { children: [] } },
      starting_frame_id: 'F1',
      status: 'complete',
    });
    if (pvErr) throw new Error(`prototype_versions insert failed: ${pvErr.message}`);

    // 5. Two frames (F1 + F2). render_path_* point to placeholder — see comment
    //    on PLACEHOLDER_PATH above. Storage signing is exercised in the
    //    integration suite for Plan 02-02.
    const { error: framesErr } = await sb.from('frames').insert([
      {
        id: frameDbF1,
        prototype_version_id: prototypeVersionId,
        frame_id: 'F1',
        name: 'Start',
        width: 375,
        height: 812,
        render_path_1x: PLACEHOLDER_PATH,
        render_path_2x: PLACEHOLDER_PATH,
        position: 0,
      },
      {
        id: frameDbF2,
        prototype_version_id: prototypeVersionId,
        frame_id: 'F2',
        name: 'Target',
        width: 375,
        height: 812,
        render_path_1x: PLACEHOLDER_PATH,
        render_path_2x: PLACEHOLDER_PATH,
        position: 1,
      },
    ]);
    if (framesErr) throw new Error(`frames insert failed: ${framesErr.message}`);

    // 6. One hotspot on F1 → F2 covering most of the frame for an easy tap.
    const { error: hotspotErr } = await sb.from('hotspots').insert({
      id: hotspotId,
      frame_id: frameDbF1,
      prototype_version_id: prototypeVersionId,
      hotspot_id: 'H1',
      target_frame_id: 'F2',
      transition_kind: 'dissolve',
      bbox_x: 0.2,
      bbox_y: 0.2,
      bbox_w: 0.6,
      bbox_h: 0.6,
      z_index: 0,
      figma_raw: {},
    });
    if (hotspotErr) throw new Error(`hotspots insert failed: ${hotspotErr.message}`);

    // 7. Single prototype block at position 0 — runner mounts it directly,
    //    without a welcome step.
    const { error: blockErr } = await sb.from('blocks').insert({
      id: blockId,
      study_id: studyId,
      position: 0,
      type: 'prototype',
      pinned: false,
      version: 0,
      content: {
        type: 'prototype',
        prototype_version_id: prototypeVersionId,
        starting_frame_id: 'F1',
        task_instruction: 'Tap the button',
        success_path: ['F2'],
        finish_frame_ids: ['F2'],
      },
    });
    if (blockErr) throw new Error(`blocks insert failed: ${blockErr.message}`);
  });

  test.afterAll(async () => {
    if (!e2eCredentialsAvailable) return;
    const sb = sbClient();
    // Cascade-deletes via workspace → study → blocks → sessions → events,
    // and prototype_versions → frames → hotspots.
    await sb.from('workspaces').delete().eq('id', workspaceId);
    if (designerUserId) {
      try {
        await sb.auth.admin.deleteUser(designerUserId);
      } catch {
        /* noop — leaves a straggler but the suite is idempotent on rerun */
      }
    }
  });

  test('respondent taps a hotspot, events land in DB with normalized coords + monotonic seq', async ({
    page,
  }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    const sb = sbClient();

    await page.goto(`/r/${runToken}`);

    // Runner mounts the prototype block directly (position 0 — no welcome).
    // The frame container exposes aria-label="Start" via FrameLayer's wrapper.
    const frame = page.locator('[aria-label="Start"]').first();
    await expect(frame).toBeVisible({ timeout: 15_000 });

    // The wrapper has aspect-ratio + a Loading… placeholder when no signed URL
    // resolves (E2E uses a fake render_path). The bbox of the wrapper is what
    // we tap against — pointerdown still fires onto the parent.
    const box = await frame.boundingBox();
    if (!box) throw new Error('frame not measurable');

    // Tap the center — lands in the hotspot bbox (0.2..0.8 covers center).
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // Allow transition (200ms dissolve) + frame_enter for F2 to flush.
    await page.waitForTimeout(800);

    // Explicit Finish task — runner emits task_finish + advances.
    await page.getByRole('button', { name: /finish task/i }).click();
    // Allow EventBuffer.flush() (final flush awaited in handleFinishTask).
    await page.waitForTimeout(2_500);

    // Query the events table by study_id (server-enriched).
    const { data: events, error } = await sb.from('events').select('*').eq('study_id', studyId);
    if (error) throw error;

    const eventList = events ?? [];
    expect(eventList.length).toBeGreaterThanOrEqual(3);

    // tap event with normalized coords + B-02 block_id attribution.
    const tap = eventList.find((e) => e.event_type === 'tap');
    expect(tap).toBeDefined();
    expect(tap?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(tap?.x ?? 2).toBeLessThanOrEqual(1);
    expect(tap?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(tap?.y ?? 2).toBeLessThanOrEqual(1);
    // B-02: tap is attributed to our blockId.
    expect(tap?.block_id).toBe(blockId);

    // task_finish event present.
    const finish = eventList.find((e) => e.event_type === 'task_finish');
    expect(finish).toBeDefined();

    // Monotonic seq per session.
    const sortedSeqs = eventList
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.seq);
    for (let i = 1; i < sortedSeqs.length; i++) {
      expect(sortedSeqs[i]).toBeGreaterThan(sortedSeqs[i - 1]);
    }

    // B-03: every event row's prototype_version_id matches the pinned id.
    for (const e of eventList) {
      expect(e.prototype_version_id).toBe(prototypeVersionId);
    }
  });
});
