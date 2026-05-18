/**
 * PrototypeReport — per-frame heatmap + per-frame stats card.
 *
 * Plan: 02-flagship-prototype-block-heatmap / 02-10 / Task 2.
 *
 * Requirements satisfied (final Slice D plan, closes Phase 2):
 *   - ANALYTICS-01: per-frame click heatmap, rendered via simpleheat
 *     against the frame's PNG (signed URL minted from the PRIVATE
 *     `prototype-renders` bucket — B-04 propagation).
 *   - ANALYTICS-02: per-frame stats card — total clicks, unique visitors,
 *     hit rate, misclick rate.
 *   - ANALYTICS-03: low-N confidence treatment. N<30 → "Preliminary" amber
 *     banner + reduced heatmap opacity. N<10 → switch to <IndividualClicks>
 *     numbered-dots fallback (D-14 honest-stats decision).
 *   - ANALYTICS-06: hotspot-area-fraction annotation — "Hotspots cover Z%
 *     of frame area" (Σ bbox_w × bbox_h).
 *   - ANALYTICS-07: misclick decomposition. Misclicks (events with
 *     `hit_target_id = null`) split into near (<= 44 CSS-px from nearest
 *     hotspot edge — WCAG min target size, D-15) vs far. Distance is
 *     computed in CSS-px against the rendered frame element.
 *
 * Two-Supabase-client boundary: this is designer-side studio code →
 * imports `@/lib/supabase/auth` (the authenticated client). RLS on
 * `events` / `frames` / `hotspots` / `prototype_versions` filters rows
 * down to workspaces the designer has access to via
 * `current_workspace_role()`.
 *
 * Phase 2 supports at most ONE prototype block per study, so the component
 * pulls all blocks and picks the first `type='prototype'`. A multi-block
 * picker UI is deferred to Phase 4.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useBlocks } from '@/lib/queries/blocks';
import { useBlockEvents } from '@/lib/queries/block-events';
import { useFrameEvents, useFrameStats, type FrameEventRow } from '@/lib/queries/events-designer';
import {
  useFrames,
  useHotspots,
  usePrototypeVersion,
  type Frame,
  type Hotspot,
} from '@/lib/queries/prototypes';
import { frameTimings, type FrameTimings } from '@/lib/analytics/frame-timings';
import { Heatmap } from '@/lib/heatmap/Heatmap';
import { IndividualClicks } from '@/lib/heatmap/individual-clicks';
import { supabase } from '@/lib/supabase/auth';
import type { PrototypeContent } from '@/lib/blocks/schemas';

const STORAGE_BUCKET = 'prototype-renders';
const SIGNED_URL_TTL_SECONDS = 86_400;

// D-14 honest-stats thresholds.
const LOW_N_BANNER_THRESHOLD = 30;
const LOW_N_INDIVIDUAL_THRESHOLD = 10;

// D-15 misclick decomposition: WCAG 2.5.5 minimum tap target — 44 CSS px.
const NEAR_MISS_DISTANCE_CSS_PX = 44;

export interface PrototypeReportProps {
  studyId: string;
}

export function PrototypeReport({ studyId }: PrototypeReportProps) {
  // ---------------------------------------------------------------------------
  // 1. Find the (single) prototype block in this study.
  // ---------------------------------------------------------------------------
  const { data: blocks = [], isLoading: blocksLoading } = useBlocks(studyId);
  const prototypeBlock = blocks.find((b) => b.type === 'prototype');

  if (blocksLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!prototypeBlock) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Prototype report</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No prototype block in this study. Add one in the builder to see analytics.
        </p>
      </div>
    );
  }

  const pvId = (prototypeBlock.content as PrototypeContent).prototype_version_id;
  return <PrototypeReportBody studyId={studyId} pvId={pvId} blockId={prototypeBlock.id} />;
}

/**
 * The report body is split out so the hooks below (which depend on a
 * resolved `pvId`) don't have to live behind a conditional in the parent —
 * React's rules-of-hooks demand a stable call shape.
 */
