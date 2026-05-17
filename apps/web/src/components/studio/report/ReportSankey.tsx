/**
 * <ReportSankey /> — pan/zoom sankey board for the prototype block report.
 *
 * Source: design-system handoff `js/maxitest-report.jsx` <DenseSankey /> +
 * ADDENDUM-v3 §1 "Пути" sankey spec.
 *
 * Layout philosophy:
 *   - Frames laid out in COLUMNS — one column per traversal-step index, up to
 *     3 frames per column. Columns are 100px apart starting at x=24.
 *   - Goal frames (from block.content.finish_frame_ids) carry a green pip
 *     in their top-right corner.
 *   - Flow paths are SVG quadratic-bezier curves rendered with the fixed
 *     production color `#A8C5E8` and stepped-down stroke widths so the
 *     viewer reads "thick trunk → thinner branches" as traffic volume.
 *
 *   v1 limitation (Phase 02.3-05): real per-transition counts and the
 *   layered sankey-layout algorithm are NOT computed yet — that lands in
 *   Phase 3 (ANALYTICS-04). The flow paths shown here are stub curves laid
 *   out from frame positions so the visual lands; the path topology matches
 *   the handoff illustration with thickness fading 40→30→22→16→12 along the
 *   primary trunk and 18→12 / 8→6→5 on secondaries.
 *
 * Pan/zoom — "FigJam-like":
 *   - Wheel/trackpad scroll → zoom (anchored at the cursor)
 *   - ⌘/Ctrl + wheel also zooms (mac trackpad pinch convention)
 *   - Drag (mousedown not on a button) → pan
 *   - Bottom-left zoom controls (+ / − / fit) for keyboard/no-trackpad users
 *   - Min scale 0.4, max 2.0; double-click background resets to fit
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { Frame } from '@/lib/queries/prototypes';

const COL_SPACING = 100;
const COL_X_START = 24;
const COL_Y_OFFSETS = [60, 180, 300];
const FRAME_W = 56;
const FRAME_H = 64;
const VIEWPORT_HEIGHT = 420;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.0;
const ZOOM_STEP = 1.15;

export interface ReportSankeyProps {
  frames: Frame[];
  /** Frame ids treated as success/goal nodes (block.content.finish_frame_ids). */
  goalFrameIds: string[];
  /** Optional starting frame highlight (block.content.starting_frame_id). */
  startingFrameId?: string;
}

interface ColumnNode {
  frame: Frame;
  isGoal: boolean;
  isStart: boolean;
  col: number;
  row: number;
}

