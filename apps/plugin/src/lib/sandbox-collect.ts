// apps/plugin/src/lib/sandbox-collect.ts — Phase 02.2 Plan 07.
//
// Sandbox-side orchestration for the full import pipeline. Runs in the
// Figma plugin sandbox (tsconfig.code.json — DOM-free, ES2017 lib, has
// access to the global `figma` and `crypto.subtle`).
//
// Responsibilities:
//   1. `serializeFlowDetectionInput()` — walk figma.root.children, serialize
//      pages/frames/reactions into the plain-data shape that the pure
//      `detectStartingFrames` library expects.
//   2. `collectReactionsGraph(pageId)` — build a Map<id, BfsNode> over ALL
//      frame-like nodes on a page (top-level AND nested) so the BFS walker
//      can resolve any destinationId an interaction may reference.
//   3. `exportFrameAsPng(node, scale)` — wrap `node.exportAsync` and unwrap
//      to a fresh ArrayBuffer (Figma returns Uint8Array — we slice the
//      backing buffer so postMessage can transfer cleanly).
//   4. `runImport(args)` — top-level orchestrator. Does BFS, collects
//      hotspots, emits progress + per-frame PNG bytes IPC messages.
//      Stops at rendering — uploads + RPC live in the UI iframe.
//
// Why pure functions take plain data: the lib/* libraries (flow-detection,
// bfs, transition) are DOM-free, figma-free pure logic so they are
// unit-testable. This file is the seam that bridges Plugin API → plain
// data → pure logic → IPC.
//
// === Pitfalls ===
//   - Pitfall 8 (RESEARCH): exportAsync is slow and yields to the event
//     loop. After each `await node.exportAsync(...)` we are free to post
//     progress IPC; Figma's UI thread stays responsive.
//   - ArrayBuffer transfer: Figma's postMessage handles ArrayBuffer
//     transferables natively. We slice the Uint8Array's backing buffer
//     so we hand over an ArrayBuffer (not a Uint8Array view) — this
//     avoids any "detached buffer" hazards on retries.

import {
  collectSubtreeNavReactions,
  walkReachable,
  type BfsNode,
  type ReactionsTreeNode,
} from './bfs';
import type { FlowDetectionInput } from './flow-detection';
// (sha256_16 used to be imported here for a runtime probe; the probe was
// removed when we discovered Figma's sandbox has no `crypto` global at
// all. Hashing of PNG bytes for content-addressable Storage paths happens
// in the UI iframe — see apps/plugin/src/lib/ui/publish.ts.)
import { mapTransition } from './transition';
import type { SandboxHotspot, SandboxWarning, SandboxToUiMessage } from '../types';

/** Plugin-API-1.126 navigation shape. The legacy REST shape uses string
 *  literals like 'NAVIGATE' / 'OPEN_OVERLAY' / 'SWAP_OVERLAY' on
 *  `action.type`; the modern Plugin API uses `action.type === 'NODE'`
 *  plus `action.navigation` ∈ 'NAVIGATE' | 'OVERLAY' | 'SWAP' | … to
 *  encode the same intent. We normalize both into a single envelope here.
 *
 *  The four navigation kinds we treat as hotspot-producing edges:
 *    - NAVIGATE   → push the destination as the new "current" frame
 *    - OVERLAY    → open destination as overlay on top of current
 *    - SWAP       → replace the current overlay with destination
 *    - (SCROLL_TO and CHANGE_TO are NOT followed — see worker contract) */
interface NavAction {
  /** Legacy-shape `type` string. We re-emit the worker-compatible strings
   *  here ('NAVIGATE' / 'OPEN_OVERLAY' / 'SWAP_OVERLAY') so the downstream
   *  pure libraries (bfs, transition) stay byte-identical to the REST
   *  path's expectations — they were written against the REST shape. */
  type: 'NAVIGATE' | 'OPEN_OVERLAY' | 'SWAP_OVERLAY';
  destinationId: string | null;
  transition: { type?: string } | null;
}

