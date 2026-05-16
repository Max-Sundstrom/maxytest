/**
 * `getCurrentAnonAccessToken` unit tests — Plan 02-08 Task 2 (W-05).
 *
 * Locks the helper-isolation invariant: the EventBuffer's pagehide handler
 * MUST NOT parse `localStorage['maxytest-runner-auth']` JSON directly. The
 * helper hides supabase-js's caching mechanics behind a stable interface so
 * the buffer file contains no `'maxytest-runner-auth'` literal (verified
 * separately by event-buffer.test.ts test 6).
 *
 * `vi.mock('@supabase/supabase-js', ...)` replaces `createClient` with a
 * stub that returns a controllable `auth.getSession()` mock — per-test we
 * set the resolved / rejected value via `getSession.mockResolvedValue(...)`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock supabase-js BEFORE importing the module under test. The createClient
// factory returns an object with a single `.auth.getSession()` stub the tests
// drive directly.
const getSession = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession },
  }),
}));

let getCurrentAnonAccessToken: () => Promise<string | null>;

beforeEach(async () => {
  vi.resetModules();
  getSession.mockReset();
  ({ getCurrentAnonAccessToken } = await import('./anon'));
});

describe('getCurrentAnonAccessToken', () => {
  it('returns the access token from the cached session', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'abc.def.ghi' } },
      error: null,
    });
    expect(await getCurrentAnonAccessToken()).toBe('abc.def.ghi');
  });

  it('returns null when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getCurrentAnonAccessToken()).toBeNull();
  });

  it('returns null when getSession rejects (does NOT throw)', async () => {
    getSession.mockRejectedValue(new Error('network'));
    await expect(getCurrentAnonAccessToken()).resolves.toBeNull();
  });

  it('returns null when getSession resolves with an error field', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'AuthSessionMissingError' },
    });
    expect(await getCurrentAnonAccessToken()).toBeNull();
  });
});
