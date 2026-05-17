// apps/plugin/src/lib/sandbox-storage.ts — Phase 02.2 Plan 05 Task 1.
//
// SANDBOX-SIDE handler for the `figma.clientStorage` IPC bridge.
//
// The UI iframe cannot call `figma.clientStorage.*` directly — that API only
// exists in the plugin SANDBOX runtime (see Figma plugin docs + RESEARCH
// §"figma.clientStorage as supabase-js Custom Storage Adapter"). The bridge
// solves this by:
//
//   1. UI side (storage-bridge.ts) posts `{type:'storage-request', id, op, key,
//      value?}` via `parent.postMessage`.
//   2. Sandbox side (this file, wired into `figma.ui.onmessage` from code.ts)
//      calls the matching `figma.clientStorage.{getAsync|setAsync|deleteAsync}`
//      and replies with `{type:'storage-reply', id, value}` so the UI promise
//      resolves with the same `id`.
//
// Pitfall 5 (RESEARCH lines ~440-460): `figma.clientStorage.getAsync` returns
// `undefined` when the key is missing — but supabase-js's custom storage
// contract requires `null` for missing keys (otherwise it falls back to a
// "session present but empty" branch that breaks `getSession`). We normalize
// `undefined → null` BEFORE posting back to the UI so the adapter never sees
// undefined.
//
// CRITICAL — DO NOT IMPORT FROM REACT / DOM / @supabase/supabase-js HERE.
// This file is compiled via tsconfig.code.json which has no `DOM` lib — any
// stray `window` / `localStorage` access would type-check fail.

export interface StorageRequestMessage {
  type: 'storage-request';
  id: number;
  op: 'get' | 'set' | 'remove';
  key: string;
  value?: string;
}

/**
 * Handles a single `storage-request` IPC message by invoking the matching
 * `figma.clientStorage` async method and posting a `storage-reply` back to
 * the UI iframe keyed by the original `id`.
 *
 * @param msg — the parsed message payload (caller validates `msg.type` first)
 */
export async function handleStorageMessage(msg: StorageRequestMessage): Promise<void> {
  switch (msg.op) {
    case 'get': {
      const v = await figma.clientStorage.getAsync(msg.key);
      // Pitfall 5: supabase-js requires null (not undefined) for missing keys.
      // figma.clientStorage can return any JSON-serialisable value; we only
      // accept strings (supabase-js stores its session JSON as a string), and
      // anything else (null, undefined, object, number) becomes null on the
      // wire so the adapter behaves as "no session cached".
      figma.ui.postMessage({
        type: 'storage-reply',
        id: msg.id,
        value: typeof v === 'string' ? v : null,
      });
      return;
    }
    case 'set': {
      // supabase-js always passes a string value for setItem; if `msg.value`
      // is missing we still call setAsync with an empty string so the adapter
      // contract holds (it would be a bug in the UI side to omit value here).
      await figma.clientStorage.setAsync(msg.key, msg.value ?? '');
      figma.ui.postMessage({ type: 'storage-reply', id: msg.id, value: null });
      return;
    }
    case 'remove': {
      await figma.clientStorage.deleteAsync(msg.key);
      figma.ui.postMessage({ type: 'storage-reply', id: msg.id, value: null });
      return;
    }
  }
}
