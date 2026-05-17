// apps/plugin/src/types.ts — Phase 02.2 Plan 06.
//
// Shared types for both sandbox (tsconfig.code.json) and UI iframe
// (tsconfig.ui.json). Must remain DOM-free — only ES2017 types may appear
// here (ArrayBuffer is OK, Blob / File / HTMLElement are NOT).
//
// Why both targets need this module: code.ts (sandbox) posts
// `SandboxToUiMessage` shapes to ui.tsx (iframe); ui.tsx posts
// `UiToSandboxMessage` shapes back. Both ends import these unions so the
// `switch (msg.type)` blocks in each runtime have exhaustive checks.
//
// See: 02.2-PATTERNS.md §13.

import type { PluginPublishPayload } from './schemas';

/**
 * Source of a flow starting-point per the 4-level cascade (CONTEXT D-05).
 * Ordered from most-authoritative to least:
 *   1. flow-starting-point — Figma's native PageNode.flowStartingPoints.
 *   2. name-marker          — top-level frame name matches /\[(start|begin)\]/i.
 *   3. graph-root           — top-level frame with no incoming reactions and ≥1 outgoing.
 *   4. first-frame-fallback — any top-level frame (last resort with a UI warning).
 */
export interface FlowStart {
  pageId: string;
  pageName: string;
  nodeId: string;
  nodeName: string;
  source: 'flow-starting-point' | 'name-marker' | 'graph-root' | 'first-frame-fallback';
}

/** Plugin error taxonomy — surfaced both inside the plugin UI and as
 *  `prototype_imports.error_code` on the server (extended via 00013). */
export type PluginErrorCode =
  | 'plugin_no_prototype'
  | 'plugin_no_session'
  | 'plugin_render_failed'
  | 'plugin_upload_failed'
  | 'plugin_rpc_failed'
  | 'auth_timeout'
  | 'unknown_error';

/** Messages SANDBOX → UI iframe.
 *  The sandbox is the trusted side (talks to figma.*); UI is the
 *  network-facing side. Sandbox posts collected data + progress events; UI
 *  consumes them, drives Storage uploads and the RPC call.
 */
export type SandboxToUiMessage =
  | { type: 'flows-detected'; flows: FlowStart[] }
  | { type: 'flows-result'; flows: FlowStart[] }
  | {
      type: 'progress';
      stage: 'parsing' | 'rendering' | 'uploading';
      done: number;
      total: number;
    }
  | { type: 'frame-rendered'; frameId: string; scale: 1 | 2; bytes: ArrayBuffer }
  | { type: 'storage-reply'; id: number; value: string | null }
  | {
      type: 'collected';
      frames: Array<{
        id: string;
        name: string;
        width: number;
        height: number;
        position: number;
      }>;
      hotspots: Array<{
        frame_node_id: string;
        hotspot_id: string;
        target_frame_id: string | null;
        transition_kind: 'slide' | 'push' | 'smart_animate' | 'dissolve';
        bbox_x: number;
        bbox_y: number;
        bbox_w: number;
        bbox_h: number;
        z_index: number;
        source_layer: string | null;
        figma_raw: unknown[];
      }>;
      warnings: Array<{ code: string; frame_id?: string; bytes?: number }>;
      fileKey: string;
      fileName: string;
    }
  | { type: 'error'; code: PluginErrorCode; message: string };

/** Messages UI iframe → SANDBOX.
 *  Open-external is fired synchronously from the click handler so Figma
 *  treats it as a user-gesture (Pitfall 3 in RESEARCH.md). Storage-request
 *  is the bridge for the supabase-js custom-storage adapter (D-04d) which
 *  delegates getItem/setItem/removeItem across the iframe → sandbox seam.
 */
export type UiToSandboxMessage =
  | { type: 'detect-flows' }
  | { type: 'start-import'; flowNodeId: string; pageId: string }
  | { type: 'open-external'; url: string }
  | { type: 'close' }
  | {
      type: 'storage-request';
      id: number;
      op: 'get' | 'set' | 'remove';
      key: string;
      value?: string;
    };

// Re-export so callers can `import type { PluginPublishPayload } from './types'`
// without dipping into schemas.ts (types.ts is the public surface for everyone
// who only needs the shape, not the Zod validator).
export type { PluginPublishPayload };