function asNavAction(action: Reaction['action']): NavAction | null {
  if (!action) return null;
  // Modern Plugin-API shape (1.126+): type === 'NODE' + navigation.
  if (action.type === 'NODE') {
    const dest = action.destinationId ?? null;
    let kind: NavAction['type'] | null = null;
    switch (action.navigation) {
      case 'NAVIGATE':
        kind = 'NAVIGATE';
        break;
      case 'OVERLAY':
        kind = 'OPEN_OVERLAY';
        break;
      case 'SWAP':
        kind = 'SWAP_OVERLAY';
        break;
      default:
        // SCROLL_TO / CHANGE_TO don't produce frame transitions.
        return null;
    }
    const transition: { type?: string } | null = action.transition
      ? { type: action.transition.type }
      : null;
    return { type: kind, destinationId: dest, transition };
  }
  return null;
}

/** Maximum 1× PNG size before we surface an `oversize_png_1x` warning.
 *  Matches the conservative cap the worker uses for the REST path; keeping
 *  the threshold identical means warnings render the same way in the
 *  designer report regardless of import path. */
const SIZE_WARN_1X_BYTES = 5 * 1024 * 1024;
const SIZE_WARN_2X_BYTES = 10 * 1024 * 1024;

/** Send a typed IPC message to the UI iframe. Adds a thin layer of type
 *  safety around `figma.ui.postMessage` so the union stays exhaustive
 *  across the sandbox-to-UI seam. */
function postToUi(msg: SandboxToUiMessage): void {
  figma.ui.postMessage(msg);
}

/**
 * Serialize the current Figma document into the plain-data shape that
 * `detectStartingFrames` consumes. This is called from the `detect-flows`
 * handler in code.ts.
 *
 * We restrict topLevelFrames to direct children of each page that are FRAME
 * or COMPONENT nodes — matching the worker's REST flow-detection scope
 * (PageNode.flowStartingPoints is also frame/component-only). InstanceNode
 * children become destinations via reactions but are not flow STARTING
 * candidates per Figma's own Prototype panel UX.
 */
export function serializeFlowDetectionInput(): FlowDetectionInput {
  const pages: FlowDetectionInput['pages'] = [];
  for (const page of figma.root.children) {
    if (page.type !== 'PAGE') continue;
    const topLevelFrames: FlowDetectionInput['pages'][number]['topLevelFrames'] = [];
    for (const child of page.children) {
      if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
      const reactions = (child.reactions ?? []).map((r) => {
        const nav = asNavAction(r.action);
        return {
          action: nav ? { destinationId: nav.destinationId ?? undefined } : undefined,
        };
      });
      topLevelFrames.push({
        id: child.id,
        name: child.name,
        reactions,
      });
    }
    pages.push({
      id: page.id,
      name: page.name,
      // PageNode.flowStartingPoints is ReadonlyArray<{nodeId, name}>; we
      // copy into a fresh array so detectStartingFrames receives a normal
      // (mutable-typed) array — the pure function never mutates anyway,
      // but ReadonlyArray covariance is brittle across module boundaries.
      flowStartingPoints: (page.flowStartingPoints ?? []).map((p) => ({
        nodeId: p.nodeId,
        name: p.name,
      })),
      topLevelFrames,
    });
  }
  return { pages };
}