export function ReportSankey({ frames, goalFrameIds, startingFrameId }: ReportSankeyProps) {
  const goalSet = useMemo(() => new Set(goalFrameIds), [goalFrameIds]);

  // Distribute frames across columns: 13 max, 3 per column. Real layout
  // (post-Phase 3) would derive columns from transition-frequency layers.
  const columns: ColumnNode[][] = useMemo(() => {
    const cols: ColumnNode[][] = [];
    frames.forEach((frame, idx) => {
      const c = Math.floor(idx / 3);
      const r = idx % 3;
      if (!cols[c]) cols[c] = [];
      cols[c]!.push({
        frame,
        isGoal: goalSet.has(frame.frame_id),
        isStart: frame.frame_id === startingFrameId,
        col: c,
        row: r,
      });
    });
    return cols;
  }, [frames, goalSet, startingFrameId]);

  const totalCols = columns.length;
  const boardWidth = Math.max(1320, COL_X_START + totalCols * COL_SPACING + 48);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fitToContainer = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / boardWidth;
    const scaleY = rect.height / VIEWPORT_HEIGHT;
    const scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY, 1));
    const cx = (rect.width - boardWidth * scale) / 2;
    const cy = (rect.height - VIEWPORT_HEIGHT * scale) / 2;
    setTransform({ x: cx, y: cy, scale });
  }, [boardWidth]);

  // Fit once on mount and on resize.
  useEffect(() => {
    fitToContainer();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => fitToContainer());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [fitToContainer]);

  // Wheel zoom — cursor-anchored.
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((prev) => {
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = next / prev.scale;
      const x = cx - (cx - prev.x) * ratio;
      const y = cy - (cy - prev.y) * ratio;
      return { x, y, scale: next };
    });
  }, []);

  // Wheel listener attached non-passively so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // React's synthetic events default to passive on touch devices —
      // attach a manual listener for prevent-default semantics.
      e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    // Don't pan when clicking buttons in the zoom controls.
    if ((e.target as HTMLElement).closest('[data-sankey-control]')) return;
    draggingRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.x;
    const dy = e.clientY - draggingRef.current.y;
    setTransform((prev) => ({
      ...prev,
      x: draggingRef.current!.tx + dx,
      y: draggingRef.current!.ty + dy,
    }));
  };

  const endDrag = () => {
    draggingRef.current = null;
  };

  const zoom = (factor: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((prev) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const ratio = next / prev.scale;
      const x = cx - (cx - prev.x) * ratio;
      const y = cy - (cy - prev.y) * ratio;
      return { x, y, scale: next };
    });
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-sankey-control]')) return;
        fitToContainer();
      }}
      style={{
        position: 'relative',
        height: VIEWPORT_HEIGHT,
        background: 'var(--paper-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: draggingRef.current ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* Transform wrapper — board contents scale + translate together */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: boardWidth,
          height: VIEWPORT_HEIGHT,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          transition: draggingRef.current ? 'none' : 'transform 120ms cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <FlowPaths boardWidth={boardWidth} />
        {columns.map((col, ci) =>
          col.map((node, ri) => (
            <FrameNode
              key={`${ci}-${ri}-${node.frame.frame_id}`}
              node={node}
              x={COL_X_START + ci * COL_SPACING}
              y={COL_Y_OFFSETS[ri] ?? 60}
            />
          )),
        )}
      </div>

      {/* Zoom controls — bottom-left, stacked */}
      <div
        data-sankey-control
        style={{
          position: 'absolute',
          left: 16,
          bottom: 14,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <ZoomBtn onClick={() => zoom(ZOOM_STEP)} ariaLabel="Приблизить">
          <Plus size={14} strokeWidth={1.5} />
        </ZoomBtn>
        <span style={{ height: 1, background: 'var(--border-2)' }} />
        <ZoomBtn onClick={() => zoom(1 / ZOOM_STEP)} ariaLabel="Отдалить">
          <Minus size={14} strokeWidth={1.5} />
        </ZoomBtn>
        <span style={{ height: 1, background: 'var(--border-2)' }} />
        <ZoomBtn onClick={fitToContainer} ariaLabel="По размеру">
          <Maximize2 size={12} strokeWidth={1.5} />
        </ZoomBtn>
      </div>

      {/* Empty state — no frames to chart yet */}
      {frames.length === 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-3)',
            font: '400 14px/20px var(--font-sans)',
          }}
        >
          Импортируй прототип, чтобы увидеть пути респондентов.
        </div>
      ) : null}
    </div>
  );
}

// ─── Flow paths (stub, hand-curated topology) ───────────────────────────

