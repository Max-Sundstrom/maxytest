// apps/plugin/src/lib/payload.ts — Phase 02.2 Plan 06.
//
// Assembles the publishPayloadSchema-conforming jsonb body that the
// plugin's UI iframe sends to the `publish_prototype_from_plugin` RPC
// (migration 00013). This module is the seam between two ergonomically
// different shapes:
//
//   - The sandbox emits CollectedFrame[] / CollectedHotspot[] —
//     plugin-internal types using nested objects (bbox) and camelCase
//     field names (figmaNodeId, hash1x, transitionKind, …). These are
//     what the sandbox naturally produces from frame.exportAsync and
//     reaction parsing.
//
//   - The RPC consumes the wire format defined by publishPayloadSchema
//     in apps/plugin/src/schemas.ts — flat snake_case fields, decomposed
//     bbox_x / bbox_y / bbox_w / bbox_h, and computed Storage paths.
//
// shapePayload performs the translation and runs publishPayloadSchema
// as the LAST guardrail. The Zod parse is a tiny CPU cost (~µs for our
// payload sizes) but catches programmer error client-side: if a future
// sandbox change emits a malformed CollectedHotspot, the user gets a
// Zod field-level message in the plugin UI instead of a cryptic
// 'invalid input syntax for type uuid' rejection from Postgres after
// ~200ms of wasted RPC round-trip.
//
// See:
//   - 02.2-PATTERNS.md §10 (payload contract)
//   - 02.2-RESEARCH.md §"Payload contract"
//   - 02.2-CONTEXT.md D-03a (UUIDv7 prototype_version_id pre-computed
//     client-side so Storage paths are predictable BEFORE the RPC runs)
//   - supabase/functions/figma-import-worker/index.ts:882-973 (the
//     side-effect target — plugin produces equivalent row shapes)

import { publishPayloadSchema, type PluginPublishPayload } from '../schemas';
import type { TransitionKind } from './transition';

export interface CollectedFrame {
  /** Figma node id ("1:23" form) — stored as `frames.frame_id` on the server. */
  figmaNodeId: string;
  name: string;
  width: number;
  height: number;
  /** sha256_16 of the 1× PNG bytes. */
  hash1x: string;
  /** sha256_16 of the 2× PNG bytes. */
  hash2x: string;
  /** DFS-preorder index — preserves the designer's layout. */
  position: number;
}

export interface CollectedHotspot {
  /** Figma node id of the OWNING frame. The RPC resolves this to
   *  `frames.id` (UUID) via a map built right after the frames INSERT. */
  frameNodeId: string;
  hotspotId: string;
  /** null = miss / no destination (PROTO-07 misclick semantics). */
  targetFrameId: string | null;
  transitionKind: TransitionKind;
  bbox: { x: number; y: number; w: number; h: number };
  zIndex: number;
  sourceLayer: string | null;
  figmaRaw: unknown[];
}

export interface ShapePayloadInput {
  studyId: string;
  workspaceId: string;
  /** UUIDv7 generated client-side per D-03a so Storage paths are
   *  predictable BEFORE the RPC runs. */
  prototypeVersionId: string;
  fileKey: string;
  fileName: string;
  startingFrameId?: string;
  /** Defaults to {} per RESEARCH Open Question 1. */
  figmaNodeTree?: object;
  frames: CollectedFrame[];
  hotspots: CollectedHotspot[];
  warnings?: Array<{ code: string; frame_id?: string; bytes?: number }>;
}

/** Build a Storage path identical to the worker's scheme. Plugin and
 *  REST paths collide on identical PNG bytes by design. */
function renderPath(
  workspaceId: string,
  prototypeVersionId: string,
  frameId: string,
  hash: string,
  scale: 1 | 2,
): string {
  return `${workspaceId}/${prototypeVersionId}/${frameId}-${hash}@${scale}x.png`;
}

/**
 * Translate CollectedFrame[] / CollectedHotspot[] into the wire payload
 * the RPC expects, validate against publishPayloadSchema, return the
 * validated object. Throws (ZodError) on schema violation.
 */
export function shapePayload(input: ShapePayloadInput): PluginPublishPayload {
  const payload: PluginPublishPayload = {
    study_id: input.studyId,
    workspace_id: input.workspaceId,
    prototype_version_id: input.prototypeVersionId,
    file_key: input.fileKey,
    file_name: input.fileName,
    // Spread `starting_frame_id` only when provided so the optional Zod
    // field passes its `.optional()` guard cleanly (avoid `undefined` keys
    // that some JSON serializers preserve in unexpected ways).
    ...(input.startingFrameId ? { starting_frame_id: input.startingFrameId } : {}),
    figma_node_tree: input.figmaNodeTree ?? {},
    frames: input.frames.map((f) => ({
      frame_id: f.figmaNodeId,
      name: f.name,
      width: f.width,
      height: f.height,
      render_path_1x: renderPath(
        input.workspaceId,
        input.prototypeVersionId,
        f.figmaNodeId,
        f.hash1x,
        1,
      ),
      render_path_2x: renderPath(
        input.workspaceId,
        input.prototypeVersionId,
        f.figmaNodeId,
        f.hash2x,
        2,
      ),
      position: f.position,
    })),
    hotspots: input.hotspots.map((h) => ({
      frame_node_id: h.frameNodeId,
      hotspot_id: h.hotspotId,
      target_frame_id: h.targetFrameId,
      transition_kind: h.transitionKind,
      bbox_x: h.bbox.x,
      bbox_y: h.bbox.y,
      bbox_w: h.bbox.w,
      bbox_h: h.bbox.h,
      z_index: h.zIndex,
      source_layer: h.sourceLayer,
      figma_raw: h.figmaRaw,
    })),
    // Omit `warnings` entirely when there are none so the jsonb on the
    // server stays compact and the optional field stays absent rather
    // than serializing as `[]`.
    ...(input.warnings && input.warnings.length > 0 ? { warnings: input.warnings } : {}),
  };

  // Last guardrail — if a future sandbox change produces a malformed
  // CollectedHotspot, the user sees a Zod field-level message in the
  // plugin UI instead of a Postgres rejection 200 ms later.
  return publishPayloadSchema.parse(payload);
}
