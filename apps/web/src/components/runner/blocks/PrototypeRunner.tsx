/**
 * PrototypeRunner — mobile-first viewer for the Phase 2 prototype block.
 *
 * We deliberately do NOT use Figma Embed Kit — see RESEARCH.md "State of
 * the Art" and CONTEXT.md anti-pattern note (specifics line 491). We
 * render server-rendered PNGs + absolutely-positioned overlay hotspots
 * and intercept every pointerdown with normalized (x, y) ∈ [0, 1]
 * coordinates so the heatmap has pixel-perfect attribution.
 *
 * Wires (Plan 02-09):
 *  - B-02: new EventBuffer(sessionId, block.id) — block.id flows into
 *    submit_events p_block_id so the server's mis-attribution check
 *    can pin each batch to a single prototype block.
 *  - B-03: supabaseAnon.rpc('set_session_prototype_pin', ...) on mount,
 *    BEFORE any events are pushed. The pin is set-once server-side; the
 *    RPC's failure mode is harmless (we log + proceed — submit_events
 *    will reject the events with a clear error if the pin is wrong).
 *  - B-04: supabaseAnon.storage.createSignedUrls(paths, 86400) batched
 *    once per pv_id; URLs threaded into FrameLayer via the `signedUrls`
 *    prop. The bucket is private (00007 RLS); the runner's anon JWT
 *    grants read via the per-session policy.
 *  - W-06: useFramesRunner + useHotspotsRunner from
 *    @/lib/queries/prototypes-runner (TanStack Query) instead of inline
 *    useEffect + supabaseAnon.from(...).
 *
 * Event protocol (Plan 02-08 submit_events shape):
 *   - frame_enter: emitted on mount for starting frame + after every
 *     transition completes for the new frame.
 *   - frame_exit: emitted on the OLD frame the instant a hotspot tap
 *     triggers a transition (paired with frame_enter on the new frame).
 *   - tap: every pointerdown that lands inside the rendered image (outside
 *     letterbox → dropped by normalizeCoords). hit_target_id and
 *     hotspot_id are null for misclicks.
 *   - task_finish: emitted when the respondent either auto-reaches a
 *     `finish_frame_ids[]` frame (PROTO-14) or clicks the explicit
 *     "Finish task" button.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { uuidv7 } from 'uuidv7';
import { Button } from '@/components/ui/button';
import {
  FrameLayer,
  TransitionAnimator,
  type FrameShape,
  type HotspotShape,
  type TransitionKind,
} from './PrototypeViewer';
import { EventBuffer } from '@/lib/runner/event-buffer';
import { nextSeq } from '@/lib/runner/seq-counter';
import { supabaseAnon } from '@/lib/supabase/anon';
import { useFramesRunner, useHotspotsRunner } from '@/lib/queries/prototypes-runner';
import type { Block } from '@/lib/blocks/types';
import type { PrototypeContent } from '@/lib/blocks/schemas';

export interface PrototypeRunnerProps {
  block: Block;
  /** Required for live mode (event submission). Preview mode passes null. */
  sessionId: string | null;
  /** Called when the prototype block finishes — RunnerShell.handleBlockAdvance wraps this. */
  onComplete: () => void;
}

/** Per-CONTEXT D-10 transition durations — kept in lock-step with TransitionAnimator. */
const TRANSITION_DURATION_MS: Record<TransitionKind, number> = {
  slide: 300,
  dissolve: 200,
  push: 400,
  smart_animate: 200,
};

