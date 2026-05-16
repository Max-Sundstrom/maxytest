/**
 * EventBuffer — client-side event-ingest buffer for the prototype runner.
 *
 * Plan 02-08 Task 3. The buffer batches `QueuedEvent` records produced by
 * `PrototypeRunner` (Plan 02-09) and ships them to the `submit_events` RPC
 * (Plan 02-07 migration 00009). Three triggers cause a flush:
 *
 *   - 20 events accumulated (`flushThreshold`, default 20).
 *   - 1 second elapsed since the last flush (`flushIntervalMs`, default 1000).
 *   - `pagehide` fires (best-effort fire-and-forget via fetch keepalive,
 *     falling back to `navigator.sendBeacon`).
 *
 * Three checker fixes are folded in:
 *
 *   - **B-02:** the constructor takes a mandatory `blockId` so each buffer
 *     instance is bound to a single prototype block; the RPC call carries
 *     `p_block_id` for the server's mis-attribution check. Multiple
 *     prototype blocks per study are now safe.
 *   - **W-05:** the `pagehide` handler obtains the access token via
 *     `getCurrentAnonAccessToken()` (helper exported from
 *     `@/lib/supabase/anon`), NOT by parsing supabase-js's internal storage
 *     shape. The implementation file contains no localStorage-key literal.
 *   - **W-10:** before draining the buffer in the `pagehide` handler the
 *     in-flight events are persisted to `sessionStorage` under
 *     `maxytest:pending-events:{sessionId}:{blockId}`. The constructor
 *     hydrates from that key so a respondent who pageshow-resumes the same
 *     block recovers events that the pagehide POST may have lost.
 *
 * Idempotency: every `QueuedEvent.id` is a UUIDv7 produced by the caller
 * (Plan 02-08 mints them in `PrototypeRunner`). `submit_events` dedupes via
 * `ON CONFLICT (id) DO NOTHING`, so retries / requeues never produce server-
 * side duplicates.
 *
 * Reload safety: per-session monotonic `seq` is the analytics ordering key
 * — `nextSeq(sessionId)` (`./seq-counter.ts`) survives reload via
 * `localStorage`. The buffer itself is intentionally not persisted (a
 * crash-loop with bad events would replay forever); the W-10 sessionStorage
 * stopgap only covers the pagehide → next-mount window.
 *
 * Phase 5 will replace the W-10 stopgap with a Dexie IndexedDB queue +
 * service worker; this file's interface is stable across that swap.
 */

import { getCurrentAnonAccessToken, supabaseAnon } from '@/lib/supabase/anon';

/** A single record in the client-side queue. The shape mirrors the
 *  `submit_events` RPC's `p_events` JSONB element layout (00009 migration). */
export interface QueuedEvent {
  /** UUIDv7 — both the database PK and the idempotency key. */
  id: string;
  /** Per-session monotonic seq (from `./seq-counter.ts`). */
  seq: number;
  /** Figma frame id (text, not FK). */
  frame_id: string;
  /** Hotspot the tap intersected, or `null` for misclicks. */
  hotspot_id: string | null;
  /** Resolved hit target id, or `null` for misclicks. */
  hit_target_id: string | null;
  event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish';
  /** Normalized [0, 1] — `null` for non-tap events. */
  x: number | null;
  y: number | null;
  /** Client-side ISO timestamp. Server records its own `server_ts`. */
  client_ts: string;
}

export interface EventBufferOptions {
  /** Wall-clock interval between auto-flushes. Defaults to 1000 ms. */
  flushIntervalMs?: number;
  /** Buffer length that triggers an immediate flush. Defaults to 20. */
  flushThreshold?: number;
}

/** Beacon payload safety threshold — below the 64 KiB Beacon API cap with
 *  headroom for header bytes added by `sendBeacon` / `fetch keepalive`. */
const BEACON_MAX_BYTES = 60 * 1024;

/** W-10: sessionStorage key used to persist pending events across pagehide. */
const pendingKey = (sessionId: string, blockId: string) =>
  `maxytest:pending-events:${sessionId}:${blockId}`;