/**
 * Build the reactions graph that the BFS walker consumes. Recursively walks
 * every descendant of the given page and writes one entry per node.
 *
 * The KEY contract — the two distinct entry shapes:
 *
 *   1. For every FRAME / COMPONENT / INSTANCE encountered (at ANY depth —
 *      direct page child, nested inside a Section, nested inside another
 *      frame, etc.), the entry's `reactions` is the AGGREGATED set of
 *      navigation reactions found anywhere in that node's subtree (the
 *      node's own reactions PLUS every descendant layer that carries
 *      `.reactions`). This is the load-bearing fix for KI-02
 *      (2026-05-17 Smart-email UAT) — Figma reactions almost always live
 *      on descendant buttons, not on the top-level frame, and without this
 *      aggregation `walkReachable` stops at the start frame with zero
 *      navigation edges.
 *
 *   2. For every non-frame node that DOES carry its own `.reactions` array
 *      (rare — historically Groups, some Section configurations), the entry
 *      holds that node's own reactions only. This preserves backwards
 *      compatibility with the pre-2026-05-17 behavior of mapping every
 *      reaction-carrying descendant by id.
 *
 * Why recurse instead of just iterating page.children: modern Figma puts
 * frames inside Sections. A prototype's starting frame may sit at
 * `page.children → Section → FrameNode`. If we only looked at direct page
 * children, the start frame would be missing from the map and BFS would
 * fail with "Starting frame has no reachable frames via reactions" — the
 * regression that surfaced in the 2026-05-17 follow-up UAT after the
 * initial KI-02 fix landed.
 *
 * Aggregation logic lives in the pure helper `collectSubtreeNavReactions`
 * (apps/plugin/src/lib/bfs.ts) so it is unit-testable without `figma.*`
 * globals. This function is the thin sandbox-side adapter that serializes
 * each frame's subtree into the plain-data shape the helper expects.
 */
export function collectReactionsGraph(pageId: string): Map<string, BfsNode> {
  const out = new Map<string, BfsNode>();
  const page = figma.root.children.find((p) => p.id === pageId);
  if (!page || page.type !== 'PAGE') return out;

  /** Serialize a Figma subtree into the plain-data `ReactionsTreeNode`
   *  shape that `collectSubtreeNavReactions` consumes. We normalize the
   *  modern Plugin-API reaction shape (`type: 'NODE'` + `navigation`)
   *  into the legacy string-literal shape (`type: 'NAVIGATE'`, etc.) at
   *  this seam so the pure helper only ever sees one canonical form. */
  function toTreeNode(node: SceneNode): ReactionsTreeNode {
    const maybeReactions = (node as unknown as { reactions?: ReadonlyArray<Reaction> }).reactions;
    const reactions: ReactionsTreeNode['reactions'] = Array.isArray(maybeReactions)
      ? maybeReactions.map((r) => {
          const nav = asNavAction(r.action);
          return {
            action: nav ? { type: nav.type, destinationId: nav.destinationId ?? null } : null,
          };
        })
      : [];

    const maybeChildren = (node as unknown as { children?: ReadonlyArray<SceneNode> }).children;
    const children: ReactionsTreeNode['children'] = Array.isArray(maybeChildren)
      ? maybeChildren.map(toTreeNode)
      : undefined;

    return { id: node.id, reactions, children };
  }

  /** Recursive visitor — writes the appropriate entry shape for each node
   *  and continues into children regardless of node type. The "frame-like
   *  → aggregated, other → own-reactions" branching is the heart of
   *  KI-02's fix. */
  function visit(node: SceneNode): void {
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      // Frame-like: write the aggregated subtree entry. This is a SUPERSET
      // of the frame's own reactions (collectSubtreeNavReactions starts at
      // the root node), so we don't need a separate own-reactions branch
      // for frames.
      const aggregated = collectSubtreeNavReactions(toTreeNode(node));
      out.set(node.id, { id: node.id, reactions: aggregated });
    } else {
      // Non-frame node — write its own reactions only IF it has any. The
      // recursion below will pick up any frame-like descendants and write
      // their aggregated entries.
      const maybeReactions = (node as unknown as { reactions?: ReadonlyArray<Reaction> }).reactions;
      if (Array.isArray(maybeReactions) && maybeReactions.length > 0) {
        const reactions: BfsNode['reactions'] = maybeReactions.map((r) => {
          const nav = asNavAction(r.action);
          return {
            action: nav ? { type: nav.type, destinationId: nav.destinationId ?? null } : null,
          };
        });
        out.set(node.id, { id: node.id, reactions });
      }
    }

    const maybeChildren = (node as unknown as { children?: ReadonlyArray<SceneNode> }).children;
    if (Array.isArray(maybeChildren)) {
      for (const child of maybeChildren) visit(child);
    }
  }

  for (const child of page.children) visit(child);
  return out;
}

