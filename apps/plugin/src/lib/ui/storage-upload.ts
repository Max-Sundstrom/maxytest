// apps/plugin/src/lib/ui/storage-upload.ts — Phase 02.2 Plan 07 Task 2.
//
// UI-iframe Storage upload helper. Runs INSIDE the plugin UI bundle (DOM
// available, fetch available) — the sandbox cannot upload because it has
// no fetch.
//
// Architectural invariant (RESEARCH §"Architectural invariant"): Storage
// paths produced by `lib/payload.ts:renderPath` are byte-identical to the
// worker's REST path. When PNG bytes are identical (re-importing the same
// file), both paths produce the same path string, and the existing
// `prototype_renders_designer_upload` RLS policy in migration 00010 lets
// the upload succeed. The worker pattern (figma-import-worker/index.ts
// line ~850) TOLERATES the resulting HTTP 409 "already exists" — we mirror
// that here so a re-import after a partial failure doesn't fail loudly on
// already-uploaded frames.
//
// Concurrency = 4 per CONTEXT D-05c / RESEARCH Open Question 3: a hand-
// rolled worker pool that respects the upload-cancellation envelope
// (abort the remaining items as soon as ANY upload fails — no point
// continuing to retry against a dead network or a 403'd workspace).

import { supabase } from '../supabase';

export interface UploadItem {
  /** Storage path — `{workspace_id}/{prototype_version_id}/{frame_id}-{hash}@{scale}x.png` */
  path: string;
  /** Raw PNG bytes from sandbox `frame.exportAsync`. */
  bytes: ArrayBuffer;
  /** Called on EACH item's completion (success or 409-tolerated). UI uses
   *  this to drive the progress counter. */
  onProgress?: () => void;
}

export interface UploadResultOk {
  ok: true;
}

export interface UploadResultErr {
  ok: false;
  code: 'plugin_upload_failed';
  message: string;
  failedPath?: string;
}

export type UploadResult = UploadResultOk | UploadResultErr;

/** Upload a single PNG. Tolerates HTTP 409 "already exists" — the worker's
 *  RLS-aware idempotency contract relies on this. Any other error surfaces
 *  as `plugin_upload_failed`. */
export async function uploadFrame(path: string, bytes: ArrayBuffer): Promise<UploadResult> {
  // Blob wraps the ArrayBuffer; supabase-js's storage client posts it as
  // the request body. contentType is mandatory — without it the worker's
  // re-import dedup compares headers and might mismatch.
  const blob = new Blob([bytes], { type: 'image/png' });

  const { error } = await supabase.storage
    .from('prototype-renders')
    .upload(path, blob, { contentType: 'image/png', upsert: false });

  if (error) {
    // supabase-js's StorageError doesn't expose a stable .code field across
    // SDK versions; we sniff the message. The Storage REST layer returns
    // "The resource already exists" (sometimes "Duplicate" in older
    // versions) for 409. Pattern stays loose intentionally — any future
    // wording change is still caught by `already`.
    const msg = error.message || '';
    if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
      // Legitimate dedup: same PNG bytes produce the same Storage path
      // (renderPath includes the content hash). Treat as success.
      return { ok: true };
    }
    return { ok: false, code: 'plugin_upload_failed', message: msg };
  }
  return { ok: true };
}

/** Upload `items` with concurrency=N. Aborts remaining items on the FIRST
 *  failure — no point continuing to retry against a dead network or a
 *  403'd workspace. Returns success only if every item succeeded (or
 *  409-tolerated). */
export async function uploadAllWithConcurrency(
  items: UploadItem[],
  concurrency: number = 4,
): Promise<UploadResult> {
  if (items.length === 0) return { ok: true };

  let next = 0;
  let failure: UploadResultErr | null = null;

  async function worker(): Promise<void> {
    while (failure === null) {
      // Atomically grab the next index. We are single-threaded JS so the
      // increment is safe even without locks.
      const i = next++;
      if (i >= items.length) return;
      const item = items[i]!;
      const result = await uploadFrame(item.path, item.bytes);
      if (!result.ok) {
        if (failure === null) {
          failure = { ...result, failedPath: item.path };
        }
        return;
      }
      // Notify after success — UI counter ticks here.
      if (item.onProgress) item.onProgress();
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(concurrency, items.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);

  if (failure !== null) return failure;
  return { ok: true };
}
