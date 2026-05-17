// apps/plugin/src/ui.tsx — Phase 02.2 Plan 07 Task 4.
//
// Top-level UI iframe entry point. Wires the full end-to-end import
// pipeline: silent cached-session restore → flow detection → flow picker
// (S2) → publishing progress (S3) → success deep-link (S4) → error
// recovery (S5). The sandbox (apps/plugin/src/code.ts) does the Figma-API
// heavy lifting; this file owns network-side work (Storage uploads,
// `publish_prototype_from_plugin` RPC).
//
// === State machine ===
//
//   loading        — silent restoreCachedSession() + first workspace fetch
//   sign-in        — magic-link Realtime handshake (Plan 05)
//   picker         — Screen S2; selecting a flow + click "Опубликовать"
//   progress       — Screen S3; reflects sandbox parsing/rendering then
//                    UI's uploading/publishing stages
//   success        — Screen S4; deep-link CTA opens study in browser
//   error          — Screen S5; ErrorCard with friendly message + retry
//
// === IPC contract (sandbox → UI) ===
//
//   - flows-result        → transition loading/picker → picker(flows)
//   - hotspots-collected  → cache the BFS output (hotspots, file metadata,
//                           reachableCount, startingFrameId) for the
//                           upcoming RPC call
//   - frame-rendered      → accumulate ArrayBuffer by (frameId, scale)
//   - progress            → update ProgressView counter (sandbox stages
//                           only: parsing, rendering)
//   - import-error        → transition to error screen with recovery code
//
// === Idempotency contract (D-03a) ===
//
//   - prototypeVersionId is a UUIDv7 generated ONCE per publish attempt
//     at the start of handlePublish. Reused on retry (RPC dedups by
//     `(study_id, idempotency_key)`).
//   - idempotencyKey is a SEPARATE UUIDv7 generated ONCE at component
//     mount. Reused on retry, regenerated only on "back from success
//     → new publish" (so each publish creates an independent audit row).
//
// === Recovery flows (UI-SPEC §"Recovery flows") ===
//
//   - plugin_no_session  → S1
//   - auth_timeout       → S1
//   - plugin_no_prototype→ S2 (re-detect)
//   - plugin_render_failed / plugin_upload_failed / plugin_rpc_failed → S3
//     (retry handlePublish with the same idempotencyKey + prototypeVersionId)
//   - unknown_error      → S2
//
// === Pitfall 3 (user-gesture) ===
//
//   - SuccessView "Open in Maxytest →" onOpen → posts `open-external`
//     IPC SYNCHRONOUSLY from the click handler. Sandbox forwards to
//     figma.openExternal(deepLinkUrl) without any await in between.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { uuidv7 } from 'uuidv7';

import DotsLoader from './components/DotsLoader';
import ErrorCard from './components/ErrorCard';
import ProgressView, { type ProgressStage } from './components/ProgressView';
import PrototypePickerView from './components/PrototypePickerView';
import SignInView from './components/SignInView';
import SuccessView from './components/SuccessView';
import { restoreCachedSession, signOut } from './lib/auth';
import { supabase } from './lib/supabase';
import { getFriendlyError } from './lib/ui/friendly-errors';
import { publishCollected, type CollectedFrameBytes } from './lib/ui/publish';
import { cssString } from './styles.css';
import type { FlowStart, PluginErrorCode, SandboxHotspot, SandboxWarning } from './types';

declare const process: { env: { VIEWER_URL: string } };

const HELP_URL =
  'https://github.com/anthropics/maxytest-placeholder/blob/main/apps/plugin/README.md';

// ─── Screen union ──────────────────────────────────────────────────────────

type RecoveryTarget = 'sign-in' | 'picker' | 'progress';

type Screen =
  | { kind: 'loading' }
  | { kind: 'sign-in' }
  | { kind: 'picker'; flows: FlowStart[] | null }
  | {
      kind: 'progress';
      flow: FlowStart;
      stage: ProgressStage;
      done: number;
      total: number;
    }
  | {
      kind: 'success';
      flow: FlowStart;
      framesCount: number;
      hotspotsCount: number;
      replayed: boolean;
      deepLinkUrl: string;
    }
  | {
      kind: 'error';
      code: PluginErrorCode;
      message?: string;
      recoveryTo: RecoveryTarget;
      /** Carry the flow forward so retry of progress-stage errors can
       *  re-run handlePublish without re-prompting the user. */
      flow?: FlowStart;
    };

