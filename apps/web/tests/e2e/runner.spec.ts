/**
 * E2E — respondent runner (mobile-chromium project). Plan 01-06 Task 2 §4.
 *
 * Three tests:
 *   1. Full runner happy path — Pixel 7 viewport, complete welcome →
 *      open_question → thanks. Asserts progress bar visible + aria-valuenow
 *      reaches the final block index.
 *   2. Archived test → <TestNotAcceptingScreen> renders.
 *   3. Invalid 22-char token → 404 card.
 *
 * `setupPublishedStudy` (fixtures) does all the provisioning; the spec just
 * navigates to /r/{run_token}.
 *
 * Mobile-only: explicit `test.use({...devices['Pixel 7']})` is redundant
 * because the project config already specifies the device, but keeping it
 * here makes the file self-documenting.
 */

import { devices, expect, test } from '@playwright/test';
import {
  cleanupDesigner,
  e2eCredentialsAvailable,
  serviceRoleClient,
  setupPublishedStudy,
} from './_fixtures';

test.use({ ...devices['Pixel 7'] });

test.describe('runner — mobile happy path', () => {
  test('welcome → open_question → thanks completes successfully', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const setup = await setupPublishedStudy();
    try {
      await page.goto(`/r/${setup.runToken}`);

      // Progress bar present (RUNNER-02).
      const progress = page.getByRole('progressbar').first();
      await expect(progress).toBeVisible({ timeout: 10_000 });

      // Welcome → click Start (default CTA per RUNNER-01 / block defaults).
      await page.getByRole('button', { name: /start|begin/i }).first().click();

      // OpenQuestion editor appears.
      const textarea = page.getByRole('textbox').first();
      await expect(textarea).toBeVisible({ timeout: 10_000 });
      await textarea.fill('E2E answer payload');

      // Finish.
      await page.getByRole('button', { name: /finish|next|submit/i }).first().click();

      // Thanks heading.
      await expect(page.getByRole('heading', { name: /thanks/i }).first()).toBeVisible({
        timeout: 10_000,
      });

      // Progress bar fully advanced (aria-valuenow == aria-valuemax).
      const valueNow = await progress.getAttribute('aria-valuenow');
      const valueMax = await progress.getAttribute('aria-valuemax');
      expect(valueNow).toBe(valueMax);
    } finally {
      await cleanupDesigner(setup.designer.userId);
    }
  });

  test('archived test shows TestNotAcceptingScreen', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const setup = await setupPublishedStudy();
    try {
      // Archive via service-role (bypasses RLS).
      const admin = serviceRoleClient();
      await admin
        .from('studies')
        .update({ status: 'archived', archived_at: new Date().toISOString() })
        .eq('id', setup.studyId);

      await page.goto(`/r/${setup.runToken}`);
      await expect(
        page.getByRole('heading', { name: /isn'?t accepting responses/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupDesigner(setup.designer.userId);
    }
  });

  test('invalid run_token shows 404 card', async ({ page }) => {
    // 22-char token that won't match anything in the DB.
    await page.goto('/r/aaaaaaaaaaaaaaaaaaaaaa');
    await expect(
      page.getByRole('heading', { name: /can'?t find this test|not found/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
