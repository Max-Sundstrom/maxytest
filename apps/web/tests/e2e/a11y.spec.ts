/**
 * E2E — axe-core a11y scan. Plan 01-06 Task 2 §5.
 *
 * Asserts WCAG 2.1 AA conformance on the three runner block screens
 * (welcome → open_question → thanks). The runner is the primary public
 * surface (~80% of traffic per CLAUDE.md mobile-first constraint), so AA
 * is non-negotiable. The prototype block (Phase 2+) gets a "WCAG
 * best-effort" scope per the same constraint.
 *
 * If `SUPABASE_SERVICE_ROLE_KEY` is missing the tests fixme; the
 * a11y-on-login-page check still runs (no provisioning needed).
 *
 * Common violations to watch for:
 *   - color-contrast on subtle text (UI-SPEC tokens should be AA-clean)
 *   - target-size (WCAG 2.5.5) — tap targets ≥44×44px on mobile
 *   - aria-labels on icon-only buttons
 *
 * If a violation surfaces, FIX THE SOURCE — never relax the rule list.
 */

import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test } from '@playwright/test';
import {
  cleanupDesigner,
  e2eCredentialsAvailable,
  setupPublishedStudy,
} from './_fixtures';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

test.use({ ...devices['Pixel 7'] });

test.describe('a11y — runner screens (axe-core, mobile viewport)', () => {
  test('login page has zero WCAG AA violations', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /Sign in to Maxytest/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('welcome runner screen has zero WCAG AA violations', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const setup = await setupPublishedStudy();
    try {
      await page.goto(`/r/${setup.runToken}`);
      await expect(page.getByRole('progressbar').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /start|begin/i }).first()).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await cleanupDesigner(setup.designer.userId);
    }
  });

  test('open_question runner screen has zero WCAG AA violations', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const setup = await setupPublishedStudy();
    try {
      await page.goto(`/r/${setup.runToken}`);
      await page.getByRole('button', { name: /start|begin/i }).first().click();
      await expect(page.getByRole('textbox').first()).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await cleanupDesigner(setup.designer.userId);
    }
  });

  test('thanks runner screen has zero WCAG AA violations', async ({ page }) => {
    test.fixme(!e2eCredentialsAvailable, 'requires SUPABASE_SERVICE_ROLE_KEY');

    const setup = await setupPublishedStudy();
    try {
      await page.goto(`/r/${setup.runToken}`);
      await page.getByRole('button', { name: /start|begin/i }).first().click();
      await page.getByRole('textbox').first().fill('a11y answer');
      await page.getByRole('button', { name: /finish|next|submit/i }).first().click();
      await expect(page.getByRole('heading', { name: /thanks/i }).first()).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await cleanupDesigner(setup.designer.userId);
    }
  });
});