/**
 * Export a single frame as PNG at the given scale. Returns a fresh
 * ArrayBuffer (the slice ensures the returned buffer is not a view over
 * a larger Uint8Array — important for postMessage transfer semantics).
 */
export async function exportFrameAsPng(
  node: FrameNode | ComponentNode | InstanceNode,
  scale: 1 | 2,
): Promise<ArrayBuffer> {
  const bytes = await node.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  });
  // bytes is Uint8Array — copy its bytes into a standalone ArrayBuffer.
  // We could transfer bytes.buffer directly, but that detaches the
  // original Uint8Array which can cause double-export retries to crash.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Recursively collect hotspot rows from a frame subtree.
 *
 * The worker's row spec (figma-import-worker/index.ts:935-970) covers
 * two cases: a reaction attached to the frame itself (full-frame click)
 * and a reaction attached to a descendant layer. We emit both shapes
 * here, scoped by `frameNodeId`. The `hotspot_id` is deterministic —
 * `${frameId}-${childId}-${index}` so repeated imports of the same
 * file produce the same hotspot ids (legitimate dedup at the DB layer
 * via the (prototype_version_id, hotspot_id) idea, if we ever add it).
 *
 * Bbox normalization (0..1 relative to the owning frame's width/height)
 * matches the worker's coordinate convention so the viewer's
 * `normalize-coords` library returns the same screen positions regardless
 * of import path.
 */
function collectFrameHotspots(frame: FrameNode | ComponentNode | InstanceNode): {
  hotspots: SandboxHotspot[];
  warnings: SandboxWarning[];
} {
  const hotspots: SandboxHotspot[] = [];
  const warnings: SandboxWarning[] = [];

  const frameW = frame.width || 1;
  const frameH = frame.height || 1;

  // (a) frame-level reactions — bbox covers the entire frame
  const ownReactions = frame.reactions ?? [];
  ownReactions.forEach((r, idx) => {
    const nav = asNavAction(r.action);
    if (!nav) return;
    hotspots.push({
      frame_node_id: frame.id,
      hotspot_id: `${frame.id}-self-${idx}`,
      target_frame_id: nav.destinationId ?? null,
      transition_kind: mapTransition(nav.transition ?? null),
      bbox_x: 0,
      bbox_y: 0,
      bbox_w: 1,
      bbox_h: 1,
      z_index: idx,
      source_layer: null,
      figma_raw: [nav],
    });
  });

  // (b) child-layer reactions — recurse through descendants
  function visitChild(node: SceneNode, parentX: number, parentY: number): void {
    const x = parentX + (('x' in node ? node.x : 0) ?? 0);
    const y = parentY + (('y' in node ? node.y : 0) ?? 0);
    const w = ('width' in node ? node.width : 0) ?? 0;
    const h = ('height' in node ? node.height : 0) ?? 0;

    const maybeReactions = (node as unknown as { reactions?: ReadonlyArray<Reaction> }).reactions;
    if (Array.isArray(maybeReactions) && maybeReactions.length > 0) {
      maybeReactions.forEach((r, idx) => {
        const nav = asNavAction(r.action);
        if (!nav) return;
        // Normalize coords to [0..1] relative to the OWNING frame. Clamp
        // negative offsets to 0 (designer mistakes — element drawn outside
        // its parent — are still imported but warning-flagged downstream
        // in v2).
        const nx = Math.max(0, x / frameW);
        const ny = Math.max(0, y / frameH);
        const nw = Math.min(1, w / frameW);
        const nh = Math.min(1, h / frameH);
        hotspots.push({
          frame_node_id: frame.id,
          hotspot_id: `${frame.id}-${node.id}-${idx}`,
          target_frame_id: nav.destinationId ?? null,
          transition_kind: mapTransition(nav.transition ?? null),
          bbox_x: nx,
          bbox_y: ny,
          bbox_w: nw,
          bbox_h: nh,
          z_index: idx,
          source_layer: node.name,
          figma_raw: [nav],
        });
      });
    }

    const maybeChildren = (node as unknown as { children?: ReadonlyArray<SceneNode> }).children;
    if (Array.isArray(maybeChildren)) {
      for (const child of maybeChildren) visitChild(child, x, y);
    }
  }

  for (const child of frame.children ?? []) visitChild(child, 0, 0);

  return { hotspots, warnings };
}

/**
 * Top-level orchestrator. Called from code.ts on `start-import`. Drives
 * the parsing + rendering stages and emits IPC messages for the UI to
 * pick up. The UI iframe runs the uploading + publishing stages.
 *
 * Flow:
 *   1. PARSING (~instant): switch to the owning page, build the
 *      reactions graph, BFS from flowNodeId. Emit `progress`.
 *   2. Collect hotspots from each reachable frame. Emit
 *      `hotspots-collected` with the prototypeVersionId echo so the UI
 *      iframe can compose Storage paths even if frame-rendered messages
 *      arrive out of order.
 *   3. RENDERING: for each reachable frame, export at 1× and 2×, hash
 *      the bytes (sha256_16 — byte-identical to the worker), emit
 *      `frame-rendered` for each scale, plus `progress` after every
 *      frame. (The UI accumulates bytes by (frameId, scale) — the hash
 *      is recomputed there too, since postMessage doesn't carry our
 *      sha string for free.)
 *
 * Errors during ANY stage emit `import-error` with a structured code.
 * The UI iframe maps the code to a friendly message via
 * `lib/ui/friendly-errors.ts`.
 */
export async function runImport(args: {
  flowNodeId: string;
  pageId: string;
  prototypeVersionId: string;
}): Promise<void> {
  try {
    // -------------------- 1. PARSING --------------------
    postToUi({ type: 'progress', stage: 'parsing', done: 0, total: 1 });

    // manifest.documentAccess = "dynamic-page" means Figma lazily loads
    // pages — non-current PageNode.children throws until we explicitly
    // request all pages. We always need the BFS to traverse reactions
    // across the prototype's page, and exportAsync for overlays may
    // require neighboring pages too, so load everything upfront.
    // Single roundtrip, run BEFORE we touch figma.root.children below.
    await figma.loadAllPagesAsync();

    // Switch to the owning page — exportAsync requires the current page
    // for some node types (overlay frames, dynamic-page-loaded pages).
    const page = figma.root.children.find((p) => p.id === args.pageId);
    if (!page || page.type !== 'PAGE') {
      postToUi({
        type: 'import-error',
        code: 'plugin_render_failed',
        message: `Page ${args.pageId} not found`,
      });
      return;
    }
    // In dynamic-page mode the synchronous setter throws:
    //   "Cannot call with documentAccess: dynamic-page.
    //    Use figma.setCurrentPageAsync instead."
    // The async variant is the only legal way to switch active page in
    // this manifest mode — and it's a no-op when `page` already IS the
    // current page, so calling it unconditionally is safe.
    await figma.setCurrentPageAsync(page);

    const graph = collectReactionsGraph(args.pageId);
    const reachableIds = walkReachable(args.flowNodeId, (id) => graph.get(id), 5000);
    if (reachableIds.length === 0) {
      postToUi({
        type: 'import-error',
        code: 'plugin_no_prototype',
        message: 'Starting frame has no reachable frames via reactions',
      });
      return;
    }

    // Resolve each id to a FrameNode-like node. Filter to FRAME / COMPONENT /
    // INSTANCE — those are the only types that have `exportAsync` AND are
    // legitimate prototype frames.
    type FrameLike = FrameNode | ComponentNode | InstanceNode;
    const frames: FrameLike[] = [];
    for (const id of reachableIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (!node) continue;
      if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        frames.push(node);
      }
    }
    if (frames.length === 0) {
      postToUi({
        type: 'import-error',
        code: 'plugin_no_prototype',
        message: 'No exportable frames in reachable set',
      });
      return;
    }

    postToUi({ type: 'progress', stage: 'parsing', done: 1, total: 1 });

    // -------------------- 2. HOTSPOT COLLECTION --------------------
    const allHotspots: SandboxHotspot[] = [];
    const allWarnings: SandboxWarning[] = [];
    for (const frame of frames) {
      const { hotspots, warnings } = collectFrameHotspots(frame);
      allHotspots.push(...hotspots);
      allWarnings.push(...warnings);
    }

    // `figma.fileKey` is null for files that aren't cloud-saved, for some
    // Development-mode plugin scenarios, and (occasionally) for files
    // freshly opened from a local copy. The downstream Zod schema requires
    // a non-empty string here, so we synthesize one. The synthesized key
    // uses the prototype's starting flow node id, which is at least
    // stable across re-imports of the SAME flow in the SAME Figma file —
    // good enough for plugin-side dedup. We tag the synthesized key with
    // a `local:` prefix so the worker / report UI can tell real Figma
    // file keys from fallbacks and surface a "save to cloud" hint.
    const realFileKey = figma.fileKey;
    const fileKey =
      realFileKey && realFileKey.length > 0 ? realFileKey : `local:${args.flowNodeId}`;
    if (!realFileKey) {
      allWarnings.push({
        code: 'no_file_key',
        frame_id: args.flowNodeId,
      });
    }

    postToUi({
      type: 'hotspots-collected',
      prototypeVersionId: args.prototypeVersionId,
      fileKey,
      fileName: figma.root.name,
      startingFrameId: args.flowNodeId,
      reachableCount: frames.length,
      hotspots: allHotspots,
      warnings: allWarnings,
    });

    // -------------------- 3. RENDERING --------------------
    const total = frames.length;
    postToUi({ type: 'progress', stage: 'rendering', done: 0, total });

    for (let i = 0; i < frames.length; i++) {
      const node = frames[i]!;
      // 1× export
      let bytes1x: ArrayBuffer;
      try {
        bytes1x = await exportFrameAsPng(node, 1);
      } catch (e) {
        postToUi({
          type: 'import-error',
          code: 'plugin_render_failed',
          message: `1× export failed for ${node.name}: ${String(e)}`,
        });
        return;
      }
      if (bytes1x.byteLength > SIZE_WARN_1X_BYTES) {
        allWarnings.push({ code: 'png_1x_oversize', frame_id: node.id, bytes: bytes1x.byteLength });
      }
      postToUi({
        type: 'frame-rendered',
        frameId: node.id,
        scale: 1,
        bytes: bytes1x,
        name: node.name,
        width: node.width,
        height: node.height,
        position: i,
      });

      // 2× export
      let bytes2x: ArrayBuffer;
      try {
        bytes2x = await exportFrameAsPng(node, 2);
      } catch (e) {
        postToUi({
          type: 'import-error',
          code: 'plugin_render_failed',
          message: `2× export failed for ${node.name}: ${String(e)}`,
        });
        return;
      }
      if (bytes2x.byteLength > SIZE_WARN_2X_BYTES) {
        allWarnings.push({ code: 'png_2x_oversize', frame_id: node.id, bytes: bytes2x.byteLength });
      }
      postToUi({
        type: 'frame-rendered',
        frameId: node.id,
        scale: 2,
        bytes: bytes2x,
        name: node.name,
        width: node.width,
        height: node.height,
        position: i,
      });

      postToUi({ type: 'progress', stage: 'rendering', done: i + 1, total });
    }

    // (Historical: a sha256_16 probe ran here to fail fast if
    // `crypto.subtle` was unavailable in the sandbox. It turns out
    // Figma's plugin sandbox runtime does NOT expose `crypto` at all —
    // ReferenceError: 'crypto' is not defined. The probe was the only
    // thing that needed it; the UI iframe owns all hashing for Storage
    // paths and gets `crypto.subtle` from the DOM. So we just drop the
    // probe instead of pulling a pure-JS SHA-256 in for no benefit.)

    // Sandbox is done; UI iframe handles uploading + publishing.
  } catch (err) {
    postToUi({
      type: 'import-error',
      code: 'plugin_render_failed',
      message: String(err),
    });
  }
}