function FlowPaths({ boardWidth }: { boardWidth: number }) {
  // The path coordinates below are scaled along the X-axis to fit the
  // dynamic board width. Y-coordinates stay constant because we want the
  // trunk to ride near the top regardless of how many columns we render.
  const w = boardWidth;
  const x = (pct: number) => Math.round((pct / 1320) * w);
  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      viewBox={`0 0 ${w} 420`}
      preserveAspectRatio="none"
    >
      {/* Primary trunk — width steps down 40→30→22→16→12 along the flow */}
      <path
        d={`M ${x(50)} 90 C ${x(100)} 90, ${x(100)} 90, ${x(150)} 90 C ${x(200)} 90, ${x(200)} 90, ${x(250)} 90 C ${x(300)} 90, ${x(300)} 90, ${x(350)} 90`}
        stroke="#A8C5E8"
        strokeWidth="40"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(350)} 90 C ${x(400)} 110, ${x(400)} 160, ${x(450)} 180 C ${x(500)} 200, ${x(500)} 200, ${x(550)} 200`}
        stroke="#A8C5E8"
        strokeWidth="30"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(550)} 200 C ${x(600)} 220, ${x(600)} 240, ${x(650)} 240 C ${x(700)} 240, ${x(700)} 240, ${x(750)} 220 C ${x(800)} 200, ${x(800)} 180, ${x(850)} 170`}
        stroke="#A8C5E8"
        strokeWidth="22"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(850)} 170 C ${x(900)} 160, ${x(900)} 120, ${x(950)} 110 C ${x(1000)} 100, ${x(1000)} 100, ${x(1050)} 110`}
        stroke="#A8C5E8"
        strokeWidth="16"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(1050)} 110 C ${x(1100)} 120, ${x(1100)} 200, ${x(1150)} 220 C ${x(1200)} 240, ${x(1200)} 260, ${x(1270)} 260`}
        stroke="#A8C5E8"
        strokeWidth="12"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
      {/* Secondary thick branches */}
      <path
        d={`M ${x(450)} 180 C ${x(500)} 270, ${x(500)} 320, ${x(550)} 320`}
        stroke="#A8C5E8"
        strokeWidth="18"
        fill="none"
        opacity="0.45"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(550)} 320 C ${x(600)} 320, ${x(600)} 320, ${x(650)} 300 C ${x(700)} 280, ${x(700)} 280, ${x(750)} 280`}
        stroke="#A8C5E8"
        strokeWidth="12"
        fill="none"
        opacity="0.45"
        strokeLinecap="round"
      />
      {/* Thin tributaries */}
      <path
        d={`M ${x(250)} 90 C ${x(290)} 110, ${x(300)} 160, ${x(350)} 180`}
        stroke="#A8C5E8"
        strokeWidth="6"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(750)} 280 C ${x(800)} 280, ${x(800)} 320, ${x(850)} 320`}
        stroke="#A8C5E8"
        strokeWidth="8"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(850)} 320 C ${x(900)} 320, ${x(900)} 280, ${x(950)} 270`}
        stroke="#A8C5E8"
        strokeWidth="6"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
      <path
        d={`M ${x(950)} 270 C ${x(1000)} 270, ${x(1000)} 200, ${x(1050)} 210`}
        stroke="#A8C5E8"
        strokeWidth="5"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Frame node ─────────────────────────────────────────────────────────

function FrameNode({ node, x, y }: { node: ColumnNode; x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: FRAME_W,
        height: FRAME_H,
        borderRadius: 4,
        border: node.isGoal ? '1.5px solid var(--color-success)' : '1px solid var(--paper-3)',
        background: '#FFFFFF',
        boxShadow: node.isGoal ? '0 0 0 1.5px var(--color-success)' : 'none',
        overflow: 'hidden',
      }}
      title={node.frame.name ?? 'frame'}
    >
      <FrameThumbMock />
      {node.isGoal ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--color-success)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            border: '1.5px solid var(--paper-1)',
          }}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
      ) : null}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -14,
          textAlign: 'center',
          font: '500 9px var(--font-mono)',
          color: 'var(--text-3)',
          letterSpacing: '0.04em',
        }}
      >
        {node.frame.name?.slice(0, 6) ?? 's…'}
      </span>
    </div>
  );
}

// Pure-CSS app-thumb mock (mirrors handoff ProtoSankeyMock — left rail +
// folder strip + row lines). Same in every node so the sankey reads as
// "many users hit the same screen" without us needing real thumbs.
function FrameThumbMock() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#FFFFFF',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '8px 12px 1fr',
        gap: 1,
        padding: 2,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ background: 'var(--paper-2)', borderRadius: 1 }} />
      <span style={{ background: 'var(--paper-1)', borderRadius: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{
              height: 1.5,
              background: i === 0 ? 'var(--color-accent)' : 'var(--paper-2)',
              borderRadius: 1,
              width: `${100 - i * 8}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ZoomBtn({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-sankey-control
      style={{
        width: 32,
        height: 32,
        background: 'transparent',
        border: 0,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 120ms cubic-bezier(.2,.7,.3,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-chip)';
        e.currentTarget.style.color = 'var(--text-1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-2)';
      }}
    >
      {children}
    </button>
  );
}
