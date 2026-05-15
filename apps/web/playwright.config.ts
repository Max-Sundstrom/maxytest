/**
 * Playwright config — Plan 01-06 Task 2.
 *
 * Three device projects per mobile-first runner spec:
 *   - `desktop-chromium`  → builder/auth/E2E flows that are desktop-only
 *   - `mobile-chromium`   → Pixel 7 viewport (411×823) — runner happy path
 *   - `mobile-webkit`     → iPhone 14 viewport — Safari engine smoke
 *
 * RLS data is shared across the suite (tests create test users via the
 * service-role key in fixtures), so `fullyParallel: false` keeps the
 * suite serial within a project. Different device projects still run in
 * parallel via Playwright's workers.
 *
 * Tests against Supabase rate-limit aggressively on Free tier (PHASE-1
 * known-issue: parallel auth.signInWithOtp triggers 429). Use
 * `--workers=1` in CI if rate-limits bite; locally Playwright defaults are fine.
 *
 * CI flow:
 *   - `pnpm build` produces `apps/web/dist/`
 *   - `pnpm preview` serves it on :4173
 *   - Playwright `webServer` block boots the preview when not in CI
 *     (CI runs preview as a separate step so logs are visible).
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Runner specs mutate the same study; keep them serial. Use describe-level
  // parallelism if individual specs grow independent.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub Actions ingests the `github` reporter (annotates the PR diff).
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Local: boot `vite preview` automatically. CI: assume an earlier step
  // already started the preview server (so we can inspect its logs on failure).
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm preview --port 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
});