// ─── IPC helpers ───────────────────────────────────────────────────────────

function sendIpc(message: { type: string; [k: string]: unknown }): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

// ─── Collected-data accumulator ────────────────────────────────────────────

/** Per-publish-attempt buffer. Cleared at the start of every handlePublish
 *  (so retry doesn't double-up bytes from a previous failed attempt). */
interface CollectedBuffer {
  /** From `hotspots-collected` — the rest of the wire payload. */
  fileKey: string;
  fileName: string;
  startingFrameId: string;
  hotspots: SandboxHotspot[];
  warnings: SandboxWarning[];
  /** Map keyed by `${frameId}@${scale}` containing the bytes plus the
   *  frame's metadata (name, width, height, position). Updated for every
   *  `frame-rendered` IPC. */
  framesByKey: Map<
    string,
    {
      frameId: string;
      scale: 1 | 2;
      bytes: ArrayBuffer;
      name: string;
      width: number;
      height: number;
      position: number;
    }
  >;
  /** Reachable frame count from sandbox — used to detect "all 2× scales
   *  arrived" before kicking off uploads. */
  reachableCount: number;
}

function emptyBuffer(): CollectedBuffer {
  return {
    fileKey: '',
    fileName: '',
    startingFrameId: '',
    hotspots: [],
    warnings: [],
    framesByKey: new Map(),
    reachableCount: 0,
  };
}

// ─── Workspace fetch ───────────────────────────────────────────────────────

/** Fetch the user's first workspace. Phase 1 + 2 assume exactly one
 *  workspace per designer (the auth trigger creates it on signup). Phase
 *  6 will introduce multi-workspace UX — out of scope here. */
async function fetchFirstWorkspaceId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', uid)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { workspace_id: string }).workspace_id;
}

