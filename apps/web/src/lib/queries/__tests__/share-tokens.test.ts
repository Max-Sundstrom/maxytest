/**
 * `share-tokens` hook unit tests — Plan 04-06 Task 5 (RED → GREEN).
 *
 * Behavioural contract:
 *   - useShareToken(studyId) → query, `enabled=!!studyId`, queryKey
 *     `['share-token', studyId]`. Issues
 *     `supabase.from('share_tokens').select(...).eq('study_id', studyId)
 *      .order(...).limit(1).maybeSingle()`.
 *   - useCreateShareToken → calls `supabase.rpc('create_share_token',
 *     { p_study_id, p_token, p_idempotency_key, p_open_answer_visibility })`.
 *     `p_token` is a freshly-generated nanoid(21); `p_idempotency_key` is a
 *     uuidv7. On success, invalidates `['share-token', studyId]`.
 *   - useRevokeShareToken → calls `supabase.rpc('revoke_share_token',
 *     { p_token, p_reactivate })`. `p_reactivate` defaults to false.
 *   - useRotateShareToken → calls `supabase.rpc('rotate_share_token',
 *     { p_old_token, p_new_token, p_idempotency_key })`. `p_new_token` is a
 *     fresh nanoid(21).
 *   - useUpdateShareTokenVisibility → direct UPDATE on share_tokens table
 *     (RLS designer_rw gates writes); does NOT use rpc.
 *
 * The Supabase client constructor (`@supabase/supabase-js`) is mocked the
 * same way `duplicate-study.test.ts` mocks it — we stub `createClient` to
 * return a plain object with `auth`, `from`, `rpc` so the late-import in
 * `share-tokens.ts` succeeds at test time without VITE_SUPABASE_* env vars.
 *
 * `nanoid` and `uuidv7` are stubbed to deterministic values so RPC argument
 * assertions are byte-exact.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// Hoisted mocks — used by the late-import of share-tokens.ts below.
const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMaybeSingleMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: maybeSingleMock,
            }),
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: updateMaybeSingleMock,
          }),
        }),
      }),
    }),
    rpc: rpcMock,
  }),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'tok_aaaaaaaaaaaaaaaaaa',
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => '00000000-0000-7000-8000-000000000001',
}));

const {
  useShareToken,
  useCreateShareToken,
  useRevokeShareToken,
  useRotateShareToken,
  useUpdateShareTokenVisibility,
} = await import('../share-tokens');

function wrapper({ children, qc }: { children: ReactNode; qc: QueryClient }) {
  return createElement(QueryClientProvider, { client: qc }, children);
}
function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => wrapper({ children, qc });
}

beforeEach(() => {
  rpcMock.mockReset();
  maybeSingleMock.mockReset();
  updateMaybeSingleMock.mockReset();
});

describe('useShareToken', () => {
  it('returns the latest share-token row for a study', async () => {
    const row = {
      id: 'st-1',
      study_id: 's1',
      token: 'tok_existing',
      is_active: true,
      created_at: '2026-05-20T00:00:00Z',
      revoked_at: null,
      created_by: 'u1',
      open_answer_visibility: {},
      title_snapshot: 'My study',
    };
    maybeSingleMock.mockResolvedValue({ data: row, error: null });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useShareToken('s1'), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(row);
  });

  it('is disabled when studyId is null', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useShareToken(null), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCreateShareToken', () => {
  it('calls supabase.rpc("create_share_token", { p_study_id, p_token, p_idempotency_key, p_open_answer_visibility })', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'st-1', study_id: 's1', token: 'tok_aaaaaaaaaaaaaaaaaa' },
      error: null,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result } = renderHook(() => useCreateShareToken(), {
      wrapper: makeWrapper(qc),
    });

    await result.current.mutateAsync({ studyId: 's1' });

    expect(rpcMock).toHaveBeenCalledWith('create_share_token', {
      p_study_id: 's1',
      p_token: 'tok_aaaaaaaaaaaaaaaaaa',
      p_idempotency_key: '00000000-0000-7000-8000-000000000001',
      p_open_answer_visibility: {},
    });
  });

  it('passes openAnswerVisibility through when supplied', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({
      studyId: 's1',
      openAnswerVisibility: { 'b-1': true },
    });
    expect(rpcMock).toHaveBeenCalledWith('create_share_token', {
      p_study_id: 's1',
      p_token: 'tok_aaaaaaaaaaaaaaaaaa',
      p_idempotency_key: '00000000-0000-7000-8000-000000000001',
      p_open_answer_visibility: { 'b-1': true },
    });
  });

  it('invalidates ["share-token", studyId] on success', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useCreateShareToken(), {
      wrapper: makeWrapper(qc),
    });

    await result.current.mutateAsync({ studyId: 's1' });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['share-token', 's1'] });
    });
  });

  it('re-throws on rpc error', async () => {
    const failure = new Error('forbidden');
    rpcMock.mockResolvedValue({ data: null, error: failure });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await expect(result.current.mutateAsync({ studyId: 's1' })).rejects.toBe(failure);
  });
});

describe('useRevokeShareToken', () => {
  it('defaults p_reactivate to false', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useRevokeShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({ token: 'tok', studyId: 's1' });
    expect(rpcMock).toHaveBeenCalledWith('revoke_share_token', {
      p_token: 'tok',
      p_reactivate: false,
    });
  });

  it('passes reactivate=true through', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useRevokeShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({ token: 'tok', studyId: 's1', reactivate: true });
    expect(rpcMock).toHaveBeenCalledWith('revoke_share_token', {
      p_token: 'tok',
      p_reactivate: true,
    });
  });

  it('invalidates ["share-token", studyId] on success', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useRevokeShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({ token: 'tok', studyId: 's1' });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['share-token', 's1'] });
    });
  });
});

describe('useRotateShareToken', () => {
  it('calls supabase.rpc("rotate_share_token", { p_old_token, p_new_token, p_idempotency_key })', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok_aaaaaaaaaaaaaaaaaa' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useRotateShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({ oldToken: 'old', studyId: 's1' });
    expect(rpcMock).toHaveBeenCalledWith('rotate_share_token', {
      p_old_token: 'old',
      p_new_token: 'tok_aaaaaaaaaaaaaaaaaa',
      p_idempotency_key: '00000000-0000-7000-8000-000000000001',
    });
  });

  it('invalidates ["share-token", studyId] on success', async () => {
    rpcMock.mockResolvedValue({ data: { token: 'tok' }, error: null });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useRotateShareToken(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({ oldToken: 'old', studyId: 's1' });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['share-token', 's1'] });
    });
  });
});

describe('useUpdateShareTokenVisibility', () => {
  it('issues direct UPDATE on share_tokens (not RPC)', async () => {
    updateMaybeSingleMock.mockResolvedValue({
      data: { token: 'tok', open_answer_visibility: { 'b-1': true } },
      error: null,
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useUpdateShareTokenVisibility(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({
      token: 'tok',
      studyId: 's1',
      visibility: { 'b-1': true },
    });
    // Direct UPDATE path — rpc must NOT have been called.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(updateMaybeSingleMock).toHaveBeenCalled();
  });

  it('invalidates ["share-token", studyId] on success', async () => {
    updateMaybeSingleMock.mockResolvedValue({
      data: { token: 'tok', open_answer_visibility: {} },
      error: null,
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateShareTokenVisibility(), {
      wrapper: makeWrapper(qc),
    });
    await result.current.mutateAsync({
      token: 'tok',
      studyId: 's1',
      visibility: {},
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['share-token', 's1'] });
    });
  });
});
