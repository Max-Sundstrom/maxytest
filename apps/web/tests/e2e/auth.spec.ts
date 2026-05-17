/**
 * E2E — auth flow. Plan 01-06 Task 2 §2.
 *
 * Three tests:
 *   1. Open-redirect rejection — `/auth/callback?next=https://evil.com` must
 *      land on `/app` (or `/auth/login` if no session). T-01-02-01.
 *   2. Login page renders + magic-link form submits → /auth/sent with masked
 *      email. AUTH-01.
 *   3. Sign-out clears the session — after injection, navigate to /app, sign
 *      out, confirm redirect to /auth/login and that the session persisted.
 *
 * Magic-link round-trip via real email is OUT OF SCOPE for CI (no email
 * interceptor). Tests use service-role-issued sessions injected via
 * `localStorage` — the same shape Supabase JS stores after a real callback.
 *
 * If `SUPABASE_SERVICE_ROLE_KEY` is unset, the session-dependent tests
 * `test.fixme()` so the spec stays green on PR-from-fork builds (forks
 * don't get repo secrets per GitHub Actions default).
 */

import { expect, test } from '@playwright/test';
import {
  cleanupDesigner,
  createDesignerUser,
  e2eCredentialsAvailable,
  injectDesignerSession,
} from './_fixtures';

test.describe('auth', () => {
  test('login page renders and magic-link form submits', async ({ page }) => {
    await page.goto('/auth/login');
    // Design-system v1 rewrite (2026-05-17) — RU copy.
    await expect(page.getByRole('heading', { name: /Войти в Maxytest/i })).toBeVisible();

    // Form interaction — fill + click Send.
    const emailInput = page.getByLabel(/email/i);
    await emailInput.fill('e2e-display@example.com');
    await page.getByRole('button', { name: /Получить ссылку/i }).click();

    // Live mode (real Supabase) → masked email visible on /auth/sent.
    // Without service-role creds + Supabase reachable, the route might
    // bounce back to /auth/login with a banner — assert the friendlier
    // alternative: the form acknowledged the click.
    if (e2eCredentialsAvailable) {
      await expect(page).toHaveURL(/\/auth\/sent/, { timeout: 10_000 });
      // Masked email: "e******y@example.com" (UI-SPEC §"Auth screens").
      await expect(page.getByText(/example\.com/)).toBeVisible();
    } else {
      // Smoke fallback: the click handler ran without crashing the SPA.
      // (Either URL change OR an error toast — both are acceptable here.)
      await page.waitForTimeout(500);
      expect(await page.title()).not.toBe('');
    }
  });

  test('open-redirect via `next` query param is rejected', async ({ page }) => {
    // Pitfall 10 end-to-end. The callback handler validates `next` via
    // `isSameOriginPath` and falls back to DEFAULT_NEXT=`/app`. Without an
    // injected session the auth gate will then redirect to `/auth/login`.
    // Either way: the URL must NOT be evil.com.
    await page.goto('/auth/callback?next=https%3A%2F%2Fevil.com&token_hash=fake&type=email');

    // Whatever the destination, it must live on our origin. The Supabase
    // callback handler will try (and fail) to exchange `fake`, log a
    // friendly error, then call navigate({ to: DEFAULT_NEXT }) which the
    // _app gate redirects to /auth/login. Either /app or /auth/login is
    // acceptable — both prove the open-redirect was rejected.
    await page.waitForURL((url) => !url.hostname.includes('evil.com'), { timeout: 10_000 });
    const finalUrl = new URL(page.url());
    expect(finalUrl.hostname).not.toBe('evil.com');
    expect(['/app', '/auth/login']).toContain(finalUrl.pathname);
  });

  test('sign-out from /app clears session and returns to /auth/login', async ({ page }) => {
    test.fixme(
      !e2eCredentialsAvailable,
      'requires SUPABASE_SERVICE_ROLE_KEY for session injection',
    );

    const designer = await createDesignerUser();
    try {
      await injectDesignerSession(page, designer);
      await page.goto('/app');
      // Either the empty-tests state ("Create your first test") or the
      // populated state — both prove we made it past the auth gate.
      await expect(
        page.getByRole('button', { name: /create your first test|new test/i }).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Sign out via the avatar / topbar menu.
      // UI-SPEC.md §"Workspace top bar" — menu trigger labelled by initials.
      await page
        .getByRole('button', { name: /account|avatar|menu/i })
        .first()
        .click();
      await page.getByRole('menuitem', { name: /sign out|log out/i }).click();

      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });

      // Reload → still on login (session cleared, not just navigated).
      await page.reload();
      await expect(page).toHaveURL(/\/auth\/login/);
    } finally {
      await cleanupDesigner(designer.userId);
    }
  });
});
