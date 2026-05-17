// apps/plugin/src/code.ts — Phase 02.2 Plan 05 entrypoint.
//
// Runs in the Figma plugin SANDBOX (no DOM, no fetch, no React). Owns the
// 360×540 UI iframe (UI-SPEC §"Surface & Runtime Constraints") and
// dispatches the three IPC verbs the UI iframe needs in Plan 05:
//
//   - storage-request → figma.clientStorage round-trip (auth session cache,
//     wired through lib/sandbox-storage.ts → lib/storage-bridge.ts so
//     supabase-js's custom storage adapter can persist the session JSON).
//   - open-external   → figma.openExternal(url). Must run synchronously
//     after the UI's click handler so the Figma desktop client preserves the
//     user-gesture flag (RESEARCH Pitfall 3); the UI side already enforces
//     this — the sandbox just forwards.
//   - close           → figma.closePlugin() (carried over from Plan 01).
//
// In Plan 07 this file expands again to drive the real import pipeline:
// flow detection, BFS over the reactions graph, per-frame exportAsync,
// sha256_16 hashing, Storage uploads. Plan 05 deliberately stays minimal —
// only the auth-handshake plumbing.
//
// What this file STILL DOES NOT do (anti-patterns per 02.2-PATTERNS.md §6):
//   - Does not import @supabase/supabase-js (no fetch in sandbox).
//   - Does not import React or react-dom (no DOM in sandbox).
//   - Does not reference window / document / localStorage.

import { detectStartingFrames } from './lib/flow-detection';
import { runImport, serializeFlowDetectionInput } from './lib/sandbox-collect';
import { handleStorageMessage, type StorageRequestMessage } from './lib/sandbox-storage';

figma.showUI(__html__, { width: 360, height: 540 });

// Message envelope — keeps the `switch` exhaustive while staying permissive
// about unknown types (T-02.2-05-06 mitigation: explicit switch, default
// branch warns but never throws / evals / reflects).
type IncomingMessage =
  | StorageRequestMessage
  | { type: 'open-external'; url: string }
  | { type: 'close' }
  | { type: 'detect-flows' }
  | {
      type: 'start-import';
      flowNodeId: string;
      pageId: string;
      prototypeVersionId: string;
    };

figma.ui.onmessage = (raw: unknown) => {
  // Defensive parse — the iframe is our own React code, but the IPC seam is
  // still a trust boundary. We accept anything with a string `type` field;
  // unknown types fall through to `console.warn` (no reflection / eval).
  if (!raw || typeof raw !== 'object') return;
  const msg = raw as Partial<IncomingMessage> & { type?: string };
  if (typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'storage-request': {
      // Validated by sandbox-storage.ts itself; await fire-and-forget so we
      // do not block other messages while clientStorage spins.
      void handleStorageMessage(msg as StorageRequestMessage);
      return;
    }
    case 'open-external': {
      // Pitfall 3 (user-gesture): we MUST forward openExternal synchronously
      // here — any `await` on this branch in either runtime would consume
      // the gesture flag and Figma Desktop would block the OS browser
      // launch silently. The UI side already enforces "no await before
      // postMessage" (apps/plugin/src/lib/auth.ts signInWithMagicLink).
      const url = (msg as { url?: unknown }).url;
      if (typeof url !== 'string' || url.length === 0) {
        console.warn('[plugin] open-external rejected: url is not a non-empty string');
        return;
      }
      figma.openExternal(url);
      return;
    }
    case 'close': {
      figma.closePlugin();
      return;
    }
    case 'detect-flows': {
      // Pure orchestration — serialize the document, run the cascade, post
      // the result. Errors here surface as an empty flows array; the UI
      // shows an ErrorCard with `plugin_no_prototype` in that case.
      try {
        const input = serializeFlowDetectionInput();
        const flows = detectStartingFrames(input);
        figma.ui.postMessage({ type: 'flows-result', flows });
      } catch (err) {
        figma.ui.postMessage({
          type: 'import-error',
          code: 'plugin_render_failed',
          message: `flow detection failed: ${String(err)}`,
        });
      }
      return;
    }
    case 'start-import': {
      // Fire-and-forget — runImport posts its own progress + completion
      // messages over IPC. Validate the required string fields first.
      const args = msg as {
        flowNodeId?: unknown;
        pageId?: unknown;
        prototypeVersionId?: unknown;
      };
      if (
        typeof args.flowNodeId !== 'string' ||
        typeof args.pageId !== 'string' ||
        typeof args.prototypeVersionId !== 'string'
      ) {
        figma.ui.postMessage({
          type: 'import-error',
          code: 'plugin_render_failed',
          message: 'start-import: missing required fields',
        });
        return;
      }
      void runImport({
        flowNodeId: args.flowNodeId,
        pageId: args.pageId,
        prototypeVersionId: args.prototypeVersionId,
      });
      return;
    }
    default: {
      // Unknown messages logged for debugging only — never thrown.
      console.warn('[plugin] unknown message type:', msg.type);
      return;
    }
  }
};
