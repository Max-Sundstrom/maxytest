/**
 * Per-session monotonic seq counter — Plan 02-08 Task 1.
 *
 * Each call to `nextSeq(sessionId)` returns the next integer in a sequence
 * scoped to the given session id. The counter is anchored in `localStorage`
 * under `maxytest:seq:{sessionId}` so it survives a page reload (Pitfall 4 —
 * RESEARCH.md lines 734-745). If `localStorage` is unavailable (iOS Safari
 * Private Browsing with quota exhausted, embedded WebView restrictions,
 * etc.) the counter degrades to an in-memory `Map` per-session, scoped to
 * the module lifetime.
 *
 * Resilience pattern mirrors `apps/web/src/lib/queries/sessions.ts`
 * (lines 124-151) where the runner's session-id cache uses the same
 * try/catch idiom.
 *
 * Consumed by `EventBuffer.push()` — each queued event carries its own
 * monotonic seq. `submit_events` enforces the invariant server-side via
 * `UNIQUE (session_id, seq)` (Plan 02-07 migration 00009).
 */

/** In-memory fallback bucket for iOS Safari Private Browsing. */
const memoryFallback = new Map<string, number>();

/** localStorage key. Unique to the seq namespace — no collision with the
 *  `maxytest:session:` prefix used by sessions.ts. */
const seqKey = (sessionId: string) => `maxytest:seq:${sessionId}`;

/**
 * Return the next monotonic seq for the given session.
 *
 *   - First call for a fresh session id returns `1`.
 *   - Each subsequent call increments by 1.
 *   - The new value is persisted to `localStorage` so a page reload
 *     continues the sequence (Pitfall 4).
 *   - If `localStorage` throws on read OR write, falls back to an in-memory
 *     counter so a respondent in Private Browsing still ships monotonic
 *     events (worst case: counter resets if the tab reloads, which is OK —
 *     submit_events dedupe by UUIDv7 prevents server-side duplicate rows).
 */
export function nextSeq(sessionId: string): number {
  const key = seqKey(sessionId);
  let current = 0;
  let storageReadable = true;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) current = n;
    }
  } catch {
    storageReadable = false;
    current = memoryFallback.get(sessionId) ?? 0;
  }

  // If we couldn't read storage but had a memory entry, prefer memory; if we
  // could read storage but memory has a higher value (e.g., a previous setItem
  // failed and the memory map is ahead), prefer the memory value — never go
  // backwards.
  if (storageReadable) {
    const mem = memoryFallback.get(sessionId);
    if (mem !== undefined && mem > current) current = mem;
  }

  const next = current + 1;
  try {
    window.localStorage.setItem(key, String(next));
  } catch {
    memoryFallback.set(sessionId, next);
  }
  return next;
}

/**
 * Test-only utility — DO NOT call from production code. Clears the in-memory
 * fallback so tests start from a clean baseline.
 */
export function __resetMemoryFallback(): void {
  memoryFallback.clear();
}
