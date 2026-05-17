// apps/plugin/src/lib/ui/publish.ts — Phase 02.2 Plan 07 Task 2.
//
// UI-iframe publish orchestrator. Driven by ui.tsx after the sandbox has
// finished its rendering stage. Responsibilities:
//
//   1. Compute sha256_16 over each (frameId, scale) byte buffer accumulated
//      from sandbox `frame-rendered` IPC messages. The hash is needed to
//      compose the Storage path (worker-byte-identical via lib/payload).
//   2. Build a 2N-item upload queue (1× + 2× per frame), upload with
//      concurrency=4 via storage-upload.ts.
//   3. Call `publish_prototype_from_plugin(payload, idempotency_key)`
//      RPC with the shaped payload. The RPC is atomic — it INSERTs
//      prototype_versions + frames + hotspots + prototype_imports in one
//      transaction (see migration 00013).
//   4. Map server errors to PluginErrorCode for the friendly-errors map.
//
// Idempotency contract (D-03a): the caller (ui.tsx) generates UUIDv7
// `idempotencyKey` ONCE at component mount and passes it back unchanged on
// retry. Server's `(study_id, idempotency_key)` UNIQUE constraint returns
// the SAME prototype_version_id with `replayed: true` on retry — no
// duplicates created.

import { sha256_16 } from '../hash';
import { shapePayload } from '../payload';
import type { CollectedFrame, CollectedHotspot } from '../payload';
import { supabase } from '../supabase';
import { uploadAllWithConcurrency, type UploadItem } from './storage-upload';
import type { PluginErrorCode, SandboxHotspot, SandboxWarning } from '../../types';

/** Frame bytes collected from sandbox over IPC. Both scales captured
 *  before upload starts. */
export interface CollectedFrameBytes {
  /** Figma node id (e.g. "1:23"). */
  frameId: string;
  name: string;
  width: number;
  height: number;
  /** BFS-preorder position from the sandbox. Stable for repeat imports
   *  of the same file. */
  position: number;
  /** 1× PNG bytes. */
  bytes1x: ArrayBuffer;
  /** 2× PNG bytes. */
  bytes2x: ArrayBuffer;
}

export interface PublishInput {
  /** From RPC contract — workspace owning the destination study. */
  workspaceId: string;
  /** Study to publish into. Created upstream by ui.tsx via `create_study`. */
  studyId: string;
  /** UUIDv7 generated at component mount per D-03a. Reused on retry. */
  prototypeVersionId: string;
  /** UUIDv7 idempotency key — single value across the entire publish
   *  attempt + any retries. */
  idempotencyKey: string;
  fileKey: string;
  fileName: string;
  /** The Figma node id of the flow's starting frame (the one the user
   *  picked in S2). */
  startingFrameId: string;
  frames: CollectedFrameBytes[];
  hotspots: SandboxHotspot[];
  warnings: SandboxWarning[];
  /** Called after EACH PNG upload completes. UI updates `ProgressView`. */
  onUploadProgress: (done: number, total: number) => void;
  /** Called when uploads finish and the RPC call begins. UI flips
   *  `ProgressView` stage from 'uploading' → 'publishing'. */
  onPublishStart: () => void;
}

export interface PublishResultOk {
  ok: true;
  data: {
    prototype_version_id: string;
    study_id: string;
    import_id?: string;
    replayed: boolean;
  };
}

export interface PublishResultErr {
  ok: false;
  code: PluginErrorCode;
  message: string;
}

export type PublishResult = PublishResultOk | PublishResultErr;

/** Worker-byte-identical Storage path: see `lib/payload.ts:renderPath`. */
function renderPath(
  workspaceId: string,
  prototypeVersionId: string,
  frameId: string,
  hash: string,
  scale: 1 | 2,
): string {
  return `${workspaceId}/${prototypeVersionId}/${frameId}-${hash}@${scale}x.png`;
}

