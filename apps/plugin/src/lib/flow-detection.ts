// apps/plugin/src/lib/flow-detection.ts — Phase 02.2 Plan 06.
//
// Pure function that identifies candidate "flow start" frames a designer
// might want to publish. Implements the 4-level cascade from CONTEXT D-05.
//
// PURE — accepts plain-data FlowDetectionInput, returns FlowStart[]. No
// `figma.*` global access here. The Plan 07 sandbox-side caller walks
// figma.root.children, serializes the relevant pageId/name/
// flowStartingPoints/topLevelFrames into the input shape, and calls this.
// Tests drive the function with hand-rolled fixtures (see __tests__/
// flow-detection.test.ts).
//
// Cascade order (once a level fires, lower levels are skipped):
//   1. flow-starting-point — Figma's authoritative PageNode.flowStartingPoints.
//   2. name-marker         — top-level frame name matches /\[(start|begin)\]/i.
//   3. graph-root          — top-level frame with zero incoming reactions
//                             AND at least one outgoing reaction.
//   4. first-frame-fallback — any top-level frame on any page (last resort).
//
// Each candidate carries its `source` so the UI can label confidence
// ("Auto-detected" vs "Best guess") — UX surface lives in Plan 07.

import type { FlowStart } from '../types';

export type { FlowStart };

/** Plain-data shape representing the Figma document state needed to detect
 *  starts. Constructed in the sandbox (Plan 07) from the Plugin API and
 *  passed across the IPC seam to the UI iframe that calls
 *  `detectStartingFrames`. */
export interface FlowDetectionInput {
  pages: Array<{
    id: string;
    name: string;
    /** From `PageNode.flowStartingPoints` (Figma Plugin API ≥ 1.0.0). */
    flowStartingPoints: ReadonlyArray<{ nodeId: string; name: string }>;
    /** Direct children of the page that are `FrameNode`s, in document order. */
    topLevelFrames: Array<{
      id: string;
      name: string;
      reactions: Array<{ action?: { destinationId?: string } }>;
    }>;
  }>;
}

/** Case-insensitive marker — leading whitespace tolerated. Matches the
 *  easytest convention (`[start]` or `[begin]` at the start of the frame
 *  name; case ignored, surrounding whitespace stripped before matching). */
const NAME_MARKER_RE = /^\s*\[(start|begin)\]/i;

export function detectStartingFrames(input: FlowDetectionInput): FlowStart[] {
  if (input.pages.length === 0) return [];

  // -------------------- Level 1: PageNode.flowStartingPoints --------------------
  const levelOne: FlowStart[] = [];
  for (const page of input.pages) {
    for (const fsp of page.flowStartingPoints) {
      // Resolve the frame's display name from topLevelFrames if available;
      // fall back to the flowStartingPoint's own `name` field otherwise
      // (Figma sometimes labels its starting points with a flow name that
      // does not match a frame name verbatim).
      const frame = page.topLevelFrames.find((f) => f.id === fsp.nodeId);
      levelOne.push({
        pageId: page.id,
        pageName: page.name,
        nodeId: fsp.nodeId,
        nodeName: frame?.name ?? fsp.name,
        source: 'flow-starting-point',
      });
    }
  }
  if (levelOne.length > 0) return levelOne;

  // -------------------- Level 2: name marker --------------------
  const levelTwo: FlowStart[] = [];
  for (const page of input.pages) {
    for (const frame of page.topLevelFrames) {
      if (NAME_MARKER_RE.test(frame.name)) {
        levelTwo.push({
          pageId: page.id,
          pageName: page.name,
          nodeId: frame.id,
          nodeName: frame.name,
          source: 'name-marker',
        });
      }
    }
  }
  if (levelTwo.length > 0) return levelTwo;

  // -------------------- Level 3: graph-root --------------------
  // A frame is a "graph root" within its page when:
  //   - no other top-level frame on the same page has a reaction whose
  //     destinationId === this frame.id (no incoming), AND
  //   - this frame itself has at least one reaction with a non-empty
  //     destinationId (at least one outgoing).
  //
  // We restrict the search to within-page only because cross-page
  // reactions are rare in Figma prototypes and the easytest fallback
  // chain treats each page independently.
  const levelThree: FlowStart[] = [];
  for (const page of input.pages) {
    // Compute the set of frame ids that ARE someone's destination.
    const incoming = new Set<string>();
    for (const frame of page.topLevelFrames) {
      for (const r of frame.reactions) {
        const dest = r.action?.destinationId;
        if (dest) incoming.add(dest);
      }
    }
    for (const frame of page.topLevelFrames) {
      const hasOutgoing = frame.reactions.some((r) => Boolean(r.action?.destinationId));
      if (!incoming.has(frame.id) && hasOutgoing) {
        levelThree.push({
          pageId: page.id,
          pageName: page.name,
          nodeId: frame.id,
          nodeName: frame.name,
          source: 'graph-root',
        });
      }
    }
  }
  if (levelThree.length > 0) return levelThree;

  // -------------------- Level 4: first top-level frame on any page --------------------
  for (const page of input.pages) {
    const first = page.topLevelFrames[0];
    if (first) {
      return [
        {
          pageId: page.id,
          pageName: page.name,
          nodeId: first.id,
          nodeName: first.name,
          source: 'first-frame-fallback',
        },
      ];
    }
  }

  // No pages contain any top-level frames. Genuinely nothing to publish.
  return [];
}
