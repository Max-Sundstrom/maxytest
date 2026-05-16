// apps/plugin/src/code.ts — Phase 02.2 Plan 01 SMOKE entrypoint.
//
// Smoke version — real import pipeline in Plan 07.
//
// Runs in the Figma plugin SANDBOX (no DOM, no fetch, no React). The
// sandbox's only job for this scaffold is to open the UI iframe at the
// canonical 360×540 surface (per 02.2-UI-SPEC §"Surface & Runtime
// Constraints") and handle the iframe's "close" message.
//
// In Plan 07 this file expands to:
//   - flow detection (figma.root.children → PageNode.flowStartingPoints)
//   - BFS over reactions graph
//   - per-frame exportAsync (1x + 2x)
//   - sha256_16 hashing of PNG bytes
//   - IPC bridge for clientStorage (Plan 05) + Storage upload requests
//
// What this file DOES NOT do (anti-patterns per 02.2-PATTERNS.md §6
// "Explicit NOT-copy"):
//   - Does not import @supabase/supabase-js (no fetch in sandbox).
//   - Does not import React or react-dom (no DOM in sandbox).
//   - Does not reference window / document / localStorage.

figma.showUI(__html__, { width: 360, height: 540 });

figma.ui.onmessage = (msg: { type?: string } | undefined) => {
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'close':
      figma.closePlugin();
      return;
    default:
      // Unknown messages are ignored during the smoke phase. Plan 05+
      // wires real handlers for `open-external`, `storage-request`,
      // `start-import`, etc.
      return;
  }
};
