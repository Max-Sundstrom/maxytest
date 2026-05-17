// apps/plugin/src/lib/storage-bridge.ts — Phase 02.2 Plan 05 Task 1.
//
// UI-IFRAME side of the figma.clientStorage IPC bridge.
//
// Companion to apps/plugin/src/lib/sandbox-storage.ts (the sandbox handler).
// Together they expose a supabase-js-compatible custom Storage object so
// `supabase.auth` can persist its session JSON into `figma.clientStorage`
// without the iframe ever touching the figma.* API surface (which only
// exists in the sandbox runtime).
//
// Wire shape (must match sandbox-storage.ts):
//   UI → sandbox: { type:'storage-request', id, op, key, value? }
//   sandbox → UI: { type:'storage-reply', id, value: string|null }
//
// Resolution model: each request allocates a monotonically increasing `id`
// and parks a `resolve` callback in the `pending` map. The single global
// `window.message` listener fans replies back to the right caller by id.
// Maps are cleared after resolution to avoid leaks (long-lived `getItem`
// calls during refresh-token loops would otherwise pile up).
//
// CRITICAL — DO NOT IMPORT FROM `@figma/plugin-typings` HERE. This file is
// compiled via tsconfig.ui.json which has no `figma` global; the iframe
// runtime has no `figma` object at all (it lives only in the sandbox). All
// figma access happens via IPC.

let nextId = 0;
const pending = new Map<number, (v: string | null) => void>();

// Single global listener — multiplexes replies for all callers via the `id`
// stamped into each request. Registering once at module load is safe in the
// plugin iframe (the iframe is torn down on plugin close so listeners do not
// accumulate across plugin invocations).
window.addEventListener('message', (ev: MessageEvent) => {
  // Figma wraps all sandbox→UI messages inside `pluginMessage`.
  const msg = (ev.data as { pluginMessage?: unknown })?.pluginMessage as
    | { type?: string; id?: number; value?: string | null }
    | undefined;
  if (!msg || msg.type !== 'storage-reply') return;
  if (typeof msg.id !== 'number') return;
  const resolver = pending.get(msg.id);
  if (resolver) {
    resolver(msg.value === undefined ? null : msg.value);
    pending.delete(msg.id);
  }
});

/**
 * Internal request helper — posts a `storage-request` to the sandbox and
 * returns a promise that resolves when the matching `storage-reply` arrives.
 *
 * @param op — figma.clientStorage operation
 * @param key — storage key (supabase-js manages this; usually `sb-<ref>-auth-token`)
 * @param value — only meaningful for `op === 'set'`
 */
function request(
  op: 'get' | 'set' | 'remove',
  key: string,
  value?: string,
): Promise<string | null> {
  const id = ++nextId;
  return new Promise<string | null>((resolve) => {
    pending.set(id, resolve);
    parent.postMessage(
      {
        pluginMessage: {
          type: 'storage-request',
          id,
          op,
          key,
          value,
        },
      },
      '*',
    );
  });
}

/**
 * Custom Storage adapter consumed by `createClient({ auth: { storage } })`
 * (see apps/plugin/src/lib/supabase.ts — Task 2). Implements the same shape
 * as the browser `Storage` interface that supabase-js expects for SSR / RN /
 * plugin contexts: getItem / setItem / removeItem returning Promises.
 *
 * NOTE — Pitfall 5 normalization: missing keys MUST resolve to `null`, never
 * `undefined`. The sandbox side guarantees this on the wire; this object
 * forwards the value untouched.
 */
export const figmaClientStorage = {
  getItem(key: string): Promise<string | null> {
    return request('get', key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await request('set', key, value);
  },
  async removeItem(key: string): Promise<void> {
    await request('remove', key);
  },
};