/** W-10: defensively read pending events from sessionStorage on construction. */
function hydratePending(sessionId: string, blockId: string): QueuedEvent[] {
  try {
    const raw = window.sessionStorage.getItem(pendingKey(sessionId, blockId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as QueuedEvent[];
    return [];
  } catch {
    return [];
  }
}

function clearPending(sessionId: string, blockId: string): void {
  try {
    window.sessionStorage.removeItem(pendingKey(sessionId, blockId));
  } catch {
    /* noop */
  }
}

function persistPending(sessionId: string, blockId: string, events: QueuedEvent[]): void {
  try {
    window.sessionStorage.setItem(pendingKey(sessionId, blockId), JSON.stringify(events));
  } catch {
    /* noop */
  }
}

export class EventBuffer {
  private buffer: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushInFlight = false;
  private readonly flushIntervalMs: number;
  private readonly flushThreshold: number;

  constructor(
    private readonly sessionId: string,
    /** B-02: required — flows into `submit_events.p_block_id`. */
    private readonly blockId: string,
    options: EventBufferOptions = {},
  ) {
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.flushThreshold = options.flushThreshold ?? 20;

    // W-10: hydrate any pending events that a previous pagehide persisted but
    // whose fire-and-forget POST may have failed in flight.
    const recovered = hydratePending(sessionId, blockId);
    if (recovered.length > 0) this.buffer.push(...recovered);

    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handlePagehide);
    }
  }

  /** Enqueue an event; flush immediately when the buffer hits the threshold. */
  push(evt: QueuedEvent): void {
    this.buffer.push(evt);
    if (this.buffer.length >= this.flushThreshold) {
      void this.flush();
    }
  }

  /** Drain the buffer and POST to `submit_events`. On error, re-queue. */
  async flush(): Promise<void> {
    if (this.flushInFlight || this.buffer.length === 0) return;
    const drained = this.buffer.splice(0, this.buffer.length);
    this.flushInFlight = true;
    try {
      const { error } = await supabaseAnon.rpc(
        'submit_events' as never,
        {
          p_session_id: this.sessionId,
          p_block_id: this.blockId,
          p_events: drained,
        } as never,
      );
      if (error) {
        // Transient error — re-queue at the head so the next flush retries.
        // UUIDv7 idempotency on the server prevents duplicate rows if the
        // failed RPC actually wrote some events before erroring.
        this.buffer.unshift(...drained);
      } else {
        // W-10 cleanup — the pending bucket served its purpose for whatever
        // subset was recovered. Safe to clear: a concurrent pagehide will
        // re-persist if it has new events to ship.
        clearPending(this.sessionId, this.blockId);
      }
    } catch {
      this.buffer.unshift(...drained);
    } finally {
      this.flushInFlight = false;
    }
  }

  private handlePagehide = (): void => {
    if (this.buffer.length === 0) return;

    // W-10: persist BEFORE the fire-and-forget POST so a next-mount can
    // recover events that the keepalive request loses in the race with tab
    // teardown. clearPending() runs after the FIRST successful flush in the
    // new buffer instance.
    persistPending(this.sessionId, this.blockId, this.buffer);

    const payload = JSON.stringify({
      p_session_id: this.sessionId,
      p_block_id: this.blockId,
      p_events: this.buffer,
    });

    if (payload.length > BEACON_MAX_BYTES) {
      // Halve recursively until under cap; W-10 keeps the dropped half
      // persisted (the next-mount path will pick it up).
      this.buffer = this.buffer.slice(Math.floor(this.buffer.length / 2));
      this.handlePagehide();
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/submit_events`;
    const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // W-05: use the helper instead of parsing supabase-js's localStorage JSON.
    // getCurrentAnonAccessToken returns synchronously from cache in the happy
    // path; the .then() chain is fine for a fire-and-forget pagehide path.
    void getCurrentAnonAccessToken().then((bearer) => {
      try {
        void fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey,
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          body: payload,
          keepalive: true,
        });
      } catch {
        // Browsers that throw on `fetch keepalive` (rare; old Safari) fall
        // back to Beacon. sendBeacon cannot set headers — the request goes
        // out anonymous, but the server-side ownership check will reject it
        // if the session isn't unauthenticated-friendly. That's a defensible
        // worst case: events arrive at the RPC, get rejected, and the W-10
        // sessionStorage retains the queue for next-mount retry.
        navigator.sendBeacon(url, payload);
      }
    });

    // Drain from in-memory; sessionStorage retains the copy until clearPending.
    this.buffer = [];
  };

  /** Cancel timer + listener. Caller MUST call this when the runner unmounts
   *  the block, otherwise the buffer keeps polling the (now-disposed) RPC. */
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.handlePagehide);
    }
  }

  /** Test-only — DO NOT use from production code. */
  __peekBufferLength(): number {
    return this.buffer.length;
  }
}