export function PrototypeRunner({ block, sessionId, onComplete }: PrototypeRunnerProps) {
  const content = block.content as PrototypeContent;
  const pvId = content.prototype_version_id;
  const startingFrameId = content.starting_frame_id;

  // Debug overlay — DEV builds only, gated by ?debug=coords (CONTEXT line 494).
  const debug = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return new URL(window.location.href).searchParams.get('debug') === 'coords';
    } catch {
      return false;
    }
  }, []);

  // W-06: TanStack Query reads — cache + dedupe across remounts.
  const { data: frames = [], isLoading: framesLoading } = useFramesRunner(pvId);
  const { data: hotspots = [], isLoading: hotspotsLoading } = useHotspotsRunner(pvId);
  const loading = framesLoading || hotspotsLoading;

  // B-03: pin the session to this prototype_version_id BEFORE any events fire.
  // Idempotent server-side (set-once); the RPC call is safe on remount.
  const [pinSet, setPinSet] = useState(false);
  useEffect(() => {
    if (!sessionId || !pvId) {
      // Preview mode (no session) — still let the viewer render. EventBuffer is gated below.
      setPinSet(true);
      return;
    }
    let abort = false;
    (async () => {
      const { error } = await supabaseAnon.rpc(
        'set_session_prototype_pin' as never,
        {
          p_session_id: sessionId,
          p_prototype_version_id: pvId,
        } as never,
      );
      if (abort) return;
      if (error) {
        // Pin failed — likely the session already has a different pin from a
        // prior remount. submit_events will still work if the existing pin
        // matches; otherwise it surfaces a clear error there. Log and proceed.
        console.warn('set_session_prototype_pin failed', error.message);
      }
      setPinSet(true);
    })();
    return () => {
      abort = true;
    };
  }, [sessionId, pvId]);

  // B-04: mint signed URLs for the PRIVATE prototype-renders bucket — once
  // per pv_id, batched. createSignedUrls accepts an array and returns one row
  // per path; we collapse into a Record<path, signedUrl>.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!frames.length) {
      setSignedUrls({});
      return;
    }
    const paths = Array.from(new Set(frames.flatMap((f) => [f.render_path_1x, f.render_path_2x])));
    let abort = false;
    supabaseAnon.storage
      .from('prototype-renders')
      .createSignedUrls(paths, 86400)
      .then(({ data, error }) => {
        if (abort || error || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
        }
        setSignedUrls(map);
      });
    return () => {
      abort = true;
    };
    // frames.length is a coarse identity — fresh frames array under the same
    // pvId means the prototype was re-imported, which our cache won't see
    // mid-session anyway (sessions.prototype_version_pin is set-once).
  }, [pvId, frames.length]);

  // Current Figma-frame id (text) — drives the FrameLayer render + hotspot filter.
  const [currentFrameId, setCurrentFrameId] = useState<string>(startingFrameId);
  // Active transition envelope — when non-null, FrameLayer is wrapped in TransitionAnimator
  // and pointer events are locked out.
  const [transition, setTransition] = useState<{ kind: TransitionKind; key: string } | null>(null);

  // B-02: EventBuffer lifecycle. block.id carries the prototype block's PK into
  // submit_events p_block_id so the server can pin each batch to one block.
  const bufferRef = useRef<EventBuffer | null>(null);
  useEffect(() => {
    if (!sessionId || !pinSet) return; // wait for pin so submit_events doesn't 400.
    const buf = new EventBuffer(sessionId, block.id);
    bufferRef.current = buf;
    // Emit frame_enter for the starting frame.
    buf.push({
      id: uuidv7(),
      seq: nextSeq(sessionId),
      frame_id: currentFrameId,
      hotspot_id: null,
      hit_target_id: null,
      event_type: 'frame_enter',
      x: null,
      y: null,
      client_ts: new Date().toISOString(),
    });
    return () => {
      void buf.flush();
      buf.dispose();
      bufferRef.current = null;
    };
    // Run once per session+block; remounts re-emit frame_enter intentionally.
    // currentFrameId is intentionally NOT in the dep list — frame transitions
    // happen via in-buffer pushes, not buffer re-creation.
  }, [sessionId, pinSet, block.id]);

  // Resolve the current frame DB row from the Figma frame id.
  const currentFrame = useMemo(
    () => frames.find((f) => f.frame_id === currentFrameId),
    [frames, currentFrameId],
  );

  // Filter hotspots to the current frame. Plan 02-02 schema: hotspots.frame_id
  // is a UUID FK to frames.id (W-01 — hard-coded, no verify comment needed).
  const currentHotspots: HotspotShape[] = useMemo(
    () =>
      hotspots
        .filter((h) => h.frame_id === currentFrame?.id)
        .map((h) => ({
          id: h.id,
          frame_id: h.frame_id,
          hotspot_id: h.hotspot_id,
          target_frame_id: h.target_frame_id,
          transition_kind: (['slide', 'dissolve', 'push', 'smart_animate'] as const).includes(
            h.transition_kind as TransitionKind,
          )
            ? (h.transition_kind as TransitionKind)
            : 'dissolve',
          bbox_x: h.bbox_x,
          bbox_y: h.bbox_y,
          bbox_w: h.bbox_w,
          bbox_h: h.bbox_h,
          z_index: h.z_index,
        })),
    [hotspots, currentFrame?.id],
  );

  // Coerce DB shape → FrameLayer's FrameShape (only the fields it needs).
  const frameForLayer: FrameShape | null = currentFrame
    ? {
        id: currentFrame.id,
        frame_id: currentFrame.frame_id,
        name: currentFrame.name,
        width: currentFrame.width,
        height: currentFrame.height,
        render_path_1x: currentFrame.render_path_1x,
        render_path_2x: currentFrame.render_path_2x,
      }
    : null;

  function handleFinishTask(_trigger: 'explicit' | 'auto') {
    if (!sessionId) {
      // Preview mode — no event, just advance.
      onComplete();
      return;
    }
    bufferRef.current?.push({
      id: uuidv7(),
      seq: nextSeq(sessionId),
      frame_id: currentFrameId,
      hotspot_id: null,
      hit_target_id: null,
      event_type: 'task_finish',
      x: null,
      y: null,
      client_ts: new Date().toISOString(),
    });
    bufferRef.current
      ?.flush()
      .catch(() => {
        /* swallow — pagehide handler will retry via sessionStorage W-10 */
      })
      .finally(() => onComplete());
  }

  function handleTap({ x, y, hotspot }: { x: number; y: number; hotspot: HotspotShape | null }) {
    if (!sessionId || transition) return; // belt-and-suspenders (Pitfall 8)

    bufferRef.current?.push({
      id: uuidv7(),
      seq: nextSeq(sessionId),
      frame_id: currentFrameId,
      hotspot_id: hotspot?.hotspot_id ?? null,
      hit_target_id: hotspot?.target_frame_id ?? null,
      event_type: 'tap',
      x,
      y,
      client_ts: new Date().toISOString(),
    });

    if (hotspot?.target_frame_id) {
      const kind: TransitionKind = hotspot.transition_kind;
      const oldFrame = currentFrameId;
      const newFrame = hotspot.target_frame_id;

      setTransition({ kind, key: `${newFrame}:${Date.now()}` });

      // frame_exit for the OLD frame — fires before the visual transition completes.
      bufferRef.current?.push({
        id: uuidv7(),
        seq: nextSeq(sessionId),
        frame_id: oldFrame,
        hotspot_id: null,
        hit_target_id: null,
        event_type: 'frame_exit',
        x: null,
        y: null,
        client_ts: new Date().toISOString(),
      });

      const durationMs = TRANSITION_DURATION_MS[kind];
      window.setTimeout(() => {
        setCurrentFrameId(newFrame);
        bufferRef.current?.push({
          id: uuidv7(),
          seq: nextSeq(sessionId),
          frame_id: newFrame,
          hotspot_id: null,
          hit_target_id: null,
          event_type: 'frame_enter',
          x: null,
          y: null,
          client_ts: new Date().toISOString(),
        });
        setTransition(null);

        // PROTO-14: auto-finish when the respondent reaches a finish frame.
        const finishFrames = content.finish_frame_ids ?? [];
        if (finishFrames.includes(newFrame)) {
          handleFinishTask('auto');
        }
      }, durationMs);
    }
  }

  // Fallback: missing prototype_version_id or starting_frame_id → skip with a
  // friendly message. Should be impossible for published studies (Plan 02-04
  // publish-readiness gate) but defence-in-depth.
  if (!pvId || !startingFrameId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
        <p className="text-body text-muted-foreground">
          This prototype isn’t available. Tap Skip to continue.
        </p>
        <Button onClick={onComplete} variant="outline" className="min-h-touch w-full max-w-xs">
          Skip
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-3 pb-6 pt-2">
      <p className="text-sm leading-relaxed">{content.task_instruction}</p>

      <div className="relative">
        {loading || !frameForLayer ? (
          <p className="text-sm text-muted-foreground">Loading prototype…</p>
        ) : transition ? (
          <TransitionAnimator
            kind={transition.kind}
            keyValue={transition.key}
            onComplete={() => {
              /* visual-only — actual state transition handled by setTimeout in handleTap */
            }}
          >
            <FrameLayer
              frame={frameForLayer}
              hotspots={currentHotspots}
              signedUrls={signedUrls}
              onTap={handleTap}
              debug={debug}
            />
          </TransitionAnimator>
        ) : (
          <FrameLayer
            frame={frameForLayer}
            hotspots={currentHotspots}
            signedUrls={signedUrls}
            onTap={handleTap}
            debug={debug}
          />
        )}
      </div>

      <div
        className="sticky bottom-0 bg-background pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <Button
          onClick={() => handleFinishTask('explicit')}
          className="min-h-touch w-full"
          variant="outline"
        >
          Finish task
        </Button>
      </div>

      {debug && (
        <pre className="fixed top-2 right-2 z-50 max-w-xs rounded bg-black/80 p-2 text-[10px] text-white">
          frame={currentFrameId} — see ?debug=coords for hotspot overlays
        </pre>
      )}
    </div>
  );
}
