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
import { useRef } from 'react';
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

export function FrameLayer({ frame, hotspots, signedUrls, onTap, debug = false }: FrameLayerProps) {
  const imgRef = useRef<HTMLImageElement>(null);

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
    </div>
  );
}