/** Drive the upload + RPC pipeline end-to-end. */
export async function publishCollected(input: PublishInput): Promise<PublishResult> {
  // 1. Hash every (frame, scale) pair up-front so the Storage path is
  //    available before the first upload starts. Hashing is cheap (~µs per
  //    KB on Web Crypto) compared to the upload itself.
  const hashed: Array<CollectedFrameBytes & { hash1x: string; hash2x: string }> = [];
  for (const f of input.frames) {
    const h1 = await sha256_16(f.bytes1x);
    const h2 = await sha256_16(f.bytes2x);
    hashed.push({ ...f, hash1x: h1, hash2x: h2 });
  }

  // 2. Build the upload queue — two items per frame (1× + 2×). The
  //    progress counter ticks once per item, so total = 2 * N.
  const total = hashed.length * 2;
  let done = 0;
  const tick = (): void => {
    done += 1;
    input.onUploadProgress(done, total);
  };
  const uploadItems: UploadItem[] = [];
  for (const f of hashed) {
    uploadItems.push({
      path: renderPath(input.workspaceId, input.prototypeVersionId, f.frameId, f.hash1x, 1),
      bytes: f.bytes1x,
      onProgress: tick,
    });
    uploadItems.push({
      path: renderPath(input.workspaceId, input.prototypeVersionId, f.frameId, f.hash2x, 2),
      bytes: f.bytes2x,
      onProgress: tick,
    });
  }

  // 3. Upload with concurrency=4. Storage-upload tolerates 409 "already
  //    exists" — see worker line ~850 contract.
  const uploadResult = await uploadAllWithConcurrency(uploadItems, 4);
  if (!uploadResult.ok) {
    return {
      ok: false,
      code: 'plugin_upload_failed',
      message: uploadResult.message,
    };
  }

  // 4. Build the RPC payload. shapePayload validates against
  //    publishPayloadSchema (Plan 06 Zod guardrail) and throws ZodError
  //    on shape mismatch — we catch it and surface as plugin_rpc_failed
  //    rather than crashing the iframe.
  input.onPublishStart();

  const collectedFrames: CollectedFrame[] = hashed.map((f) => ({
    figmaNodeId: f.frameId,
    name: f.name,
    width: f.width,
    height: f.height,
    hash1x: f.hash1x,
    hash2x: f.hash2x,
    position: f.position,
  }));

  // Translate SandboxHotspot (wire shape) → CollectedHotspot (camelCase
  // shape that shapePayload expects). The translation is mechanical —
  // we keep both shapes so the sandbox IPC stays in flat-snake_case
  // (which the RPC will eventually consume) while shapePayload's
  // CollectedHotspot stays plugin-internal-camelCase.
  const collectedHotspots: CollectedHotspot[] = input.hotspots.map((h) => ({
    frameNodeId: h.frame_node_id,
    hotspotId: h.hotspot_id,
    targetFrameId: h.target_frame_id,
    transitionKind: h.transition_kind,
    bbox: { x: h.bbox_x, y: h.bbox_y, w: h.bbox_w, h: h.bbox_h },
    zIndex: h.z_index,
    sourceLayer: h.source_layer,
    figmaRaw: h.figma_raw,
  }));

  let payload;
  try {
    payload = shapePayload({
      studyId: input.studyId,
      workspaceId: input.workspaceId,
      prototypeVersionId: input.prototypeVersionId,
      fileKey: input.fileKey,
      fileName: input.fileName,
      startingFrameId: input.startingFrameId,
      figmaNodeTree: {},
      frames: collectedFrames,
      hotspots: collectedHotspots,
      warnings: input.warnings.length > 0 ? input.warnings : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      code: 'plugin_rpc_failed',
      message: `Payload validation failed: ${String(err)}`,
    };
  }

  // 5. Call the atomic RPC.
  const { data, error } = await supabase.rpc('publish_prototype_from_plugin', {
    p_payload: payload,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    // Postgres-side `RAISE EXCEPTION ... USING ERRCODE = '42501'` surfaces
    // here as PostgREST's structured error with `code: '42501'`. Map
    // 42501 → plugin_no_session (unauthenticated) or plugin_rpc_failed
    // (forbidden — wrong role).
    const pgCode = (error as { code?: string }).code;
    const msg = error.message || 'RPC failed';
    if (pgCode === '42501') {
      // Two flavors of 42501 in the RPC: 'unauthenticated' (auth.uid()
      // null) and 'forbidden' (current_workspace_role NOT IN owner|editor).
      // The RAISE message string differs — `unauthenticated` vs
      // `forbidden`. We sniff the message to differentiate so the friendly-
      // map shows the right recovery CTA.
      if (msg.toLowerCase().includes('unauthenticated')) {
        return { ok: false, code: 'plugin_no_session', message: msg };
      }
      return { ok: false, code: 'plugin_rpc_failed', message: msg };
    }
    // 02000 = "study not found in workspace" (cross-check failure).
    return { ok: false, code: 'plugin_rpc_failed', message: msg };
  }

  // 6. Success. The RPC's RETURNS jsonb is unwrapped to a plain object by
  //    supabase-js.
  const result = data as {
    prototype_version_id: string;
    study_id: string;
    import_id?: string;
    replayed: boolean;
  };
  return { ok: true, data: result };
}
