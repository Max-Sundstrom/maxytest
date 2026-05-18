/**
 * FrameLayer — single-frame renderer + tap interception for the
 * prototype runner. Plan 02-09 Task 2 / PATTERNS.md lines 328-371 +
 * RESEARCH.md Pattern 3 (aspect-ratio wrapper + coord normalization).
 *
 * Responsibilities:
 *   - Render the frame PNG (1x + 2x via <picture>) inside a fixed-aspect
 *     wrapper. `aspect-ratio: width/height` keeps the wrapper at the
 *     frame's logical ratio across all viewport widths; `object-contain`
 *     letterboxes the image so we never crop / distort (PROTO-11).
 *   - Intercept every pointerdown, normalize via `normalizeCoords` from
 *     Plan 02-01, and dispatch the tap to the parent runner.
 *   - Sort hotspots DESC by z_index before hit-testing so overlay
 *     hotspots (z_index ≥ 100) win (PROTO-09 / Pitfall 7).
 *   - Drop outside-letterbox clicks: normalizeCoords returns null and we
 *     skip the dispatch (CONTEXT D-discretion line 248).
 *   - Render a transient red ring overlay at the tap location when the
 *     tap falls outside any hotspot — visual misclick feedback per Plan
 *     03.1-05 / 03.1-CONTEXT.md GA4 / D-74. The `tap` event with
 *     `hit_target_id: null` is still dispatched via `onTap` — this is
 *     presentation-only and never alters the analytics event stream.
 *
 * Misclick spam cap:
 *   - At most 3 rings are simultaneously visible; the 4th miss replaces
 *     the oldest (FIFO eviction). Each ring auto-unmounts after 600ms
 *     via a setTimeout tracked in a useRef<Map> so unmount cleanup can
 *     clearTimeout pending timers (no memory leak on rapid-fire taps or
 *     mid-ring frame transition).
 *
 * Ring IDs:
 *   - Generated via `crypto.randomUUID()` (Web Crypto API, available in
 *     all Phase 1 browser targets per tsconfig ES2022 + Safari 16+
 *     baseline). We deliberately do NOT import the project's uuidv7()
 *     helper here — runner code stays import-light, and React keys only
 *     need stable uniqueness across the array's lifetime, not the
 *     monotonic-sortable guarantees of UUIDv7.
 *
 * Signed-URL strategy (B-04):
 *   - The runner (PrototypeRunner) mints signed URLs ONCE per
 *     prototype_version_id and threads them down via the `signedUrls`
 *     prop (Record<storage_path, signedUrl>). FrameLayer never calls
 *     supabase.storage.createSignedUrls itself — that would mint a URL
 *     per render and burn signing throughput.
 *
 * Boundary:
 *   - Path is under `components/runner/blocks/PrototypeViewer/**` which
 *     the ESLint runner-tree glob (Plan 02-01 + W-06) covers. NEVER
 *     import @/lib/supabase/auth.
 */
import { useEffect, useRef, useState } from 'react';
import { normalizeCoords } from '@/lib/figma/coords';
import { HotspotOverlay } from './HotspotOverlay';

export interface FrameShape {
  id: string;
  frame_id: string;
  name: string;
  width: number;
  height: number;
  render_path_1x: string;
  render_path_2x: string;
}

export interface HotspotShape {
  id: string;
  frame_id: string;
  hotspot_id: string;
  target_frame_id: string | null;
  transition_kind: 'slide' | 'dissolve' | 'push' | 'smart_animate';
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  z_index: number;
}

export interface FrameLayerProps {
  frame: FrameShape;
  /** Hotspots for the CURRENT frame only — the runner pre-filters by frame_id. */
  hotspots: HotspotShape[];
  /** B-04: pre-minted signed URL map (path → URL). Runner mints once at session start. */
  signedUrls: Record<string, string>;
  onTap: (input: { x: number; y: number; hotspot: HotspotShape | null }) => void;
  /** Dev-only: render pink hotspot outlines on top of the frame. */
  debug?: boolean;
}

/** Maximum number of simultaneously-visible misclick rings (Plan 03.1-05 / GA4). */
const MISCLICK_MAX_VISIBLE = 3;
/** Per-ring lifetime in ms — locked by 03.1-CONTEXT.md GA4/D-74. */
const MISCLICK_RING_DURATION_MS = 600;

interface MisclickRing {
  /** crypto.randomUUID() — React key + Map lookup. */
  id: string;
  /** Normalized 0..1 within the frame's aspect-ratio wrapper (same space as HotspotOverlay). */
  x: number;
  y: number;
}

