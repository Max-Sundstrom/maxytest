/**
 * `EventBuffer` unit tests — Plan 02-08 Task 3.
 *
 * Covers the runtime invariants of the client-side ingest buffer:
 *
 *   1. push() adds events to the buffer.
 *   2. 20-event threshold auto-flushes (B-02 — blockId flows into the RPC).
 *   3. 1s timer auto-flushes (vi.useFakeTimers()).
 *   4. flush() error path re-queues events (`unshift(...drained)`).
 *   5. dispose() cancels the timer + removes the pagehide listener.
 *   6. pagehide handler uses `getCurrentAnonAccessToken()` (W-05) —
 *      verified by behavior AND by static-file check (no
 *      `'maxytest-runner-auth'` literal in event-buffer.ts).
 *   7. Concurrent flush() while one is in flight returns immediately.
 *   8. (W-10) pagehide while fetch rejects → sessionStorage retains events.
 *   9. (W-10) successful flush clears the sessionStorage key.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the supabase anon client + helper. We control rpc + getSession per-test.
// vi.mock is hoisted above local declarations; use vi.hoisted to share fn refs.
const { rpc, getCurrentAnonAccessToken } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getCurrentAnonAccessToken: vi.fn(),
}));
vi.mock('@/lib/supabase/anon', () => ({
  supabaseAnon: { rpc },
  getCurrentAnonAccessToken,
}));

import { EventBuffer, type QueuedEvent } from './event-buffer';

function makeEvent(overrides: Partial<QueuedEvent> = {}): QueuedEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    seq: overrides.seq ?? 1,
    frame_id: overrides.frame_id ?? 'frame-1',
    hotspot_id: overrides.hotspot_id ?? null,
    hit_target_id: overrides.hit_target_id ?? null,
    event_type: overrides.event_type ?? 'tap',
    x: overrides.x ?? 0.5,
    y: overrides.y ?? 0.5,
    client_ts: overrides.client_ts ?? new Date().toISOString(),
  };
}

const SESSION_ID = '11111111-1111-7111-8111-111111111111';
const BLOCK_ID = '22222222-2222-7222-8222-222222222222';

describe('EventBuffer', () => {
  beforeEach(() => {
    rpc.mockReset();
    getCurrentAnonAccessToken.mockReset();
    getCurrentAnonAccessToken.mockResolvedValue('mock.access.token');
    rpc.mockResolvedValue({ data: 0, error: null });
    try {
      window.sessionStorage.clear();
    } catch {
      /* noop */
    }
    // Stub VITE env vars used by pagehide URL construction.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1 — push() adds events to the internal buffer
  // -------------------------------------------------------------------------
  it('push() adds an event to the buffer', () => {
    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.push(makeEvent());
    expect(buf.__peekBufferLength()).toBe(1);
    buf.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 2 — 20-threshold auto-flush; blockId flows through (B-02)
  // -------------------------------------------------------------------------
  it('auto-flushes at the 20-event threshold and passes p_block_id through', async () => {
    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    for (let i = 0; i < 20; i++) buf.push(makeEvent({ seq: i + 1 }));
    // Microtask + macrotask drain so the void flush() Promise resolves.
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledTimes(1);
    const [rpcName, args] = rpc.mock.calls[0];
    expect(rpcName).toBe('submit_events');
    expect(args).toMatchObject({
      p_session_id: SESSION_ID,
      p_block_id: BLOCK_ID,
    });
    expect(Array.isArray(args.p_events)).toBe(true);
    expect(args.p_events).toHaveLength(20);
    buf.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 3 — 1s timer auto-flush
  // -------------------------------------------------------------------------
  it('1s timer auto-flushes a partial buffer', async () => {
    vi.useFakeTimers();
    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.push(makeEvent());
    buf.push(makeEvent({ seq: 2 }));
    // Advance the wall clock by the flush interval.
    await vi.advanceTimersByTimeAsync(1000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_events).toHaveLength(2);
    buf.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 4 — re-queue on transient flush error
  // -------------------------------------------------------------------------
  it('re-queues events when flush() returns an error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.push(makeEvent({ seq: 1 }));
    buf.push(makeEvent({ seq: 2 }));
    await buf.flush();
    // Failed flush should restore the events for the next attempt.
    expect(buf.__peekBufferLength()).toBe(2);
    buf.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 5 — dispose() clears timer + listener
  // -------------------------------------------------------------------------
  it('dispose() clears the interval timer and removes the pagehide listener', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.dispose();
    expect(clearSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
  });

  // -------------------------------------------------------------------------
  // Test 6 — W-05: pagehide uses getCurrentAnonAccessToken; file has no literal
  // -------------------------------------------------------------------------
  it('pagehide handler reads the token via getCurrentAnonAccessToken (W-05) and the file contains no localStorage-key literal', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('', { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);

    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.push(makeEvent({ seq: 1 }));
    window.dispatchEvent(new Event('pagehide'));

    // Pagehide handler resolves getCurrentAnonAccessToken().then(...) before calling fetch.
    await new Promise((r) => setTimeout(r, 0));

    expect(getCurrentAnonAccessToken).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalled();
    const fetchInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((fetchInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer mock.access.token',
    );

    // Static check — the implementation file MUST NOT contain the literal
    // 'maxytest-runner-auth'. Reading the file in-test prevents future
    // regressions where someone "optimizes" the helper away.
    const filePath = path.resolve(__dirname, 'event-buffer.ts');
    const src = fs.readFileSync(filePath, 'utf8');
    expect(src).not.toContain('maxytest-runner-auth');

    buf.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 7 — concurrent flush returns immediately
  // -------------------------------------------------------------------------
  it('skips a concurrent flush() when one is already in flight', async () => {
    let resolveRpc: ((v: { data: number; error: null }) => void) | null = null;
    rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveRpc = r;
        }),
    );
    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.push(makeEvent({ seq: 1 }));
    const p1 = buf.flush(); // first call drains buffer + holds RPC promise
    // Re-fill while RPC is in flight so the second flush has something to send.
    buf.push(makeEvent({ seq: 2 }));
    const p2 = buf.flush(); // second call must be a no-op
    expect(rpc).toHaveBeenCalledTimes(1); // still only the first RPC dispatched
    // Resolve the in-flight RPC so the test cleans up.
    resolveRpc!({ data: 1, error: null });
    await p1;
    await p2;
    buf.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 8 — W-10: pagehide while fetch rejects → sessionStorage retains
  // -------------------------------------------------------------------------
  it('persists undelivered events to sessionStorage on pagehide (W-10 recovery)', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network')));
    vi.stubGlobal('fetch', fetchSpy);
    const sendBeaconSpy = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: sendBeaconSpy });

    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    buf.push(makeEvent({ seq: 1, frame_id: 'f-a' }));
    buf.push(makeEvent({ seq: 2, frame_id: 'f-b' }));
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 0));

    const persisted = window.sessionStorage.getItem(
      `maxytest:pending-events:${SESSION_ID}:${BLOCK_ID}`,
    );
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted!) as QueuedEvent[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].frame_id).toBe('f-a');
    expect(parsed[1].frame_id).toBe('f-b');

    buf.dispose();

    // A NEW buffer for the same (sessionId, blockId) hydrates from sessionStorage.
    const buf2 = new EventBuffer(SESSION_ID, BLOCK_ID);
    expect(buf2.__peekBufferLength()).toBe(2);
    buf2.dispose();
  });

  // -------------------------------------------------------------------------
  // Test 9 — W-10: cleanup after a successful flush
  // -------------------------------------------------------------------------
  it('clears the sessionStorage pending key after a successful flush', async () => {
    // Pre-seed sessionStorage with a "previous-tab" pending event.
    const stale = [makeEvent({ seq: 99, frame_id: 'stale' })];
    window.sessionStorage.setItem(
      `maxytest:pending-events:${SESSION_ID}:${BLOCK_ID}`,
      JSON.stringify(stale),
    );
    rpc.mockResolvedValue({ data: 1, error: null });

    const buf = new EventBuffer(SESSION_ID, BLOCK_ID);
    // The constructor hydrated the stale event.
    expect(buf.__peekBufferLength()).toBe(1);

    await buf.flush();

    expect(
      window.sessionStorage.getItem(`maxytest:pending-events:${SESSION_ID}:${BLOCK_ID}`),
    ).toBeNull();

    buf.dispose();
  });
});
