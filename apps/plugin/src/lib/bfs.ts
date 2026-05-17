// apps/plugin/src/lib/bfs.ts — Phase 02.2 Plan 06.
//
// Breadth-first walk over a Figma prototype's reactions graph, starting
// from a single frame and following navigation actions. Per CONTEXT D-05a,
// we follow NAVIGATE / OPEN_OVERLAY / SWAP_OVERLAY actions; we ignore
// CLOSE_OVERLAY and other non-navigation action types.
//
// Two invariants vs easytest (PATTERNS §9 "Explicit NOT-copy"):
//   1. `visited` Set prevents revisiting a node — easytest's reaction
//      walker can loop forever on SWAP_OVERLAY cycles. We never can.
//   2. `visitedCap` (default 5000) is defense-in-depth: pathological
//      graphs (designer mistake, mass-generated frames, etc.) won't
//      consume unbounded plugin memory.
//
// Callback API (not graph-as-Map): Plan 07 wires `getNode` to
// `figma.getNodeById(id) as FrameNode | null`. The Plugin API resolves
// nodes O(1) without us holding a full document map in memory.

export interface BfsNode {
  id: string;
  reactions: Array<{ action?: { type?: string; destinationId?: string | null } | null }>;
}

/** Plain-data shape of a Figma node that may carry reactions and may have
 *  children with their own reactions. Used by `collectSubtreeNavReactions`
 *  so the aggregation logic is figma-free and unit-testable. The sandbox
 *  caller (sandbox-collect.ts) serializes a real Figma subtree into this
 *  shape before invoking the helper. */
export interface ReactionsTreeNode {
  id: string;
  reactions: ReadonlyArray<{
    action?: { type?: string; destinationId?: string | null } | null;
  }>;
  children?: ReadonlyArray<ReactionsTreeNode>;
}

/** Navigation action types that count as graph edges. CLOSE_OVERLAY is
 *  explicitly NOT in here (its destinationId is null and it pops the
 *  overlay stack — not a navigation to a new frame). */
const NAV_ACTIONS = new Set<string>(['NAVIGATE', 'OPEN_OVERLAY', 'SWAP_OVERLAY']);

/**
 * Walk a subtree (the FRAME-like node + all its descendants) and return
 * the union of navigation reactions found anywhere inside it.
 *
 * Why this exists: in Figma, prototype reactions are almost always attached
 * to descendant layers (buttons, cards), NOT to the top-level frame.
 * `walkReachable` only follows reactions on the node it is currently
 * visiting, so if the BFS graph entry for a frame carries only the frame's
 * own (empty) reactions, BFS stops at the start frame and never discovers
 * any destinations. This helper aggregates a frame's effective outgoing
 * edges by pulling reactions from every descendant whose `.reactions` is
 * populated — so the BfsNode the walker sees for that frame correctly
 * represents "everywhere the user can navigate to from here".
 *
 * Only navigation actions are kept (NAVIGATE / OPEN_OVERLAY / SWAP_OVERLAY).
 * The caller is expected to have normalized modern Plugin API shapes
 * (action.type === 'NODE' + action.navigation) into these strings before
 * building the input — see `asNavAction` in sandbox-collect.ts.
 */
export function collectSubtreeNavReactions(root: ReactionsTreeNode): BfsNode['reactions'] {
  const out: BfsNode['reactions'] = [];
  function visit(node: ReactionsTreeNode): void {
    for (const r of node.reactions) {
      const action = r.action;
      if (!action) continue;
      const t = action.type;
      if (t && NAV_ACTIONS.has(t)) {
        out.push({ action: { type: t, destinationId: action.destinationId ?? null } });
      }
    }
    if (node.children) {
      for (const child of node.children) visit(child);
    }
  }
  visit(root);
  return out;
}

/**
 * BFS from `startId`, returning the list of visited node IDs in BFS order.
 *
 * The default `visitedCap` of 5000 is generous (real prototypes rarely
 * exceed ~50 frames) but bounded — large enough to handle the worst real
 * file we have on hand (Phase 02.1 UAT used `AnPMpM9Locu4TGVZjK0emK` with
 * dozens of frames) while still preventing a pathological loop from
 * draining the plugin's memory.
 */
export function walkReachable(
  startId: string,
  getNode: (id: string) => BfsNode | undefined,
  visitedCap: number = 5000,
): string[] {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  const result: string[] = [];

  while (queue.length > 0 && visited.size < visitedCap) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;

    const node = getNode(id);
    if (!node) continue;

    visited.add(id);
    result.push(id);

    for (const r of node.reactions) {
      const action = r.action;
      if (!action) continue;
      const t = action.type;
      const dest = action.destinationId;
      if (t && NAV_ACTIONS.has(t) && dest) {
        // Don't pre-filter visited here — the dequeue loop above handles it
        // and pre-filtering would require us to fan out destinations into
        // multiple branches without ordering guarantees. Letting the queue
        // hold duplicates is cheap and BFS-order-preserving.
        queue.push(dest);
      }
    }
  }

  return result;
}
