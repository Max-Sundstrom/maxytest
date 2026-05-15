/**
 * E2E — builder flow. Plan 01-06 Task 2 §3 (desktop-chromium only).
 *
 * Four tests:
 *   1. Create test from empty-state → builder renders welcome + thanks.
 *   2. Edit welcome title → autosave → reload → title persists. D-13 + D-14.
 *   3. Add `open_question` via catalog → third card appears.
 *      (Drag-reorder is brittle in Playwright; validated in human checkpoint
 *      Task 10 of Plan 01-03 + via the `useReorderBlocks` unit test.)
 *   4. Publish → toast confirms + topbar shows "Published".
 *
 * All four tests share `setupPublishedStudy` is overkill — the builder owns
 * the lifecycle. Instead each test provisions a fresh designer + opens
 * /app, exercising the real create-study flow end-to-end.
 *
 * Skip-on-no-creds: same approach as auth.spec.ts.
 */

import { expect, test } from '@playwright/test';
import {
  cleanupDesigner,
  createDesignerUser,
  e2eCredentialsAvailable,
  injectDesignerSession,
} from './_fixtures';

// Builder = desktop-only — D-26 maps mobile to <MobileBuilderBlocked>.
test.describe('builder (desktop-chromium only)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only suite');

  test('create test → builder renders welcome + thanks defaults', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const designer = await createDesignerUser();
    try {
      await injectDesignerSession(page, designer);
      await page.goto('/app');

      // Empty-tests state on first visit.
      const createBtn = page
        .getByRole('button', { name: /create your first test/i })
        .first();
      await expect(createBtn).toBeVisible({ timeout: 15_000 });
      await createBtn.click();

      // Builder route — UUID URL pattern.
      await expect(page).toHaveURL(/\/studies\/[0-9a-f-]+\/edit/, { timeout: 10_000 });

      // Welcome + thanks default blocks visible.
      await expect(page.getByText(/Welcome/i).first()).toBeVisible();
      await expect(page.getByText(/Thanks/i).first()).toBeVisible();
    } finally {
      await cleanupDesigner(designer.userId);
    }
  });

  test('edit welcome title → autosave → reload persists', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const designer = await createDesignerUser();
    try {
      await injectDesignerSession(page, designer);
      await page.goto('/app');
      await page.getByRole('button', { name: /create your first test/i }).first().click();
      await page.waitForURL(/\/studies\/[0-9a-f-]+\/edit/);

      // Click into the welcome title editor (inline-edit per Plan 01-03).
      const titleField = page.getByRole('textbox', { name: /title|welcome.*title/i }).first();
      await titleField.click();
      await titleField.fill('Edited welcome title E2E');

      // Wait past the 700ms debounce + the save round-trip.
      await page.waitForTimeout(1500);
      await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 10_000 });

      // Reload and assert the title persisted.
      await page.reload();
      await expect(page.getByText('Edited welcome title E2E')).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupDesigner(designer.userId);
    }
  });

  test('add open_question via catalog → third card appears', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const designer = await createDesignerUser();
    try {
      await injectDesignerSession(page, designer);
      await page.goto('/app');
      await page.getByRole('button', { name: /create your first test/i }).first().click();
      await page.waitForURL(/\/studies\/[0-9a-f-]+\/edit/);

      // Initial: 2 cards (welcome + thanks).
      const initialCount = await page.locator('[data-block-card]').count();
      expect(initialCount).toBeGreaterThanOrEqual(2);

      // "+ Add block" → catalog → "Open question".
      await page.getByRole('button', { name: /add block|\+/ }).first().click();
      await page.getByRole('button', { name: /open question/i }).first().click();

      // Third card appears.
      await expect.poll(async () => page.locator('[data-block-card]').count()).toBeGreaterThan(
        initialCount,
      );
    } finally {
      await cleanupDesigner(designer.userId);
    }
  });

  test('publish → toast + topbar shows Published', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const designer = await createDesignerUser();
    try {
      await injectDesignerSession(page, designer);
      await page.goto('/app');
      await page.getByRole('button', { name: /create your first test/i }).first().click();
      await page.waitForURL(/\/studies\/[0-9a-f-]+\/edit/);

      // Add at least one non-pinned block so the study is publishable (D-14).
      await page.getByRole('button', { name: /add block|\+/ }).first().click();
      await page.getByRole('button', { name: /open question/i }).first().click();
      await page.waitForTimeout(800); // autosave debounce + save

      // Click "Publish".
      await page.getByRole('button', { name: /publish/i }).first().click();

      // Toast confirms.
      await expect(
        page.getByRole('status').filter({ hasText: /published/i }).first(),
      ).toBeVisible({ timeout: 10_000 });

      // Topbar status now shows Published.
      await expect(page.getByText(/published/i).first()).toBeVisible();
    } finally {
      await cleanupDesigner(designer.userId);
    }
  });
});
