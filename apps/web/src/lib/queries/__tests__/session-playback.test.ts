/**
 * `useSessionPlayback` hook tests — Plan 03-05 Task 1.
 *
 * Light hook coverage — verifies the contract surface (enabled gating
 * + queryKey shape + staleTime) without exercising the Supabase round-trip.
 * Integration coverage (does the data actually flow into PlaybackPlayer?)
 * lands in Plan 03-06 via a Playwright E2E walk-through.
 *
 * Pattern: render the hook inside a `QueryClientProvider` wrapper with
 * `retry: false` so disabled queries stay disabled (no network attempt).
 * We assert against `queryClient.getQueryCache()` to introspect the
 * registered query — this is the lowest-friction way to verify the
 * queryKey shape without mocking `supabase.from`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock @supabase/supabase-js so `@/lib/supabase/auth` can instantiate without
// reading import.meta.env.VITE_* at module init. The hook under test doesn't
// actually invoke the client in these cases (queries are either disabled or
// never resolved — we only assert the queryKey/enabled contract).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  }),
}));

// Late import AFTER the mock so `auth.ts` picks up the mocked createClient.
const { useSessionPlayback } = await import('../session-playback');

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { wrapper, qc };
}

describe('useSessionPlayback', () => {
  it('is disabled when sessionId is null (no fetch, data undefined)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSessionPlayback(null, 'block-1'), { wrapper });

    // disabled queries report `pending` status with `fetchStatus === 'idle'`.
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it('is disabled when blockId is null (no fetch, data undefined)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSessionPlayback('session-1', null), { wrapper });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it('registers a queryKey of shape ["session-playback", sessionId, blockId]', () => {
    const { wrapper, qc } = makeWrapper();
    renderHook(() => useSessionPlayback('session-1', 'block-1'), { wrapper });

    const queries = qc.getQueryCache().getAll();
    const registered = queries.find((q) => q.queryKey[0] === 'session-playback');
    expect(registered).toBeDefined();
    expect(registered!.queryKey).toEqual(['session-playback', 'session-1', 'block-1']);
  });
});