// ─── App component ────────────────────────────────────────────────────────

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  // Idempotency key + prototype-version-id: generated ONCE per publish
  // attempt at handlePublish entry. The key resets when the user returns
  // from success → new publish (so each publish is independent), so we
  // hold them in refs (don't trigger re-renders).
  const idempotencyKeyRef = useRef<string | null>(null);
  const prototypeVersionIdRef = useRef<string | null>(null);

  // Collected sandbox data (per-attempt buffer).
  const collectedRef = useRef<CollectedBuffer>(emptyBuffer());

  // Cached workspace id (fetched once after sign-in).
  const workspaceIdRef = useRef<string | null>(null);

  // Current flow being imported. Kept in a ref (NOT just on the `screen`
  // state) because the IPC `onMessage` handler lives inside a useEffect
  // with an empty deps array — its closure captures `screen` from the
  // first render only (when `screen.kind === 'loading'`). Reading
  // `screen.flow` from inside that stale closure always returns
  // `undefined`, so `onAllFramesRendered` would fail with "Internal
  // plugin state not ready" right when all frames arrive. A ref dodges
  // the stale-closure trap — handlePublish sets it before posting
  // `start-import`, onAllFramesRendered reads it after all frames land.
  const currentFlowRef = useRef<FlowStart | null>(null);

  // Inject the stylesheet ONCE.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = cssString;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Silent cached-session restore on mount.
  useEffect(() => {
    void (async () => {
      const ok = await restoreCachedSession();
      if (!ok) {
        setScreen({ kind: 'sign-in' });
        return;
      }
      const wsId = await fetchFirstWorkspaceId();
      if (!wsId) {
        setScreen({
          kind: 'error',
          code: 'plugin_rpc_failed',
          message: 'Не удалось определить ваш воркспейс. Создайте его в Maxytest и войдите снова.',
          recoveryTo: 'sign-in',
        });
        return;
      }
      workspaceIdRef.current = wsId;
      setScreen({ kind: 'picker', flows: null });
      sendIpc({ type: 'detect-flows' });
    })();
  }, []);

  // Esc closes the plugin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') sendIpc({ type: 'close' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sandbox → UI IPC listener.
  useEffect(() => {
    function onMessage(ev: MessageEvent): void {
      const data = ev.data as { pluginMessage?: { type?: string; [k: string]: unknown } };
      const msg = data?.pluginMessage;
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'flows-result': {
          const flows = (msg.flows ?? []) as FlowStart[];
          setScreen({ kind: 'picker', flows });
          return;
        }
        case 'hotspots-collected': {
          // Cache the BFS output for the upcoming RPC call.
          const m = msg as {
            fileKey: string;
            fileName: string;
            startingFrameId: string;
            reachableCount: number;
            hotspots: SandboxHotspot[];
            warnings: SandboxWarning[];
          };
          collectedRef.current.fileKey = m.fileKey;
          collectedRef.current.fileName = m.fileName;
          collectedRef.current.startingFrameId = m.startingFrameId;
          collectedRef.current.hotspots = m.hotspots;
          collectedRef.current.warnings = m.warnings;
          collectedRef.current.reachableCount = m.reachableCount;
          return;
        }
        case 'frame-rendered': {
          const m = msg as {
            frameId: string;
            scale: 1 | 2;
            bytes: ArrayBuffer;
            name: string;
            width: number;
            height: number;
            position: number;
          };
          const key = `${m.frameId}@${m.scale}`;
          collectedRef.current.framesByKey.set(key, {
            frameId: m.frameId,
            scale: m.scale,
            bytes: m.bytes,
            name: m.name,
            width: m.width,
            height: m.height,
            position: m.position,
          });

          // When all 2 × N frames are accumulated, kick off uploads.
          const expected = collectedRef.current.reachableCount * 2;
          if (expected > 0 && collectedRef.current.framesByKey.size === expected) {
            // Defer the upload run to a microtask so this handler returns
            // promptly and the setScreen below isn't called inside the
            // message-dispatch frame (some Figma sandbox builds get fussy
            // about same-tick postMessage roundtrips).
            void onAllFramesRendered();
          }
          return;
        }
        case 'progress': {
          const p = msg as {
            stage: 'parsing' | 'rendering' | 'uploading' | 'publishing';
            done: number;
            total: number;
          };
          setScreen((prev) => {
            if (prev.kind !== 'progress') return prev;
            return { ...prev, stage: p.stage, done: p.done, total: p.total };
          });
          return;
        }
        case 'import-error': {
          const e = msg as { code: PluginErrorCode; message: string };
          setScreen((prev) => ({
            kind: 'error',
            code: e.code,
            message: e.message,
            recoveryTo: e.code === 'plugin_no_prototype' ? 'picker' : 'progress',
            flow: prev.kind === 'progress' || prev.kind === 'error' ? prev.flow : undefined,
          }));
          return;
        }
        default:
          // Other IPC types (storage-reply, etc.) are handled by other
          // listeners. No action here.
          return;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ─── Flow callbacks ─────────────────────────────────────────────────────

  /** Convert the framesByKey Map into CollectedFrameBytes[]. Pairs
   *  (frameId, 1) + (frameId, 2) into a single entry per frame; orders
   *  by sandbox-assigned `position` so downstream code sees BFS-preorder. */
  function collectFrameBytes(): CollectedFrameBytes[] {
    const byFrameId = new Map<
      string,
      Partial<CollectedFrameBytes> & {
        bytes1x?: ArrayBuffer;
        bytes2x?: ArrayBuffer;
      }
    >();
    for (const entry of collectedRef.current.framesByKey.values()) {
      const cur = byFrameId.get(entry.frameId) ?? {
        frameId: entry.frameId,
        name: entry.name,
        width: entry.width,
        height: entry.height,
        position: entry.position,
      };
      cur.name = entry.name;
      cur.width = entry.width;
      cur.height = entry.height;
      cur.position = entry.position;
      if (entry.scale === 1) cur.bytes1x = entry.bytes;
      else cur.bytes2x = entry.bytes;
      byFrameId.set(entry.frameId, cur);
    }
    const out: CollectedFrameBytes[] = [];
    for (const v of byFrameId.values()) {
      if (!v.bytes1x || !v.bytes2x) continue;
      out.push({
        frameId: v.frameId!,
        name: v.name!,
        width: v.width!,
        height: v.height!,
        position: v.position!,
        bytes1x: v.bytes1x,
        bytes2x: v.bytes2x,
      });
    }
    return out.sort((a, b) => a.position - b.position);
  }

  /** Called when the sandbox has finished rendering all reachable frames.
   *  Kicks off uploads + RPC. Errors transition to S5 with a recovery code. */
  async function onAllFramesRendered(): Promise<void> {
    const wsId = workspaceIdRef.current;
    const idem = idempotencyKeyRef.current;
    const pvId = prototypeVersionIdRef.current;
    // Use the ref, NOT screenFlow() — see comment on currentFlowRef.
    const flow = currentFlowRef.current;
    if (!wsId || !idem || !pvId || !flow) {
      // Surface which ref is empty so future debugging doesn't require
      // another patch + rebuild. Each piece is intentionally separate;
      // the runtime turns the four truthy checks into a comma-list that
      // looks like "wsId, pvId" if those two are missing.
      const missing = [
        !wsId && 'workspace',
        !idem && 'idempotency-key',
        !pvId && 'prototype-version-id',
        !flow && 'flow',
      ]
        .filter(Boolean)
        .join(', ');
      setScreen({
        kind: 'error',
        code: 'unknown_error',
        message: `Внутреннее состояние плагина не готово к публикации (missing: ${missing})`,
        recoveryTo: 'picker',
      });
      return;
    }

    // Create the study now — the RPC requires an existing study_id.
    const flowName = `${flow.pageName} → ${flow.nodeName}`;
    let studyId: string;
    try {
      const title = `${collectedRef.current.fileName} — ${flowName}`.slice(0, 120);
      const { data, error } = await supabase.rpc('create_study', {
        ws_id: wsId,
        study_title: title,
      });
      if (error || !data) {
        setScreen({
          kind: 'error',
          code: 'plugin_rpc_failed',
          message: error?.message ?? 'Не удалось создать study',
          recoveryTo: 'progress',
          flow,
        });
        return;
      }
      studyId = data as string;
    } catch (err) {
      setScreen({
        kind: 'error',
        code: 'plugin_rpc_failed',
        message: String(err),
        recoveryTo: 'progress',
        flow,
      });
      return;
    }

    const frames = collectFrameBytes();
    const framesCount = frames.length;
    const hotspotsCount = collectedRef.current.hotspots.length;

    setScreen({
      kind: 'progress',
      flow,
      stage: 'uploading',
      done: 0,
      total: framesCount * 2,
    });

    const result = await publishCollected({
      workspaceId: wsId,
      studyId,
      prototypeVersionId: pvId,
      idempotencyKey: idem,
      fileKey: collectedRef.current.fileKey,
      fileName: collectedRef.current.fileName,
      startingFrameId: collectedRef.current.startingFrameId,
      frames,
      hotspots: collectedRef.current.hotspots,
      warnings: collectedRef.current.warnings,
      onUploadProgress: (done, total) => {
        setScreen((prev) => {
          if (prev.kind !== 'progress') return prev;
          return { ...prev, stage: 'uploading', done, total };
        });
      },
      onPublishStart: () => {
        setScreen((prev) => {
          if (prev.kind !== 'progress') return prev;
          return { ...prev, stage: 'publishing', done: 0, total: 1 };
        });
      },
    });

    if (!result.ok) {
      setScreen({
        kind: 'error',
        code: result.code,
        message: result.message,
        recoveryTo: 'progress',
        flow,
      });
      return;
    }

    const deepLinkUrl = `${process.env.VIEWER_URL}/studies/${result.data.study_id}/edit`;
    setScreen({
      kind: 'success',
      flow,
      framesCount,
      hotspotsCount,
      replayed: result.data.replayed,
      deepLinkUrl,
    });
  }

  /** Begin a publish attempt. Generates idempotencyKey + prototypeVersionId
   *  (or reuses if `retry === true`). */
  function handlePublish(flow: FlowStart, retry: boolean): void {
    if (!retry || !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = uuidv7();
    }
    if (!retry || !prototypeVersionIdRef.current) {
      prototypeVersionIdRef.current = uuidv7();
    }
    // Mirror the flow into a ref so the stale-closure-locked IPC handler
    // can still see it when frame-rendered messages start arriving.
    currentFlowRef.current = flow;
    // Fresh per-attempt buffer (unless retrying a progress-stage error,
    // in which case we keep the already-collected hotspots/frames).
    if (!retry) {
      collectedRef.current = emptyBuffer();
    }
    setScreen({
      kind: 'progress',
      flow,
      stage: 'parsing',
      done: 0,
      total: 1,
    });
    sendIpc({
      type: 'start-import',
      flowNodeId: flow.nodeId,
      pageId: flow.pageId,
      prototypeVersionId: prototypeVersionIdRef.current,
    });
  }

  function handleRefresh(): void {
    setScreen({ kind: 'picker', flows: null });
    sendIpc({ type: 'detect-flows' });
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
    idempotencyKeyRef.current = null;
    prototypeVersionIdRef.current = null;
    workspaceIdRef.current = null;
    currentFlowRef.current = null;
    collectedRef.current = emptyBuffer();
    setScreen({ kind: 'sign-in' });
  }

  function handleBackFromSuccess(): void {
    // Regenerate keys so a new publish is independent (UI-SPEC §"Screen
    // S4 Interactions").
    idempotencyKeyRef.current = null;
    prototypeVersionIdRef.current = null;
    currentFlowRef.current = null;
    collectedRef.current = emptyBuffer();
    setScreen({ kind: 'picker', flows: null });
    sendIpc({ type: 'detect-flows' });
  }

  function handleOpenInMaxytest(deepLinkUrl: string): void {
    // Synchronous IPC inside the click handler — Pitfall 3.
    sendIpc({ type: 'open-external', url: deepLinkUrl });
  }

  function handleRetryFromError(): void {
    if (screen.kind !== 'error') return;
    const { recoveryTo, flow } = screen;
    if (recoveryTo === 'sign-in') {
      void handleSignOut();
      return;
    }
    if (recoveryTo === 'picker') {
      handleRefresh();
      return;
    }
    if (recoveryTo === 'progress' && flow) {
      handlePublish(flow, /* retry */ true);
      return;
    }
    // Fallback — go to picker.
    handleRefresh();
  }

  function openHelp(): void {
    sendIpc({ type: 'open-external', url: HELP_URL });
  }

  // ─── Render branches ────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      {screen.kind === 'loading' && (
        <main
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DotsLoader />
        </main>
      )}

      {screen.kind === 'sign-in' && (
        <SignInView
          onSignedIn={() => {
            void (async () => {
              const wsId = await fetchFirstWorkspaceId();
              if (!wsId) {
                setScreen({
                  kind: 'error',
                  code: 'plugin_rpc_failed',
                  message:
                    'Не удалось определить ваш воркспейс. Создайте его в Maxytest и войдите снова.',
                  recoveryTo: 'sign-in',
                });
                return;
              }
              workspaceIdRef.current = wsId;
              setScreen({ kind: 'picker', flows: null });
              sendIpc({ type: 'detect-flows' });
            })();
          }}
        />
      )}

      {screen.kind === 'picker' &&
        (screen.flows === null ? (
          <main
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DotsLoader />
          </main>
        ) : (
          <PrototypePickerView
            flows={screen.flows}
            onPublish={(flow) => handlePublish(flow, /* retry */ false)}
            onRefresh={handleRefresh}
            onSignOut={() => void handleSignOut()}
          />
        ))}

      {screen.kind === 'progress' && (
        <ProgressView
          flowName={`${screen.flow.pageName} → ${screen.flow.nodeName}`}
          stage={screen.stage}
          done={screen.done}
          total={screen.total}
        />
      )}

      {screen.kind === 'success' && (
        <SuccessView
          flowName={`${screen.flow.pageName} → ${screen.flow.nodeName}`}
          framesCount={screen.framesCount}
          hotspotsCount={screen.hotspotsCount}
          replayed={screen.replayed}
          deepLinkUrl={screen.deepLinkUrl}
          onOpen={() => handleOpenInMaxytest(screen.deepLinkUrl)}
          onBack={handleBackFromSuccess}
          onSignOut={() => void handleSignOut()}
        />
      )}

      {screen.kind === 'error' && (
        <ErrorScreen
          code={screen.code}
          message={screen.message}
          onRetry={handleRetryFromError}
          onHelp={openHelp}
        />
      )}
    </div>
  );
}

// ─── Error screen ─────────────────────────────────────────────────────────

function ErrorScreen({
  code,
  message,
  onRetry,
}: {
  code: PluginErrorCode;
  message?: string;
  onRetry: () => void;
  onHelp: () => void;
}) {
  const fr = getFriendlyError(code);
  return (
    <main
      style={{
        flex: 1,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        background: '#FFFFFF',
      }}
    >
      <ErrorCard
        code={code}
        title={fr.title}
        // Show the friendly summary FOLLOWED by the raw sandbox/RPC detail
        // when present. The previous ternary discarded `message` entirely
        // (both branches rendered `fr.message`), which hid the actual cause
        // of plugin_render_failed / plugin_rpc_failed / plugin_upload_failed
        // errors — leaving the user with no way to tell which frame broke.
        message={
          message && message !== fr.title && message !== fr.message
            ? `${fr.message}\n\nДетали: ${message}`
            : fr.message
        }
        onRetry={onRetry}
        retryLabel={fr.retryLabel}
      />
    </main>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