function PrototypeReportBody({
  studyId: _studyId,
  pvId,
  blockId,
}: {
  studyId: string;
  pvId: string;
  blockId: string;
}) {
  // ---------------------------------------------------------------------------
  // 2. Fetch prototype + frames + selected-frame data.
  // ---------------------------------------------------------------------------
  const { data: pv } = usePrototypeVersion(pvId);
  const { data: frames = [] } = useFrames(pvId);

  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedFrameId && frames.length > 0) {
      setSelectedFrameId(frames[0]!.frame_id);
    }
  }, [frames.length, selectedFrameId]);

  const selectedFrame = frames.find((f) => f.frame_id === selectedFrameId) ?? null;
  const selectedFrameDbId = selectedFrame?.id;

  const { data: hotspots = [] } = useHotspots(selectedFrameDbId);
  const { data: events = [] } = useFrameEvents(pvId, selectedFrameId, { eventType: 'tap' });
  const { data: stats } = useFrameStats(pvId, selectedFrameId);

  // ---------------------------------------------------------------------------
  // Plan 03-03 — time-on-frame (median / P95 / N посещений).
  //
  // Shares the Plan-03-01 `useBlockEvents` cache slot with ReportShell.tsx;
  // TanStack Query dedups by identical queryKey, so this hook does NOT trigger
  // a second round-trip when the user opens this card after the header tiles
  // have already rendered. The pure `frameTimings` aggregator subtracts the
  // 300 ms transition lockout per the Pitfall 4 pairing table (see
  // frame-timings.ts header — Open Q1 RESOLVED 2026-05-18).
  // ---------------------------------------------------------------------------
  const { data: allBlockEvents = [] } = useBlockEvents(pvId, blockId);
  const timings: FrameTimings = useMemo(
    () =>
      selectedFrameId
        ? frameTimings(allBlockEvents, selectedFrameId)
        : { median_ms: 0, p95_ms: 0, sample_size: 0 },
    [allBlockEvents, selectedFrameId],
  );

  // ---------------------------------------------------------------------------
  // 3. B-04 — designer-side signed URLs for the PRIVATE bucket.
  //    Mint once per pvId for every frame's 1x + 2x render path so both the
  //    thumbnail grid AND the selected-frame PNG resolve.
  // ---------------------------------------------------------------------------
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (frames.length === 0) {
      setSignedUrls({});
      return;
    }
    const paths = Array.from(
      new Set(frames.flatMap((f) => [f.render_path_1x, f.render_path_2x]).filter(Boolean)),
    );
    if (paths.length === 0) return;

    let aborted = false;
    void supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (aborted || error || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.path && row.signedUrl) {
            map[row.path] = row.signedUrl;
          }
        }
        setSignedUrls(map);
      });

    return () => {
      aborted = true;
    };
  }, [pvId, frames.length]);

  function srcForPath(path: string | null | undefined): string | undefined {
    if (!path) return undefined;
    return signedUrls[path];
  }

  // ---------------------------------------------------------------------------
  // 4. Per-frame stat derivations.
  // ---------------------------------------------------------------------------
  const uniqueVisitors = stats?.uniqueVisitors ?? 0;
  const totalClicks = events.length;
  const hits = events.filter((e) => e.hit_target_id !== null).length;
  const misses = totalClicks - hits;
  const hitRate = totalClicks === 0 ? 0 : hits / totalClicks;
  const missRate = totalClicks === 0 ? 0 : misses / totalClicks;
  const hotspotAreaFraction = useMemo(
    () => hotspots.reduce((sum, h) => sum + h.bbox_w * h.bbox_h, 0),
    [hotspots],
  );

  // ---------------------------------------------------------------------------
  // 5. Misclick decomposition (ANALYTICS-07 / D-15).
  //
  //    For each miss (hit_target_id is null), compute the shortest CSS-px
  //    distance to ANY hotspot's bbox edge. A miss within 44 CSS-px of a
  //    hotspot edge counts as "near" (the respondent was close enough that
  //    a slightly bigger target would have caught the tap); the rest are
  //    "far" (a real navigation mistake).
  // ---------------------------------------------------------------------------
  const renderedFrameWidthCssPxRef = useRef<number>(0);
  const [renderedTick, setRenderedTick] = useState(0);

  const { nearMisses, farMisses } = useMemo(() => {
    if (!selectedFrame || hotspots.length === 0 || renderedFrameWidthCssPxRef.current === 0) {
      return { nearMisses: 0, farMisses: misses };
    }
    const cssScale = renderedFrameWidthCssPxRef.current / selectedFrame.width;
    let near = 0;
    let far = 0;
    for (const e of events) {
      if (e.hit_target_id !== null) continue;
      if (e.x === null || e.y === null) {
        far++;
        continue;
      }
      const eCssX = e.x * selectedFrame.width * cssScale;
      const eCssY = e.y * selectedFrame.height * cssScale;
      const minDist = minDistanceToHotspotEdgeCssPx(
        eCssX,
        eCssY,
        hotspots,
        selectedFrame,
        cssScale,
      );
      if (minDist <= NEAR_MISS_DISTANCE_CSS_PX) near++;
      else far++;
    }
    return { nearMisses: near, farMisses: far };
    // We depend on `renderedTick` so the memo recomputes after the canvas
    // mounts and the ref is populated.
  }, [events, hotspots, selectedFrame, misses, renderedTick]);

  // ---------------------------------------------------------------------------
  // 6. Render-mode selection (D-14 low-N).
  // ---------------------------------------------------------------------------
  const N = uniqueVisitors;
  const isLowN = N < LOW_N_BANNER_THRESHOLD;
  const isVeryLowN = N < LOW_N_INDIVIDUAL_THRESHOLD;
  const [renderMode, setRenderMode] = useState<'heatmap' | 'individual'>(
    isVeryLowN ? 'individual' : 'heatmap',
  );
  // Auto-switch when N crosses the threshold (e.g. responses keep arriving
  // while the report is open).
  useEffect(() => {
    setRenderMode(isVeryLowN ? 'individual' : 'heatmap');
  }, [isVeryLowN]);

  // ---------------------------------------------------------------------------
  // 7. Heatmap canvas binding.
  // ---------------------------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmapRef = useRef<Heatmap | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedFrame || renderMode !== 'heatmap') return;

    if (!heatmapRef.current) heatmapRef.current = new Heatmap();
    heatmapRef.current.init(canvas, {
      width: selectedFrame.width,
      height: selectedFrame.height,
    });

    const points = events
      .filter((e) => e.x !== null && e.y !== null)
      .map((e) => ({ x: e.x as number, y: e.y as number, value: 1 }));
    heatmapRef.current.render(points, { lowN: isLowN });

    // Snapshot the rendered CSS width so the misclick decomposition can
    // run in the same units the user sees.
    renderedFrameWidthCssPxRef.current = canvas.clientWidth;
    setRenderedTick((n) => n + 1);

    return () => {
      heatmapRef.current?.dispose();
      heatmapRef.current = null;
    };
    // Re-run when the selected frame, the event count, the render mode, or
    // the lowN classification changes.
  }, [selectedFrameId, events.length, renderMode, isLowN, selectedFrame]);

  // Snapshot rendered width even in individual-clicks mode so the misclick
  // distance math has the right scale.
  const overlayWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (renderMode !== 'individual' || !overlayWrapperRef.current) return;
    renderedFrameWidthCssPxRef.current = overlayWrapperRef.current.clientWidth;
    setRenderedTick((n) => n + 1);
  }, [renderMode, selectedFrameId]);

  // ---------------------------------------------------------------------------
  // 8. Render.
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Prototype report</h1>
        <p className="text-sm text-muted-foreground">{pv?.figma_file_name ?? '—'}</p>
      </header>

      {/* Frame thumbnail picker */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {frames.map((f) => {
          const isSelected = selectedFrameId === f.frame_id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFrameId(f.frame_id)}
              className={
                'block rounded border-2 text-left ' +
                (isSelected ? 'border-primary' : 'border-transparent')
              }
              aria-pressed={isSelected}
              aria-label={`Select frame ${f.name}`}
            >
              <img
                src={srcForPath(f.render_path_1x)}
                alt={f.name}
                loading="lazy"
                className="block w-full rounded bg-muted"
              />
              <span className="mt-1 block truncate text-xs">{f.name}</span>
            </button>
          );
        })}
      </div>

      {/* Selected-frame heatmap + stats */}
      {selectedFrame && (
        <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div
            ref={overlayWrapperRef}
            className="relative"
            style={{ aspectRatio: `${selectedFrame.width} / ${selectedFrame.height}` }}
          >
            <img
              src={srcForPath(selectedFrame.render_path_1x)}
              alt={selectedFrame.name}
              className="absolute inset-0 h-full w-full object-contain"
            />
            {renderMode === 'heatmap' ? (
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply"
                aria-hidden
              />
            ) : (
              <IndividualClicks
                events={events
                  .filter(
                    (e): e is FrameEventRow & { x: number; y: number } =>
                      e.x !== null && e.y !== null,
                  )
                  .map((e) => ({ x: e.x, y: e.y, client_ts: e.client_ts }))}
                frame={{ width: selectedFrame.width, height: selectedFrame.height }}
              />
            )}
            <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
              N = {N}
            </span>
          </div>

          <aside className="space-y-3">
            {isLowN && (
              <div
                role="status"
                className="border-l-4 border-amber-500 bg-amber-100 p-3 text-sm text-amber-900"
              >
                Preliminary — based on {N} of ~{LOW_N_BANNER_THRESHOLD} responses we typically
                recommend.
              </div>
            )}
            {isVeryLowN && (
              <p className="text-xs text-muted-foreground">
                Heatmap mode needs more data — showing individual clicks instead.
              </p>
            )}
            <div className="space-y-1 text-sm">
              <p>
                Unique visitors: <strong>{uniqueVisitors}</strong>
              </p>
              <p>
                Total clicks: <strong>{totalClicks}</strong>
              </p>
              <p>
                Hit rate: <strong>{(hitRate * 100).toFixed(0)}%</strong> ({hits}/{totalClicks})
              </p>
              <p>
                Misclicks: <strong>{(missRate * 100).toFixed(0)}%</strong> ({misses}/{totalClicks})
                — {nearMisses} {'near (<44 px)'} · {farMisses} far
              </p>
              <p className="text-muted-foreground">
                Hotspots cover {(hotspotAreaFraction * 100).toFixed(0)}% of frame area.
              </p>
              {timings.sample_size > 0 ? (
                <>
                  <p>
                    Медианное время: <strong>{(timings.median_ms / 1000).toFixed(1)} с</strong>
                  </p>
                  <p>
                    P95: <strong>{(timings.p95_ms / 1000).toFixed(1)} с</strong>
                  </p>
                  <p>
                    N посещений: <strong>{timings.sample_size}</strong>
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Время на фрейме: нет данных</p>
              )}
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geometry helper — minimum CSS-px distance from a click point to the
// nearest hotspot bbox edge.
//
// The bbox is in NORMALIZED [0,1] coords; we rescale to CSS px by multiplying
// by `frame.width * cssScale` (and frame.height for the y-axis). A point
// inside any bbox returns 0 (hits should be excluded by the caller, but the
// math is defensive). For a point outside, we compute the Manhattan-style
// edge distance per axis (max(0, …)) and combine via Euclidean norm — this
// is the correct "distance to rectangle" formula.
// ---------------------------------------------------------------------------

function minDistanceToHotspotEdgeCssPx(
  pointCssX: number,
  pointCssY: number,
  hotspots: Hotspot[],
  frame: Frame,
  cssScale: number,
): number {
  let min = Number.POSITIVE_INFINITY;
  const frameW = frame.width * cssScale;
  const frameH = frame.height * cssScale;
  for (const h of hotspots) {
    const x1 = h.bbox_x * frameW;
    const y1 = h.bbox_y * frameH;
    const x2 = x1 + h.bbox_w * frameW;
    const y2 = y1 + h.bbox_h * frameH;
    const dx = Math.max(x1 - pointCssX, 0, pointCssX - x2);
    const dy = Math.max(y1 - pointCssY, 0, pointCssY - y2);
    const d = Math.hypot(dx, dy);
    if (d < min) min = d;
  }
  return min === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : min;
}
