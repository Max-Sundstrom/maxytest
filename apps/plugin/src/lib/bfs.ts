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

/** Navigation action types that count as graph edges. CLOSE_OVERLAY is
 *  explicitly NOT in here (its destinationId is null and it pops the
 *  overlay stack — not a navigation to a new frame). */
const NAV_ACTIONS = new Set<string>(['NAVIGATE', 'OPEN_OVERLAY', 'SWAP_OVERLAY']);

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