export function FrameLayer({ frame, hotspots, signedUrls, onTap, debug = false }: FrameLayerProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  /**
   * Misclick state — list of currently-visible rings. Mounted as
   * absolutely-positioned divs inside the aspect-ratio wrapper.
   */
  const [misclicks, setMisclicks] = useState<MisclickRing[]>([]);
  /**
   * Removal-timer registry keyed by ring id. We keep this in a ref (not
   * state) so the cleanup useEffect can `clearTimeout` on unmount without
   * triggering an extra render. Map.delete + clearTimeout are both
   * idempotent, which makes React 19 strict-mode double-invoke benign
   * even when the eviction side-effect runs inside a setState updater.
   */
  const misclickTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all pending ring-removal timers when the frame unmounts
  // (e.g. respondent navigates to the next frame mid-ring). Without this
  // the timer would fire on an unmounted component and leak DOM intent.
  useEffect(() => {
    const timers = misclickTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  function handlePointerDown(evt: React.PointerEvent) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const coords = normalizeCoords(rect, evt.nativeEvent);
    // outside letterbox → DROP (do NOT record as region:letterbox per CONTEXT D-discretion).
    if (!coords) return;
    // DESC by z_index: overlay hotspots win the hit-test (PROTO-09 / Pitfall 7).
    const sorted = [...hotspots].sort((a, b) => b.z_index - a.z_index);
    const hit =
      sorted.find(
        (h) =>
          coords.x >= h.bbox_x &&
          coords.x <= h.bbox_x + h.bbox_w &&
          coords.y >= h.bbox_y &&
          coords.y <= h.bbox_y + h.bbox_h,
      ) ?? null;

    // Misclick visual feedback (Plan 03.1-05). PURE PRESENTATION — the
    // analytics `tap` event below still fires regardless. Source-layer is
    // local state + setTimeout; no store, no analytics double-recording.
    if (hit === null) {
      const id = crypto.randomUUID();
      setMisclicks((prev) => {
        // Spam cap: keep at most MISCLICK_MAX_VISIBLE simultaneous rings.
        // When adding the (cap+1)th, drop the oldest (FIFO) and clear its timer.
        // clearTimeout + Map.delete are idempotent — strict-mode double-invoke safe.
        const next = [...prev, { id, x: coords.x, y: coords.y }];
        while (next.length > MISCLICK_MAX_VISIBLE) {
          const dropped = next.shift()!;
          const t = misclickTimers.current.get(dropped.id);
          if (t) clearTimeout(t);
          misclickTimers.current.delete(dropped.id);
        }
        return next;
      });
      const timer = setTimeout(() => {
        setMisclicks((prev) => prev.filter((m) => m.id !== id));
        misclickTimers.current.delete(id);
      }, MISCLICK_RING_DURATION_MS);
      misclickTimers.current.set(id, timer);
    }

    onTap({ x: coords.x, y: coords.y, hotspot: hit });
  }

  const src1x = signedUrls[frame.render_path_1x];
  const src2x = signedUrls[frame.render_path_2x];

  return (
    <div
      className="relative w-full select-none"
      // Fixed aspect ratio so letterboxing happens OUTSIDE the image, not inside.
      style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
      onPointerDown={handlePointerDown}
      aria-label={frame.name}
    >
      {src1x ? (
        <picture>
          {src2x && <source srcSet={src2x} media="(min-resolution: 1.5dppx)" />}
          <img
            ref={imgRef}
            src={src1x}
            alt={frame.name}
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        </picture>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground text-sm">
          Loading…
        </div>
      )}
      <HotspotOverlay hotspots={hotspots} debug={debug} />

      {/*
       * Misclick rings (Plan 03.1-05 / GA4). One <div> per active miss,
       * centered on the click coordinate via translate(-50%, -50%) baked
       * INTO the @keyframes (`misclick-ring-fadeout` in tokens.css). The
       * CSS animation overrides the static transform, so we don't apply
       * any static transform here. `pointer-events-none` is critical —
       * the ring must never absorb subsequent taps. `aria-hidden` because
       * the visual ring is decorative; the SR announcement is handled by
       * the separate aria-live region below.
       */}
      {misclicks.map((m) => (
        <div
          key={m.id}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: `${m.x * 100}%`,
            top: `${m.y * 100}%`,
            width: 32,
            height: 32,
            border: '2px solid var(--color-warning)',
            borderRadius: '50%',
            background: 'transparent',
            animation: 'misclick-ring-fadeout 600ms cubic-bezier(.2, .7, .3, 1) forwards',
          }}
        />
      ))}

      {/*
       * Single aria-live region for the whole component (NOT one per
       * ring). When the misclicks array transitions empty → non-empty
       * or grows, aria-live="polite" re-reads the new content. The
       * announcement string is the Russian «Промах» — runner UX is
       * Russian-first per project conventions.
       */}
      <div
        aria-live="polite"
        className="sr-only"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {misclicks.length > 0 ? 'Промах' : ''}
      </div>
    </div>
  );
}
